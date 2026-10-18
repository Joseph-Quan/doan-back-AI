const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const db = require('../config/database');

// POST /api/auth/register
const register = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { email, phone, password, full_name, security_question_id, security_answer } = req.body;

    // Validate
    if (!email || !password || !full_name) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin bắt buộc.' });
    }

    // Kiểm tra email trùng
    const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Email này đã được sử dụng. Vui lòng dùng email khác.' });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 8 ký tự.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await conn.beginTransaction();

    const [result] = await conn.query(
      'INSERT INTO users (email, phone, password_hash, full_name, role_id) VALUES (?, ?, ?, ?, 1)',
      [email, phone || null, passwordHash, full_name]
    );
    const userId = result.insertId;

    // Lưu câu hỏi bảo mật nếu có
    if (security_question_id && security_answer) {
      const answerHash = await bcrypt.hash(security_answer.toLowerCase().trim(), 10);
      await conn.query(
        'INSERT INTO user_security_answers (user_id, question_id, answer_hash) VALUES (?, ?, ?)',
        [userId, security_question_id, answerHash]
      );
    }

    await conn.commit();

    const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công!',
      data: { token, user: { id: userId, email, full_name, role_id: 1 } }
    });
  } catch (err) {
    await conn.rollback();
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Đã có lỗi xảy ra. Vui lòng thử lại.' });
  } finally {
    conn.release();
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu.' });
    }

    const [users] = await db.query(
      'SELECT id, email, phone, password_hash, full_name, avatar, role_id, is_active FROM users WHERE email = ?',
      [email]
    );

    if (!users.length) {
      return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng.' });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng.' });
    }

    // Cập nhật last_login
    await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          avatar: user.avatar,
          role_id: user.role_id
        }
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Đã có lỗi xảy ra.' });
  }
};

// GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, email, phone, full_name, avatar, role_id, created_at, last_login FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ success: true, data: users[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// GET /api/auth/security-questions
const getSecurityQuestions = async (req, res) => {
  try {
    const [questions] = await db.query('SELECT id, question FROM security_questions WHERE is_active = 1');
    res.json({ success: true, data: questions });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// POST /api/auth/forgot-password - Bước 1: Tìm tài khoản
const forgotPassword = async (req, res) => {
  try {
    const { identifier } = req.body; // email or phone

    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập email hoặc số điện thoại.' });
    }

    const [users] = await db.query(
      'SELECT id, email, phone, full_name FROM users WHERE email = ? OR phone = ?',
      [identifier, identifier]
    );

    if (!users.length) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản với thông tin này.' });
    }

    const user = users[0];

    // Lấy câu hỏi bảo mật
    const [answers] = await db.query(`
      SELECT usa.id, sq.id as question_id, sq.question
      FROM user_security_answers usa
      JOIN security_questions sq ON sq.id = usa.question_id
      WHERE usa.user_id = ?
    `, [user.id]);

    if (!answers.length) {
      return res.status(400).json({ success: false, message: 'Tài khoản chưa thiết lập câu hỏi bảo mật. Vui lòng liên hệ hỗ trợ.' });
    }

    res.json({
      success: true,
      data: {
        user_id: user.id,
        masked_email: maskEmail(user.email),
        questions: answers.map(a => ({ id: a.question_id, question: a.question }))
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// POST /api/auth/verify-security-answer - Bước 2: Xác minh câu trả lời
const verifySecurityAnswer = async (req, res) => {
  try {
    const { user_id, question_id, answer } = req.body;

    const [answers] = await db.query(
      'SELECT answer_hash FROM user_security_answers WHERE user_id = ? AND question_id = ?',
      [user_id, question_id]
    );

    if (!answers.length) {
      return res.status(400).json({ success: false, message: 'Câu hỏi bảo mật không hợp lệ.' });
    }

    const isMatch = await bcrypt.compare(answer.toLowerCase().trim(), answers[0].answer_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Câu trả lời không đúng.' });
    }

    // Tạo token khôi phục (1 lần dùng, hết hạn 15 phút)
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user_id, resetToken, expiresAt]
    );

    res.json({
      success: true,
      message: 'Xác minh thành công.',
      data: { reset_token: resetToken }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// POST /api/auth/reset-password - Bước 3: Đặt mật khẩu mới
const resetPassword = async (req, res) => {
  try {
    const { reset_token, new_password } = req.body;

    if (!reset_token || !new_password) {
      return res.status(400).json({ success: false, message: 'Thông tin không đầy đủ.' });
    }

    if (new_password.length < 8) {
      return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 8 ký tự.' });
    }

    const [tokens] = await db.query(
      'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > NOW()',
      [reset_token]
    );

    if (!tokens.length) {
      return res.status(400).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn.' });
    }

    const passwordHash = await bcrypt.hash(new_password, 12);

    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, tokens[0].user_id]);
    await db.query('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [tokens[0].id]);

    res.json({ success: true, message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// POST /api/auth/change-password
const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    const [users] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const isMatch = await bcrypt.compare(current_password, users[0].password_hash);

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng.' });
    }

    if (new_password.length < 8) {
      return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' });
    }

    const passwordHash = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);

    res.json({ success: true, message: 'Đổi mật khẩu thành công.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// Utility
function maskEmail(email) {
  const [user, domain] = email.split('@');
  const masked = user.length <= 2 ? user : user[0] + '*'.repeat(user.length - 2) + user[user.length - 1];
  return `${masked}@${domain}`;
}

module.exports = { register, login, getMe, getSecurityQuestions, forgotPassword, verifySecurityAnswer, resetPassword, changePassword };
