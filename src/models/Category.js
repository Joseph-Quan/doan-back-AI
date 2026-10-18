const BaseModel = require('./BaseModel');
const db = require('../config/database');

class CategoryModel extends BaseModel {
  constructor() {
    super('categories');

    this.addHook('beforeCreate', async (data) => {
      if (!data.slug && data.name) {
        data.slug = data.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[đĐ]/g, 'd')
          .replace(/[^a-z0-9 -]/g, '')
          .trim()
          .replace(/\s+/g, '-');
      }
      if (data.is_active === undefined) data.is_active = 1;
      if (data.sort_order === undefined) data.sort_order = 0;
      return data;
    });
  }

  /**
   * Lấy danh sách danh mục đang kích hoạt
   */
  async getActiveCategories() {
    return this.findAll({ is_active: 1 }, { orderBy: 'sort_order ASC, id ASC' });
  }

  /**
   * Lấy số lượng sản phẩm trong từng danh mục
   */
  async getCategoriesWithProductCount() {
    const query = `
      SELECT c.*, COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
      WHERE c.is_active = 1
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.id ASC
    `;
    const [rows] = await db.query(query);
    return rows || [];
  }
}

module.exports = new CategoryModel();
