const express = require('express');
const router = express.Router();
const {
  getBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  getPublicBanners
} = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * ========================================================
 * PHÂN LUỒNG ROUTER: BANNER SLIDER (BANNERS)
 * ========================================================
 */

// [PUBLIC] Danh sách banner công khai hiển thị trên trang chủ
router.get('/', getPublicBanners);
router.get('/public', getPublicBanners);

// [ADMIN] Quản trị banner
router.get('/all', authenticate, requireAdmin, getBanners);
router.post('/', authenticate, requireAdmin, createBanner);
router.put('/:id', authenticate, requireAdmin, updateBanner);
router.delete('/:id', authenticate, requireAdmin, deleteBanner);

module.exports = router;
