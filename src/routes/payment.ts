import express, { Router } from 'express';
import { getQRInfo, processVisaPayment, confirmQRTransfer } from '../controllers/paymentController';
import { authenticate } from '../middleware/auth';

const router: Router = express.Router();

router.use(authenticate);

router.get('/qr-info/:orderId', getQRInfo);
router.post('/visa-process', processVisaPayment);
router.post('/confirm-qr', confirmQRTransfer);

module.exports = router;
export default router;
