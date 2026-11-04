import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, getMe, getSecurityQuestions, forgotPassword, verifySecurityAnswer, resetPassword, changePassword } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router: Router = express.Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: 'Quá nhiều lần thử. Vui lòng thử lại sau 15 phút.' } });
const forgotLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { success: false, message: 'Quá nhiều yêu cầu. Thử lại sau 1 giờ.' } });

router.post('/register', register);
router.post('/login', loginLimiter, login);
router.get('/me', authenticate, getMe);
router.get('/security-questions', getSecurityQuestions);
router.post('/forgot-password', forgotLimiter, forgotPassword);
router.post('/verify-security-answer', forgotLimiter, verifySecurityAnswer);
router.post('/reset-password', resetPassword);
router.post('/change-password', authenticate, changePassword);

module.exports = router;
export default router;
