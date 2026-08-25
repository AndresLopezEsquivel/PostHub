# The PostgreSQL database.
#
# Not reachable from the internet: publicly_accessible stays false and the only
# ingress rule on its security group admits port 5432 from the app server's
# group. The backend reaches it over the VPC's private network, with
# DATABASE_SSL=true so the connection is encrypted in transit.

# Every subnet in the default VPC. RDS requires a subnet group spanning at
# least two availability zones — even for a single-AZ instance — so that AWS
# can move the database if its zone fails.
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_db_subnet_group" "postgres" {
  name        = "posthub-db-subnet-group"
  description = "Subnets available to the PostHub database"
  subnet_ids  = data.aws_subnets.default.ids
}

resource "aws_db_instance" "postgres" {
  identifier = "posthub-db"

  engine = "postgres"
  # Major version only. AWS applies minor patches within it, and pinning the
  # full version would make every routine patch show up as config drift.
  engine_version = "16"

  instance_class    = var.db_instance_class
  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  # The database the app connects to, created on first boot. Migrations are a
  # deploy step (`npm run migrate`), never run automatically at server start.
  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # Single-AZ: a standby would double the cost and this is one small app.
  multi_az = false

  # Daily automated backups. Free-tier accounts cap how far back these may go,
  # so the default is deliberately low — see the variable.
  backup_retention_period = var.db_backup_retention_days
  skip_final_snapshot     = true

  # Left off deliberately so `terraform destroy` can tear the stack down. Turn
  # both this and skip_final_snapshot around the moment real data lives here.
  deletion_protection = false
}
