#!/usr/bin/env node
/**
 * พิสูจน์ว่าการปรับสต็อกพร้อมกันไม่ทำให้สต็อกติดลบหรือยอดเพี้ยน
 *
 * สร้างสินค้าใหม่ที่มีสต็อก 15 แล้วยิงคำขอ "ลด 1 ชิ้น" พร้อมกัน 30 ครั้ง
 * ผลที่ถูกต้อง: สำเร็จ 15 / ถูกปฏิเสธ 15 (409) สต็อกสุดท้าย 0 และผลรวมประวัติตรงกับสต็อก
 *
 * ใช้: npm run race-test            (ค่าเริ่มต้น http://localhost:3000)
 *      BASE_URL=http://host:3000 node scripts/race-test.js
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const STOCK = 15;
const REQUESTS = 30;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

(async () => {
  const categories = await call('GET', '/api/categories');
  const categoryId = categories.body.data[0].id;

  const sku = `RACE-${Date.now()}`;
  const created = await call('POST', '/api/products', {
    name: 'Race test product',
    sku,
    cost_price: 1,
    category_id: categoryId,
    stock_quantity: STOCK,
  });
  if (created.status !== 201) throw new Error(`สร้างสินค้าไม่สำเร็จ: ${JSON.stringify(created.body)}`);
  const id = created.body.data.id;
  console.log(`สร้างสินค้า ${sku} (id ${id}) สต็อกเริ่มต้น ${STOCK}`);
  console.log(`ยิงคำขอลด 1 ชิ้น พร้อมกัน ${REQUESTS} ครั้ง...\n`);

  const results = await Promise.all(
    Array.from({ length: REQUESTS }, () =>
      call('PATCH', '/api/stock/adjust', { product_id: id, change: -1, reason: 'race test' })
    )
  );

  const ok = results.filter((r) => r.status === 200).length;
  const rejected = results.filter((r) => r.status === 409 && r.body.error.code === 'INSUFFICIENT_STOCK').length;
  const other = REQUESTS - ok - rejected;

  const product = (await call('GET', `/api/products/${id}`)).body.data;
  const history = (await call('GET', `/api/products/${id}/transactions?limit=100`)).body.data;
  const ledger = history.reduce((sum, t) => sum + (t.type === 'IN' ? t.quantity : -t.quantity), 0);

  console.log(`สำเร็จ (200):                ${ok}`);
  console.log(`ถูกปฏิเสธ (409 สต็อกไม่พอ):  ${rejected}`);
  console.log(`ผลลัพธ์อื่น:                 ${other}`);
  console.log(`สต็อกสุดท้าย:                ${product.stock_quantity}`);
  console.log(`ผลรวมจากประวัติรายการ:       ${ledger}\n`);

  const pass =
    ok === STOCK && rejected === REQUESTS - STOCK && other === 0 && product.stock_quantity === 0 && ledger === product.stock_quantity;
  console.log(pass ? 'ผ่าน: ไม่มีสต็อกติดลบ และยอดตรงกับประวัติ' : 'ไม่ผ่าน: ตรวจสอบ logic การ lock');
  process.exit(pass ? 0 : 1);
})().catch((err) => {
  console.error('ทดสอบไม่สำเร็จ:', err.message);
  process.exit(2);
});