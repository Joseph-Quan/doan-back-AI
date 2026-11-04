const BaseModel = require('./BaseModel');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

class UserModel extends BaseModel {
  constructor() {
    super('users');

    // Hook: beforeCreate - Tự động băm mật khẩu nếu truyền password thuần
    this.addHook('beforeCreate', async (data) => {
      if (data.password && !data.password_hash) {
        data.password_hash = await bcrypt.hash(data.password, 10);
        delete data.password;
      }
      if (!data.avatar) {
        data.avatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80';
      }
      if (data.is_active === undefined) {
        data.is_active = 1;
      }
      if (data.role_id === undefined) {
        data.role_id = 1; // Mặc định là Khách hàng
      }
      if (!data.created_at) {
        data.created_at = new Date();
      }
      return data;
    });

    // Hook: beforeUpdate - Băm lại mật khẩu nếu có cập nhật
    this.addHook('beforeUpdate', async (data) => {
      if (data.password) {
        data.password_hash = await bcrypt.hash(data.password, 10);
        delete data.password;
      }
      return data;
    });
  }

  /**
   * Tìm người dùng theo Email hoặc Số điện thoại
   */
  async findByEmailOrPhone(identifier) {
    const [rows] = await db.query(
      `SELECT u.*, r.name as role_name 
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.email = ? OR u.phone = ?
       LIMIT 1`,
      [identifier, identifier]
    );
    return rows && rows.length > 0 ? rows[0] : null;
  }

  /**
   * Xác thực mật khẩu
   */
  async verifyPassword(user, password) {
    if (!user || !user.password_hash) return false;
    return bcrypt.compare(password, user.password_hash);
  }

  /**
   * Cập nhật thời điểm đăng nhập gần nhất
   */
  async touchLastLogin(userId) {
    await db.query(`UPDATE users SET last_login = NOW() WHERE id = ?`, [userId]);
  }

  /**
   * Lấy danh sách địa chỉ của người dùng
   */
  async getAddresses(userId) {
    const [rows] = await db.query(
      `SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC`,
      [userId]
    );
    return rows || [];
  }
}

module.exports = new UserModel();
