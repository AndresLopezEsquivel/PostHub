# PostHub infrastructure (Terraform)

Every AWS resource PostHub runs on, as code.

## Prerequisites

* **Terraform** ≥ 1.5 and the **AWS CLI** v2.
* An SSH key pair for the EC2 instance.
    * `ec2.tf` uploads the public key to AWS.
* AWS credentials the Terraform's AWS provider can use to create and manage AWS resources. To avoid long-lived secrets on disk, check out [Login with console credentials](https://docs.aws.amazon.com/signin/latest/userguide/command-line-sign-in.html#command-line-sign-in-local-development).

```bash
aws login                      # 12-hour session, no access keys to leak
aws sts get-caller-identity    # confirm before using Terraform apply
```

## Applying

```bash
terraform init                 # once, and after changing provider versions
terraform plan
terraform apply
```

The first apply takes roughly **10–15 minutes**, nearly all of it CloudFront and
RDS. Nothing is hanging.

## Tearing down

```bash
terraform destroy
```

Four things to expect:

1. It prompts for `db_password` even though destroying doesn't verify it.
2. A **non-empty bucket blocks deletion**. Empty it first:
   `aws s3 rm s3://$(terraform output -raw uploads_bucket) --recursive`
3. **CloudFront takes 10–15 minutes** to disable and delete. Don't interrupt it.
4. **The database is deleted with no final snapshot** (`skip_final_snapshot`).

## Explaining the config files one by one

### `variables.tf`

To know more about how to define variables, check out Terraform's [Define variables](https://developer.hashicorp.com/terraform/language/values/variables). Variables let users pass custom values to Terraform modules at runtime. PostHub defines the following variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `aws_region` | `us-east-1` | |
| `uploads_bucket_name` | `posthub-uploads-prod` | S3 names are unique across **all** AWS accounts. Change it if it's taken. |
| `instance_type` | `t3.micro` | |
| `ssh_public_key_path` | `~/.ssh/id_ed25519.pub` | Only the public half is uploaded |
| `ssh_allowed_cidr` | `0.0.0.0/0` | Port 22 open to the internet. Narrow it. See below for how to do it. |
| `db_instance_class` | `db.t3.micro` | |
| `db_name` / `db_username` | `posthub` | |
| `db_password` | **none** | Prompted, or via `TF_VAR_db_password` environment variable |
| `db_backup_retention_days` | `1` | Free-tier accounts reject larger values |

Before creating/updating resources via `terraform apply`, be aware that, by default, the EC2 instance's security group leaves port 22 open to the internet (SSH connections are allowed from anywhere). Restrict it to your IP only:

```bash
terraform apply -var "ssh_allowed_cidr=$(curl -s ifconfig.me)/32"
```
These Terraform configuration files create a t3.micro by default. Override it if needed.

### `providers.tf`

`providers.tf` doesn't contain any credentials or provision any AWS infrastructure. This file tells Terraform what it needs before touching AWS: a Terraform CLI of version 1.5 or newer, and the official `harshicorp/aws` provider of version `~> 6.0`. It also configures the provider to use the `aws_region` variable defined in `variables.tf`, which defaults to `us-east-1`. This file is the setup layer `terraform init` reads to download plugins.

Resources to dive deeper into:

