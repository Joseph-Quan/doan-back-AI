const BaseModel = require('./BaseModel');
const User = require('./User');
const Product = require('./Product');
const Category = require('./Category');
const Order = require('./Order');
const Cart = require('./Cart');
const Review = require('./Review');
const Banner = require('./Banner');
const Promotion = require('./Promotion');
const Transaction = require('./Transaction');

/**
 * Global Hooks Registry (Event Bus)
 * Cho phép các module lắng nghe sự kiện nghiệp vụ xuyên suốt hệ thống
 */
class ModelHooksBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (!this.listeners.has(event)) return;
    const filtered = this.listeners.get(event).filter(h => h !== handler);
    this.listeners.set(event, filtered);
  }

  async emit(event, payload) {
    if (!this.listeners.has(event)) return;
    const handlers = this.listeners.get(event);
    for (const handler of handlers) {
      try {
        await handler(payload);
      } catch (err) {
        console.error(`ModelHook error on [${event}]:`, err);
      }
    }
  }
}

const hooksBus = new ModelHooksBus();

module.exports = {
  BaseModel,
  User,
  Product,
  Category,
  Order,
  Cart,
  Review,
  Banner,
  Promotion,
  Transaction,
  hooks: hooksBus
};
