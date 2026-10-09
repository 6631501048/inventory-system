// ทดสอบ endpoint อ่านข้อมูล + categories โดย mock เฉพาะ db.query (route และ service เป็นของจริง)
jest.mock('../src/db', () => ({ query: jest.fn(), withTransaction: jest.fn(), pool: { end: jest.fn() } }));

const request = require('supertest');
const { query } = require('../src/db');
const app = require('../src/app');

const prodRow = (over = {}) => ({
  id: 1, category_id: 1, category_name: 'IT', name: 'Mouse', sku: 'MS-1', cost_price: '199.00',
  stock_quantity: 3, created_at: new Date(), updated_at: new Date(), ...over,
});

beforeEach(() => {
  query.mockReset();
  delete process.env.LOW_STOCK_THRESHOLD;
});

describe('GET /api/products/low-stock', () => {
  test('ใช้ threshold เริ่มต้น 5 และเรียกเป็น route low-stock (ไม่ถูกจับเป็น /:id)', async () => {
    query.mockResolvedValueOnce({ rows: [prodRow({ stock_quantity: 0 }), prodRow({ id: 2, stock_quantity: 4 })] });
    const res = await request(app).get('/api/products/low-stock');

    expect(res.status).toBe(200);
    expect(query.mock.calls[0][0]).toMatch(/p\.stock_quantity < \$1/);
    expect(query.mock.calls[0][1]).toEqual([5]);
    expect(res.body.meta).toEqual({ threshold: 5, count: 2 });
    expect(res.body.data[0]).toMatchObject({ category_name: 'IT', cost_price: 199 });
  });

  test('เปลี่ยน threshold ได้ด้วย ?threshold=10', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/products/low-stock?threshold=10');
    expect(query.mock.calls[0][1]).toEqual([10]);
    expect(res.body.meta.threshold).toBe(10);
  });

  test('อ่านค่าเริ่มต้นจาก LOW_STOCK_THRESHOLD', async () => {
    process.env.LOW_STOCK_THRESHOLD = '8';
    query.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/products/low-stock');
    expect(query.mock.calls[0][1]).toEqual([8]);
  });

  test('400 เมื่อ threshold ไม่ใช่จำนวนเต็ม', async () => {
    const res = await request(app).get('/api/products/low-stock?threshold=abc');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('GET /api/products', () => {
  test('ค่าเริ่มต้น: หน้า 1, 20 รายการ, ไม่มี WHERE', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: 45 }] }).mockResolvedValueOnce({ rows: [prodRow()] });
    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(query.mock.calls[1][1]).toEqual([20, 0]);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 45, total_pages: 3 });
  });

  test('search + category_id + แบ่งหน้า สร้าง SQL และ params ถูกต้อง', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: 1 }] }).mockResolvedValueOnce({ rows: [prodRow()] });
    await request(app).get('/api/products?search=mouse&category_id=2&page=3&limit=10');

    expect(query.mock.calls[1][0]).toMatch(/ILIKE \$1 OR p\.sku ILIKE \$1/);
    expect(query.mock.calls[1][0]).toMatch(/p\.category_id = \$2/);
    expect(query.mock.calls[1][1]).toEqual(['%mouse%', 2, 10, 20]);
  });

  test('escape % และ _ ในคำค้นหา', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: 0 }] }).mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/products').query({ search: '50%_off' });
    expect(query.mock.calls[0][1]).toEqual(['%50\\%\\_off%']);
  });

  test.each([['page=0'], ['page=abc'], ['limit=101'], ['limit=-1'], ['category_id=x']])('400 เมื่อ %s', async (qs) => {
    const res = await request(app).get(`/api/products?${qs}`);
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('GET /api/products/:id', () => {
  test('200 พบสินค้า', async () => {
    query.mockResolvedValueOnce({ rows: [prodRow()] });
    const res = await request(app).get('/api/products/1');
    expect(res.status).toBe(200);
    expect(res.body.data.sku).toBe('MS-1');
  });

  test('404 ไม่พบสินค้า', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/products/999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test.each([['abc'], ['0'], ['1.5'], ['-1']])('400 เมื่อ id = %s', async (id) => {
    const res = await request(app).get(`/api/products/${id}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/products/:id/transactions', () => {
  test('200 เรียงใหม่ไปเก่าและมี meta', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })
      .mockResolvedValueOnce({
        rows: [
          { id: '2', product_id: 1, type: 'OUT', quantity: 1, stock_before: 5, stock_after: 4, reason: null, created_at: new Date() },
          { id: '1', product_id: 1, type: 'IN', quantity: 5, stock_before: 0, stock_after: 5, reason: 'Initial stock', created_at: new Date() },
        ],
      });
    const res = await request(app).get('/api/products/1/transactions');
    expect(res.status).toBe(200);
    expect(query.mock.calls[2][0]).toMatch(/ORDER BY id DESC/);
    expect(res.body.data.map((t) => t.id)).toEqual([2, 1]);
    expect(res.body.meta.total).toBe(2);
  });

  test('404 เมื่อไม่พบสินค้า', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/products/999/transactions');
    expect(res.status).toBe(404);
  });
});

describe('categories', () => {
  test('GET /api/categories พร้อม product_count', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'IT', description: null, product_count: 4, created_at: new Date() }],
    });
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ name: 'IT', product_count: 4 });
  });

  test('POST /api/categories 201', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 4, name: 'Tools', description: null, created_at: new Date() }] });
    const res = await request(app).post('/api/categories').send({ name: ' Tools ' });
    expect(res.status).toBe(201);
    expect(query.mock.calls[0][1]).toEqual(['Tools', null]);
    expect(res.body.data).toMatchObject({ id: 4, name: 'Tools', product_count: 0 });
  });

  test('POST /api/categories 400 เมื่อไม่ส่งชื่อ', async () => {
    const res = await request(app).post('/api/categories').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('name');
  });

  test('POST /api/categories 409 เมื่อชื่อซ้ำ', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    const res = await request(app).post('/api/categories').send({ name: 'IT' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_CATEGORY');
  });
});