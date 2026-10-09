require('dotenv').config();
const app = require('./app');
const { pool } = require('./db');

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
  console.log(`Inventory API running at http://localhost:${PORT}`);
});

// ปิดระบบอย่างเรียบร้อย
async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
