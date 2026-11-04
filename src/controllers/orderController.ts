import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { OrderStatus } from '../types';

const db = require('../config/database');

// Tạo mã đơn hàng
function generateOrderNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0,10).replace(/-/g,'');
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `WH${date}${rand}`;
}

// POST /api/orders - Đặt hàng
const createOrder = async (req: Request, res: Response): Promise<any> => {
  const conn = await db.getConnection();
  try {
    const {
      address_id, full_name, phone, province, district, ward, address_detail,
      payment_method, customer_note, promotion_code
    } = req.body;

    if (!payment_method || !['cod', 'qr_transfer', 'visa'].includes(payment_method)) {
      return res.status(400).json({ success: false, message: 'Phương thức thanh toán không hợp lệ.' });
    }

    // Lấy giỏ hàng
    const [cartItems] = await conn.query(`
      SELECT ci.product_id, ci.quantity, p.name, p.sku, p.price, p.sale_price, p.stock_quantity
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id AND p.is_active = 1
      WHERE ci.user_id = ?
    `, [req.user.id]);

    if (!cartItems.length) {
      return res.status(400).json({ success: false, message: 'Giỏ hàng trống.' });
    }

    // Lấy địa chỉ giao hàng
    let shippingInfo = { full_name, phone, province, district, ward, address_detail };
    if (address_id) {
      const [addrs] = await conn.query('SELECT * FROM user_addresses WHERE id = ? AND user_id = ?', [address_id, req.user.id]);
      if (addrs.length) shippingInfo = addrs[0];
    }

    if (!shippingInfo.full_name || !shippingInfo.phone || !shippingInfo.province) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp địa chỉ giao hàng đầy đủ.' });
    }

    await conn.beginTransaction();

    // Kiểm tra tồn kho (khóa các sản phẩm)
    for (const item of cartItems) {
      const [locked] = await conn.query(
        'SELECT stock_quantity FROM products WHERE id = ? FOR UPDATE',
        [item.product_id]
      );
      if (locked[0].stock_quantity < item.quantity) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: `Sản phẩm "${item.name}" không đủ hàng. Tồn kho: ${locked[0].stock_quantity}, yêu cầu: ${item.quantity}.`
        });
      }
    }

    // Tính tiền (server-side)
    let subtotal = cartItems.reduce((sum, item) => {
      const price = item.sale_price || item.price;
      return sum + price * item.quantity;
    }, 0);

    let discount = 0;
    let promotionId = null;

    // Áp dụng khuyến mãi
    if (promotion_code) {
      const [promos] = await conn.query(
        `SELECT * FROM promotions WHERE code = ? AND is_active = 1
         AND (start_date IS NULL OR start_date <= NOW())
         AND (end_date IS NULL OR end_date >= NOW())
         AND (usage_limit IS NULL OR usage_count < usage_limit)`,
        [promotion_code]
      );
      if (promos.length) {
        const promo = promos[0];
        if (subtotal >= promo.min_order_amount) {
          promotionId = promo.id;
          if (promo.type === 'percentage') {
            discount = subtotal * promo.value / 100;
            if (promo.max_discount_amount) discount = Math.min(discount, promo.max_discount_amount);
          } else if (promo.type === 'fixed_amount') {
            discount = Math.min(promo.value, subtotal);
          }
        }
      }
    }

    const shippingFee = subtotal >= 5000000 ? 0 : 50000; // Free ship đơn >= 5tr
    const totalAmount = subtotal - discount + shippingFee;
    const orderNumber = generateOrderNumber();

    // Tạo đơn hàng
    const [orderResult] = await conn.query(`
      INSERT INTO orders (
        order_number, user_id, shipping_full_name, shipping_phone,
        shipping_province, shipping_district, shipping_ward, shipping_address_detail,
        subtotal, shipping_fee, discount_amount, total_amount,
        payment_method, promotion_id, promotion_code, customer_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      orderNumber, req.user.id,
      shippingInfo.full_name, shippingInfo.phone,
      shippingInfo.province, shippingInfo.district, shippingInfo.ward, shippingInfo.address_detail,
      subtotal, shippingFee, discount, totalAmount,
      payment_method, promotionId, promotion_code || null, customer_note || null
    ]);

    const orderId = orderResult.insertId;

    // Thêm order items & trừ tồn kho
    for (const item of cartItems) {
      const price = item.sale_price || item.price;
      const primaryImage = await conn.query(
        'SELECT image_url FROM product_images WHERE product_id = ? AND is_primary = 1 LIMIT 1',
        [item.product_id]
      );
      const imgUrl = primaryImage[0][0]?.image_url || '';

      await conn.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_sku, product_image, unit_price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.name, item.sku, imgUrl, price, item.quantity, price * item.quantity]
      );

      // Trừ tồn kho
      const before = item.stock_quantity;
      const after = before - item.quantity;
      await conn.query('UPDATE products SET stock_quantity = ?, sold_count = sold_count + ? WHERE id = ?', [after, item.quantity, item.product_id]);
      await conn.query(
        'INSERT INTO inventory_logs (product_id, change_type, quantity_change, quantity_before, quantity_after, note) VALUES (?, ?, ?, ?, ?, ?)',
        [item.product_id, 'sale', -item.quantity, before, after, `Đơn hàng ${orderNumber}`]
      );
    }

    // Lịch sử trạng thái đơn hàng
    await conn.query('INSERT INTO order_status_history (order_id, status, note) VALUES (?, ?, ?)', [orderId, 'pending', 'Đơn hàng được tạo']);

    // Tạo giao dịch
    const transactionRef = `TXN-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    await conn.query(
      'INSERT INTO transactions (order_id, transaction_ref, payment_method, amount) VALUES (?, ?, ?, ?)',
      [orderId, transactionRef, payment_method, totalAmount]
    );

    // Cập nhật số lần dùng khuyến mãi
    if (promotionId) {
      await conn.query('UPDATE promotions SET usage_count = usage_count + 1 WHERE id = ?', [promotionId]);
    }

    // Xóa giỏ hàng
    await conn.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);

    // Thông báo
    await conn.query(
      'INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'Đặt hàng thành công!', `Đơn hàng #${orderNumber} đã được tạo. Tổng tiền: ${totalAmount.toLocaleString('vi-VN')} VNĐ`, 'order', `/orders/${orderId}`]
    );

    await conn.commit();

    // Lấy thông tin ngân hàng cho QR
    let bankInfo = null;
    if (payment_method === 'qr_transfer') {
      const [banks] = await db.query('SELECT * FROM bank_accounts WHERE is_active = 1 LIMIT 1');
      bankInfo = banks[0] || null;
    }

    res.status(201).json({
      success: true,
      message: 'Đặt hàng thành công!',
      data: {
        order_id: orderId,
        order_number: orderNumber,
        total_amount: totalAmount,
        payment_method,
        transaction_ref: transactionRef,
        bank_info: bankInfo
      }
    });
  } catch (err) {
    await conn.rollback();
    console.error('Create order error:', err);
    res.status(500).json({ success: false, message: 'Đã có lỗi xảy ra khi đặt hàng.' });
  } finally {
    conn.release();
  }
};

