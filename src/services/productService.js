const { query, withTransaction } = require('../db');
const { AppError, badRequest, conflict, notFound } = require('../errors');
const {
  validateProductInput,
  parseId,
  queryInt,
  parsePagination,
  paginationMeta,
  MAX_INT,
} = require('../validators');
const { mapProduct, mapTransaction } = require('../mappers');

/**
 * สร้างสินค้าใหม่
 * ถ้ามีสต็อกเริ่มต้น > 0 จะบันทึก transaction (IN, "Initial stock") ด้วย
 * เพื่อให้ประวัติรวมกันแล้วตรงกับยอดคงเหลือเสมอ ทั้งหมดอยู่ใน DB transaction เดียว
 */
async function createProduct(input) {
  const { value, errors } = validateProductInput(input);
  if (errors.length) throw badRequest('ข้อมูลสินค้าไม่ถูกต้อง', errors);

  try {
    return await withTransaction(async (client) => {
      const cat = await client.query('SELECT id FROM categories WHERE id = $1', [value.category_id]);
      if (cat.rows.length === 0) {
        throw new AppError(400, 'CATEGORY_NOT_FOUND', `ไม่พบหมวดหมู่ id ${value.category_id}`, [
          { field: 'category_id', message: 'ไม่พบหมวดหมู่นี้' },
        ]);
      }

      const inserted = await client.query(
        `INSERT INTO products (category_id, name, sku, cost_price, stock_quantity)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [value.category_id, value.name, value.sku, value.cost_price, value.stock_quantity]
      );
      const product = mapProduct(inserted.rows[0]);

      let transaction = null;
      if (value.stock_quantity > 0) {
        const tx = await client.query(
          `INSERT INTO stock_transactions (product_id, type, quantity, stock_before, stock_after, reason)
           VALUES ($1, 'IN', $2, 0, $2, 'Initial stock')
           RETURNING *`,
          [product.id, value.stock_quantity]
        );
        transaction = mapTransaction(tx.rows[0]);
      }

      return { ...product, initial_transaction: transaction };
    });
  } catch (err) {
    // 23505 = unique_violation (products.sku) ให้ DB เป็นตัวตัดสิน กัน race ระหว่างสองคำขอที่ส่ง SKU เดียวกัน
    if (err.code === '23505') {
      throw conflict('DUPLICATE_SKU', `SKU "${value.sku}" มีอยู่ในระบบแล้ว`);
    }
    throw err;
  }
}

const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name
  FROM products p
  JOIN categories c ON c.id = p.category_id`;

/** escape อักขระพิเศษของ LIKE (% _ \) ไม่ให้ผู้ใช้พิมพ์แล้วกลายเป็น wildcard */
const escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&');

/**
 * GET /api/products?search=&category_id=&page=&limit=
 * ค้นหาจากชื่อหรือ SKU, กรองตามหมวดหมู่, แบ่งหน้า, เรียงจากใหม่ไปเก่า
 */
async function listProducts(filters = {}) {
  const pg = parsePagination(filters);
  const where = [];
  const params = [];

  if (filters.search !== undefined) {
    if (typeof filters.search !== 'string') {
      throw badRequest('search ต้องเป็นข้อความ', [{ field: 'search', message: 'search ต้องเป็นข้อความ' }]);
    }
    const term = filters.search.trim();
    if (term.length > 100) {
      throw badRequest('search ยาวเกิน 100 ตัวอักษร', [{ field: 'search', message: 'ยาวเกิน 100 ตัวอักษร' }]);
    }
    if (term) {
      params.push(`%${escapeLike(term)}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
    }
  }

  const categoryId = queryInt(filters.category_id, 'category_id', { def: undefined });
  if (categoryId !== undefined) {
    params.push(categoryId);
    where.push(`p.category_id = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const count = await query(`SELECT COUNT(*)::int AS total FROM products p ${whereSql}`, params);
  const rows = await query(
    `${PRODUCT_SELECT} ${whereSql}
     ORDER BY p.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pg.limit, pg.offset]
  );

  return { items: rows.rows.map(mapProduct), meta: paginationMeta(pg, count.rows[0].total) };
}

/** GET /api/products/:id */
async function getProduct(rawId) {
  const id = parseId(rawId);
  const { rows } = await query(`${PRODUCT_SELECT} WHERE p.id = $1`, [id]);
  if (rows.length === 0) throw notFound(`ไม่พบสินค้า id ${id}`);
  return mapProduct(rows[0]);
}

/**
 * GET /api/products/low-stock
 * สินค้าที่คงเหลือ "น้อยกว่า" threshold (ค่าเริ่มต้น 5 จาก LOW_STOCK_THRESHOLD)
 * ส่ง ?threshold=N เพื่อเปลี่ยนค่าได้ เรียงจากเหลือน้อยสุดก่อน
 */
async function listLowStock(filters = {}) {
  const fallback = Number(process.env.LOW_STOCK_THRESHOLD) || 5;
  const threshold = queryInt(filters.threshold, 'threshold', { min: 1, max: MAX_INT, def: fallback });

  const { rows } = await query(
    `${PRODUCT_SELECT} WHERE p.stock_quantity < $1 ORDER BY p.stock_quantity ASC, p.name ASC`,
    [threshold]
  );
  return { items: rows.map(mapProduct), meta: { threshold, count: rows.length } };
}

/**
 * GET /api/products/:id/transactions?page=&limit= (ใหม่ไปเก่า)
 * เรียงตาม id ไม่ใช่ created_at: id ถูกสร้างหลังได้ lock แถวสินค้า จึงตรงกับลำดับจริงของการปรับสต็อก
 * ส่วน NOW() คือเวลาเริ่ม transaction ซึ่งอาจสลับลำดับเมื่อมีคำขอพร้อมกัน
 */
async function listTransactions(rawId, filters = {}) {
  const id = parseId(rawId);
  const pg = parsePagination(filters);

  const product = await query('SELECT id FROM products WHERE id = $1', [id]);
  if (product.rows.length === 0) throw notFound(`ไม่พบสินค้า id ${id}`);

  const count = await query('SELECT COUNT(*)::int AS total FROM stock_transactions WHERE product_id = $1', [id]);
  const rows = await query(
    `SELECT * FROM stock_transactions
     WHERE product_id = $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [id, pg.limit, pg.offset]
  );

  return { items: rows.rows.map(mapTransaction), meta: paginationMeta(pg, count.rows[0].total) };
}

module.exports = { createProduct, listProducts, getProduct, listLowStock, listTransactions };