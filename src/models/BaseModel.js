const db = require('../config/database');

/**
 * BaseModel - Lớp nền tảng cho toàn bộ Models trong hệ thống WoodHome.
 * Tích hợp sẵn cơ chế Lifecycle Hooks (beforeCreate, afterCreate, beforeUpdate, afterUpdate...)
 * giúp xử lý nghiệp vụ mượt mà, tự động và chuẩn chu.
 */
class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
    this.hooks = {
      beforeCreate: [],
      afterCreate: [],
      beforeUpdate: [],
      afterUpdate: [],
      beforeDelete: [],
      afterDelete: []
    };
  }

  /**
   * Đăng ký một lifecycle hook
   * @param {'beforeCreate'|'afterCreate'|'beforeUpdate'|'afterUpdate'|'beforeDelete'|'afterDelete'} event 
   * @param {Function} callback 
   */
  addHook(event, callback) {
    if (this.hooks[event]) {
      this.hooks[event].push(callback);
    }
    return this;
  }

  async runHooks(event, payload, extra = {}) {
    if (!this.hooks[event] || this.hooks[event].length === 0) return payload;
    let data = payload;
    for (const hook of this.hooks[event]) {
      const res = await hook(data, extra);
      if (res !== undefined) {
        data = res;
      }
    }
    return data;
  }

  /**
   * Tìm theo ID
   */
  async findById(id) {
    const [rows] = await db.query(`SELECT * FROM ${this.tableName} WHERE id = ? LIMIT 1`, [id]);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  /**
   * Tìm một bản ghi theo điều kiện
   */
  async findOne(conditions = {}) {
    const keys = Object.keys(conditions);
    if (keys.length === 0) {
      const [rows] = await db.query(`SELECT * FROM ${this.tableName} LIMIT 1`);
      return rows && rows.length > 0 ? rows[0] : null;
    }

    const whereClause = keys.map(k => `${k} = ?`).join(' AND ');
    const values = keys.map(k => conditions[k]);
    const [rows] = await db.query(`SELECT * FROM ${this.tableName} WHERE ${whereClause} LIMIT 1`, values);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  /**
   * Tìm nhiều bản ghi với tùy chọn filter, sort, limit, offset
   */
  async findAll(conditions = {}, options = {}) {
    const { orderBy = 'id DESC', limit, offset } = options;
    const keys = Object.keys(conditions);

    let sql = `SELECT * FROM ${this.tableName}`;
    let values = [];

    if (keys.length > 0) {
      const whereClause = keys.map(k => `${k} = ?`).join(' AND ');
      sql += ` WHERE ${whereClause}`;
      values = keys.map(k => conditions[k]);
    }

    if (orderBy) {
      sql += ` ORDER BY ${orderBy}`;
    }

    if (limit !== undefined && limit !== null) {
      sql += ` LIMIT ?`;
      values.push(parseInt(limit));
      if (offset !== undefined && offset !== null) {
        sql += ` OFFSET ?`;
        values.push(parseInt(offset));
      }
    }

    const [rows] = await db.query(sql, values);
    return rows || [];
  }

  /**
   * Đếm số lượng bản ghi
   */
  async count(conditions = {}) {
    const keys = Object.keys(conditions);
    let sql = `SELECT COUNT(*) as total FROM ${this.tableName}`;
    let values = [];

    if (keys.length > 0) {
      const whereClause = keys.map(k => `${k} = ?`).join(' AND ');
      sql += ` WHERE ${whereClause}`;
      values = keys.map(k => conditions[k]);
    }

    const [rows] = await db.query(sql, values);
    return rows && rows[0] ? Number(rows[0].total) : 0;
  }

  /**
   * Tạo mới bản ghi có chạy qua beforeCreate và afterCreate hooks
   */
  async create(data) {
    let processedData = { ...data };
    
    // Chạy beforeCreate hooks
    processedData = await this.runHooks('beforeCreate', processedData);

    const keys = Object.keys(processedData);
    const values = Object.values(processedData);
    const placeholders = keys.map(() => '?').join(', ');
    const columns = keys.join(', ');

    const sql = `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`;
    const [result] = await db.query(sql, values);

    const newId = result.insertId || processedData.id;
    let createdRecord = await this.findById(newId);
    if (!createdRecord) {
      createdRecord = { id: newId, ...processedData };
    }

    // Chạy afterCreate hooks
    await this.runHooks('afterCreate', createdRecord);

    return createdRecord;
  }

  /**
   * Cập nhật bản ghi có chạy qua beforeUpdate và afterUpdate hooks
   */
  async update(id, data) {
    let original = await this.findById(id);
    if (!original) {
      throw new Error(`Bản ghi #${id} không tồn tại trong bảng ${this.tableName}.`);
    }

    let processedData = { ...data };
    // Chạy beforeUpdate hooks
    processedData = await this.runHooks('beforeUpdate', processedData, { original });

    const keys = Object.keys(processedData);
    if (keys.length === 0) return original;

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(processedData), id];

    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
    await db.query(sql, values);

    const updatedRecord = await this.findById(id);

    // Chạy afterUpdate hooks
    await this.runHooks('afterUpdate', updatedRecord, { original });

    return updatedRecord;
  }

  /**
   * Xóa bản ghi có chạy qua beforeDelete và afterDelete hooks
   */
  async delete(id) {
    const record = await this.findById(id);
    if (!record) return false;

    // Chạy beforeDelete hooks
    await this.runHooks('beforeDelete', record);

    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const [result] = await db.query(sql, [id]);

    // Chạy afterDelete hooks
    await this.runHooks('afterDelete', record);

    return result.affectedRows > 0;
  }
}

module.exports = BaseModel;
