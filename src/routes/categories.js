const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const categoryService = require('../services/categoryService');

const router = express.Router();

// GET /api/categories
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ data: await categoryService.listCategories() });
  })
);

// POST /api/categories
router.post(
  '/',
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await categoryService.createCategory(req.body) });
  })
);

module.exports = router;