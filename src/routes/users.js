const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, getAddresses, addAddress, updateAddress, deleteAddress, getWishlist, toggleWishlist, getNotifications, markAllNotificationsRead, adminGetUsers, adminUpdateUser } = require('../controllers/userController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate);

// Profile
router.get('/profile', getProfile);
router.put('/profile', updateProfile);

// Addresses
router.get('/addresses', getAddresses);
router.post('/addresses', addAddress);
router.put('/addresses/:id', updateAddress);
router.delete('/addresses/:id', deleteAddress);

// Wishlist
router.get('/wishlist', getWishlist);
router.post('/wishlist/:productId', toggleWishlist);
router.delete('/wishlist/:productId', toggleWishlist);

// Notifications
router.get('/notifications', getNotifications);
router.put('/notifications/read-all', markAllNotificationsRead);

// Admin
router.get('/admin/users', requireAdmin, adminGetUsers);
router.put('/admin/users/:id', requireAdmin, adminUpdateUser);

module.exports = router;
