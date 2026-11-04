const express = require('express');
const router = express.Router();
const {
  getDashboard,
  getBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  getTransactions,
  getAdminLogs,
  getBankAccounts,
  updateBankAccount,
  getPublicBanners,
  validatePromotion
} = require('../controllers/adminController');
const {
  adminGetProducts,
  adminGetProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  updateStock
} = require('../controllers/productController');
const {
  adminGetOrders,
  adminUpdateOrderStatus,
  verifyPayment
} = require('../controllers/orderController');
const {
  adminGetUsers,
  adminUpdateUser
} = require('../controllers/userController');
const { authenticate, requireAdmin, requireStaff } = require('../middleware/auth');

/**
 * ========================================================
 * PHÂN LUỒNG ROUTER: CỔNG QUẢN TRỊ TRUNG TÂM (ADMIN PORTAL)
 * ========================================================
 */

// --- 1. Tương thích ngược cho các route công khai từng nằm trong admin ---
router.get('/banners/public', getPublicBanners);
router.post('/promotions/validate', authenticate, validatePromotion);
router.get('/bank-accounts', authenticate, getBankAccounts);

// --- 2. Bắt buộc đăng nhập cho toàn bộ các route quản trị còn lại ---
router.use(authenticate);

// --- 3. Thống kê & Báo cáo Dashboard ---
router.get('/dashboard', requireStaff, getDashboard);
router.get('/transactions', requireStaff, getTransactions);
router.get('/logs', requireAdmin, getAdminLogs);

// --- 4. Quản lý Sản phẩm tập trung tại Admin ---
router.get('/products', requireStaff, adminGetProducts);
router.get('/products/list', requireStaff, adminGetProducts);
router.get('/products/:id', requireStaff, adminGetProductById);
router.post('/products', requireAdmin, createProduct);
router.post('/products/create', requireAdmin, createProduct);
router.put('/products/:id', requireAdmin, updateProduct);
router.delete('/products/:id', requireAdmin, deleteProduct);
router.put('/products/:id/stock', requireStaff, updateStock);

// --- 5. Quản lý Đơn hàng tập trung tại Admin ---
router.get('/orders', requireStaff, adminGetOrders);
router.get('/orders/list', requireStaff, adminGetOrders);
router.put('/orders/:id/status', requireStaff, adminUpdateOrderStatus);
router.post('/orders/:id/verify-payment', requireAdmin, verifyPayment);

// --- 6. Quản lý Người dùng tập trung tại Admin ---
router.get('/users', requireAdmin, adminGetUsers);
router.put('/users/:id', requireAdmin, adminUpdateUser);

// --- 7. Quản lý Banners ---
router.get('/banners', requireAdmin, getBanners);
router.post('/banners', requireAdmin, createBanner);
router.put('/banners/:id', requireAdmin, updateBanner);
router.delete('/banners/:id', requireAdmin, deleteBanner);

// --- 8. Cấu hình Tài khoản Ngân hàng (VietQR) ---
router.put('/bank-accounts/:id', requireAdmin, updateBankAccount);

module.exports = router;
