const db = require('../config/database');

// GET /api/admin/dashboard
const getDashboard = async (req, res) => {
  try {
    // Thống kê tổng quan:
    // Theo yêu cầu: Đơn hàng bị "huỷ" (status = 'cancelled') KHÔNG được tính vào doanh thu.
    // CHỈ KHI đơn hàng được xác nhận "đã giao thành công" (status = 'delivered') thì MỚI ĐƯỢC TÍNH vào doanh thu.
    const [stats] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURDATE() AND status != 'cancelled') as orders_today,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE DATE(created_at) = CURDATE() AND status = 'delivered') as revenue_today,
        (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders,
        (SELECT COUNT(*) FROM users WHERE role_id = 1) as total_customers,
        (SELECT COUNT(*) FROM products WHERE is_active = 1) as total_products,
        (SELECT COUNT(*) FROM products WHERE stock_quantity <= 5 AND is_active = 1) as low_stock_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW()) AND status = 'delivered') as revenue_month,
        (SELECT COUNT(*) FROM orders WHERE MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW()) AND status != 'cancelled') as orders_month
    `);

    // Đơn hàng gần đây
    const [recentOrders] = await db.query(`
      SELECT o.id, o.order_number, o.total_amount, o.status, o.payment_method, o.created_at, u.full_name
      FROM orders o JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC LIMIT 10
    `);

    // Sản phẩm bán chạy tháng này: Chỉ tính từ các đơn đã giao thành công (status = 'delivered')
    const [topProducts] = await db.query(`
      SELECT p.id, p.name, p.slug, SUM(oi.quantity) as total_sold, SUM(oi.subtotal) as total_revenue,
             (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) as image
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id AND MONTH(o.created_at) = MONTH(NOW()) AND YEAR(o.created_at) = YEAR(NOW()) AND o.status = 'delivered'
      JOIN products p ON p.id = oi.product_id
      GROUP BY p.id ORDER BY total_sold DESC LIMIT 5
    `);

    // Doanh thu 7 ngày qua: Chỉ tính từ các đơn đã giao thành công (status = 'delivered')
    const [revenueChart] = await db.query(`
      SELECT DATE(created_at) as date, COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as revenue
      FROM orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND status = 'delivered'
      GROUP BY DATE(created_at) ORDER BY date ASC
    `);

    // Sản phẩm sắp hết hàng
    const [lowStock] = await db.query(`
      SELECT id, name, sku, stock_quantity
      FROM products WHERE stock_quantity <= 5 AND is_active = 1
      ORDER BY stock_quantity ASC LIMIT 10
    `);

    // Thống kê so sánh 3 phương thức thanh toán:
    // Đơn hủy (status = 'cancelled') loại bỏ hoàn toàn.
    // Doanh thu (total_revenue) CHỈ ĐƯỢC TÍNH khi status = 'delivered'.
    const [paymentStatsRaw] = await db.query(`
      SELECT 
        payment_method,
        COUNT(CASE WHEN status != 'cancelled' THEN 1 END) as total_orders,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN total_amount ELSE 0 END), 0) as total_revenue
      FROM orders
      WHERE status != 'cancelled'
      GROUP BY payment_method
    `);

    const methodConfig = {
      cod: { key: 'cod', label: 'Tiền mặt (COD)', icon: '💵', color: '#10b981' },
      qr_transfer: { key: 'qr_transfer', label: 'Chuyển khoản (VietQR)', icon: '📲', color: '#d97706' },
      visa: { key: 'visa', label: 'Thẻ quốc tế (Visa/Master)', icon: '💳', color: '#2563eb' }
    };

    const paymentMap = {
      cod: { ...methodConfig.cod, count: 0, revenue: 0 },
      qr_transfer: { ...methodConfig.qr_transfer, count: 0, revenue: 0 },
      visa: { ...methodConfig.visa, count: 0, revenue: 0 }
    };

    let totalOrdersCount = 0;
    let totalRevenueSum = 0;

    paymentStatsRaw.forEach(row => {
      const pm = row.payment_method;
      const count = Number(row.total_orders) || 0;
      const rev = Number(row.total_revenue) || 0;
      if (paymentMap[pm]) {
        paymentMap[pm].count = count;
        paymentMap[pm].revenue = rev;
      }
      totalOrdersCount += count;
      totalRevenueSum += rev;
    });

    const payment_methods_stats = Object.values(paymentMap).map(m => ({
      ...m,
      percentage: totalOrdersCount > 0 ? Math.round((m.count / totalOrdersCount) * 100) : 0,
      revenue_percentage: totalRevenueSum > 0 ? Math.round((m.revenue / totalRevenueSum) * 100) : 0
    }));

    const db_status = {
      is_mysql: !db.isFallbackMode(),
      engine: db.isFallbackMode() ? 'In-Memory Mock DB' : 'MySQL Server trên XAMPP',
      database_name: process.env.DB_NAME || 'woodhome'
    };

    res.json({
      success: true,
      data: {
        stats: stats[0],
        recent_orders: recentOrders,
        top_products: topProducts,
        revenue_chart: revenueChart,
        low_stock: lowStock,
        payment_methods_stats,
        total_payment_orders: totalOrdersCount,
        total_payment_revenue: totalRevenueSum,
        db_status
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// GET /api/admin/banners
const getBanners = async (req, res) => {
  try {
    const [banners] = await db.query('SELECT * FROM banners ORDER BY sort_order ASC');
    res.json({ success: true, data: banners });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// POST /api/admin/banners
const createBanner = async (req, res) => {
  try {
    const { title, description, image_url, cta_text, cta_link, sort_order } = req.body;
    const [result] = await db.query(
      'INSERT INTO banners (title, description, image_url, cta_text, cta_link, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description, image_url, cta_text, cta_link, sort_order || 0]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// PUT /api/admin/banners/:id
const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, image_url, cta_text, cta_link, sort_order, is_active } = req.body;
    await db.query(
      'UPDATE banners SET title=?, description=?, image_url=?, cta_text=?, cta_link=?, sort_order=?, is_active=?, updated_at=NOW() WHERE id=?',
      [title, description, image_url, cta_text, cta_link, sort_order, is_active, id]
    );
    res.json({ success: true, message: 'Cập nhật banner thành công.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// DELETE /api/admin/banners/:id
const deleteBanner = async (req, res) => {
  try {
    await db.query('DELETE FROM banners WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa banner.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// GET /api/admin/transactions - Đối soát giao dịch
const getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, payment_method } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '1=1';
    const params = [];
    if (status) { where += ' AND t.status = ?'; params.push(status); }
    if (payment_method) { where += ' AND t.payment_method = ?'; params.push(payment_method); }

    const [total] = await db.query(`SELECT COUNT(*) as c FROM transactions t WHERE ${where}`, params);
    const [transactions] = await db.query(`
      SELECT t.*, o.order_number, o.shipping_full_name, u.email
      FROM transactions t
      JOIN orders o ON o.id = t.order_id
      JOIN users u ON u.id = o.user_id
      WHERE ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    res.json({ success: true, data: { transactions, total: total[0].c } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// GET /api/admin/logs - Nhật ký quản trị
const getAdminLogs = async (req, res) => {
  try {
    const [logs] = await db.query(`
      SELECT al.*, u.full_name, u.email
      FROM admin_logs al JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC LIMIT 50
    `);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// GET /api/admin/bank-accounts
const getBankAccounts = async (req, res) => {
  try {
    const [accounts] = await db.query('SELECT * FROM bank_accounts WHERE is_active = 1');
    res.json({ success: true, data: accounts });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// PUT /api/admin/bank-accounts/:id - Chỉ admin mới được sửa
const updateBankAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { bank_name, account_number, account_name, branch } = req.body;

    const [old] = await db.query('SELECT * FROM bank_accounts WHERE id = ?', [id]);
    await db.query(
      'UPDATE bank_accounts SET bank_name=?, account_number=?, account_name=?, branch=?, updated_at=NOW() WHERE id=?',
      [bank_name, account_number, account_name, branch, id]
    );
    await db.query('INSERT INTO admin_logs (user_id, action, entity_type, entity_id, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, 'update_bank_account', 'bank_account', id, JSON.stringify(old[0]), JSON.stringify(req.body)]);

    res.json({ success: true, message: 'Cập nhật tài khoản ngân hàng thành công.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// GET /api/banners - Public banners
const getPublicBanners = async (req, res) => {
  try {
    const [banners] = await db.query(`
      SELECT * FROM banners WHERE is_active = 1
      AND (start_date IS NULL OR start_date <= NOW())
      AND (end_date IS NULL OR end_date >= NOW())
      ORDER BY sort_order ASC
    `);
    res.json({ success: true, data: banners });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// POST /api/promotions/validate - Kiểm tra mã giảm giá
const validatePromotion = async (req, res) => {
  try {
    const { code, order_amount } = req.body;

    const [promos] = await db.query(
      `SELECT * FROM promotions WHERE code = ? AND is_active = 1
       AND (start_date IS NULL OR start_date <= NOW())
       AND (end_date IS NULL OR end_date >= NOW())
       AND (usage_limit IS NULL OR usage_count < usage_limit)`,
      [code]
    );

    if (!promos.length) {
      return res.status(404).json({ success: false, message: 'Mã giảm giá không hợp lệ hoặc đã hết lượt dùng.' });
    }

    const promo = promos[0];
    if (order_amount < promo.min_order_amount) {
      return res.status(400).json({
        success: false,
        message: `Mã này yêu cầu đơn hàng tối thiểu ${parseInt(promo.min_order_amount).toLocaleString('vi-VN')} VNĐ.`
      });
    }

    let discount = 0;
    if (promo.type === 'percentage') {
      discount = order_amount * promo.value / 100;
      if (promo.max_discount_amount) discount = Math.min(discount, promo.max_discount_amount);
    } else if (promo.type === 'fixed_amount') {
      discount = Math.min(promo.value, order_amount);
    }

    res.json({
      success: true,
      message: `Áp dụng mã "${code}" thành công!`,
      data: { promotion: promo, discount_amount: discount }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

module.exports = { getDashboard, getBanners, createBanner, updateBanner, deleteBanner, getTransactions, getAdminLogs, getBankAccounts, updateBankAccount, getPublicBanners, validatePromotion };
