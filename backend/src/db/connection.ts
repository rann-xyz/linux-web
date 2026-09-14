import pkg from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

const { Pool } = pkg;

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'linux_web_db',
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  max: 20,
});

pool.on('error', (err: Error) => {
  logger.error('Unexpected error on idle client', err);
});

pool.on('connect', () => {
  logger.info('New database connection established');
});

// Test connection on startup
poolQuery('SELECT NOW()', [])
  .then(() => logger.info('✅ Database connection successful'))
  .catch(err => logger.error('❌ Database connection failed:', err));

export async function poolQuery(text: string, params: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export default pool;
