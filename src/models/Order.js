const BaseModel = require('./BaseModel');
const db = require('../config/database');

class OrderModel extends BaseModel {
  constructor() {
    super('orders');

    // Hook: beforeCreate
    this.addHook('beforeCreate', async (data) => {
      if (!data.order_number) {
        const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
        const rand = Math.floor(1000 + Math.random() * 9000);
        data.order_number = `WH${dateStr}-${rand}`;
      }
      if (!data.status) data.status = 'pending';
      if (!data.payment_status) {
        data.payment_status = data.payment_method === 'cod' ? 'unpaid' : 'pending';
      }
      if (!data.created_at) data.created_at = new Date();
      return data;
    });

    // Hook: afterUpdate - Kiểm soát luồng trạng thái
    this.addHook('afterUpdate', async (updatedRecord, { original }) => {
      // Nếu đơn bị hủy, tự động hoàn trả số lượng tồn kho
      if (updatedRecord.status === 'cancelled' && original.status !== 'cancelled') {
        const [items] = await db.query(
          `SELECT product_id, quantity FROM order_items WHERE order_id = ?`,
          [updatedRecord.id]
        );
        if (items && items.length > 0) {
          for (const item of items) {
            await db.query(
              `UPDATE products SET stock_quantity = stock_quantity + ?, sold_count = GREATEST(0, sold_count - ?) WHERE id = ?`,
              [item.quantity, item.quantity, item.product_id]
            );
          }
        }
      }

      // Nếu đơn COD đã giao thành công -> đánh dấu thanh toán hoàn tất
      if (updatedRecord.status === 'delivered' && updatedRecord.payment_method === 'cod') {
        await db.query(`UPDATE orders SET payment_status = 'paid' WHERE id = ?`, [updatedRecord.id]);
      }
    });
  }

  /**
   * Tạo đơn hàng hoàn chỉnh gồm Header và Items trong Transaction
   */
  async createOrderWithItems(orderData, items) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Tạo đơn hàng
      const order = await this.create(orderData);

      // 2. Thêm từng sản phẩm vào order_items & cập nhật kho
      for (const item of items) {
        const lineTotal = item.quantity * item.price;
        await conn.query(
          `INSERT INTO order_items (order_id, product_id, product_name, price, quantity, line_total)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [order.id, item.product_id, item.name || item.product_name, item.price, item.quantity, lineTotal]
        );

        // Giảm tồn kho, tăng đã bán
        await conn.query(
          `UPDATE products 
           SET stock_quantity = GREATEST(0, stock_quantity - ?),
               sold_count = sold_count + ?
           WHERE id = ?`,
          [item.quantity, item.quantity, item.product_id]
        );
      }

      // 3. Tạo bản ghi giao dịch (Transaction)
      const txnStatus = (order.payment_method === 'cod') ? 'pending' : (order.payment_status === 'paid' ? 'success' : 'pending');
      await conn.query(
        `INSERT INTO transactions (order_id, payment_method, amount, status, notes, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [order.id, order.payment_method, order.final_amount, txnStatus, `Khởi tạo giao dịch đơn hàng ${order.order_number}`]
      );

      await conn.commit();
      return order;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Lấy chi tiết đơn hàng kèm danh sách sản phẩm và thông tin người mua
   */
  async getOrderWithItems(orderId) {
    const [orders] = await db.query(
      `SELECT o.*, u.full_name as user_name, u.email as user_email, u.phone as user_phone
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = ? LIMIT 1`,
      [orderId]
    );

    if (!orders || orders.length === 0) return null;
    const order = orders[0];

    const [items] = await db.query(
      `SELECT oi.*, p.sku, 
              (SELECT image_url FROM product_images pi WHERE pi.product_id = oi.product_id AND pi.is_primary = 1 LIMIT 1) as product_image
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
      [orderId]
    );

    order.items = items || [];
    return order;
  }
}

module.exports = new OrderModel();
