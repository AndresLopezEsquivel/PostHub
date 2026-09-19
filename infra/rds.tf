# The PostgreSQL database.
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
  engine_version = "16"

  instance_class    = var.db_instance_class
  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  multi_az = false

  backup_retention_period = var.db_backup_retention_days
  skip_final_snapshot     = true

  deletion_protection = false
}
