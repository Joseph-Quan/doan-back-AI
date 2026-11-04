const BaseModel = require('./BaseModel');
const db = require('../config/database');

class PromotionModel extends BaseModel {
  constructor() {
    super('promotions');
  }

  /**
   * Kiểm tra và tính toán giảm giá của mã khuyến mãi
   */
  async validateCode(code, subtotal) {
    if (!code) throw new Error('Vui lòng nhập mã giảm giá.');

    const cleanCode = code.trim().toUpperCase();
    const [rows] = await db.query(
      `SELECT * FROM promotions WHERE code = ? AND is_active = 1 LIMIT 1`,
      [cleanCode]
    );

    if (!rows || rows.length === 0) {
      throw new Error('Mã giảm giá không hợp lệ hoặc đã hết hạn.');
    }

    const promo = rows[0];
    const now = new Date();

    if (promo.start_date && new Date(promo.start_date) > now) {
      throw new Error('Chương trình khuyến mãi chưa bắt đầu.');
    }
    if (promo.end_date && new Date(promo.end_date) < now) {
      throw new Error('Mã giảm giá này đã hết hạn sử dụng.');
    }
    const usageCount = Number(promo.used_count !== undefined ? promo.used_count : (promo.usage_count || 0));
    if (promo.usage_limit && usageCount >= promo.usage_limit) {
      throw new Error('Mã giảm giá này đã hết lượt sử dụng.');
    }
    if (promo.min_order_amount && subtotal < Number(promo.min_order_amount)) {
      throw new Error(`Đơn hàng phải từ ${Number(promo.min_order_amount).toLocaleString('vi-VN')} đ mới áp dụng được mã này.`);
    }

    const promoType = (promo.discount_type || promo.type || '').toLowerCase();
    const promoValue = Number(promo.discount_value !== undefined ? promo.discount_value : (promo.value || 0));

    let discount = 0;
    if (promoType === 'percent' || promoType === 'percentage') {
      discount = (subtotal * promoValue) / 100;
      if (promo.max_discount_amount && discount > Number(promo.max_discount_amount)) {
        discount = Number(promo.max_discount_amount);
      }
    } else {
      discount = promoValue;
    }

    discount = Math.min(discount, subtotal);

    return {
      promo,
      discount: Math.round(discount),
      finalTotal: Math.max(0, subtotal - discount)
    };
  }

  /**
   * Tăng số lần đã dùng của mã
   */
  async incrementUsage(promoId) {
    try {
      await db.query(`UPDATE promotions SET used_count = COALESCE(used_count, 0) + 1, usage_count = COALESCE(usage_count, 0) + 1 WHERE id = ?`, [promoId]);
    } catch {
      await db.query(`UPDATE promotions SET usage_count = COALESCE(usage_count, 0) + 1 WHERE id = ?`, [promoId]);
    }
  }
}

module.exports = new PromotionModel();
