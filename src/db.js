require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'inventory',
  password: process.env.DB_PASSWORD || 'inventory_pass',
  database: process.env.DB_NAME || 'inventory_db',
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error:', err.message);
});

/** query ธรรมดา (ไม่ใช่ transaction) */
const query = (text, params) => pool.query(text, params);

/**
 * รันงานภายใน transaction เดียว
 * - สำเร็จ => COMMIT
 * - throw => ROLLBACK แล้ว throw ต่อ
 */
async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
