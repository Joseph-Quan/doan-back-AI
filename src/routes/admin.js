const express = require('express');
const router = express.Router();
const { getDashboard, getBanners, createBanner, updateBanner, deleteBanner, getTransactions, getAdminLogs, getBankAccounts, updateBankAccount, getPublicBanners, validatePromotion } = require('../controllers/adminController');
const { authenticate, requireAdmin, requireStaff } = require('../middleware/auth');

// Public
router.get('/banners/public', getPublicBanners);
router.post('/promotions/validate', authenticate, validatePromotion);
router.get('/bank-accounts', authenticate, getBankAccounts);

// Staff/Admin
router.use(authenticate);
router.get('/dashboard', requireStaff, getDashboard);
router.get('/transactions', requireStaff, getTransactions);
router.get('/logs', requireAdmin, getAdminLogs);

// Banners - Admin only
router.get('/banners', requireAdmin, getBanners);
router.post('/banners', requireAdmin, createBanner);
router.put('/banners/:id', requireAdmin, updateBanner);
router.delete('/banners/:id', requireAdmin, deleteBanner);

// Bank accounts - Admin only
router.put('/bank-accounts/:id', requireAdmin, updateBankAccount);

module.exports = router;
