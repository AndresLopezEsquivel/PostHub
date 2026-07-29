import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',

  // TLS to the database. Off for local Compose Postgres (which doesn't speak
  // it); on for managed databases like RDS that require it. Set DATABASE_SSL=true
  // in those environments, or pass ?sslmode=require in DATABASE_URL and mirror
  // it here.
  databaseSsl: process.env.DATABASE_SSL === 'true',
};
