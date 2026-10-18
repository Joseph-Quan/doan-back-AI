const BaseModel = require('./BaseModel');
const db = require('../config/database');
const Product = require('./Product');

class ReviewModel extends BaseModel {
  constructor() {
    super('reviews');

    this.addHook('beforeCreate', async (data) => {
      if (!data.rating) data.rating = 5;
      data.rating = Math.max(1, Math.min(5, Number(data.rating)));
      if (data.is_approved === undefined) data.is_approved = 1;
      if (!data.created_at) data.created_at = new Date();
      return data;
    });

    // Hook: afterCreate - Tự động cập nhật điểm trung bình của sản phẩm
    this.addHook('afterCreate', async (record) => {
      if (record.product_id) {
        await Product.recalculateRatings(record.product_id);
      }
    });

    // Hook: afterDelete - Cập nhật lại khi xóa đánh giá
    this.addHook('afterDelete', async (record) => {
      if (record.product_id) {
        await Product.recalculateRatings(record.product_id);
      }
    });
  }

  /**
   * Lấy danh sách đánh giá của sản phẩm kèm thông tin người mua
   */
  async getProductReviews(productId) {
    const query = `
      SELECT r.*, u.full_name as user_name, u.avatar as user_avatar
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      WHERE r.product_id = ? AND r.is_approved = 1
      ORDER BY r.created_at DESC
    `;
    const [rows] = await db.query(query, [productId]);
    return rows || [];
  }
}

module.exports = new ReviewModel();
