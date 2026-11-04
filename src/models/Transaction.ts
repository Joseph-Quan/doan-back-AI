const BaseModel = require('./BaseModel');
const db = require('../config/database');

class TransactionModel extends BaseModel {
  constructor() {
    super('transactions');

    this.addHook('beforeCreate', async (data) => {
      if (!data.status) data.status = 'pending';
      if (!data.created_at) data.created_at = new Date();
      return data;
    });
  }

  /**
   * Lấy danh sách giao dịch kèm thông tin đơn hàng
   */
  async getTransactionsWithOrder() {
    const query = `
      SELECT t.*, o.order_number, o.status as order_status, u.full_name as customer_name
      FROM transactions t
      LEFT JOIN orders o ON o.id = t.order_id
      LEFT JOIN users u ON u.id = o.user_id
      ORDER BY t.created_at DESC
    `;
    const [rows] = await db.query(query);
    return rows || [];
  }
}

module.exports = new TransactionModel();
