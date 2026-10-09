const { badRequest } = require('./errors');

const MAX_INT = 2147483647;
const MAX_CHANGE = 1000000;
const MAX_COST = 9999999999.99; // NUMERIC(12,2)

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** แปลงเป็นจำนวนเต็ม รับทั้ง number และ string เช่น "+10", "-5" ไม่ใช่จำนวนเต็มคืน null */
function parseInteger(v) {
  if (typeof v === 'number') return Number.isSafeInteger(v) ? v : null;
  if (typeof v === 'string' && /^[+-]?\d+$/.test(v.trim())) {
    const n = Number(v.trim());
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

function parseMoney(v) {
  let n = null;
  if (typeof v === 'number' && Number.isFinite(v)) n = v;
  else if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim())) n = Number(v.trim());
  if (n === null) return null;
  if (Number(n.toFixed(2)) !== n) return null; // ทศนิยมเกิน 2 ตำแหน่ง
  return n;
}

function validateProductInput(body) {
  const errors = [];
  if (!isPlainObject(body)) {
    return { value: null, errors: [{ field: 'body', message: 'ต้องส่งข้อมูลเป็น JSON object' }] };
  }
  const value = {};

  // name
  if (typeof body.name !== 'string' || body.name.trim() === '') {
    errors.push({ field: 'name', message: 'ต้องระบุชื่อสินค้า' });
  } else if (body.name.trim().length > 200) {
    errors.push({ field: 'name', message: 'ชื่อสินค้ายาวเกิน 200 ตัวอักษร' });
  } else {
    value.name = body.name.trim();
  }

  // sku (trim + uppercase เพื่อกัน "abc-1" กับ "ABC-1" ซ้ำกัน)
  if (typeof body.sku !== 'string' || body.sku.trim() === '') {
    errors.push({ field: 'sku', message: 'ต้องระบุ SKU' });
  } else if (body.sku.trim().length > 50) {
    errors.push({ field: 'sku', message: 'SKU ยาวเกิน 50 ตัวอักษร' });
  } else if (!/^[A-Za-z0-9._-]+$/.test(body.sku.trim())) {
    errors.push({ field: 'sku', message: 'SKU ใช้ได้เฉพาะ A-Z, 0-9, จุด, ขีดกลาง และขีดล่าง' });
  } else {
    value.sku = body.sku.trim().toUpperCase();
  }

  // cost_price
  const cost = parseMoney(body.cost_price);
  if (cost === null || cost < 0 || cost > MAX_COST) {
    errors.push({ field: 'cost_price', message: 'ราคาทุนต้องเป็นตัวเลข >= 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง' });
  } else {
    value.cost_price = cost;
  }

  // category_id
  const categoryId = parseInteger(body.category_id);
  if (categoryId === null || categoryId <= 0 || categoryId > MAX_INT) {
    errors.push({ field: 'category_id', message: 'category_id ต้องเป็นจำนวนเต็มบวก' });
  } else {
    value.category_id = categoryId;
  }

  // stock_quantity (ไม่บังคับ ค่าเริ่มต้น 0)
  if (body.stock_quantity === undefined || body.stock_quantity === null) {
    value.stock_quantity = 0;
  } else {
    const stock = parseInteger(body.stock_quantity);
    if (stock === null || stock < 0 || stock > MAX_INT) {
      errors.push({ field: 'stock_quantity', message: 'stock_quantity ต้องเป็นจำนวนเต็ม >= 0' });
    } else {
      value.stock_quantity = stock;
    }
  }

  return { value: errors.length ? null : value, errors };
}

