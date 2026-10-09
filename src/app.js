const path = require('path');
const express = require('express');
const { query } = require('./db');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check (เช็คว่า API และ DB พร้อมใช้งาน)
app.get('/api/health', async (req, res, next) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    next(err);
  }
});

app.use('/api/products', require('./routes/products'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/categories', require('./routes/categories'));

app.use('/api', notFoundHandler);
app.use(errorHandler);

module.exports = app;