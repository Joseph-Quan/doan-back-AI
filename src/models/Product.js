const BaseModel = require('./BaseModel');
const db = require('../config/database');

function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

class ProductModel extends BaseModel {
  constructor() {
    super('products');

    // Hook: beforeCreate
    this.addHook('beforeCreate', async (data) => {
      if (!data.slug && data.name) {
        data.slug = slugify(data.name) + '-' + Math.floor(Math.random() * 1000);
      }
      if (!data.sku) {
        data.sku = 'WH-PRD-' + Math.floor(1000 + Math.random() * 9000);
      }
      if (data.price !== undefined) data.price = Number(data.price);
      if (data.sale_price !== undefined && data.sale_price !== null && data.sale_price !== '') {
        data.sale_price = Number(data.sale_price);
      } else {
        data.sale_price = null;
      }
      if (data.stock_quantity !== undefined) data.stock_quantity = Math.max(0, Number(data.stock_quantity));
      if (data.is_active === undefined) data.is_active = 1;
      if (data.is_featured === undefined) data.is_featured = 0;
      if (data.average_rating === undefined) data.average_rating = 5.0;
      if (data.review_count === undefined) data.review_count = 0;
      if (data.views === undefined) data.views = 0;
      if (data.sold_count === undefined) data.sold_count = 0;
      if (!data.created_at) data.created_at = new Date();
      return data;
    });

    // Hook: beforeUpdate
    this.addHook('beforeUpdate', async (data, { original }) => {
      if (data.name && (!data.slug || data.slug === original.slug)) {
        data.slug = slugify(data.name) + '-' + (original.id || Math.floor(Math.random() * 1000));
      }
      if (data.price !== undefined) data.price = Number(data.price);
      if (data.sale_price !== undefined && data.sale_price !== null && data.sale_price !== '') {
        data.sale_price = Number(data.sale_price);
      } else if (data.sale_price === '') {
        data.sale_price = null;
      }
      if (data.stock_quantity !== undefined) data.stock_quantity = Math.max(0, Number(data.stock_quantity));
      return data;
    });
  }

  /**
   * Lấy chi tiết sản phẩm kèm ảnh chính và danh mục
   */
  async findBySlug(slug) {
    const query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug,
             (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) as primary_image
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.slug = ?
      LIMIT 1
    `;
    const [rows] = await db.query(query, [slug]);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  /**
   * Lấy danh sách ảnh của sản phẩm
   */
  async getImages(productId) {
    const [rows] = await db.query(
      `SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, id ASC`,
      [productId]
    );
    return rows || [];
  }

  /**
   * Thêm hoặc gán ảnh cho sản phẩm
   */
  async addImage(productId, imageUrl, isPrimary = 0) {
    if (isPrimary) {
      await db.query(`UPDATE product_images SET is_primary = 0 WHERE product_id = ?`, [productId]);
    }
    const [result] = await db.query(
      `INSERT INTO product_images (product_id, image_url, is_primary) VALUES (?, ?, ?)`,
      [productId, imageUrl, isPrimary ? 1 : 0]
    );
    return result.insertId;
  }

  /**
   * Tăng lượt xem sản phẩm
   */
  async incrementViews(productId) {
    await db.query(`UPDATE products SET views = views + 1 WHERE id = ?`, [productId]);
  }

  /**
   * Cập nhật số lượng tồn kho và đã bán
   */
  async adjustStock(productId, quantityDelta) {
    await db.query(
      `UPDATE products 
       SET stock_quantity = GREATEST(0, stock_quantity - ?),
           sold_count = GREATEST(0, sold_count + ?)
       WHERE id = ?`,
      [quantityDelta, quantityDelta, productId]
    );
  }

  /**
   * Tính toán lại điểm đánh giá trung bình
   */
  async recalculateRatings(productId) {
    const [stats] = await db.query(
      `SELECT COUNT(*) as count, AVG(rating) as avg_rating 
       FROM reviews 
       WHERE product_id = ? AND is_approved = 1`,
      [productId]
    );
    if (stats && stats.length > 0) {
      const count = Number(stats[0].count) || 0;
      const avg = Number(stats[0].avg_rating) ? Number(Number(stats[0].avg_rating).toFixed(1)) : 5.0;
      await db.query(
        `UPDATE products SET review_count = ?, average_rating = ? WHERE id = ?`,
        [count, avg, productId]
      );
    }
  }
}

module.exports = new ProductModel();
