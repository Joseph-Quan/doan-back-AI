const express = require('express');
const router = express.Router();
const { validatePromotion } = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const db = require('../config/database');

/**
 * ========================================================
 * PHÂN LUỒNG ROUTER: MÃ KHUYẾN MÃI (PROMOTIONS)
 * ========================================================
 */

// [PUBLIC / AUTH] Kiểm tra tính hợp lệ của mã giảm giá khi thanh toán
router.post('/validate', authenticate, validatePromotion);

// [PUBLIC] Lấy danh sách các mã khuyến mãi công khai đang hoạt động
router.get('/public', async (req, res) => {
  try {
    const [promos] = await db.query(`
      SELECT id, code, name, type, value, min_order_amount, max_discount_amount, start_date, end_date
      FROM promotions
      WHERE is_active = 1
        AND (start_date IS NULL OR start_date <= NOW())
        AND (end_date IS NULL OR end_date >= NOW())
        AND (usage_limit IS NULL OR usage_count < usage_limit)
      ORDER BY id DESC
    `);
    res.json({ success: true, data: promos });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

// [ADMIN] Lấy toàn bộ danh sách mã khuyến mãi trong hệ thống
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const [promos] = await db.query('SELECT * FROM promotions ORDER BY id DESC');
    res.json({ success: true, data: promos });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

// [ADMIN] Tạo mã khuyến mãi mới
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { code, name, type, value, min_order_amount, max_discount_amount, usage_limit, start_date, end_date } = req.body;
    if (!code || value === undefined) {
      return res.status(400).json({ success: false, message: 'Mã code và giá trị giảm giá là bắt buộc.' });
    }

    const cleanCode = code.trim().toUpperCase();
    const [result] = await db.query(
      `INSERT INTO promotions (code, name, type, value, min_order_amount, max_discount_amount, usage_limit, start_date, end_date, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [cleanCode, name || cleanCode, type || 'percentage', Number(value), min_order_amount || 0, max_discount_amount || null, usage_limit || null, start_date || null, end_date || null]
    );

    res.status(201).json({
      success: true,
      message: 'Tạo mã khuyến mãi mới thành công!',
      data: { id: result.insertId, code: cleanCode }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server khi tạo mã khuyến mãi.' });
  }
});

// [ADMIN] Cập nhật mã khuyến mãi
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, type, value, min_order_amount, max_discount_amount, usage_limit, is_active, start_date, end_date } = req.body;

    await db.query(
      `UPDATE promotions SET code=?, name=?, type=?, value=?, min_order_amount=?, max_discount_amount=?, usage_limit=?, is_active=?, start_date=?, end_date=?, updated_at=NOW() WHERE id=?`,
      [code ? code.trim().toUpperCase() : undefined, name, type, value, min_order_amount, max_discount_amount, usage_limit, is_active !== undefined ? Number(is_active) : 1, start_date, end_date, id]
    );

    res.json({ success: true, message: 'Cập nhật mã khuyến mãi thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server khi cập nhật mã khuyến mãi.' });
  }
});

// [ADMIN] Xóa mã khuyến mãi
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM promotions WHERE id = ?', [id]);
    res.json({ success: true, message: 'Đã xóa mã khuyến mãi.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

module.exports = router;
