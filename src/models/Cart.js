const BaseModel = require('./BaseModel');
const db = require('../config/database');

class CartModel extends BaseModel {
  constructor() {
    super('cart');
  }

  /**
   * Lấy giỏ hàng của user
   */
  async getCartItems(userId) {
    const query = `
      SELECT c.id as cart_id, c.quantity, c.created_at,
             p.id as product_id, p.name, p.slug, p.price, p.sale_price, p.stock_quantity,
             p.material, p.dimensions, p.color,
             COALESCE(p.sale_price, p.price) as current_price,
             (c.quantity * COALESCE(p.sale_price, p.price)) as line_total,
             (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) as primary_image
      FROM cart c
      JOIN products p ON p.id = c.product_id
      WHERE c.user_id = ? AND p.is_active = 1
      ORDER BY c.created_at DESC
    `;
    const [items] = await db.query(query, [userId]);
    const subtotal = (items || []).reduce((acc, item) => acc + Number(item.line_total), 0);
    return { items: items || [], subtotal };
  }

  /**
   * Thêm hoặc tăng số lượng vào giỏ hàng
   */
  async addToCart(userId, productId, quantity = 1) {
    // Kiểm tra hàng tồn kho
    const [products] = await db.query(`SELECT stock_quantity, name FROM products WHERE id = ? AND is_active = 1`, [productId]);
    if (!products || products.length === 0) {
      throw new Error('Sản phẩm không tồn tại hoặc đã ngừng kinh doanh.');
    }
    const product = products[0];

    const [existing] = await db.query(`SELECT id, quantity FROM cart WHERE user_id = ? AND product_id = ?`, [userId, productId]);
    if (existing && existing.length > 0) {
      const newQuantity = existing[0].quantity + Number(quantity);
      if (newQuantity > product.stock_quantity) {
        throw new Error(`Kho chỉ còn ${product.stock_quantity} sản phẩm khả dụng.`);
      }
      await db.query(`UPDATE cart SET quantity = ? WHERE id = ?`, [newQuantity, existing[0].id]);
      return { id: existing[0].id, quantity: newQuantity };
    } else {
      if (quantity > product.stock_quantity) {
        throw new Error(`Kho chỉ còn ${product.stock_quantity} sản phẩm khả dụng.`);
      }
      const [res] = await db.query(
        `INSERT INTO cart (user_id, product_id, quantity, created_at) VALUES (?, ?, ?, NOW())`,
        [userId, productId, Number(quantity)]
      );
      return { id: res.insertId, quantity: Number(quantity) };
    }
  }

  /**
   * Xóa toàn bộ giỏ hàng của user sau khi đặt hàng
   */
  async clearCart(userId) {
    await db.query(`DELETE FROM cart WHERE user_id = ?`, [userId]);
  }
}

module.exports = new CartModel();
