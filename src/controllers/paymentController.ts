import { Request, Response } from 'express';
import { generateVietQRUrl } from '../utils/vietqr';

const db = require('../config/database');

// GET /api/payment/qr-info/:orderId
const getQRInfo = async (req: Request, res: Response): Promise<any> => {
  try {
    const { orderId } = req.params;

    const [orders] = await db.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ?',
      [orderId, req.user.id]
    );
    if (!orders.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }

    const order = orders[0];
    const [banks] = await db.query('SELECT * FROM bank_accounts WHERE is_active = 1 LIMIT 1');
    const bank = banks[0] || {
      bank_name: 'MBBank',
      account_number: '0979958935',
      account_name: 'PHẠM VĂN QUÂN',
      branch: 'Chi nhánh Hà Nội'
    };

    const memo = `WH ${order.order_number}`;
    const qrImageUrl = generateVietQRUrl({
      bankCode: bank.bank_code || (bank.bank_name.includes('MB') ? 'MB' : 'VCB'),
      accountNumber: bank.account_number,
      accountName: bank.account_name,
      amount: order.total_amount,
      memo
    });

    res.json({
      success: true,
      data: {
        order_number: order.order_number,
        total_amount: order.total_amount,
        payment_status: order.payment_status,
        bank: {
          bank_name: bank.bank_name,
          account_number: bank.account_number,
          account_name: bank.account_name,
          branch: bank.branch,
          memo
        },
        qr_image_url: qrImageUrl,
        expires_in_minutes: 15
      }
    });
  } catch (err) {
    console.error('getQRInfo error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// POST /api/payment/visa-process
// Chỉ cho phép mô phỏng ở môi trường demo; production phải dùng PSP có webhook/chữ ký.
const processVisaPayment = async (req: Request, res: Response): Promise<any> => {
  try {
    if (process.env.PAYMENT_DEMO_MODE !== 'true') {
      return res.status(503).json({
        success: false,
        message: 'Thanh toán Visa chưa được cấu hình cổng thanh toán an toàn.'
      });
    }
    const { order_id, card_number, card_holder, expiry_date, cvv, otp } = req.body;

    if (!order_id || !card_number || !card_holder || !expiry_date || !cvv) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin thẻ.' });
    }

    // Kiểm tra định dạng thẻ cơ bản
    const cleanCard = card_number.replace(/\s+/g, '');
    if (cleanCard.length < 15 || cleanCard.length > 19) {
      return res.status(400).json({ success: false, message: 'Số thẻ Visa không hợp lệ.' });
    }

    if (cvv.length < 3 || cvv.length > 4) {
      return res.status(400).json({ success: false, message: 'Mã bảo mật CVV không hợp lệ.' });
    }

    const [orders] = await db.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ? AND payment_method = ?',
      [order_id, req.user.id, 'visa']
    );
    if (!orders.length) {
      return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại.' });
    }

    const order = orders[0];
    if (order.payment_status === 'paid') {
      return res.json({
        success: true,
        message: 'Đơn hàng đã được thanh toán trước đó.',
        data: { order_id, order_number: order.order_number, transaction_status: 'success' }
      });
    }

    // Cập nhật trạng thái đơn hàng và transaction
    await db.query("UPDATE orders SET payment_status = 'paid', status = 'confirmed', updated_at = NOW() WHERE id = ?", [order_id]);
    await db.query(
      "UPDATE transactions SET status = 'success', note = ?, updated_at = NOW() WHERE order_id = ?",
      [`Đã thanh toán qua thẻ Visa kết thúc bằng *${cleanCard.slice(-4)}`, order_id]
    );

    await db.query(
      "INSERT INTO order_status_history (order_id, status, note) VALUES (?, 'confirmed', ?)",
      [order_id, `Xác nhận thanh toán Visa thành công (Số thẻ: **** **** **** ${cleanCard.slice(-4)})`]
    );

    res.json({
      success: true,
      message: 'Thanh toán thẻ Visa thành công! Đơn hàng đã được xác nhận.',
      data: {
        order_id,
        order_number: order.order_number,
        transaction_status: 'success',
        last4: cleanCard.slice(-4)
      }
    });
  } catch (err) {
    console.error('processVisaPayment error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server khi xử lý thanh toán.' });
  }
};

// POST /api/payment/confirm-qr-transfer
// Khách bấm xác nhận "Tôi đã chuyển khoản xong" hoặc Webhook ngân hàng
const confirmQRTransfer = async (req: Request, res: Response): Promise<any> => {
  try {
    const { order_id } = req.body;

    const [orders] = await db.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ? AND payment_method = ?',
      [order_id, req.user.id, 'qr_transfer']
    );
    if (!orders.length) {
      return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại.' });
    }

    // Khách chỉ gửi yêu cầu đối soát; không được tự xác nhận đã nhận tiền.
    await db.query("UPDATE orders SET payment_status = 'pending', updated_at = NOW() WHERE id = ?", [order_id]);
    await db.query("UPDATE transactions SET status = 'pending', note = 'Khách yêu cầu đối soát VietQR', updated_at = NOW() WHERE order_id = ?", [order_id]);

    await db.query(
      "INSERT INTO order_status_history (order_id, status, note) VALUES (?, 'pending', 'Khách đã gửi yêu cầu đối soát VietQR')",
      [order_id]
    );

    res.json({
      success: true,
      message: 'Đã gửi yêu cầu đối soát. Nhân viên sẽ xác nhận sau khi kiểm tra giao dịch ngân hàng.'
    });
  } catch (err) {
    console.error('confirmQRTransfer error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

module.exports = { getQRInfo, processVisaPayment, confirmQRTransfer };
export { getQRInfo, processVisaPayment, confirmQRTransfer };
