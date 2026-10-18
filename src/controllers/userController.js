const db = require('../config/database');

// GET /api/user/profile
const getProfile = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, email, phone, full_name, avatar, created_at, last_login FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ success: true, data: users[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// PUT /api/user/profile
const updateProfile = async (req, res) => {
  try {
    const { full_name, phone } = req.body;
    if (!full_name) return res.status(400).json({ success: false, message: 'Tên không được để trống.' });

    await db.query('UPDATE users SET full_name = ?, phone = ?, updated_at = NOW() WHERE id = ?', [full_name, phone, req.user.id]);
    res.json({ success: true, message: 'Cập nhật hồ sơ thành công.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// GET /api/user/addresses
const getAddresses = async (req, res) => {
  try {
    const [addresses] = await db.query('SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC', [req.user.id]);
    res.json({ success: true, data: addresses });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// POST /api/user/addresses
const addAddress = async (req, res) => {
  try {
    const { full_name, phone, province, district, ward, address_detail, is_default } = req.body;

    if (!full_name || !phone || !province || !district || !ward || !address_detail) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin địa chỉ.' });
    }

    if (is_default) {
      await db.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    }

    const [result] = await db.query(
      'INSERT INTO user_addresses (user_id, full_name, phone, province, district, ward, address_detail, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, full_name, phone, province, district, ward, address_detail, is_default ? 1 : 0]
    );

    res.status(201).json({ success: true, message: 'Thêm địa chỉ thành công.', data: { id: result.insertId } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// PUT /api/user/addresses/:id
const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, phone, province, district, ward, address_detail, is_default } = req.body;

    if (is_default) {
      await db.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    }

    await db.query(
      'UPDATE user_addresses SET full_name=?, phone=?, province=?, district=?, ward=?, address_detail=?, is_default=? WHERE id=? AND user_id=?',
      [full_name, phone, province, district, ward, address_detail, is_default ? 1 : 0, id, req.user.id]
    );

    res.json({ success: true, message: 'Cập nhật địa chỉ thành công.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// DELETE /api/user/addresses/:id
const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM user_addresses WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true, message: 'Đã xóa địa chỉ.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// GET /api/user/wishlist
const getWishlist = async (req, res) => {
  try {
    const [items] = await db.query(`
      SELECT w.id, w.created_at, p.id as product_id, p.name, p.slug, p.price, p.sale_price, p.average_rating,
             (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) as image
      FROM wishlists w JOIN products p ON p.id = w.product_id
      WHERE w.user_id = ? ORDER BY w.created_at DESC
    `, [req.user.id]);
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// POST /api/user/wishlist/:productId
const toggleWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const [existing] = await db.query('SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?', [req.user.id, productId]);

    if (existing.length) {
      await db.query('DELETE FROM wishlists WHERE user_id = ? AND product_id = ?', [req.user.id, productId]);
      res.json({ success: true, message: 'Đã xóa khỏi danh sách yêu thích.', liked: false });
    } else {
      await db.query('INSERT INTO wishlists (user_id, product_id) VALUES (?, ?)', [req.user.id, productId]);
      res.json({ success: true, message: 'Đã thêm vào danh sách yêu thích.', liked: true });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// GET /api/user/notifications
const getNotifications = async (req, res) => {
  try {
    const [notifications] = await db.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    const [unread] = await db.query('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
    res.json({ success: true, data: { notifications, unread_count: unread[0].c } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// PUT /api/user/notifications/read-all
const markAllNotificationsRead = async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, message: 'Đã đánh dấu tất cả là đã đọc.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// Admin: GET /api/admin/users
const adminGetUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '1=1';
    const params = [];
    if (search) { where += ' AND (u.email LIKE ? OR u.full_name LIKE ? OR u.phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (role_id) { where += ' AND u.role_id = ?'; params.push(role_id); }

    const [total] = await db.query(`SELECT COUNT(*) as c FROM users u WHERE ${where}`, params);
    const [users] = await db.query(`
      SELECT u.id, u.email, u.phone, u.full_name, u.role_id, u.is_active, u.created_at, u.last_login, r.name as role_name
      FROM users u JOIN roles r ON r.id = u.role_id WHERE ${where}
      ORDER BY u.created_at DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    res.json({ success: true, data: { users, total: total[0].c } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// Admin: PUT /api/admin/users/:id
const adminUpdateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role_id, is_active } = req.body;

    const old = await db.query('SELECT role_id, is_active FROM users WHERE id = ?', [id]);
    await db.query('UPDATE users SET role_id = ?, is_active = ? WHERE id = ?', [role_id, is_active, id]);
    await db.query('INSERT INTO admin_logs (user_id, action, entity_type, entity_id, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, 'update_user', 'user', id, JSON.stringify(old[0][0]), JSON.stringify({ role_id, is_active })]);

    res.json({ success: true, message: 'Cập nhật tài khoản thành công.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

module.exports = { getProfile, updateProfile, getAddresses, addAddress, updateAddress, deleteAddress, getWishlist, toggleWishlist, getNotifications, markAllNotificationsRead, adminGetUsers, adminUpdateUser };
