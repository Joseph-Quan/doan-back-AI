import express, { Router } from 'express';
import { getCart, addToCart, updateCartItem, removeCartItem, clearCart } from '../controllers/cartController';
import { authenticate } from '../middleware/auth';

const router: Router = express.Router();

router.use(authenticate);
router.get('/', getCart);
router.post('/', addToCart);
router.put('/:id', updateCartItem);
router.delete('/:id', removeCartItem);
router.delete('/', clearCart);

module.exports = router;
export default router;
