/** แปลง row จาก Postgres เป็น object ที่ส่งออก API (NUMERIC มาเป็น string ต้องแปลงเป็นตัวเลข) */
function mapProduct(row) {
  return {
    id: row.id,
    category_id: row.category_id,
    ...(row.category_name !== undefined && { category_name: row.category_name }),
    name: row.name,
    sku: row.sku,
    cost_price: Number(row.cost_price),
    stock_quantity: row.stock_quantity,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapTransaction(row) {
  return {
    id: Number(row.id), // BIGSERIAL มาเป็น string
    product_id: row.product_id,
    type: row.type,
    quantity: row.quantity,
    stock_before: row.stock_before,
    stock_after: row.stock_after,
    reason: row.reason,
    created_at: row.created_at,
  };
}

function mapCategory(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ...(row.product_count !== undefined && { product_count: Number(row.product_count) }),
    created_at: row.created_at,
  };
}

module.exports = { mapProduct, mapTransaction, mapCategory };