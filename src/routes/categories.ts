const express = require('express');
const router = express.Router();
const { getCategories } = require('../controllers/productController');
const { authenticate, requireStaff, requireAdmin } = require('../middleware/auth');
const db = require('../config/database');

/**
 * ========================================================
 * PHÂN LUỒNG ROUTER: DANH MỤC SẢN PHẨM (CATEGORIES)
 * ========================================================
 */

// [PUBLIC] Lấy danh sách danh mục kèm số lượng sản phẩm
router.get('/', getCategories);

// [PUBLIC] Lấy chi tiết danh mục theo slug
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const [categories] = await db.query(
      'SELECT * FROM categories WHERE slug = ? AND is_active = 1 LIMIT 1',
      [slug]
    );
    if (!categories.length) {
      return res.status(404).json({ success: false, message: 'Danh mục không tồn tại.' });
    }
    res.json({ success: true, data: categories[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

// [ADMIN/STAFF] Tạo danh mục mới
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, slug, description, sort_order } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Tên danh mục là bắt buộc.' });

    const cleanSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const [result] = await db.query(
      'INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES (?, ?, ?, ?, 1)',
      [name, cleanSlug, description || null, sort_order || 0]
    );

    res.status(201).json({
      success: true,
      message: 'Tạo danh mục mới thành công!',
      data: { id: result.insertId, name, slug: cleanSlug }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server khi tạo danh mục.' });
  }
});

// [ADMIN/STAFF] Cập nhật danh mục
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, description, sort_order, is_active } = req.body;

    await db.query(
      'UPDATE categories SET name=?, slug=?, description=?, sort_order=?, is_active=?, updated_at=NOW() WHERE id=?',
      [name, slug, description, sort_order, is_active !== undefined ? Number(is_active) : 1, id]
    );

    res.json({ success: true, message: 'Cập nhật danh mục thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server khi cập nhật danh mục.' });
  }
});

// [ADMIN] Xóa danh mục
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [products] = await db.query('SELECT COUNT(*) as c FROM products WHERE category_id = ? AND is_active = 1', [id]);
    if (products[0] && products[0].c > 0) {
      return res.status(400).json({
        success: false,
        message: `Không thể xóa danh mục này vì còn ${products[0].c} sản phẩm đang hoạt động.`
      });
    }

    await db.query('DELETE FROM categories WHERE id = ?', [id]);
    res.json({ success: true, message: 'Đã xóa danh mục thành công.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server khi xóa danh mục.' });
  }
});

module.exports = router;