function validateAdjustInput(body) {
  const errors = [];
  if (!isPlainObject(body)) {
    return { value: null, errors: [{ field: 'body', message: 'ต้องส่งข้อมูลเป็น JSON object' }] };
  }
  const value = {};

  const productId = parseInteger(body.product_id);
  if (productId === null || productId <= 0 || productId > MAX_INT) {
    errors.push({ field: 'product_id', message: 'product_id ต้องเป็นจำนวนเต็มบวก' });
  } else {
    value.product_id = productId;
  }

  const change = parseInteger(body.change);
  if (change === null) {
    errors.push({ field: 'change', message: 'change ต้องเป็นจำนวนเต็ม เช่น 10 หรือ -5' });
  } else if (change === 0) {
    errors.push({ field: 'change', message: 'change ต้องไม่เป็น 0' });
  } else if (Math.abs(change) > MAX_CHANGE) {
    errors.push({ field: 'change', message: `ปรับได้ครั้งละไม่เกิน ${MAX_CHANGE.toLocaleString('en-US')} ชิ้น` });
  } else {
    value.change = change;
  }

  if (body.reason === undefined || body.reason === null) {
    value.reason = null;
  } else if (typeof body.reason !== 'string') {
    errors.push({ field: 'reason', message: 'reason ต้องเป็นข้อความ' });
  } else if (body.reason.trim().length > 255) {
    errors.push({ field: 'reason', message: 'reason ยาวเกิน 255 ตัวอักษร' });
  } else {
    value.reason = body.reason.trim() || null;
  }

  return { value: errors.length ? null : value, errors };
}

/** แปลง query string เป็นจำนวนเต็ม (รับเฉพาะตัวเลขล้วน) ไม่ส่งมาคืนค่า def */
function queryInt(raw, field, { min = 1, max = MAX_INT, def } = {}) {
  if (raw === undefined) return def;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw badRequest(`${field} ต้องเป็นจำนวนเต็ม`, [{ field, message: `${field} ต้องเป็นจำนวนเต็ม` }]);
  }
  const n = Number(raw);
  if (n < min || n > max) {
    throw badRequest(`${field} ต้องอยู่ระหว่าง ${min} ถึง ${max}`, [
      { field, message: `${field} ต้องอยู่ระหว่าง ${min} ถึง ${max}` },
    ]);
  }
  return n;
}

/** id จาก URL param เช่น /products/:id */
function parseId(raw, field = 'id') {
  return queryInt(raw === undefined ? '' : raw, field);
}

function parsePagination(q = {}) {
  const page = queryInt(q.page, 'page', { min: 1, max: 1000000, def: 1 });
  const limit = queryInt(q.limit, 'limit', { min: 1, max: 100, def: 20 });
  return { page, limit, offset: (page - 1) * limit };
}

function paginationMeta({ page, limit }, total) {
  return { page, limit, total, total_pages: Math.ceil(total / limit) };
}

function validateCategoryInput(body) {
  const errors = [];
  if (!isPlainObject(body)) {
    return { value: null, errors: [{ field: 'body', message: 'ต้องส่งข้อมูลเป็น JSON object' }] };
  }
  const value = {};

  if (typeof body.name !== 'string' || body.name.trim() === '') {
    errors.push({ field: 'name', message: 'ต้องระบุชื่อหมวดหมู่' });
  } else if (body.name.trim().length > 100) {
    errors.push({ field: 'name', message: 'ชื่อหมวดหมู่ยาวเกิน 100 ตัวอักษร' });
  } else {
    value.name = body.name.trim();
  }

  if (body.description === undefined || body.description === null) {
    value.description = null;
  } else if (typeof body.description !== 'string' || body.description.trim().length > 255) {
    errors.push({ field: 'description', message: 'description ต้องเป็นข้อความไม่เกิน 255 ตัวอักษร' });
  } else {
    value.description = body.description.trim() || null;
  }

  return { value: errors.length ? null : value, errors };
}

module.exports = {
  validateProductInput,
  validateAdjustInput,
  validateCategoryInput,
  parseInteger,
  parseId,
  queryInt,
  parsePagination,
  paginationMeta,
  MAX_INT,
  MAX_CHANGE,
};