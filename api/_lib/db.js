import { neon } from '@neondatabase/serverless';

let sql;
export function getDb() {
  if (!process.env.DATABASE_URL) {
    const error = new Error('Database is not configured on this deployment.');
    error.statusCode = 503;
    throw error;
  }
  if (!sql) sql = neon(process.env.DATABASE_URL);
  return sql;
}
