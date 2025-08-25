#!/usr/bin/env node

/**
 * Production database migration script
 * Run this after deploying to Vercel with: node packages/api/migrate-production.js
 */

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  const DATABASE_URL = process.env.DATABASE_URL;
  
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    console.error('Please set DATABASE_URL and try again');
    process.exit(1);
  }

  console.log('🔍 Connecting to database...');
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // Test connection
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    
    // Read migration file
    const migrationPath = join(__dirname, 'src', 'db', 'migrations', '001_initial_schema.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    
    console.log('📋 Running database migration...');
    
    // Run migration
    await client.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('🎉 Database is ready for use');
    
    client.release();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    
    if (error.message.includes('already exists')) {
      console.log('💡 Tables might already exist. This is normal if you\'ve run the migration before.');
    } else {
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration().catch(console.error);
