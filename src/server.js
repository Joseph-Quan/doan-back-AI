const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

// Khởi tạo Database
require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payment');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middlewares
app.use(helmet({
  contentSecurityPolicy: false, // Cho phép load fonts Google, CDN icons, ảnh Unsplash & VietQR
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static file handlers
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/upload', uploadRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'WoodHome E-Commerce API',
    version: '1.0.0',
    timestamp: new Date()
  });
});

// SPA fallback: Chuyển hướng các trang về index.html (Express 5 compatible)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    // Không trả về index.html cho các file tĩnh bị thiếu để tránh lỗi MIME type
    if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map)$/i.test(req.path)) {
      return res.status(404).send('Asset not found');
    }
    return res.sendFile(path.join(__dirname, '../public/index.html'));
  }
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'Endpoint không tồn tại.' });
  }
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Đã có lỗi xảy ra trên máy chủ.',
    error: process.env.NODE_ENV === 'development' ? err : undefined
  });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log('========================================================');
    console.log(`🌲 WOODHOME E-COMMERCE SERVER ĐANG CHẠY TẠI CỔNG ${PORT}`);
    console.log(`🌐 Truy cập website: http://localhost:${PORT}`);
    console.log(`📚 API Docs / Health: http://localhost:${PORT}/api/health`);
    console.log('========================================================');
  });
}

module.exports = app;
