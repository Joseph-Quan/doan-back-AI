const express = require('express');
const router = express.Router();
const { createOrder, getMyOrders, getOrderDetail, cancelOrder, adminGetOrders, adminUpdateOrderStatus, verifyPayment } = require('../controllers/orderController');
const { authenticate, requireAdmin, requireStaff } = require('../middleware/auth');

router.use(authenticate);

// Customer
router.post('/', createOrder);
router.get('/', getMyOrders);
router.get('/:id', getOrderDetail);
router.put('/:id/cancel', cancelOrder);

// Admin/Staff
router.get('/admin/list', requireStaff, adminGetOrders);
router.put('/admin/:id/status', requireStaff, adminUpdateOrderStatus);
router.post('/admin/:id/verify-payment', requireAdmin, verifyPayment);

module.exports = router;
