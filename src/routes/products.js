const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductBySlug,
  getCategories,
  addReview,
  createProduct,
  updateProduct,
  deleteProduct,
  adminGetProducts,
  adminGetProductById,
  updateStock
} = require('../controllers/productController');
const { authenticate, requireAdmin, requireStaff } = require('../middleware/auth');

// Public
router.get('/categories', getCategories);
router.get('/', getProducts);
router.get('/:slug', getProductBySlug);

// Protected
router.post('/:id/reviews', authenticate, addReview);

// Admin/Staff Product Management
router.get('/admin/list', authenticate, requireStaff, adminGetProducts);
router.get('/admin/:id', authenticate, requireStaff, adminGetProductById);
router.post('/admin/create', authenticate, requireAdmin, createProduct);
router.put('/admin/:id', authenticate, requireAdmin, updateProduct);
router.delete('/admin/:id', authenticate, requireAdmin, deleteProduct);
router.put('/admin/:id/stock', authenticate, requireStaff, updateStock);

module.exports = router;