// GET /api/orders - Lịch sử đơn hàng
const getMyOrders = async (req: Request, res: Response): Promise<any> => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (parseInt(String(page), 10) - 1) * parseInt(String(limit), 10);

    let where = 'o.user_id = ?';
    const params: any[] = [req.user.id];
    if (status) { where += ' AND o.status = ?'; params.push(status); }

    const [orders] = await db.query(`
      SELECT o.id, o.order_number, o.status, o.total_amount, o.payment_method, o.payment_status, o.created_at,
             (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count,
             (SELECT product_name FROM order_items WHERE order_id = o.id LIMIT 1) as first_item_name,
             (SELECT product_image FROM order_items WHERE order_id = o.id LIMIT 1) as first_item_image
      FROM orders o WHERE ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(String(limit), 10), offset]);

    const [total] = await db.query(`SELECT COUNT(*) as c FROM orders o WHERE ${where}`, params);

    res.json({ success: true, data: { orders, total: total[0].c, page: parseInt(String(page), 10) } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// GET /api/orders/:id - Chi tiết đơn hàng
const getOrderDetail = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    const [orders] = await db.query(`
      SELECT o.*, t.transaction_ref, t.status as transaction_status
      FROM orders o
      LEFT JOIN transactions t ON t.order_id = o.id
      WHERE o.id = ? AND (o.user_id = ? OR ? IN (SELECT id FROM users WHERE role_id IN (2,3,4)))
    `, [id, req.user.id, req.user.id]);

    if (!orders.length) {
      return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại.' });
    }

    const [items] = await db.query('SELECT * FROM order_items WHERE order_id = ?', [id]);
    const [history] = await db.query('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC', [id]);

    res.json({ success: true, data: { ...orders[0], items, history } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// ========================================================
// HỖ TRỢ THEO DÕI ĐƠN HÀNG VÀ BẢN ĐỒ VẬN CHUYỂN (MAP TRACKING)
// ========================================================

function getWarehouseInfo(province: string) {
  const p = (province || '').toLowerCase();
  if (p.includes('hà nội') || p.includes('hải phòng') || p.includes('quảng ninh') || p.includes('bắc ninh') || p.includes('hải dương')) {
    return {
      name: 'Tổng kho Nội thất WoodHome Miền Bắc',
      address: 'Số 88 Võ Chí Công, Tây Hồ, Hà Nội',
      phone: '024.3888.9999',
      lat: 21.0537,
      lng: 105.8048
    };
  }
  if (p.includes('đà nẵng') || p.includes('huế') || p.includes('quảng nam') || p.includes('bình định') || p.includes('khánh hòa')) {
    return {
      name: 'Tổng kho Nội thất WoodHome Miền Trung',
      address: 'Số 120 Nguyễn Văn Linh, Hải Châu, TP. Đà Nẵng',
      phone: '0236.3777.888',
      lat: 16.0544,
      lng: 108.2022
    };
  }
  return {
    name: 'Tổng kho Trung tâm WoodHome Miền Nam',
    address: 'Khu Chế Xuất Tân Thuận & Bến Nghé, TP. Hồ Chí Minh',
    phone: '028.3999.8888',
    lat: 10.7410,
    lng: 106.7218
  };
}

function getDestinationCoords(province: string, district: string): [number, number] {
  const p = (province || '').toLowerCase();
  const d = (district || '').toLowerCase();

  if (p.includes('hà nội')) {
    if (d.includes('cầu giấy')) return [21.0362, 105.7905];
    if (d.includes('đống đa')) return [21.0180, 105.8286];
    if (d.includes('hai bà trưng')) return [21.0063, 105.8504];
    if (d.includes('hà đông')) return [20.9723, 105.7769];
    if (d.includes('ba đình')) return [21.0345, 105.8210];
    return [21.0285, 105.8542];
  }
  if (p.includes('đà nẵng')) {
    if (d.includes('sơn trà')) return [16.0778, 108.2393];
    if (d.includes('thanh khê')) return [16.0601, 108.1884];
    return [16.0610, 108.2208];
  }
  if (p.includes('bình dương')) return [10.9805, 106.6519];
  if (p.includes('đồng nai')) return [10.9460, 106.8242];
  if (p.includes('cần thơ')) return [10.0452, 105.7469];

  // TP.HCM districts
  if (d.includes('quận 1') || d.includes('q1') || d.includes('bến nghé') || d.includes('lê duẩn')) return [10.7769, 106.7009];
  if (d.includes('quận 3') || d.includes('q3')) return [10.7844, 106.6844];
  if (d.includes('quận 7') || d.includes('q7') || d.includes('phú mỹ hưng')) return [10.7340, 106.7218];
  if (d.includes('quận 2') || d.includes('thủ đức') || d.includes('thảo điền')) return [10.8035, 106.7456];
  if (d.includes('bình thạnh')) return [10.8016, 106.7114];
  if (d.includes('phú nhuận')) return [10.7992, 106.6803];
  if (d.includes('tân bình')) return [10.8015, 106.6557];
  if (d.includes('gò vấp')) return [10.8387, 106.6653];
  return [10.7769, 106.7009];
}

function generateRouteWaypoints(start: [number, number], end: [number, number]): [number, number][] {
  const points: [number, number][] = [start];
  const steps = 6;
  const dLat = (end[0] - start[0]) / steps;
  const dLng = (end[1] - start[1]) / steps;

  const offsets = [
    [0.002, 0.003],
    [-0.001, 0.004],
    [0.0025, 0.001],
    [-0.0015, -0.001],
    [0.001, 0.0015]
  ];

  for (let i = 1; i < steps; i++) {
    const off = offsets[(i - 1) % offsets.length];
    points.push([
      Number((start[0] + dLat * i + off[0] * 0.4).toFixed(6)),
      Number((start[1] + dLng * i + off[1] * 0.4).toFixed(6))
    ]);
  }
  points.push(end);
  return points;
}

function interpolatePosition(points: [number, number][], percent: number): [number, number] {
  if (percent <= 0) return points[0];
  if (percent >= 100) return points[points.length - 1];
  const t = (percent / 100) * (points.length - 1);
  const index = Math.floor(t);
  const fraction = t - index;
  if (index >= points.length - 1) return points[points.length - 1];
  const p1 = points[index];
  const p2 = points[index + 1];
  return [
    Number((p1[0] + (p2[0] - p1[0]) * fraction).toFixed(6)),
    Number((p1[1] + (p2[1] - p1[1]) * fraction).toFixed(6))
  ];
}

function buildTrackingData(order: any, items: any[], history: any[]) {
  const warehouse = getWarehouseInfo(order.shipping_province);
  const destCoords = getDestinationCoords(order.shipping_province, order.shipping_district);
  const route = generateRouteWaypoints([warehouse.lat, warehouse.lng], destCoords);

  let progress = 0;
  let etaText = 'Dự kiến 24 - 48h';
  let courierStatusText = 'Chờ điều phối';

  switch (order.status) {
    case 'pending':
      progress = 5;
      courierStatusText = 'Đang chờ điều phối xe vận chuyển tại kho';
      etaText = 'Dự kiến 24 - 48h';
      break;
    case 'confirmed':
      progress = 15;
      courierStatusText = 'Đã lên lịch xe tải giao đồ gỗ';
      etaText = 'Dự kiến xuất kho trong ngày';
      break;
    case 'processing':
      progress = 30;
      courierStatusText = 'Đang kiểm tra chất lượng gỗ & bốc xếp lên xe tải';
      etaText = 'Dự kiến giao trong chiều nay';
      break;
    case 'shipping':
      progress = 70;
      courierStatusText = 'Tài xế đang vận chuyển trên tuyến đường đến bạn';
      etaText = 'Khoảng 25 - 40 phút nữa (Hôm nay)';
      break;
    case 'delivered':
      progress = 100;
      courierStatusText = 'Đã giao hàng và hoàn tất bàn giao lắp đặt';
      etaText = 'Đã giao thành công';
      break;
    case 'cancelled':
      progress = 0;
      courierStatusText = 'Đơn hàng đã hủy';
      etaText = 'Đơn đã hủy';
      break;
    default:
      progress = 10;
  }

  const currentPos = interpolatePosition(route, progress);

  const steps = [
    {
      key: 'pending',
      label: 'Đặt hàng thành công',
      desc: 'Hệ thống đã ghi nhận đơn hàng của bạn',
      time: order.created_at,
      completed: ['pending', 'confirmed', 'processing', 'shipping', 'delivered'].includes(order.status),
      active: order.status === 'pending'
    },
    {
      key: 'confirmed',
      label: 'Đã xác nhận đơn',
      desc: 'Nhân viên WoodHome đã duyệt và liên hệ xác nhận',
      time: order.confirmed_at,
      completed: ['confirmed', 'processing', 'shipping', 'delivered'].includes(order.status),
      active: order.status === 'confirmed'
    },
    {
      key: 'processing',
      label: 'Đóng gói & Bốc xếp',
      desc: 'Kiểm định bề mặt sơn, bọc màng PE chống trầy và lên xe',
      time: null,
      completed: ['processing', 'shipping', 'delivered'].includes(order.status),
      active: order.status === 'processing'
    },
    {
      key: 'shipping',
      label: 'Đang giao hàng',
      desc: 'Xe tải chuyên dụng đang di chuyển trên lộ trình',
      time: order.shipped_at,
      completed: ['shipping', 'delivered'].includes(order.status),
      active: order.status === 'shipping'
    },
    {
      key: 'delivered',
      label: 'Giao hàng thành công',
      desc: 'Khách hàng đã nhận và nghiệm thu sản phẩm tại nhà',
      time: order.delivered_at,
      completed: order.status === 'delivered',
      active: order.status === 'delivered'
    }
  ];

  return {
    order: { ...order, items, history },
    warehouse,
    destination: {
      receiver_name: order.shipping_full_name,
      phone: order.shipping_phone,
      address: [order.shipping_address_detail, order.shipping_ward, order.shipping_district, order.shipping_province].filter(Boolean).join(', '),
      lat: destCoords[0],
      lng: destCoords[1]
    },
    courier: {
      name: 'Trần Hữu Nam',
      phone: '0982.113.889',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
      vehicle: 'Xe tải Suzuki Carry Pro 990kg (Thùng kín lót đệm bảo vệ gỗ)',
      plate_number: '51D-924.88',
      current_lat: currentPos[0],
      current_lng: currentPos[1],
      progress_percent: progress,
      eta: etaText,
      status_text: courierStatusText
    },
    route,
    steps
  };
}

// GET /api/orders/:id/tracking - Lấy dữ liệu theo dõi hành trình và bản đồ
const getOrderTracking = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    const [orders] = await db.query(`
      SELECT o.*, t.transaction_ref, t.status as transaction_status
      FROM orders o
      LEFT JOIN transactions t ON t.order_id = o.id
      WHERE o.id = ? AND (o.user_id = ? OR ? IN (SELECT id FROM users WHERE role_id IN (2,3,4)))
    `, [id, req.user.id, req.user.id]);

    if (!orders.length) {
      return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại.' });
    }

    const order = orders[0];
    const [items] = await db.query('SELECT * FROM order_items WHERE order_id = ?', [id]);
    const [history] = await db.query('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC', [id]);

    const trackingData = buildTrackingData(order, items, history);
    res.json({ success: true, data: trackingData });
  } catch (err) {
    console.error('Tracking error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server khi lấy thông tin theo dõi.' });
  }
};

// PUT /api/orders/:id/cancel - Hủy đơn
const cancelOrder = async (req: Request, res: Response): Promise<any> => {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;
    const { reason } = req.body;

    await conn.beginTransaction();

    const [orders] = await conn.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ? FOR UPDATE',
      [id, req.user.id]
    );

    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại.' });
    }

    if (!['pending', 'confirmed'].includes(orders[0].status)) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Không thể hủy đơn hàng ở trạng thái này.' });
    }

    await conn.query('UPDATE orders SET status = ?, cancelled_at = NOW() WHERE id = ?', ['cancelled', id]);
    await conn.query('INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES (?, ?, ?, ?)',
      [id, 'cancelled', reason || 'Khách hàng hủy đơn', req.user.id]);

    // Hoàn kho
    const [items] = await conn.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [id]);
    for (const item of items) {
      const [p] = await conn.query('SELECT stock_quantity FROM products WHERE id = ?', [item.product_id]);
      const before = p[0].stock_quantity;
      const after = before + item.quantity;
      await conn.query('UPDATE products SET stock_quantity = ?, sold_count = sold_count - ? WHERE id = ?', [after, item.quantity, item.product_id]);
      await conn.query(
        'INSERT INTO inventory_logs (product_id, change_type, quantity_change, quantity_before, quantity_after, note) VALUES (?, ?, ?, ?, ?, ?)',
        [item.product_id, 'return', item.quantity, before, after, `Hủy đơn ${orders[0].order_number}`]
      );
    }

    await conn.commit();
    res.json({ success: true, message: 'Đơn hàng đã được hủy thành công.' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  } finally {
    conn.release();
  }
};

// Admin: GET /api/admin/orders
const adminGetOrders = async (req: Request, res: Response): Promise<any> => {
  try {
    const { page = 1, limit = 20, status, payment_method, search } = req.query;
    const offset = (parseInt(String(page), 10) - 1) * parseInt(String(limit), 10);
    let where = '1=1';
    const params = [];

    if (status) { where += ' AND o.status = ?'; params.push(status); }
    if (payment_method) { where += ' AND o.payment_method = ?'; params.push(payment_method); }
    if (search) { where += ' AND (o.order_number LIKE ? OR o.shipping_full_name LIKE ? OR o.shipping_phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    const [total] = await db.query(`SELECT COUNT(*) as c FROM orders o WHERE ${where}`, params);
    const [orders] = await db.query(`
      SELECT o.*, u.email, u.full_name as customer_name,
             (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o JOIN users u ON u.id = o.user_id
      WHERE ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(String(limit), 10), offset]);

    res.json({ success: true, data: { orders, total: total[0].c } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// Admin: PUT /api/admin/orders/:id/status
const adminUpdateOrderStatus = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled', 'returned'];

    if (!validStatuses.includes(status as OrderStatus)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ.' });
    }

    const [oldOrder] = await db.query('SELECT status, order_number FROM orders WHERE id = ?', [id]);
    if (!oldOrder.length) {
      return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại.' });
    }

    if (status === 'delivered') {
      // Khi đã giao thành công: Đánh dấu trạng thái giao hàng, thời gian giao và thanh toán hoàn tất
      await db.query(
        "UPDATE orders SET status = 'delivered', payment_status = 'paid', delivered_at = NOW(), updated_at = NOW() WHERE id = ?",
        [id]
      );
    } else if (status === 'cancelled') {
      // Khi hủy đơn: Hoàn lại số lượng tồn kho nếu đơn trước đó chưa hủy
      if (oldOrder[0].status !== 'cancelled') {
        const [items] = await db.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [id]);
        for (const item of items) {
          await db.query(
            'UPDATE products SET stock_quantity = stock_quantity + ?, sold_count = GREATEST(0, sold_count - ?) WHERE id = ?',
            [item.quantity, item.quantity, item.product_id]
          );
        }
      }
      await db.query(
        "UPDATE orders SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE id = ?",
        [id]
      );
    } else if (status === 'confirmed') {
      await db.query(
        "UPDATE orders SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW() WHERE id = ?",
        [id]
      );
    } else if (status === 'shipping') {
      await db.query(
        "UPDATE orders SET status = 'shipping', shipped_at = NOW(), updated_at = NOW() WHERE id = ?",
        [id]
      );
    } else {
      await db.query('UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    }

    await db.query(
      'INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES (?, ?, ?, ?)',
      [id, status, note || `Cập nhật trạng thái thành ${status}`, req.user.id]
    );
    await db.query(
      'INSERT INTO admin_logs (user_id, action, entity_type, entity_id, new_values) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'update_order_status', 'order', id, JSON.stringify({ status, note })]
    );

    res.json({
      success: true,
      message: status === 'delivered' 
        ? 'Đã xác nhận giao hàng thành công! Đơn hàng được cộng vào doanh thu hệ thống.' 
        : (status === 'cancelled' ? 'Đã hủy đơn hàng! Doanh thu đơn đã được loại khỏi thống kê.' : 'Cập nhật trạng thái đơn hàng thành công.')
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// POST /api/orders/:id/verify-payment - Xác nhận thanh toán QR (admin)
const verifyPayment = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { transaction_ref, note } = req.body;

    // Cập nhật giao dịch
    if (transaction_ref) {
      await db.query(
        `UPDATE transactions SET status = 'success', note = ?, updated_at = NOW() WHERE order_id = ? AND transaction_ref = ?`,
        [note || 'Admin đã xác nhận thanh toán', id, transaction_ref]
      );
    } else {
      await db.query(
        `UPDATE transactions SET status = 'success', note = ?, updated_at = NOW() WHERE order_id = ?`,
        [note || 'Admin đã xác nhận thanh toán', id]
      );
    }

    // Cập nhật đơn hàng sang đã thanh toán và đã xác nhận nếu đang pending
    await db.query("UPDATE orders SET payment_status = 'paid', status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END, updated_at = NOW() WHERE id = ?", [id]);

    await db.query("INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES (?, 'confirmed', ?, ?)",
      [id, note || 'Xác nhận thanh toán thành công', req.user.id]);

    await db.query('INSERT INTO admin_logs (user_id, action, entity_type, entity_id, new_values) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'verify_payment', 'order', id, JSON.stringify({ transaction_ref, note })]);

    res.json({ success: true, message: 'Xác nhận thanh toán thành công!' });
  } catch (err) {
    console.error('verifyPayment error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server khi xác nhận thanh toán.' });
  }
};

module.exports = { createOrder, getMyOrders, getOrderDetail, getOrderTracking, cancelOrder, adminGetOrders, adminUpdateOrderStatus, verifyPayment };
export { createOrder, getMyOrders, getOrderDetail, getOrderTracking, cancelOrder, adminGetOrders, adminUpdateOrderStatus, verifyPayment };
