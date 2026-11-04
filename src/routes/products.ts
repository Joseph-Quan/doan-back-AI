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

/**
 * ========================================================
 * PHÂN LUỒNG ROUTER: SẢN PHẨM (PRODUCTS)
 * ========================================================
 */

// 1. Phân luồng Quản trị sản phẩm (Admin / Staff) - ĐẶT TRƯỚC :slug để tránh nuốt URL
router.get('/admin/list', authenticate, requireStaff, adminGetProducts);
router.post('/admin/create', authenticate, requireAdmin, createProduct);
router.get('/admin/:id', authenticate, requireStaff, adminGetProductById);
router.put('/admin/:id', authenticate, requireAdmin, updateProduct);
router.delete('/admin/:id', authenticate, requireAdmin, deleteProduct);
router.put('/admin/:id/stock', authenticate, requireStaff, updateStock);

// 2. Phân luồng Tiện ích & Danh mục (Tương thích ngược)
router.get('/categories', getCategories);

// 3. Phân luồng Cửa hàng công khai (Public Storefront)
router.get('/', getProducts);

// 4. Phân luồng Đánh giá sản phẩm (Protected)
router.post('/:id/reviews', authenticate, addReview);

// 5. Chi tiết sản phẩm theo Slug (Đặt ở cuối cùng của nhóm GET)
router.get('/:slug', (req, res, next) => {
  // Chặn trường hợp 'admin' lọt vào slug
  if (req.params.slug === 'admin') {
    return res.status(404).json({ success: false, message: 'Đường dẫn không hợp lệ.' });
  }
  return getProductBySlug(req, res, next);
});

module.exports = router;
