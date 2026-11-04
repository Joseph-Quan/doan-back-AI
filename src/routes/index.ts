import express, { Router } from 'express';

const router: Router = express.Router();

// Import các nhánh phân luồng router
const authRoutes = require('./auth');
const productRoutes = require('./products');
const categoryRoutes = require('./categories');
const bannerRoutes = require('./banners');
const promotionRoutes = require('./promotions');
const cartRoutes = require('./cart');
const orderRoutes = require('./orders');
const userRoutes = require('./users');
const paymentRoutes = require('./payment');
const uploadRoutes = require('./upload');
const adminRoutes = require('./admin');
const aiRoutes = require('./ai');

/**
 * ========================================================
 * KIẾN TRÚC PHÂN LUỒNG ROUTER TRUNG TÂM (CENTRAL GATEWAY)
 * ========================================================
 */

// 1. Phân luồng Cổng Xác thực & Bảo mật (Auth Gateway)
router.use('/auth', authRoutes);

// 2. Phân luồng Sản phẩm & Danh mục (Catalog & Products)
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);

// 3. Phân luồng Tiếp thị & Khuyến mãi (Banners & Promotions)
router.use('/banners', bannerRoutes);
router.use('/promotions', promotionRoutes);

// 4. Phân luồng Khách hàng cá nhân (Customer Portal)
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/users', userRoutes);
router.use('/payment', paymentRoutes);
router.use('/upload', uploadRoutes);
router.use('/ai', aiRoutes);

// 5. Phân luồng Cổng Quản trị & Vận hành (Staff / Admin Portal - RBAC)
router.use('/admin', adminRoutes);

module.exports = router;
export default router;
