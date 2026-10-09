const { AppError } = require('../errors');

function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'ROUTE_NOT_FOUND', message: `ไม่พบ endpoint ${req.method} ${req.originalUrl}` },
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // JSON body พัง
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'รูปแบบ JSON ไม่ถูกต้อง' },
    });
  }

  if (err instanceof AppError) {
    const body = { code: err.code, message: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json({ error: body });
  }

  // Postgres: unique violation / foreign key violation (กันเหนียวนอกเหนือจาก logic ใน service)
  if (err.code === '23505') {
    return res.status(409).json({
      error: { code: 'DUPLICATE', message: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' },
    });
  }
  if (err.code === '23503') {
    return res.status(400).json({
      error: { code: 'INVALID_REFERENCE', message: 'ข้อมูลอ้างอิงไม่ถูกต้อง' },
    });
  }

  console.error('Unhandled error:', err);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
  });
}

module.exports = { notFoundHandler, errorHandler };
