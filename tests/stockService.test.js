// mock DB: withTransaction เรียก work ด้วย client ปลอม และบันทึกว่า commit หรือ rollback
const mockClient = { query: jest.fn() };
let mockOutcome;

jest.mock('../src/db', () => ({
  withTransaction: jest.fn(async (work) => {
    try {
      const result = await work(mockClient);
      mockOutcome = 'COMMIT';
      return result;
    } catch (err) {
      mockOutcome = 'ROLLBACK';
      throw err;
    }
  }),
}));

const { adjustStock, computeAdjustment } = require('../src/services/stockService');

const productRow = (stock) => ({
  id: 1, category_id: 1, name: 'Mouse', sku: 'MS-1', cost_price: '199.00',
  stock_quantity: stock, created_at: new Date(), updated_at: new Date(),
});
const txRow = (over) => ({ id: '1', product_id: 1, reason: null, created_at: new Date(), ...over });

beforeEach(() => {
  mockClient.query.mockReset();
  mockOutcome = undefined;
});

describe('computeAdjustment (pure logic)', () => {
  test('เพิ่มสต็อก => IN', () => {
    expect(computeAdjustment(3, 10)).toEqual({ after: 13, type: 'IN', quantity: 10 });
  });
  test('ลดสต็อก => OUT', () => {
    expect(computeAdjustment(10, -4)).toEqual({ after: 6, type: 'OUT', quantity: 4 });
  });
  test('ลดจนเหลือ 0 พอดีได้', () => {
    expect(computeAdjustment(5, -5).after).toBe(0);
  });
  test('ลดเกินคงเหลือ => 409 INSUFFICIENT_STOCK', () => {
    expect.assertions(3);
    try {
      computeAdjustment(5, -6);
    } catch (err) {
      expect(err.status).toBe(409);
      expect(err.code).toBe('INSUFFICIENT_STOCK');
      expect(err.details).toEqual({ available: 5, requested: 6 });
    }
  });
  test('เกินขีดจำกัด INTEGER => 409 STOCK_LIMIT_EXCEEDED', () => {
    expect(() => computeAdjustment(2147483647, 1)).toThrow(expect.objectContaining({ code: 'STOCK_LIMIT_EXCEEDED' }));
  });
});

describe('adjustStock', () => {
  test('สำเร็จ: lock แถว (FOR UPDATE) -> update สต็อก -> insert transaction -> COMMIT', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 1, stock_quantity: 3 }] })
      .mockResolvedValueOnce({ rows: [productRow(13)] })
      .mockResolvedValueOnce({ rows: [txRow({ type: 'IN', quantity: 10, stock_before: 3, stock_after: 13 })] });

    const result = await adjustStock({ product_id: 1, change: 10, reason: 'รับของเข้า' });

    expect(mockClient.query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
    expect(mockClient.query.mock.calls[2][0]).toMatch(/INSERT INTO stock_transactions/);
    expect(mockClient.query.mock.calls[2][1]).toEqual([1, 'IN', 10, 3, 13, 'รับของเข้า']);
    expect(result.product.stock_quantity).toBe(13);
    expect(result.product.cost_price).toBe(199); // แปลงจาก string เป็นตัวเลข
    expect(result.transaction).toMatchObject({ type: 'IN', quantity: 10, stock_before: 3, stock_after: 13 });
    expect(mockOutcome).toBe('COMMIT');
  });

  test('สต็อกไม่พอ: 409, ไม่ UPDATE/INSERT อะไรเลย, ROLLBACK', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1, stock_quantity: 2 }] });

    await expect(adjustStock({ product_id: 1, change: -5 })).rejects.toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
    });
    expect(mockClient.query).toHaveBeenCalledTimes(1); // มีแค่ SELECT
    expect(mockOutcome).toBe('ROLLBACK');
  });

  test('ไม่พบสินค้า: 404', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    await expect(adjustStock({ product_id: 999, change: 1 })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(mockOutcome).toBe('ROLLBACK');
  });

  test('ข้อมูลไม่ถูกต้อง: 400 และไม่แตะ DB เลย', async () => {
    await expect(adjustStock({ product_id: 1, change: 0 })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  test('ถ้า INSERT transaction ล้มเหลว ต้อง ROLLBACK (ไม่ปล่อยให้ UPDATE สต็อกค้าง)', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 1, stock_quantity: 3 }] })
      .mockResolvedValueOnce({ rows: [productRow(13)] })
      .mockRejectedValueOnce(new Error('db down'));

    await expect(adjustStock({ product_id: 1, change: 10 })).rejects.toThrow('db down');
    expect(mockOutcome).toBe('ROLLBACK');
  });
});
