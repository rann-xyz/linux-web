import pg from 'pg';

const { Pool } = pg;

export const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/terminal',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
db.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export async function query(text: string, params?: unknown[]): Promise<pg.QueryResult> {
  const start = Date.now();
  try {
    const result = await db.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`Slow query (${duration}ms):`, text.slice(0, 100));
    }
    return result;
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
}

export async function getClient(): Promise<pg.PoolClient> {
  return db.connect();
}

export async function transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default db;