* [Configure providers](https://developer.hashicorp.com/terraform/language/providers/requirements).
* [AWS provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs).

### `s3.tf`

Before describing what `s3.tf` does, a few notes on PostHub's S3 usage:

* PostHub keeps user-uploaded images (post pictures and profile avatars) in a private S3 bucket that nobody can browse or read directly.
* To show an image, requests go through a CDN (CloudFront), which is the only reader the bucket trusts. The browser loads a normal image URL from there, and the CDN fetches it from storage behind the scenes.
* To upload an image, the browser asks the PostHub API for a presigned URL. The image bytes never pass through PostHub's own server. All the server ever handles is a short, meaningless filename it made up, which it stores in the database and later turns back into a CDN link when rendering a page.
* PostHub's server can create those pre-signed URLs because the EC2 instance it runs on carries an IAM role allowed to do exactly one thing and nothing else: write objects to the S3 bucket. It can't read, list, or delete anything, and there are no passwords or access keys stored anywhere in the app.

Given this context, `s3.tf`:

* Creates the S3 bucket where every uploaded image will live.
* Configures the S3 bucket to be private and inaccessible to the public.

CloudFront being allowed to read from the bucket, and the app server being allowed to write to the bucket, are handled in later configuration files.

Bucket names are globally unique across all AWS accounts. If `posthub-uploads-prod` is already taken, override it:

```bash
terraform apply -var 'uploads_bucket_name=posthub-uploads-yourname'
```

To verify the bucket was created, run:

```bash
aws s3 ls | grep posthub-uploads
````

To verify the bucket is private, run:

```bash
aws s3api get-public-access-block --bucket posthub-uploads-yourname
````

All four keys should come back `true`:

```json
{
  "PublicAccessBlockConfiguration": {
    "BlockPublicAcls": true,
    "IgnorePublicAcls": true,
    "BlockPublicPolicy": true,
    "RestrictPublicBuckets": true
  }
}
```

Resources to dive deeper into:
* [`aws_s3_bucket`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket)
* [`aws_s3_bucket_public_access_block`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_public_access_block)

### `cloudfront.tf`

**Origin Access Control (OAC):**
* An Origin Access Control (OAC) lets CloudFront send authenticated requests to an Amazon S3 origin.
* `aws_cloudfront_origin_access_control.uploads` creates an OAC, sets s3 as the origin (`origin_access_control_origin_type = "s3"`), configures the OAC to always sign requests to S3 (`signing_behavior = "always"`), and uses AWS Signature Version 4 (`signing_protocol = "sigv4"`).
* SigV4 is the AWS signing protocol for adding authentication information to AWS API requests. It verifies your identity and protects requests in transit.

Resources to dive deeper into:
* [`aws_cloudfront_origin_access_control`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_origin_access_control)
* [Restrict access to an Amazon S3 origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
* [AWS Signature Version 4 for API requests](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv.html)

**CloudFront Distribution:**

What is a CloudFront distribution?
* A CloudFront distribution tells CloudFront where you want content to be delivered from and how to deliver it to users.
* Key aspects of a distribution:
  1. Origin servers: like an S3 bucket or an HTTP server, where CloudFront gets your files.
  2. Domain name: CloudFront assigns a unique domain name to your distribution.
  3. Edge Locations: CloudFront sends your distribution's configuration to its global network of edge locations, which cache and serve your content close to your users.

What is a cache behavior?
* A cache behavior describes how CloudFront processes requests matching a specific URL path pattern.
* It routes to exactly one origin (or origin group). A distribution can have multiple cache behaviors, each pointing to different origins.
* It specifies the single origin (or one origin group for failover) that serves requests matching its path pattern.
* When CloudFront receives a viewer request, it compares the requested path against the path patterns of your cache behaviors in order. If no path pattern matches, the default cache behavior is applied.
* For each cache behavior, you can configure: path pattern, target origin, viewer protocol policy, allowed HTTP methods, caching policies, and more.

What is a default cache behavior?
* It describes how CloudFront handles requests when no other cache behavior matches.
* It applies when:
  * You don't specify a `CacheBehavior` element, or
  * A request URL doesn't match any of the `PathPattern` values defined in your other `CacheBehavior` elements
* You must create exactly one default cache behavior per distribution.
* If you have multiple origins but only a default cache behavior, CloudFront will only ever use one of those origins (the one the default behavior points to). To use all origins, you need at least as many cache behaviors (including the default) as you have origins.

What is a cache policy?

* When attached to a cache behavior in a CloudFront distribution, a cache policy controls two important things:
  * The cache key: the unique identifier for an object stored in a CloudFront edge location's cache. Each object in the cache has a unique cache key.
  * TTL (Time to Live): the amount of time, in seconds, that objects remain in a CloudFront edge cache before CloudFront checks with the origin server to see if the object has been updated.

What are managed cache policies?

* CloudFront managed cache policies are a set of predefined cache policies created and maintained by AWS that you can attach to any cache behavior in your CloudFront distribution.
* They eliminate the need to write or maintain your own cache policy and provide settings optimized for specific use cases.
* To use them, attach a managed cache policy to a cache behavior in your distribution. You reference the policy either by name (in the console) or by ID (with the AWS CLI or SDKs).
* Some available managed cache policies are CachingDisabled, CachingOptimized,CachingOptimizedForUncompressedObjects.

What is a cache key?

* A cache key is the unique identifier for an object stored in a CloudFront edge location's cache.
* Each object in the cache has a unique cache key.
* A cache hit occurs when a viewer request generates the same cache key as a prior request, and the matching object is in the edge location's cache and still valid.
* A cache miss occurs when there's no match and CloudFront fetches the content from the origin.
* A cache hit reduces load on your origin server and reduces latency for the viewer.
* By default, the cache key includes only:
  * The domain name of the CloudFront distribution (e.g., `d111111abcdef8.cloudfront.net`).
  * The URL path of the requested object (e.g., `/content/stories/example-story.html`).
* You can customize the cache key:
  * Other values in the viewer request (such as query strings, HTTP headers, and cookies) are not included in the cache key by default.
  * You can customize the cache key using a cache policy, which lets you include additional values such as HTTP headers, Cookies, URL query strings.

What is Time to Live (TTL)?

* TTL (Time to Live) in Amazon CloudFront refers to the amount of time, in seconds, that objects remain in a CloudFront edge cache before CloudFront checks with the origin server to see if the object has been updated.
* TTL controls how long cached content stays at CloudFront edge locations before it expires.
* TTL can help:
  * Improve performance for users: longer cache durations mean files are more likely to be served directly from the edge cache, closer to the viewer, without a round trip to the origin.
  * Reduce origin load: fewer requests reach your origin server when content is cached longer.
  * Serve dynamic content: reducing the cache duration allows you to serve more frequently changing content.
* CloudFront uses three TTL settings that work together with Cache-Control and Expires HTTP headers from the origin: minimum TTL, maximum TTL, and default TTL.
* You can use cache policies to control TTL.

How is PostHub's CloudFront distribution configured in `cloudfront.tf`?

In `aws_cloudfront_distribution.uploads`:
* `enabled=true` means the distribution is active and ready to serve content. If `false`, the distribution is created but not serving content.
* The `origin {}` block specifies the origin server for the distribution (where CloudFront fetches content when there's a cache miss). In this case, the origin is PostHub's S3 bucket. It also attaches the OAC to the origin, so CloudFront can sign requests to S3.
* The `default_cache_behavior {}` block defines how CloudFront handles requests that don't match any other cache behavior path pattern, where a cache behavior lets you configure how CloudFront handles requests that match a specific URL path pattern.
  * `target_origin_id` indicates which origin CloudFront should route requests to when they use the default cache behavior. Its values are the `origin_id` of the origin block.
  * `viewer_protocol_policy` specifies the protocol viewers can use to access origin files. Possible values are `allow-all`, `https-only`, and `redirect-to-https`. In this case, we are using `redirect-to-https`, which means CloudFront will redirect HTTP requests to HTTPS.
  * Allowed HTTP methods control which HTTP methods CloudFront accepts from viewers and forwards to the origin. In our case, `allowed_methods = ["GET", "HEAD"]`, which means CloudFront can only retrieve objects or object headers from the origin.
  * Cached HTTP methods control which HTTP method responses CloudFront will store in its cache. In our case, `cached_methods  = ["GET", "HEAD"]`, which means CloudFront caches responses to GET and HEAD requests.
  * We retrieve information about the `CachingOptimized` managed cache policy via the `aws_cloudfront_cache_policy.caching_optimized` data source. We then assign that managed policy to `default_cache_behavior` (`cache_policy_id = data.aws_cloudfront_cache_policy.caching_optimized.id`).
* Since we'll be using the CloudFront-assigned domain name, we'll be making use of the default CloudFront certificate (`cloudfront_default_certificate = true`), which is the built-in SSL/TLS certificate that CloudFront provides automatically for every distribution, at no additional cost. As we saw, when we create a CloudFront distribution, CloudFront assigns it a domain name in the format `d111111abcdef8.cloudfront.net`. The default certificate covers this domain name, enabling HTTPS for your distribution without any additional configuration. If you want to serve content via your own domain (e.g., `https://example.com/image1.jpg`), you must use a Custom SSL Certificate instead.

Resources to dive deeper into:
* [What is Amazon CloudFront?](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html)
* [Get started with a CloudFront standard distribution](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/GettingStarted.SimpleDistribution.html)
* [Distribution settings](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesGeneral.html#DownloadDistValuesSSLCertificate)
* [CacheBehavior](https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_CacheBehavior.html)
* [Cache behavior settings](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html)
* [DefaultCacheBehavior](https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_DefaultCacheBehavior.html)
* [AWS::CloudFront::Distribution DefaultCacheBehavior](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-distribution-defaultcachebehavior.html)
* [CachePolicy](https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_CachePolicy.html)
* [Understand cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cache-key-understand-cache-policy.html)
* [Create cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cache-key-create-cache-policy.html)
* [AWS::CloudFront::CachePolicy](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cloudfront-cachepolicy.html)
* [Use managed cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html)
* [Understand the cache key](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-the-cache-key.html)
* [Control the cache key with a policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-the-cache-key.html)
* [Manage how long content stays in the cache (expiration)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html)
* [Controlling how long Amazon S3 content is cached by Amazon CloudFront](https://docs.aws.amazon.com/whitepapers/latest/build-static-websites-aws/controlling-how-long-amazon-s3-content-is-cached-by-amazon-cloudfront.html)
* [`aws_cloudfront_cache_policy`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/cloudfront_cache_policy)
* [`aws_cloudfront_distribution`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_distribution)

**Bucket policy:**
* `data.aws_iam_policy_document.uploads_cloudfront_read` is a data block (doesn't provision infrastructure) that generates an IAM policy in JSON format that we'll attach to the S3 bucket via `aws_s3_bucket_policy`.
* The generated JSON represents a resource-based, inline policy.
* Resource-based policies are attached to a resource (e.g., an S3 bucket, SQS queues, Amazon DynamoDB tables) and you can specify who has access to the resource and what actions they can perform on it.
* The `data.aws_iam_policy_document.uploads_cloudfront_read` policy grants permission to retrieve objects from Amazon S3 (`s3:GetObject`). This policy is scoped to the objects in the S3 bucket (`resources = ["${aws_s3_bucket.uploads.arn}/*"]`). A principal identifies who can access the resources. Principals can include accounts, users, roles, federated users, or AWS services. In this case, the principal is the CloudFront service (`cloudfront.amazonaws.com`). However, the principal `cloudfront.amazonaws.com` is the CloudFront service itself, and CloudFront accesses S3 to serve a specific distribution's request. When CloudFront calls `s3:GetObject`, there's always a distribution behind that call. That's why the policy adds a condition to restrict access to only the specific distribution we created (`aws_cloudfront_distribution.uploads.arn`). This condition is specified using `aws:SourceArn`, which identifies the ARN of the resource (the CloudFront distribution) that caused the service principal (CloudFront) to make the request. Without it, CloudFront remains as the principal, but any distribution could retrieve objects from the bucket.
* `aws_s3_bucket_policy.uploads` attaches the resource-based policy to the uploads bucket. Its policy is the rendered JSON of `data.aws_iam_policy_document.uploads_cloudfront_read`. Note that `depends_on` declares an explicit dependency Terraform can't infer automatically. The S3 bucket public-access block must settle before the bucket policy is applied.

Resources for a deeper dive into IAM policies:

* [`aws_iam_policy_document`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document)
* [`aws_s3_bucket_policy`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_policy)
* [Identity-based policies and resource-based policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_identity-vs-resource.html)
* [Managed policies and inline policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html)
* [AWS global condition context keys (for `aws:SourceArn`)](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-sourcearn)
* [Actions, resources, and condition keys for Amazon S3 (for `s3:GetObject`)](https://docs.aws.amazon.com/service-authorization/latest/reference/list_s3.html#list_s3-action-GetObject)
* [AWS JSON policy elements: Principal](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html)
* [`depends_on`](https://developer.hashicorp.com/terraform/language/meta-arguments/depends_on)

### `iam.tf`

Clients fetch user-uploaded images (post pictures and profile avatars) via the CloudFront distribution defined in `cloudfront.tf`. Conversely, users upload images to PostHub's S3 bucket via presigned URLs provided by the backend, so binaries never go through the API.

To prevent the backend from using long-term, static AWS credentials to generate the presigned URLs, we use an instance profile to attach an IAM role to the EC2 instance where the API runs. The role's trust policy allows the Amazon EC2 service to assume it. That trust relationship is what allows AWS Security Token Service (STS) to issue short-term credentials, which EC2 places on IMDS, where the AWS SDK can read them to sign the presigned URLs. The role's inline policy grants only s3:PutObject, so those credentials can't read or list objects.

Below, we define the relevant concepts and walk through iam.tf in more detail.

**What is a trust policy?**
* It is a specific type of resource-based policy attached to an IAM role.
* It is a JSON policy document that defines which principal entities are allowed to assume an IAM role.
  * An IAM role is both an identity and a resource that supports resource-based policies.
  * You must attach both a trust policy and an identity-based policy to an IAM role.
* It answers the question: *"Who is allowed to assume this role?"*.
* It can be used to allow AWS services (e.g., Amazon EC2) to assume a role and act on your behalf.
* Characteristics distinguish a trust policy:
  * It is attached exclusively to an IAM role (not to users, groups, or other resources directly).
  * It uses the `Principal` element to specify who can assume the role.
  * It uses the `sts:AssumeRole` action as the permitted action.
  * A role can have only one trust policy.
  * It is a type of resource-based policy (the IAM role is both an identity and a resource).
* In CloudFormation, it can be attached to an IAM role via the `AssumeRolePolicyDocument` property of the `AWS::IAM::Role` resource.

A minimal example of a trust policy (allowing Amazon EC2 to assume a role):

```json
{
    "Version":"2012-10-17",
    "Statement": {
        "Sid": "TrustPolicyStatementThatAllowsEC2ServiceToAssumeTheAttachedRole",
        "Effect": "Allow",
        "Principal": { "Service": "ec2.amazonaws.com" },
        "Action": "sts:AssumeRole"
    }
}
```

**What is `sts:AssumeRole`?**
* `sts:AssumeRole` is an AWS STS (Security Token Service) action that lets a principal (e.g., an AWS service) assume an IAM role and receive temporary security credentials to act with that role's permissions.
* When a principal assumes a role, AWS STS returns a set of temporary credentials consisting of an access key ID, a secret access key, and a session token.
* Temporary credentials can then be used to make AWS API calls with the permissions defined by the assumed role.
* The target role must have a trust policy that explicitly permits the calling principal to assume it.
* It is used in IAM policies to control which principals may assume which roles.

**What are identity-based policies?**
* An identity-based policy is a JSON permissions policy document that you attach to an IAM identity (a user, a group of users, or role).
* They control what actions that identity can perform, on which resources, and under what conditions.
* They come into two forms:
  * Inline policies: embedded directly into a single identity.
  * Managed policies: standalone policies that can be attached to multiple identities.
* Unlike resource-based policies, they attach to an identity rather than a resource.
* They lack a `Principal` element.
  * The policy is attached directly to an identity, the principal is implicitly the identity it is attached to.
  * Resource-based policies include a `Principal` element to specify who is allowed or denied access to the resource.
  * Both identity- and resource-based policies use the standard JSON policy document structure with `Version`, `Statement`, `Effect`, `Action`, `Resource`, and optionally `Condition`.


**What are permissions policies?**
* The term *permissions policies* is the broader concept.
  * It refers to any policy that grants or restricts permissions (actions on resources).
  * Identity-based and resource-based policies are both permissions policies.
* The opposite category is a trust policy, which defines who can assume a role.

**What's an inline policy?**
* It is a policy created for a single IAM identity (a user, user group, or role) that is embedded directly into that identity.
* It maintains a strict one-to-one relationship between a policy and an identity.
* It is deleted when you delete the identity.
* It is used when you want to ensure that permissions are never inadvertently assigned to the wrong identity.
  * It part of that specific identity and cannot be reused or attached elsewhere.
  * If a policy could apply to more than one entity, a managed policy is the better choice.

**What is an instance profile?**
* It is the mechanism by which an IAM role is attached to and made available on an EC2 instance.
  * An IAM role cannot be attached directly to an EC2 instance. It must be associated through an instance profile.
* It can contain only one IAM role, though a role can be included in multiple instance profiles.
* Its core purpose is to:
  * Allow applications running on EC2 instances to securely make API requests to AWS services.
  * Removes the need to distribute or manage long-term static AWS credentials on those instances.
* Instead of embedding credentials, it delivers temporary credentials to the instance automatically.
* It helps solve several problems:
  * No need to distribute AWS credentials to each instance.
    * Especially difficult for Spot Instances or Auto Scaling groups.
  * No need to manually rotate credentials on each instance.
  * Permissions can be updated centrally by changing the IAM role
* When using the IAM console to create an IAM role for EC2, the console automatically creates an instance profile with the same name as the role.
* If creating the IAM role using the AWS CLI, API, or an AWS SDK, you must:
  * Create the instance profile separately.
  * Add the role to the instance profile.
* For example, you can use an instance profile to grant an application on an EC2 instance permission to read from an S3 bucket, without ever storing an access key on the instance.

For more information on instance profiles:

* [IAM roles for Amazon EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html)
* [Use instance profiles](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2_instance-profiles.html)
* [Use an IAM role to grant permissions to applications running on Amazon EC2 instances](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2.html)
* [`aws_iam_instance_profile`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_instance_profile)

**What is IMDS?**
* It stands for Instance Metadata Service.
* It is a service that runs locally on every EC2 instance.
* It provides data about the instance that applications can use to configure or manage the running instance.
  * This data is called instance metadata and includes categories such as hostname, events, and security groups.
* It is accessible from within the instance itself via a local endpoint
  * By default `http://169.254.169.254` (IPv4) or `http://[fd00:ec2::254]` (IPv6).
* Its key uses:
  * Providing instance metadata (hostname, security groups, AMI ID, etc.).
  * Supplying temporary credentials for an IAM role attached to the instance (AWS SDKs use IMDS as part of their default credential provider chain).

Fore more information on IMDS:
* [Configure the Instance Metadata Service options](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-options.html)
* [IMDS credential provider](https://docs.aws.amazon.com/sdkref/latest/guide/feature-imds-credentials.html)

**Breaking down each resource and data source in `iam.tf`:**

`data.aws_iam_policy_document.ec2_assume_role`:

This data source builds a JSON IAM policy document. It doesn't provision AWS resources. This IAM policy will later become a trust policy when attached to `posthub-app-role` (defined in the `aws_iam_role.app` resource) via `assume_role_policy`.

* `actions = ["sts:AssumeRole"]`
  * `sts:AssumeRole` is the only allowed action.
  * When omitted, `effect` defaults to `Allow` in Terraform's `aws_iam_policy_document`.
  * Via `sts:AssumeRole`, AWS STS issues the short-term credentials the API uses to sign the presigned URLs users need to upload images.
* `principals {...}`
  * The principal is the Amazon EC2 service itself.
  * Amazon EC2 service is the principal allowed to assume the IAM role this trust policy will be attached to (in this case, `posthub-app-role`, defined in the `aws_iam_role.app` resource).

`aws_iam_role.app`:

This resource creates the `posthub-app-role` IAM role. Its trust policy is defined in `data.aws_iam_policy_document.ec2_assume_role`, and the principal allowed to assume the role is the Amazon EC2 service. The role reaches EC2 instances via the `posthub-app-profile` instance profile defined in `aws_iam_instance_profile.app`.

* `assume_role_policy` specifies the trust policy attached to the IAM role.
  * It is a JSON policy document that defines which principals are allowed to assume the role.
  * It answers the question *"Who is allowed to become this role?"*. Without it, no entity can assume the role.
  * It is a required attribute when creating an `aws_iam_role` resource.
* `assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json`:
  * Attaches the IAM policy JSON document built by `data.aws_iam_policy_document.ec2_assume_role`.

`data.aws_iam_policy_document.uploads_write`:

This data source builds a JSON IAM policy document rather than provisioning AWS resources. It's an identity-based policy attached inline to `posthub-app-role` (defined in `aws_iam_role.app`) via policy in `aws_iam_role_policy.uploads_write`. Once attached, it grants that role `s3:PutObject` on PostHub's S3 objects (`${aws_s3_bucket.uploads.arn}/*`).

While `data.aws_iam_policy_document.ec2_assume_role` specifies the principals that can assume `posthub-app-role`, `data.aws_iam_policy_document.uploads_write` defines which actions the role is allowed to perform.

* `sid="PutUploadObjects"`
  * `sid` is the Statement ID. It is  an optional identifier to differentiate between statements within a policy.
  * In this case, the Statement ID is `"PutUploadObjects"`
* `actions   = ["s3:PutObject"]`
  * `actions` represents the list of API actions that the statement either allows or denies.
  * Action names consist of a service namespace, a colon, and the action name.
  * In this case, `effect` is omitted, so it defaults to `"Allow"`.
  * This statement only allows the `s3:PutObject` action. It allows to add objects to an S3 bucket.
  * `s3:PutObject` is an object-level operation.
    * Object operations are S3 API operations that operate on the object resource type.
    * In IAM policies, this means the Resource element must be an object ARN (e.g., `arn:aws:s3:::bucket-name/*`), not a bucket ARN.
* `resources = ["${aws_s3_bucket.uploads.arn}/*"]`
  * `resources` specifies the resource(s) to which the actions apply, identified by their ARN.
  * An Amazon Resource Name (ARN) uniquely identifies an AWS resource.
  * Since `s3:PutObject` is an object-level action, `resources` specifies all objects in PostHub's S3 bucket, not the bucket itself.

`aws_iam_role_policy.uploads_write`:

This resource attaches the identity-based IAM policy defined in `data.aws_iam_policy_document.uploads_write` to the `posthub-app-role` IAM role defined in `aws_iam_role.app`.

* `aws_iam_role_policy` adds an inline policy document embedded in a specified IAM role.
  * Its equivalent CloudFormation resource type is `AWS::IAM::RolePolicy`.
  * `aws_iam_role` vs. `aws_iam_role_policy`
    * `aws_iam_role` creates the role itself and defines its trust policy.
    * `aws_iam_role_policy` attaches an inline policy to the role, defining what the role can do.
* `role   = aws_iam_role.app.id`
  * `role` specifies the IAM role the inline policy attaches to.
  * In this case, the policy is attached to the `posthub-app-role` role, defined in `aws_iam_role.app`.
* `policy = data.aws_iam_policy_document.uploads_write.json`
  * `policy` attaches the inline policy document, which is a JSON formatted string.
  * In this case, we are attaching the policy created with `aws_iam_policy_document.uploads_write`.

`aws_iam_instance_profile.app`:

This resource creates the `posthub-app-profile` instance profile. The Amazon EC2 service is the principal that can assume the `posthub-app-role` IAM role (defined in `aws_iam_role.app`); however, since IAM roles can't be attached directly to EC2 instances, `posthub-app-role` reaches them via `posthub-app-profile`. This way, applications running on EC2 instances can securely make API requests to AWS services without long-term, static credentials. Here, PostHub's backend will be able to generate presigned URLs for users to upload images to PostHub's S3 bucket.

Resources:

* [Managed policies and inline policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html)
* [Policies and permissions in AWS Identity and Access Management](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html)
* [IAM JSON policy element reference](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html)
* [Grammar of the IAM JSON policy language](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_grammar.html)
* [AWS JSON policy elements: Principal](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html)
* [AssumeRole](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html)
* [Policies and permissions in AWS Identity and Access Management - Resource-based policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html#policies_resource-based)
* [When do I use IAM? - When you create policies and permissions](https://docs.aws.amazon.com/IAM/latest/UserGuide/when-to-use-iam.html#getting-started_trust-policies)
* [Create a role using custom trust policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-custom.html)
* [Update a role trust policy](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_update-role-trust-policy.html)
* [Grant a user permissions to pass a role to an AWS service](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html)
* [Step 2: (CLI only) creating an IAM role for Amazon Comprehend](https://docs.aws.amazon.com/comprehend/latest/dg/tutorial-reviews-create-role.html)
* [Create a role to give permissions to an IAM user](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-user.html)
* [What is AWS Identity and Access Management Roles Anywhere?](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/introduction.html)
* [Restrict assumed IAM role access](https://docs.aws.amazon.com/codeguru/detector-library/terraform/restrict-assumed-role-terraform/)
* [`AWS::IAM::Role`](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-iam-role.html)
* [`AWS::IAM::RolePolicy`](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-iam-rolepolicy.html)
* [PutObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html)
* [Identify AWS resources with Amazon Resource Names (ARNs)](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference-arns.html)
* [Required permissions for Amazon S3 API operations](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-with-s3-policy-actions.html)
* [Access control in Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-management.html)
* [Grant read and write access to Amazon S3 bucket objects](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_examples_s3_rw-bucket.html)
* [`aws_iam_policy_document`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/iam_policy_document)
* [`aws_iam_role`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role)
* [`aws_iam_role_policy`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role_policy)
* [`aws_iam_instance_profile`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_instance_profile)

### `network.tf`

`network.tf` defines two security groups: `posthub-ec2-sg` (`aws_security_group.ec2`) and `posthub-rds-sg` (`aws_security_group.rds`). The EC2 instance where PostHub's API runs will be associated with `posthub-ec2-sg`, while PostHub's Postgres RDS instance will be associated with `posthub-rds-sg`.

The `posthub-ec2-sg` security group has two inbound rules (`ec2_ssh` and `ec2_https`) and one outbound rule (`ec2_all`). The `ec2_ssh` rule is intended for SSH access and permits inbound TCP traffic on port 22 from the CIDR range supplied by `var.ssh_allowed_cidr`. The `ec2_https` rule is intended for HTTPS connections and allows inbound TCP traffic on port 443 from `0.0.0.0/0` (any address on the internet). The `ec2_all` rule permits unrestricted outbound traffic, letting the instance initiate connections to any destination, on any port and protocol.

The `posthub-rds-sg` security group has a single inbound rule, `rds_postgres`, which allows inbound TCP traffic on port 5432 from resources associated with the `posthub-ec2-sg` security group. In this case, it'll allow inbound traffic originating from the EC2 instance where PostHub's API runs.

Keep in mind that security groups are stateful, which means that if an inbound rule permits traffic to reach the instance, the response traffic is automatically allowed out (regardless of outbound rules). Similarly, if the instance initiates traffic and an outbound rule permits it, the response traffic is allowed back in (regardless of inbound rules). That explains why `rds_postgres` needs no outbound rule: query results flow back over the connection PostHub's API opened to RDS, without further restriction.

A quick reminder: security groups operate at the protocol and port level, and they cannot inspect application-layer protocols to distinguish whether a connection is SSH, HTTP, or HTTPS by content. For instance, a rule allowing TCP port 22 is described as allowing "SSH traffic" purely because SSH conventionally uses that port.

**Breaking down each resource and data source in `network.tf`:**

`data.aws_vpc.default`:

`aws_vpc` looks up and provides details about a specific VPC. It is a data block, so Terraform creates and destroys nothing. Some attributes it exports are `id` (the VPC ID), `arn` (ARN of the VPC), `cidr_block` (primary IPv4 CIDR range).
* `default=true` selects the account's default VPC in the region.

`aws_security_group.ec2`:

`aws_security_group` creates a new security group.

* `name = "posthub-ec2-sg"`
  * The security group's name is `posthub-ec2-sg`.
* `description = "PostHub application server: SSH + HTTPS"`
  * `description` defines the security group's description.
* `vpc_id = data.aws_vpc.default.id`
  * `vpc_id` defines which VPC owns the security group.
  * In this case, the default VPC of the region owns the security group.

`aws_vpc_security_group_ingress_rule.ec2_ssh`:

`aws_vpc_security_group_ingress_rule` manages one inbound (ingress) rule for a security group. In this case, the `ec2_ssh` rule attaches to `posthub-ec2-sg` (defined in `aws_security_group.ec2`) and permits inbound TCP traffic on port 22 only (for SSH access), from the CIDR range supplied by `var.ssh_allowed_cidr`. A security group is a layer-4 filter. It matches protocol, port, and source CIDR, and inspects nothing above that. It has no idea whether the bytes are HTTP, HTTPS, or SSH.

* `security_group_id = aws_security_group.ec2.id`
  * The inbound rule is attached to the security group defined in `aws_security_group.ec2`.
* `cidr_ipv4 = var.ssh_allowed_cidr`
  * `cidr_ipv4` is the source IPv4 CIDR range. It represents who may connect in, written in CIDR notation.
  * In this case, the source range comes from the `ssh_allowed_cidr` variable.
* `ip_protocol = "tcp"`
  * `ip_protocol` is the IP protocol name or number.
    * It accepts a name (`tcp`, `udp`, `icmp`, `icmpv6`) or a number (`6`, `17`, `1`, `58`).
  * In our case, SSH uses `tcp`.
* `from_port=22` and `to_port=22`
  * `from_port` and `to_port` define a port range, not a direction.
  * `from_port` is the lowest port in the range (inclusive).
  * `to_port` is the highest port in the range (inclusive).
  * `from_port == to_port` means one port only.
    * In our case, `from_port=22` and `to_port=22`. We only need port 22 for SSH connections.
  * `from_port != to_port` means a range of ports. `8000, 8080` opens 81 ports.

`aws_vpc_security_group_ingress_rule.ec2_https`:

The `ec2_https` rule attaches to `posthub-ec2-sg` (defined in `aws_security_group.ec2`) and allows inbound TCP traffic on port 443 from `0.0.0.0/0`, meaning any address on the internet.

`aws_vpc_security_group_egress_rule.ec2_all`:

The `ec2_all` rule attaches to `posthub-ec2-sg` (defined in `aws_security_group.ec2`) and permits unrestricted outbound traffic, letting the instance initiate connections to any destination on any protocol or port. Setting `ip_protocol` to `-1` matches all protocols and all port ranges, so `from_port` and `to_port` are omitted. It enables package downloads, API calls, and updates without restricting which destinations the instance can reach.

`aws_security_group.rds`:

The `rds` resource creates a security group named `posthub-rds-sg` inside the account's default VPC, which the `aws_vpc` data source looks up.

`aws_vpc_security_group_ingress_rule.rds_postgres`:

The `rds_postgres` rule attaches to the `posthub-rds-sg` security group and allows inbound TCP traffic on port 5432 from resources associated with the `posthub-ec2-sg` security group (defined in `aws_security_group.ec2`).

* `referenced_security_group_id`
  * Allows only traffic originating from resources associated with the security group it names.
  * Names another security group as the source, instead of an IP range.
  * In this case, allows only traffic originating from `posthub-ec2-sg` (defined in `aws_security_group.ec2`).
  * Some of its benefits in our particular case are:
    * Removes the need to track instance IPs in variables or CIDR lists.
    * Add an instance to the EC2 group and it inherits database access automatically.
    * Access still works even if an instance gets a new IP after a stop/start.

Resources:

* [Control traffic to your AWS resources using security groups](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html)
* [Protocol numbers](https://www.iana.org/assignments/protocol-numbers)
* [Control traffic to your AWS resources using security groups](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html)
* [Amazon EC2 security groups for your EC2 instances](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html)
* [Amazon EC2 security group connection tracking](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-connection-tracking.html)
* [`aws_vpc`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/vpc)
* [`aws_security_group`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group)
* [`aws_vpc_security_group_ingress_rule`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc_security_group_ingress_rule)
* [`aws_vpc_security_group_egress_rule`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc_security_group_egress_rule)

### `ec2.tf`

`ec2.tf` provisions the EC2 instance where PostHub runs.

**What's cloud-init?**

* It is an open-source application that bootstraps Linux images in a cloud computing environment.
* When you launch an instance, it receives actions through the *user data* fields.
  * User data is information you pass to an EC2 instance at launch time to automate configuration tasks.
  * cloud-init is the open-source application that reads and acts on that user data when the instance boots
* Some of its supported user data formats are Gzip, Base64, and user data scripts.
  * By default, user data scripts and cloud-init directives run only during the first boot when you launch an instance.

Resources:
* [`cloud-init` documentation](https://docs.cloud-init.io/en/22.2/)
* [Customized cloud-init - Amazon Linux 2023](https://docs.aws.amazon.com/linux/al2023/ug/cloud-init.html)
* [Customized cloud-init - Amazon Linux 2027](https://docs.aws.amazon.com/linux/al2027/ug/cloud-init.html)
* [Using cloud-init on AL2](https://docs.aws.amazon.com/linux/al2/ug/amazon-linux-cloud-init.html)
* [Run commands when you launch an EC2 instance with user data input](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html)

**What's a user data script in cloud-init?**
* It is one of the supported formats that cloud-init can process.
* It allows you to run shell commands automatically on the instance during boot

Resources:

* [Run commands when you launch an EC2 instance with user data input](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html)

**What are EC2 instance metadata options?**

* EC2 instance metadata options control how the Instance Metadata Service (IMDS) behaves on your instances.
* There are five configurable options:
  * `HttpEndpoint`
    * Enables or disables the HTTP metadata endpoint on your instances.
    * If set to `disabled`, you cannot access your instance metadata at all.
  * `HttpTokens`
    * Controls whether IMDSv2 (session-oriented, token-based) is required or optional.
    * If set to `required`, IMDSv2 is mandatory.
  * `HttpPutResponseHopLimit`
  * `HttpProtocolIpv6`
  * `InstanceMetadataTags`
* Options can be set at three levels: account, AMI, and instance levels.

Resources:
* [`AWS::EC2::Instance` MetadataOptions](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-ec2-instance-metadataoptions.html)
* [`modify-instance-metadata-options`](https://docs.aws.amazon.com/cli/latest/reference/ec2/modify-instance-metadata-options.html)
* [Use instance metadata to manage your EC2 instance](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html)
* [Use the Instance Metadata Service to access instance metadata](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html)

**Breaking down each resource and data source in `ec2.tf`:**

`data.aws_ami.ubuntu`:

* `aws_ami`
  * It looks up an existing Amazon Machine Image (AMI) to launch instances from.
  * It retrieves the ID of a registered AMI for use in other resources.
* `most_recent = true`
  * If matches more than one AMI, it returns the most recent one.
* `owners = ["099720109477"]`
  * It is a filter that specifies who published the AMI.
  * It matters because:
    * AMI names aren't unique or reserved.
    * Different owners can publish AMIs with the same name.
    * Without it, we could end up launching an image published by an unknown party.
  * `099720109477` is Canonical's ID.
* `filter { ... }`
  * Each `filter` block specifies a `name`/`values` pair to narrow the AMI search.
  * `name` is the name of the filter.
    * Common keys are `name`, `architecture`, `virtualization-type`, `root-device-type`, `state``
  * `values` is a list that specifies the values that are accepted for the given filter.
  * In our case, `filter` restricts the search to AMIs whose name matches Canonical's publishing convention.
    * The prefix `ubuntu/images/` identifies the image namespace.
    * `hvm-ssd*` requires HVM virtualization on EBS storage and tolerates variants such as `hvm-ssd-gp3`.
    * The middle segment pins three things:
      * The release (Ubuntu 24.04 LTS, Noble Numbat).
      * The architecture (x86_64).
      * The build type (server).

`aws_key_pair.app`:

* `aws_key_pair`
  * It registers an SSH public key with AWS for instance login.
  * You generate the key pair yourself; AWS never sees the private key.
  * A key pair is used to control login access to EC2 instances.
* `key_name = "posthub-key"`
  * In this case, the name of the key pair is `posthub-key`.
* `public_key = file(pathexpand(var.ssh_public_key_path))`
  * `public_key` is the public key itself.
  * `file(...)` reads the file at apply time and returns its contents as a string.
  * `pathexpand(...)` expands a leading `~` into the absolute home directory.
    * `file()` does not expand `~` on its own.
  * `var.ssh_public_key_path` defaults to `~/.ssh/id_ed25519.pub`.

`aws_instance.app`:

* `aws_instance` provisions a single EC2 instance.
* `ami = data.aws_ami.ubuntu.id`
  * `ami` specifies the AMI to boot.
  * In this case, the AMI will be the one specified by `data.aws_ami.ubuntu`.
* `instace_type = var.instance_type`
  * `instance_type` specifies the instance type for use with the instance.
  * `var.instance_type` defaults to `t3.micro`.
* `key_name = aws_key_pair.app.key_name`
  * `key_name` specifies the name of the key pair to be used with the instance.
  * `aws_key_pair.app.key_name` is the the SSH key pair registered via `aws_key_pair`.
* `vpc_security_group_ids = [aws_security_group.ec2.id]`
  * `vpc_security_group_ids` is the list of security groups associated with the instance.
  * `aws_security_group.ec2` is the `posthub-ec2-sg` security group defined in `network.tf`.
* `iam_instance_profile = aws_iam_instance_profile.app.name`
  * `iam_instance_profile` specifies the instance's instance profile.
  * `aws_iam_instance_profile.app` is defined in `iam.tf`and we've discussed it earlier.
* `user_data = local.user_data`
  * `user_data` hands a script to the instance that cloud-init runs once, as root, on first boot.
  * In this case, it installs Docker CE and the Compose plugin.
* `metadata_options { ... }`
   * `metadata_options` configures the instance's access to IMDS.
   * `http_endpoint = "enabled"` keeps IMDS reachable at all.
      * If disabled, PostHub's API presigning loses its credential source.
   * `http_tokens = "required"` enforces IMDSv2.


Resources:

* [Amazon EC2 key pairs and Amazon EC2 instances](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-key-pairs.html)
* [Amazon EC2 instance types](https://docs.aws.amazon.com/ec2/latest/instancetypes/instance-types.html)
* [Amazon EC2 instance type specifications](https://docs.aws.amazon.com/ec2/latest/instancetypes/ec2-instance-type-specifications.html)
* [`aws_ami` data source](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ami)
* [`aws_key_pair` resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/key_pair)
* [`aws_instance` resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/instance)

### `s3_cors.tf`

`s3.tf` provisions PostHub's S3 bucket, while `s3_cors.tf` provisions its CORS configuration. Cross-Origin Resource Sharing (CORS) is a mechanism by which a server declares, via `Access-Control-Allow-*` headers, which websites (origins) can access its resources **from a browser**. CORS is browser-enforced: the server declares, the browser enforces. It tells the browser which cross-origin requests to allow.

In PostHub's case, the frontend uploads images (post pictures and profile avatars) directly to S3 via a presigned URL provided by the API. Since the frontend's origin (scheme + host + port) differs from the S3 origin, CORS is needed. Keep in mind that the presigned URL authorizes the request, while CORS is what convinces the browser to make it (`curl` with the same presigned URL ignores CORS entirely and uploads fine).

PostHub's S3 CORS configuration lives in `s3_cors.tf` rather than `s3.tf` for readability (one concern per file). Terraform parses every `.tf` file in the directory into one graph, so file boundaries don't affect the order in which resources are created. The CORS config would behave identically if `aws_s3_bucket_cors_configuration.uploads` were defined in `s3.tf`.

The CORS configuration of PostHub's S3 bucket allows only `PUT` requests. Remember: image reads go through a CloudFront distribution, while image uploads go through an S3 presigned URL.

On PostHub's EC2 instance (provisioned in `ec2.tf`), Nginx terminates TLS and serves the React single-page application's build files over HTTPS on port 443. For testing purposes, PostHub uses the EC2 instance's public IP rather than an Elastic IP, so the address changes whenever the instance is stopped and restarted. Hence the origin allowed by the S3 CORS configuration is `https://<EC2-PUBLIC-IP>`. Worth noting: since `allowed_origins` in `cors_rule {}` depends on `aws_instance.app.public_ip` (the EC2 instance's public IP), stopping and restarting the instance requires a `terraform apply` to refresh `aws_instance.app.public_ip`. Otherwise, the S3 CORS configuration holds a stale origin.

The AWS provider models `aws_s3_bucket_cors_configuration` and `aws_s3_bucket` as separate resources, which keeps their dependencies independent: the bucket can be created without the EC2 instance, whereas the CORS configuration depends on `aws_instance.app.public_ip`, a computed value.

**What's an S3 CORS configuration?**

* It contains rules that define which origins (domains) are allowed to make cross-origin requests to the bucket, which HTTP methods are permitted for each origin, and other operation-specific details.
  * CORS is a browser security feature that normally blocks web applications loaded from one domain from making requests to a different domain.
  * By adding a CORS configuration to your S3 bucket, you selectively allow cross-origin access to your S3 resources.
  * CORS is primarily a browser security mechanism. It doesn't prevent someone from making requests to S3 using curl, the AWS CLI, etc
* Key configuration elements:

| Element | Description |
|---|---|
| `AllowedOrigins` | Domains allowed to make cross-origin requests |
| `AllowedMethods` | HTTP methods permitted |
| `AllowedHeaders` | Headers allowed in preflight requests |
| `ExposeHeaders` | Response headers accessible to browser scripts |
| `MaxAgeSeconds` | How long (in seconds) the browser can cache a preflight response |

Resources:
* [MDN docs - Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
* [AWS - What's CORS](https://aws.amazon.com/what-is/cross-origin-resource-sharing/)
* [S3 - Using cross-origin resource sharing (CORS)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html)
* [Cross-Origin Resource Sharing (CORS)](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/cors.html)
* [`aws_s3_bucket_cors_configuration` resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_cors_configuration)

### `rds.tf`

PostHub uses AWS's default VPC. AWS provisions one in each region, and each includes a default subnet in every Availability Zone. Default subnets are public by default.

Creating an RDS instance requires a DB subnet group: a collection of subnets designated for RDS instances. From that collection, RDS then chooses a subnet and an IP address to associate with the DB instance, which runs in the Availability Zone containing the chosen subnet. Each DB subnet group must have at least one subnet in at least two Availability Zones in the AWS Region (meaning a minimum of two subnets), even for a Single-AZ deployment. That way, you can migrate to Multi-AZ later without reconfiguring your network.

In `rds.tf`, `data.aws_subnets.default` fetches all default subnets in the default VPC (`data.aws_vpc.default.id`, defined in `network.tf`). That list is passed to the `aws_db_subnet_group.postgres` resource to provision the `posthub-db-subnet-group` DB subnet group (the subnets available to the PostHub database).

At a high level, `aws_db_instance.postgres` provisions PostHub's RDS instance (a Postgres database). It attaches the `posthub-db-subnet-group` DB subnet group and the `posthub-rds-sg` security group (defined in `network.tf`), keeps the instance unreachable from the internet (`publicly_accessible = false`), and specifies a Single-AZ deployment (`multi_az = false`).

Worth noting: `publicly_accessible = false` is only half of what keeps the RDS instance private. The other half is the `posthub-rds-sg` security group, which only allows inbound TCP traffic on port 5432 from resources associated with the `posthub-ec2-sg` security group (attached to PostHub's EC2 instance).

Neither the EC2 instance nor the RDS instance is pinned to a specific subnet or Availability Zone, so AWS decides where to place them (for the RDS instance, choosing from the subnets in the DB subnet group). They're in the same VPC, but may land in different AZs. Even so, the EC2 instance can reach the database via the VPC's local route, which is present in every VPC route table and carries traffic between resources within the VPC.

Resources:
* [Default VPCs](https://docs.aws.amazon.com/vpc/latest/userguide/default-vpc.html)
* [Amazon VPC and Amazon RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.html)
* [Subnets for your VPC](https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html)
* [Configure route tables](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html)
* [`aws_subnets` data source](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/subnets)
* [`aws_db_subnet_group` resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_subnet_group)
* [`aws_db_instance` resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance)
