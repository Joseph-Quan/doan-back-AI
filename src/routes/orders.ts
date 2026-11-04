import express, { Router } from 'express';
import {
  createOrder,
  getMyOrders,
  getOrderDetail,
  getOrderTracking,
  cancelOrder,
  adminGetOrders,
  adminUpdateOrderStatus,
  verifyPayment
} from '../controllers/orderController';
import { authenticate, requireAdmin, requireStaff } from '../middleware/auth';

const router: Router = express.Router();

/**
 * ========================================================
 * PHÂN LUỒNG ROUTER: ĐƠN HÀNG (ORDERS)
 * ========================================================
 */

router.use(authenticate);

// 1. Phân luồng Quản trị Đơn hàng (Staff & Admin)
router.get('/admin/list', requireStaff, adminGetOrders);
router.put('/admin/:id/status', requireStaff, adminUpdateOrderStatus);
router.post('/admin/:id/verify-payment', requireAdmin, verifyPayment);

// 2. Phân luồng Khách hàng (Customer Orders)
router.post('/', createOrder);
router.get('/', getMyOrders);
router.put('/:id/cancel', cancelOrder);
router.get('/:id/tracking', getOrderTracking);
router.get('/:id', getOrderDetail);

module.exports = router;
export default router;
