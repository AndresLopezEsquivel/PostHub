# PostHub

PostHub is a full-stack social publishing platform where users can write posts, follow authors, and like, bookmark, and comment on posts. The platform uses Nginx as a reverse proxy and was built with Node.js, Express, TypeScript, React, and PostgreSQL. It is containerized with Docker and deployed on AWS infrastructure provisioned with Terraform, including an EC2 instance, an RDS database, a CloudFront distribution for serving objects from a private S3 bucket, and an EC2 instance role that generates presigned S3 upload URLs (eliminating the need for static credentials), among other AWS resources.

<!-- ![PostHub Docker Compose](/docs/diagrams/PostHub_DockerCompose.png) -->
<!-- ![PostHub AWS Architecture](/docs/diagrams/PostHub_AWS_Architecture.png) -->

<figure>
  <img src="./docs/diagrams/PostHub_DockerCompose.png" alt="PostHub on EC2">
  <figcaption><small>Figure 1: PostHub on EC2 — Production Compose Project</small></figcaption>
</figure>

<figure>
  <img src="./docs/diagrams/PostHub_AWS_Architecture.png" alt="PostHub AWS Architecture">
  <figcaption><small>Figure 2: PostHub AWS Architecture</small></figcaption>
</figure>

For more information on PostHub's Docker and Terraform configurations, check out:
* [PostHub's Docker configuration](/docs/docker.md)
* [PostHub's Terraform configuration](/infra/README.md)

Let's briefly walk through PostHub's architecture, starting from the innermost components and working outward.

As shown in Figure 1, PostHub is a containerized application orchestrated with Docker Compose, with two services running in the production environment: `api` and `web`. The `api` service is an Express server listening on the container's port 4000 and handling HTTP requests to paths prefixed with `/api`. It serves the REST API and communicates with PostHub's PostgreSQL database. The `web` service is an Nginx server that serves PostHub's React single-page application (SPA) build files and reverse-proxies requests to paths prefixed with `/api` to the `api` service. It listens for HTTPS requests on the container's port 443 (published to the host) and terminates TLS. The `api` and `web` containers communicate over the Compose-managed network, so the API does not need to publish port 4000 to the host. PostHub uses session-based authentication, and the `web` service forwards the `X-Forwarded-Proto` header to the `api` service. Express trusts this header because the app sets `trust proxy` to `1` in production, so the backend recognizes the original request as HTTPS and issues a `Secure` session cookie.
