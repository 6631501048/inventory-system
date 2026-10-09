const { withTransaction } = require('../db');
const { AppError, badRequest, notFound } = require('../errors');
const { validateAdjustInput, MAX_INT } = require('../validators');
const { mapProduct, mapTransaction } = require('../mappers');

/**
 * Logic บริสุทธิ์ (ไม่แตะ DB) คำนวณผลของการปรับสต็อก
 * - สต็อกห้ามติดลบ
 * - สต็อกห้ามเกินขีดจำกัดของ INTEGER
 */
function computeAdjustment(current, change) {
  const after = current + change;

  if (after < 0) {
    throw new AppError(
      409,
      'INSUFFICIENT_STOCK',
      `สต็อกไม่พอ: คงเหลือ ${current} ชิ้น แต่ต้องการลด ${-change} ชิ้น`,
      { available: current, requested: -change }
    );
  }
  if (after > MAX_INT) {
    throw new AppError(409, 'STOCK_LIMIT_EXCEEDED', 'จำนวนสต็อกเกินขีดจำกัดที่ระบบรองรับ');
  }

  return { after, type: change > 0 ? 'IN' : 'OUT', quantity: Math.abs(change) };
}

/**
 * ปรับสต็อกสินค้า (+ เพิ่ม, - ลด) และบันทึกลง stock_transactions ทุกครั้ง
 *
 * ป้องกัน race condition ด้วย SELECT ... FOR UPDATE:
 * คำขอที่ปรับสินค้าเดียวกันพร้อมกันจะต่อคิวรอกัน ไม่มีใครอ่านค่าเก่าแล้วเขียนทับ
 * การ UPDATE สต็อกและ INSERT transaction อยู่ใน DB transaction เดียวกัน
 * ถ้าขั้นใดล้มเหลวจะ ROLLBACK ทั้งหมด
 */
async function adjustStock(input) {
  const { value, errors } = validateAdjustInput(input);
  if (errors.length) throw badRequest('ข้อมูลการปรับสต็อกไม่ถูกต้อง', errors);

  return withTransaction(async (client) => {
    const locked = await client.query(
      'SELECT id, stock_quantity FROM products WHERE id = $1 FOR UPDATE',
      [value.product_id]
    );
    if (locked.rows.length === 0) {
      throw notFound(`ไม่พบสินค้า id ${value.product_id}`);
    }

    const before = locked.rows[0].stock_quantity;
    const { after, type, quantity } = computeAdjustment(before, value.change);

    const updated = await client.query(
      'UPDATE products SET stock_quantity = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [after, value.product_id]
    );

    const tx = await client.query(
      `INSERT INTO stock_transactions (product_id, type, quantity, stock_before, stock_after, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [value.product_id, type, quantity, before, after, value.reason]
    );

    return { product: mapProduct(updated.rows[0]), transaction: mapTransaction(tx.rows[0]) };
  });
}

module.exports = { adjustStock, computeAdjustment };
