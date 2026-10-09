/**
 * Error ที่ตั้งใจโยนจาก business logic
 * ทุก error ตอบกลับรูปแบบเดียวกัน: { error: { code, message, details? } }
 */
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details) => new AppError(400, 'VALIDATION_ERROR', message, details);
const notFound = (message) => new AppError(404, 'NOT_FOUND', message);
const conflict = (code, message) => new AppError(409, code, message);

module.exports = { AppError, badRequest, notFound, conflict };
