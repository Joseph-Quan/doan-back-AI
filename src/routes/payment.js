const express = require('express');
const router = express.Router();
const { getQRInfo, processVisaPayment, confirmQRTransfer } = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/qr-info/:orderId', getQRInfo);
router.post('/visa-process', processVisaPayment);
router.post('/confirm-qr', confirmQRTransfer);

module.exports = router;
