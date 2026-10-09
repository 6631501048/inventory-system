const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const stockService = require('../services/stockService');

const router = express.Router();

// PATCH /api/stock/adjust - ปรับสต็อก (+ เพิ่ม, - ลด)
router.patch(
  '/adjust',
  asyncHandler(async (req, res) => {
    const result = await stockService.adjustStock(req.body);
    res.json({ data: result });
  })
);

module.exports = router;
