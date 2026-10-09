const { query } = require('../db');
const { badRequest, conflict } = require('../errors');
const { validateCategoryInput } = require('../validators');
const { mapCategory } = require('../mappers');

/** GET /api/categories พร้อมจำนวนสินค้าในแต่ละหมวด */
async function listCategories() {
  const { rows } = await query(
    `SELECT c.*, COUNT(p.id)::int AS product_count
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id
     GROUP BY c.id
     ORDER BY c.name ASC`
  );
  return rows.map(mapCategory);
}

/** POST /api/categories */
async function createCategory(input) {
  const { value, errors } = validateCategoryInput(input);
  if (errors.length) throw badRequest('ข้อมูลหมวดหมู่ไม่ถูกต้อง', errors);

  try {
    const { rows } = await query(
      'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *',
      [value.name, value.description]
    );
    return mapCategory({ ...rows[0], product_count: 0 });
  } catch (err) {
    if (err.code === '23505') {
      throw conflict('DUPLICATE_CATEGORY', `หมวดหมู่ "${value.name}" มีอยู่แล้ว`);
    }
    throw err;
  }
}

module.exports = { listCategories, createCategory };