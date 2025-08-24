import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { Database } from './types.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool,
  }),
});

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    await db.selectFrom('presets').select('id').limit(1).execute();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing database connection...');
  await db.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Closing database connection...');
  await db.destroy();
  process.exit(0);
});



