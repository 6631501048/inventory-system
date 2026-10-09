/** ส่ง error จาก async handler ต่อให้ errorHandler (Express 4 ไม่ทำให้เอง) */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
