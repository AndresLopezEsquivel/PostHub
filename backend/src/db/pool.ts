import { Pool } from 'pg';
import { env } from '../config/env';

// No query is issued here — pg opens connections lazily on first use.
// This just gives future service code a ready-made pool to import.
export const pool = new Pool({ connectionString: env.databaseUrl });
