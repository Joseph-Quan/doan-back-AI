import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { AuthUser } from '../types';

const db = require('../config/database');

// Xác thực JWT token
const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = (req as any).cookies?.token;
    const token = authHeader?.replace('Bearer ', '') || cookieToken;
    
    if (!token) {
      res.status(401).json({ success: false, message: 'Bạn cần đăng nhập để thực hiện thao tác này.' });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: number };
    
    const [users]: [AuthUser[], any] = await db.query(
      'SELECT id, email, full_name, role_id, is_active FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!users.length || !users[0].is_active) {
      res.status(401).json({ success: false, message: 'Tài khoản không hợp lệ hoặc đã bị khóa.' });
      return;
    }

    (req as any).user = users[0];
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
      return;
    }
    res.status(401).json({ success: false, message: 'Token không hợp lệ.' });
  }
};

// Tùy chọn: xác thực nếu có token
const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = (req as any).cookies?.token;
    const token = authHeader?.replace('Bearer ', '') || cookieToken;
    if (!token) { next(); return; }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: number };
    const [users]: [AuthUser[], any] = await db.query(
      'SELECT id, email, full_name, role_id, is_active FROM users WHERE id = ?',
      [decoded.userId]
    );
    if (users.length && users[0].is_active) {
      (req as any).user = users[0];
    }
  } catch {
    // Token không hợp lệ -> bỏ qua, không cản request
  }
  next();
};

// Kiểm tra quyền (role_id: 1=customer, 2=staff_sales, 3=staff_warehouse, 4=admin)
const requireRole = (...roleIds: number[]) => (req: Request, res: Response, next: NextFunction): void => {
  const user: AuthUser | undefined = (req as any).user;
  if (!user) {
    res.status(401).json({ success: false, message: 'Chưa xác thực.' });
    return;
  }
  if (!roleIds.includes(user.role_id)) {
    res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này.' });
    return;
  }
  next();
};

const requireAdmin = requireRole(4);
const requireStaff = requireRole(2, 3, 4);
const requireCustomer = requireRole(1, 2, 3, 4);

module.exports = { authenticate, optionalAuth, requireRole, requireAdmin, requireStaff, requireCustomer };
export { authenticate, optionalAuth, requireRole, requireAdmin, requireStaff, requireCustomer };
