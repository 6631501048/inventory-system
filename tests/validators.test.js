const { validateProductInput, validateAdjustInput } = require('../src/validators');

describe('validateProductInput', () => {
  const valid = { name: ' Keyboard ', sku: 'kb-001', cost_price: 350.5, category_id: 1, stock_quantity: 10 };

  test('ข้อมูลถูกต้อง: trim ชื่อ และแปลง SKU เป็นตัวพิมพ์ใหญ่', () => {
    const { value, errors } = validateProductInput(valid);
    expect(errors).toEqual([]);
    expect(value).toEqual({ name: 'Keyboard', sku: 'KB-001', cost_price: 350.5, category_id: 1, stock_quantity: 10 });
  });

  test('stock_quantity ไม่ส่งมา = 0', () => {
    const { value } = validateProductInput({ ...valid, stock_quantity: undefined });
    expect(value.stock_quantity).toBe(0);
  });

  test('รวมทุก error ที่พบในครั้งเดียว', () => {
    const { errors, value } = validateProductInput({});
    expect(value).toBeNull();
    expect(errors.map((e) => e.field)).toEqual(['name', 'sku', 'cost_price', 'category_id']);
  });

  test.each([
    ['ชื่อว่าง', { name: '   ' }, 'name'],
    ['SKU มีช่องว่าง', { sku: 'AB CD' }, 'sku'],
    ['ราคาติดลบ', { cost_price: -1 }, 'cost_price'],
    ['ราคาทศนิยมเกิน 2 ตำแหน่ง', { cost_price: 1.234 }, 'cost_price'],
    ['ราคาเป็นข้อความที่ไม่ใช่ตัวเลข', { cost_price: 'abc' }, 'cost_price'],
    ['category_id เป็น 0', { category_id: 0 }, 'category_id'],
    ['สต็อกติดลบ', { stock_quantity: -1 }, 'stock_quantity'],
    ['สต็อกเป็นทศนิยม', { stock_quantity: 1.5 }, 'stock_quantity'],
  ])('ปฏิเสธ: %s', (_label, patch, field) => {
    const { errors } = validateProductInput({ ...valid, ...patch });
    expect(errors.map((e) => e.field)).toContain(field);
  });

  test('ปฏิเสธ body ที่ไม่ใช่ object', () => {
    expect(validateProductInput(null).errors[0].field).toBe('body');
    expect(validateProductInput([]).errors[0].field).toBe('body');
  });
});

describe('validateAdjustInput', () => {
  test('รับตัวเลขบวกและลบ', () => {
    expect(validateAdjustInput({ product_id: 1, change: 10 }).value).toEqual({ product_id: 1, change: 10, reason: null });
    expect(validateAdjustInput({ product_id: 1, change: -5, reason: ' ขายออก ' }).value).toEqual({
      product_id: 1,
      change: -5,
      reason: 'ขายออก',
    });
  });

  test('รับข้อความ "+10" และ "-5"', () => {
    expect(validateAdjustInput({ product_id: '2', change: '+10' }).value.change).toBe(10);
    expect(validateAdjustInput({ product_id: '2', change: '-5' }).value.change).toBe(-5);
  });

  test.each([
    ['change = 0', { product_id: 1, change: 0 }, 'change'],
    ['change เป็นทศนิยม', { product_id: 1, change: 1.5 }, 'change'],
    ['change ไม่ใช่ตัวเลข', { product_id: 1, change: 'abc' }, 'change'],
    ['change ไม่ส่งมา', { product_id: 1 }, 'change'],
    ['change ใหญ่เกินไป', { product_id: 1, change: 1000001 }, 'change'],
    ['product_id ไม่ส่งมา', { change: 1 }, 'product_id'],
    ['product_id ติดลบ', { product_id: -1, change: 1 }, 'product_id'],
    ['reason ไม่ใช่ข้อความ', { product_id: 1, change: 1, reason: 123 }, 'reason'],
    ['reason ยาวเกิน', { product_id: 1, change: 1, reason: 'x'.repeat(256) }, 'reason'],
  ])('ปฏิเสธ: %s', (_label, body, field) => {
    const { errors, value } = validateAdjustInput(body);
    expect(value).toBeNull();
    expect(errors.map((e) => e.field)).toContain(field);
  });
});
