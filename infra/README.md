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
