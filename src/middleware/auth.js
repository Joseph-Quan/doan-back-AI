const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Xác thực JWT token
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'Bạn cần đăng nhập để thực hiện thao tác này.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const [users] = await db.query(
      'SELECT id, email, full_name, role_id, is_active FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!users.length || !users[0].is_active) {
      return res.status(401).json({ success: false, message: 'Tài khoản không hợp lệ hoặc đã bị khóa.' });
    }

    req.user = users[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
    }
    return res.status(401).json({ success: false, message: 'Token không hợp lệ.' });
  }
};

// Tùy chọn: xác thực nếu có token
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [users] = await db.query(
      'SELECT id, email, full_name, role_id, is_active FROM users WHERE id = ?',
      [decoded.userId]
    );
    if (users.length && users[0].is_active) {
      req.user = users[0];
    }
  } catch {}
  next();
};

// Kiểm tra quyền (role_id: 1=customer, 2=staff_sales, 3=staff_warehouse, 4=admin)
const requireRole = (...roleIds) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Chưa xác thực.' });
  }
  if (!roleIds.includes(req.user.role_id)) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này.' });
  }
  next();
};

const requireAdmin = requireRole(4);
const requireStaff = requireRole(2, 3, 4);
const requireCustomer = requireRole(1, 2, 3, 4);

module.exports = { authenticate, optionalAuth, requireRole, requireAdmin, requireStaff, requireCustomer };
