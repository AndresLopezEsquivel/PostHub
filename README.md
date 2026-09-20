# PostHub

PostHub is a full-stack social publishing platform where users can write posts, follow authors, and like, bookmark, and comment on posts. The platform uses Nginx as a reverse proxy and was built with Node.js, Express, TypeScript, React, and PostgreSQL. It is containerized with Docker and deployed on AWS infrastructure provisioned with Terraform, including an EC2 instance, an RDS database, a CloudFront distribution for serving objects from a private S3 bucket, and an EC2 instance role that generates presigned S3 upload URLs (eliminating the need for static credentials), among other AWS resources.

![PostHub AWS Architecture](/docs/diagrams/PostHub_AWS_Architecture.png)
![PostHub Docker Compose](/docs/diagrams/PostHub_DockerCompose.png)
