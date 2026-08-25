# The application server.
#
# One EC2 instance running the production Docker Compose stack: nginx serving
# the built frontend and terminating TLS on 443, proxying /api to the backend
# container, which talks to RDS. This is where the previous three steps come
# together — the instance profile (IAM) and the app security group (network)
# are both attached here.

# Latest Ubuntu 24.04 LTS image, looked up rather than hardcoded: AMI ids are
# region-specific, so a literal id would silently break this config anywhere
# but us-east-1. The owner id is Canonical's — filtering by name alone would
# match anyone's image that happens to be named like Ubuntu.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd*/ubuntu-noble-24.04-amd64-server-*"]
  }
}

# The SSH key pair, uploaded from a public key on your machine. Only the PUBLIC
# half ever leaves the laptop — AWS never sees the private key, which is what
# makes this safe to run from a committed config.
resource "aws_key_pair" "app" {
  key_name   = "posthub-key"
  public_key = file(pathexpand(var.ssh_public_key_path))
}

# First-boot provisioning: install Docker and the Compose plugin so the box is
# ready to run the stack. Deploying the app itself (clone the repo, write the
# root .env, `docker compose -f docker-compose.prod.yml up -d`) stays manual for
# now — that needs secrets, which don't belong in a committed file.
locals {
  user_data = <<-EOT
    #!/bin/bash
    set -euxo pipefail

    apt-get update
    apt-get install -y ca-certificates curl gnupg

    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
    https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list

    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io \
      docker-buildx-plugin docker-compose-plugin

    # Let the default user run docker without sudo (takes effect next login).
    usermod -aG docker ubuntu
  EOT
}

resource "aws_instance" "app" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type

  key_name               = aws_key_pair.app.key_name
  vpc_security_group_ids = [aws_security_group.ec2.id]

  # Attaching the profile is what gives the backend its S3 credentials — the
  # SDK reads short-lived keys from instance metadata, so none are configured.
  iam_instance_profile = aws_iam_instance_profile.app.name

  user_data = local.user_data

  # Ubuntu's default root volume is 8 GB, which Docker images fill quickly.
  # gp3 is cheaper and faster than gp2 at the same size.
  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  # IMDSv2 required. Without this the metadata service answers plain HTTP GETs,
  # and a server-side request forgery bug in the app could be used to read the
  # instance role's credentials. Enforcing tokens closes that path.
  metadata_options {
    http_tokens   = "required"
    http_endpoint = "enabled"
  }

  tags = {
    Name = "posthub-app"
  }

  lifecycle {
    # `most_recent = true` above means the AMI id changes whenever Canonical
    # publishes a new image — without this, an unrelated `apply` would destroy
    # and recreate the running server. Deliberately re-image by bumping this
    # block off, or by tainting the instance.
    ignore_changes = [ami]
  }
}
