require('dotenv').config();
const app = require('./app');
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const PORT = Number(process.env.PORT) || 3000;

// สร้างตารางอัตโนมัติตอนเริ่มระบบ (schema.sql ใช้ IF NOT EXISTS / ON CONFLICT จึงรันซ้ำได้)
// ปิดได้ด้วย RUN_SCHEMA=false เช่นตอนใช้ docker compose ที่โหลด schema ให้อยู่แล้ว
async function initSchema() {
  if (process.env.RUN_SCHEMA === 'false') return;
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
}

let server;
initSchema()
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`Inventory API running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialise schema:', err.message);
    process.exit(1);
  });

// ปิดระบบอย่างเรียบร้อย
async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  if (!server) process.exit(0);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
