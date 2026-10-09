const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const productService = require('../services/productService');

const router = express.Router();

// POST /api/products - สร้างสินค้าใหม่
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const product = await productService.createProduct(req.body);
    res.status(201).json({ data: product });
  })
);

// GET /api/products - รายการสินค้า (ค้นหา/กรอง/แบ่งหน้า)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { items, meta } = await productService.listProducts(req.query);
    res.json({ data: items, meta });
  })
);

// GET /api/products/low-stock - ต้องวางก่อน /:id ไม่งั้น "low-stock" จะถูกตีความเป็น id
router.get(
  '/low-stock',
  asyncHandler(async (req, res) => {
    const { items, meta } = await productService.listLowStock(req.query);
    res.json({ data: items, meta });
  })
);

// GET /api/products/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await productService.getProduct(req.params.id) });
  })
);

// GET /api/products/:id/transactions - ประวัติการเพิ่ม/ลดสต็อกของสินค้า
router.get(
  '/:id/transactions',
  asyncHandler(async (req, res) => {
    const { items, meta } = await productService.listTransactions(req.params.id, req.query);
    res.json({ data: items, meta });
  })
);

module.exports = router;