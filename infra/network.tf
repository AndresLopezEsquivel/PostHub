# Networking: the default VPC and the two security groups.
#
# We don't build a VPC. PostHub is one EC2 box plus one RDS instance, both in
# the account's default VPC — a custom VPC with public/private subnets and a NAT
# gateway would be more correct at scale, but a NAT gateway alone costs more per
# month than everything else here combined. Noted as a later hardening step.
#
# A security group is a stateful firewall attached to a resource. "Stateful"
# matters: reply traffic on an established connection is always allowed, so you
# only ever declare the direction a connection is *opened* in.

# Read the account's default VPC rather than creating one. A `data` source looks
# something up; it creates nothing and is never destroyed.
data "aws_vpc" "default" {
  default = true
}

# --- EC2 security group ----------------------------------------------------
# The public-facing box: SSH for administration, HTTPS for the app. Nginx
# terminates TLS on 443 with a self-signed cert and proxies /api to the backend
# container, so port 4000 is never exposed — only 443.
resource "aws_security_group" "ec2" {
  name        = "posthub-ec2-sg"
  description = "PostHub application server: SSH + HTTPS"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "ec2_ssh" {
  security_group_id = aws_security_group.ec2.id
  description       = "SSH administration"

  cidr_ipv4   = var.ssh_allowed_cidr
  ip_protocol = "tcp"
  from_port   = 22
  to_port     = 22
}

resource "aws_vpc_security_group_ingress_rule" "ec2_https" {
  security_group_id = aws_security_group.ec2.id
  description       = "Public app traffic"

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "tcp"
  from_port   = 443
  to_port     = 443
}

# Outbound to anywhere: the box pulls Docker images, hits the package mirrors,
# reaches S3 for presigned-URL signing, and connects to RDS. "-1" means every
# protocol, and from/to ports are omitted because they're meaningless then.
resource "aws_vpc_security_group_egress_rule" "ec2_all" {
  security_group_id = aws_security_group.ec2.id
  description       = "Allow all outbound"

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"
}

# --- RDS security group ----------------------------------------------------
# The database is not on the internet: publicly_accessible stays off, and this
# group admits Postgres traffic from exactly one source — the EC2 group above.
resource "aws_security_group" "rds" {
  name        = "posthub-rds-sg"
  description = "PostHub database: Postgres from the app server only"
  vpc_id      = data.aws_vpc.default.id
}

# `referenced_security_group_id` instead of a CIDR: the rule allows whatever is
# *in* the EC2 group, so it keeps working if the instance is replaced and gets a
# new private IP. Membership is the identity, not an address.
resource "aws_vpc_security_group_ingress_rule" "rds_postgres" {
  security_group_id = aws_security_group.rds.id
  description       = "Postgres from the app server"

  referenced_security_group_id = aws_security_group.ec2.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

# No egress rule for RDS on purpose. Security groups are stateful, so query
# results flow back over the connection the app opened without one, and the
# database has no reason to originate outbound traffic.
