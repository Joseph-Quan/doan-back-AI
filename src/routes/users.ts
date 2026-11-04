import express, { Router } from 'express';
import {
  getProfile,
  updateProfile,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  getWishlist,
  toggleWishlist,
  getNotifications,
  markAllNotificationsRead,
  adminGetUsers,
  adminUpdateUser
} from '../controllers/userController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router: Router = express.Router();

/**
 * ========================================================
 * PHÂN LUỒNG ROUTER: TÀI KHOẢN NGƯỜI DÙNG (USERS)
 * ========================================================
 */

router.use(authenticate);

// 1. Phân luồng Quản trị tài khoản người dùng (Admin)
router.get('/admin/users', requireAdmin, adminGetUsers);
router.put('/admin/users/:id', requireAdmin, adminUpdateUser);

// 2. Phân luồng Hồ sơ cá nhân (Profile)
router.get('/profile', getProfile);
router.put('/profile', updateProfile);

// 3. Phân luồng Sổ địa chỉ (Address Book)
router.get('/addresses', getAddresses);
router.post('/addresses', addAddress);
router.put('/addresses/:id', updateAddress);
router.delete('/addresses/:id', deleteAddress);

// 4. Phân luồng Sản phẩm yêu thích (Wishlist)
router.get('/wishlist', getWishlist);
router.post('/wishlist/:productId', toggleWishlist);
router.delete('/wishlist/:productId', toggleWishlist);

// 5. Phân luồng Thông báo (Notifications)
router.get('/notifications', getNotifications);
router.put('/notifications/read-all', markAllNotificationsRead);

module.exports = router;
export default router;
