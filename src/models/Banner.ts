const BaseModel = require('./BaseModel');
const db = require('../config/database');

class BannerModel extends BaseModel {
  constructor() {
    super('banners');

    this.addHook('beforeCreate', async (data) => {
      if (data.is_active === undefined) data.is_active = 1;
      if (data.sort_order === undefined) data.sort_order = 0;
      if (!data.created_at) data.created_at = new Date();
      return data;
    });
  }

  /**
   * Lấy danh sách banner đang hiển thị cho trang chủ
   */
  async getActiveBanners() {
    const [rows] = await db.query(
      `SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order ASC, id ASC`
    );
    return rows || [];
  }
}

module.exports = new BannerModel();
