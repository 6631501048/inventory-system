// ทดสอบชั้น HTTP: status code, รูปแบบ response และ error format
jest.mock('../src/services/productService');
jest.mock('../src/services/stockService');
jest.mock('../src/db', () => ({ query: jest.fn(), withTransaction: jest.fn(), pool: { end: jest.fn() } }));

const request = require('supertest');
const app = require('../src/app');
const productService = require('../src/services/productService');
const stockService = require('../src/services/stockService');
const { AppError, badRequest, conflict, notFound } = require('../src/errors');

describe('POST /api/products', () => {
  test('201 และส่งข้อมูลสินค้ากลับใน data', async () => {
    productService.createProduct.mockResolvedValue({ id: 1, sku: 'KB-001' });
    const res = await request(app).post('/api/products').send({ name: 'Keyboard' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { id: 1, sku: 'KB-001' } });
  });

  test('400 VALIDATION_ERROR พร้อม details', async () => {
    productService.createProduct.mockRejectedValue(badRequest('ข้อมูลสินค้าไม่ถูกต้อง', [{ field: 'sku', message: 'x' }]));
    const res = await request(app).post('/api/products').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: [{ field: 'sku' }] });
  });

  test('409 DUPLICATE_SKU', async () => {
    productService.createProduct.mockRejectedValue(conflict('DUPLICATE_SKU', 'ซ้ำ'));
    const res = await request(app).post('/api/products').send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_SKU');
  });

  test('400 INVALID_JSON เมื่อ body พัง', async () => {
    const res = await request(app).post('/api/products').set('Content-Type', 'application/json').send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('PATCH /api/stock/adjust', () => {
  test('200 ส่ง product และ transaction กลับ', async () => {
    stockService.adjustStock.mockResolvedValue({ product: { id: 1, stock_quantity: 13 }, transaction: { id: 5 } });
    const res = await request(app).patch('/api/stock/adjust').send({ product_id: 1, change: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.product.stock_quantity).toBe(13);
    expect(stockService.adjustStock).toHaveBeenCalledWith({ product_id: 1, change: 10 });
  });

  test('409 INSUFFICIENT_STOCK', async () => {
    stockService.adjustStock.mockRejectedValue(new AppError(409, 'INSUFFICIENT_STOCK', 'สต็อกไม่พอ'));
    const res = await request(app).patch('/api/stock/adjust').send({ product_id: 1, change: -99 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  test('404 NOT_FOUND', async () => {
    stockService.adjustStock.mockRejectedValue(notFound('ไม่พบสินค้า'));
    const res = await request(app).patch('/api/stock/adjust').send({ product_id: 999, change: 1 });
    expect(res.status).toBe(404);
  });

  test('500 INTERNAL_ERROR เมื่อเกิด error ที่ไม่คาดคิด (ไม่เผยรายละเอียดภายใน)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    stockService.adjustStock.mockRejectedValue(new Error('secret db detail'));
    const res = await request(app).patch('/api/stock/adjust').send({ product_id: 1, change: 1 });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
  });
});

describe('route ที่ไม่มีอยู่', () => {
  test('404 ROUTE_NOT_FOUND', async () => {
    const res = await request(app).get('/api/nothing');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});
