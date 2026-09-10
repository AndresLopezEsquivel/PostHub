# PostHub infrastructure (Terraform)

Every AWS resource PostHub runs on, as code. `terraform apply` from this
directory builds the whole stack from an empty account; `terraform destroy`
removes it again.

This replaces the click-through-the-console setup that `docs/set_up_production.md`
assumed under "Prerequisites (once per instance)". That document still owns the
**deploy** — cloning the repo, writing `.env`, generating the cert, running
Compose. This one owns the **infrastructure** underneath it.

## What it builds

```
                      ┌─────────────────────────────────────┐
   browser ──HTTPS───▶│ EC2  posthub-app                    │
      │               │  nginx :443 → SPA + /api → api:4000 │
      │               └──────────┬──────────────┬───────────┘
      │                         │              │
      │              instance role      TLS, port 5432
      │              (s3:PutObject)     from the app SG only
      │                         │              │
      │                         ▼              ▼
      │              presigned PUT URL   ┌───────────────┐
      └──PUT bytes──────────────┐        │ RDS  postgres │
                                ▼        │ posthub-db    │
                        ┌──────────────┐ └───────────────┘
   browser ◀──GET───────│ S3  uploads  │
      ▲                 │  (private)   │
      │                 └──────┬───────┘
      └── CloudFront ◀──OAC────┘
```

Nineteen resources across seven files, plus seven read-only `data` lookups —
things Terraform reads rather than creates: the default VPC and its subnets, the
latest Ubuntu AMI, an AWS-managed CloudFront cache policy, and the three IAM
policy documents assembled from HCL instead of hand-written JSON.

| File | Creates |
| --- | --- |
| `providers.tf` | Terraform + AWS provider pins, region |
| `variables.tf` | Every input knob (see below) |
| `outputs.tf` | The values you need to configure the app |
| `s3.tf` | Uploads bucket + public-access block |
| `cloudfront.tf` | OAC, distribution, and the bucket policy trusting it |
| `iam.tf` | Instance role, its `s3:PutObject` policy, instance profile |
| `network.tf` | App and database security groups |
| `ec2.tf` | SSH key pair and the app server |
| `s3_cors.tf` | Bucket CORS, allowing browser `PUT` from the app's origin |
| `rds.tf` | Subnet group and the Postgres instance |

Two design points carried over from the app's own conventions:

- **The bucket is private and stays private.** Reads go through CloudFront,
  authenticated by an Origin Access Control and scoped to this one distribution.
  Writes are presigned `PUT`s straight from the browser. Nothing is public.
- **No static AWS credentials exist anywhere.** The backend signs upload URLs
  with short-lived credentials the SDK reads from instance metadata, which is
  why `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are absent from the
  production `.env`. Presigning is a local computation; the instance role is
  what makes the resulting URL valid.

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
export TF_VAR_db_password='…'   # or let Terraform prompt for it
terraform plan                 # read this like a diff, every time
terraform apply
```

The first apply takes roughly **10–15 minutes**, nearly all of it CloudFront and
RDS. Nothing is hanging.


## Outputs

After using `terraform apply`, use `terraform output` to see the values required to configure the app.


| Output | Goes into the production `.env` as |
| --- | --- |
| `uploads_bucket` | `S3_BUCKET` |
| `cloudfront_domain` | `S3_PUBLIC_BASE_URL=https://<value>` |
| `db_endpoint` | `DATABASE_URL=postgresql://<user>:<pass>@<value>/posthub` |
| `app_public_ip` | The site's address, and the cert's `subjectAltName` |
| `app_ssh` | Ready-made SSH command |

`AWS_REGION` matches `aws_region`. The database password is deliberately **not**
an output — assemble `DATABASE_URL` from the password you supplied.

Setting `S3_BUCKET`, `AWS_REGION`, and `S3_PUBLIC_BASE_URL` is all it takes to
light up uploads: the backend's upload endpoint answers `503` until they're
present and needs no code change to go live.

## Deploying the app

`user_data` installs Docker and the Compose plugin on first boot, so the box is
ready but empty. Continue from **"Deploy"** in `docs/set_up_production.md` —
clone the repo, write `.env`, generate the self-signed cert, `docker compose -f
docker-compose.prod.yml up -d --build`, then run the migration and seed.

```bash
ssh ubuntu@$(terraform output -raw app_public_ip)
docker --version      # empty output means cloud-init is still running:
                      # sudo cloud-init status --wait
```

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

Re-applying afterward rebuilds everything — but the instance gets a **new public
IP**, so the cert must be regenerated and the browser warning re-accepted. The
CORS rule updates itself, since it reads the IP from the instance.

## State

Terraform tracks what it created in `terraform.tfstate`, here on disk and
**gitignored** — it contains the database password in plaintext. Consequences:

- Don't commit it, and don't lose it. Without state, Terraform no longer knows
  these resources exist and `apply` tries to create duplicates.
- Only one person can safely apply at a time.

Moving state to an S3 backend with DynamoDB locking is the fix, and is the first
thing to do if anyone else ever runs this.

## Deliberate shortcuts

Each of these is a considered trade-off for a learning deployment, not an
oversight — and each is a small change when it stops being acceptable:

| Shortcut | Why | Fix |
| --- | --- | --- |
| No Elastic IP | Free tier bills idle public IPs | `aws_eip` — also stabilises the cert and CORS |
| Password in state | Simplest thing that works | `manage_master_user_password` → Secrets Manager |
| `skip_final_snapshot`, `deletion_protection = false` | So `destroy` works while iterating | Flip both once real data lives here |
| Default VPC | A NAT gateway costs more than everything else here combined | Custom VPC, private subnets |
| SSH open to `0.0.0.0/0` | Home IPs move; locking yourself out mid-project is worse | `ssh_allowed_cidr`, or SSM Session Manager and no port 22 at all |
| Local state | One operator, one machine | S3 backend + DynamoDB lock |
| `AdministratorAccess` on the Terraform user | Learning the tool, not IAM | Scope to the services actually used |

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
