const db = require('../config/database');

// GET /api/cart
const getCart = async (req, res) => {
  try {
    const [items] = await db.query(`
      SELECT ci.id, ci.quantity, ci.product_id,
             p.name, p.slug, p.price, p.sale_price, p.stock_quantity,
             (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) as image
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id AND p.is_active = 1
      WHERE ci.user_id = ?
      ORDER BY ci.added_at DESC
    `, [req.user.id]);

    const subtotal = items.reduce((sum, item) => {
      const price = item.sale_price || item.price;
      return sum + price * item.quantity;
    }, 0);

    res.json({ success: true, data: { items, subtotal, item_count: items.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// POST /api/cart - Thêm vào giỏ
const addToCart = async (req, res) => {
  try {
    const { product_id, quantity = 1 } = req.body;

    // Kiểm tra sản phẩm
    const [products] = await db.query(
      'SELECT id, name, price, stock_quantity, is_active FROM products WHERE id = ?',
      [product_id]
    );

    if (!products.length || !products[0].is_active) {
      return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh.' });
    }

    const product = products[0];

    // Kiểm tra tồn kho
    const [existing] = await db.query(
      'SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?',
      [req.user.id, product_id]
    );

    const currentInCart = existing.length ? existing[0].quantity : 0;
    const newTotal = currentInCart + parseInt(quantity);

    const available = product.stock_quantity;
    if (newTotal > available) {
      return res.status(400).json({
        success: false,
        message: `Chỉ còn ${available} sản phẩm trong kho. Bạn đã có ${currentInCart} trong giỏ.`
      });
    }

    if (existing.length) {
      await db.query(
        'UPDATE cart_items SET quantity = ?, updated_at = NOW() WHERE user_id = ? AND product_id = ?',
        [newTotal, req.user.id, product_id]
      );
    } else {
      await db.query(
        'INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)',
        [req.user.id, product_id, quantity]
      );
    }

    res.json({ success: true, message: `Đã thêm "${product.name}" vào giỏ hàng.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// PUT /api/cart/:id - Cập nhật số lượng
const updateCartItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (quantity < 1) {
      return res.status(400).json({ success: false, message: 'Số lượng tối thiểu là 1.' });
    }

    // Kiểm tra tồn kho
    const [items] = await db.query(
      `SELECT ci.id, p.stock_quantity FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.id = ? AND ci.user_id = ?`,
      [id, req.user.id]
    );

    if (!items.length) {
      return res.status(404).json({ success: false, message: 'Sản phẩm không có trong giỏ hàng.' });
    }

    if (quantity > items[0].stock_quantity) {
      return res.status(400).json({
        success: false,
        message: `Chỉ còn ${items[0].stock_quantity} sản phẩm trong kho.`
      });
    }

    await db.query('UPDATE cart_items SET quantity = ?, updated_at = NOW() WHERE id = ? AND user_id = ?', [quantity, id, req.user.id]);
    res.json({ success: true, message: 'Cập nhật giỏ hàng thành công.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// DELETE /api/cart/:id - Xóa khỏi giỏ
const removeCartItem = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true, message: 'Đã xóa sản phẩm khỏi giỏ hàng.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// DELETE /api/cart - Xóa toàn bộ giỏ
const clearCart = async (req, res) => {
  try {
    await db.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, message: 'Đã xóa toàn bộ giỏ hàng.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

module.exports = { getCart, addToCart, updateCartItem, removeCartItem, clearCart };
