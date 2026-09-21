# PostHub

PostHub is a full-stack social publishing platform where users can write posts, follow authors, and like, bookmark, and comment on posts. The platform uses Nginx as a reverse proxy and was built with Node.js, Express, TypeScript, React, and PostgreSQL. It is containerized with Docker and deployed on AWS infrastructure provisioned with Terraform, including an EC2 instance, an RDS database, a CloudFront distribution for serving objects from a private S3 bucket, and an EC2 instance role that generates presigned S3 upload URLs (eliminating the need for static credentials), among other AWS resources.

<figure>
  <img src="./docs/diagrams/PostHub_DockerCompose.png" alt="PostHub on EC2">
  <figcaption><small>Figure 1: PostHub on EC2 — Production Compose Project</small></figcaption>
</figure>

<figure>
  <img src="./docs/diagrams/PostHub_AWS_Architecture.png" alt="PostHub AWS Architecture">
  <figcaption><small>Figure 2: PostHub AWS Architecture</small></figcaption>
</figure>

For more information on PostHub's Docker and Terraform configurations, check out:
* [PostHub's Docker configuration](./docs/docker.md)
* [PostHub's Terraform configuration](./infra/README.md)

## Architecture

Let's briefly walk through PostHub's architecture, starting from the innermost components and working outward.

As shown in Figure 1, PostHub is a containerized application orchestrated with Docker Compose, with two services running in the production environment: `api` and `web`. The `api` service is an Express server listening on the container's port 4000 and handling HTTP requests to paths prefixed with `/api`. It serves the REST API and communicates with PostHub's PostgreSQL database. The `web` service is an Nginx server that serves PostHub's React single-page application (SPA) build files and reverse-proxies requests to paths prefixed with `/api` to the `api` service. It listens for HTTPS requests on the container's port 443 (published to the host) and terminates TLS. The `api` and `web` containers communicate over the Compose-managed network, so the API does not need to publish port 4000 to the host. PostHub uses session-based authentication, and the `web` service forwards the `X-Forwarded-Proto` header to the `api` service. Express trusts this header because the app sets `trust proxy` to `1` in production, so the backend recognizes the original request as HTTPS and issues a `Secure` session cookie.

Let's zoom out and take a look at PostHub's AWS architecture, shown in Figure 2. The AWS infrastructure is provisioned with Terraform, and the configuration files can be found in `infra/`. PostHub is deployed in the `us-east-1` region and uses the region's default VPC, which provides a default subnet in each Availability Zone. These subnets are public by default.

The Docker Compose project shown in Figure 1 is deployed on an EC2 instance. Its security group allows inbound TCP traffic on port 443 from any address on the internet. We therefore expect HTTPS requests to reach the EC2 instance through port 443 and be handled by the `web` service, as described earlier.

PostHub's PostgreSQL database is deployed on an RDS instance. It is configured as not publicly accessible, so it does not receive a public address. Its security group only allows inbound TCP traffic on port 5432 from resources associated with the EC2 instance's security group. As a result, the PostHub EC2 instance is the only resource permitted to communicate with the RDS instance.

Neither the EC2 instance nor the RDS instance is pinned to a specific subnet or Availability Zone, so AWS determines where to place them. For the RDS instance, AWS selects a subnet from those in the configured DB subnet group. Although both resources belong to the same VPC, they may be placed in different Availability Zones. The EC2 instance can still communicate with the RDS instance through the VPC's local route, which is present in every VPC route table and allows traffic between resources within the VPC. Figure 2 therefore shows them in different Availability Zones to illustrate that this placement is possible and does not prevent them from communicating.

PostHub stores user-uploaded images, such as post pictures and profile avatars, in a private S3 bucket. The bucket's objects cannot be browsed or read directly by users. In Figure 2, the S3 bucket is shown outside the VPC boundary but within the region boundary because S3 is a regional AWS service rather than a resource contained within the VPC.

Clients fetch user-uploaded images through the CloudFront distribution. The distribution is shown outside the region boundary but within the AWS boundary in Figure 2 because CloudFront is a global AWS service. The API returns a normal image URL pointing to the CloudFront domain; the browser then requests that URL from CloudFront, which retrieves the object from S3 behind the scenes. We use an Origin Access Control (OAC) so that CloudFront can send authenticated requests to the S3 origin. The bucket policy grants the CloudFront service permission to retrieve objects from the bucket and includes a condition that restricts this permission to the specific CloudFront distribution we created. This makes CloudFront the only service authorized to read objects from the bucket while preventing direct access.

Conversely, when users upload images, their browsers send the files directly to the S3 bucket using presigned URLs generated by the backend. This keeps the image data out of the API entirely. The bucket also has a CORS configuration that allows `PUT` requests from the app's origin; without it, the browser would block the cross-origin upload.

To avoid using long-term static AWS credentials in the backend, we use an instance profile to attach an IAM role to the EC2 instance running the API. The role's trust policy allows the Amazon EC2 service to assume the role, so AWS Security Token Service (STS) can issue temporary credentials. EC2 makes these credentials available through the Instance Metadata Service (IMDS), where the AWS SDK running in the backend can retrieve them and use them to generate the presigned URLs. The role's inline policy grants only `s3:PutObject` permission, so the credentials cannot be used to read or list objects in the bucket.

## Getting started (development)

Docker is the only prerequisite — there is no host Node or npm. No `.env` file is
needed either: `docker-compose.yml` falls back to throwaway local credentials.

```bash
docker compose up --build                  # web :5173, api :4000, db :5432
docker compose exec api npm run migrate    # apply the schema
docker compose exec api npm run seed       # category reference data
docker compose exec api npm run seed:dev   # optional: sample users and posts
```

Add `-d` to the first command (`docker compose up --build -d`) to start the stack
detached, which frees the terminal for the `exec` commands; follow the output
afterwards with `docker compose logs -f api`.

Then open http://localhost:5173. `docker compose down` stops the stack; add `-v`
to drop the database volume as well, which is how you start from a clean schema,
since migrations are forward-only.

Image uploads stay dormant locally: with the S3 environment variables unset,
`POST /api/uploads/presign` answers `503` and posts render without images.
