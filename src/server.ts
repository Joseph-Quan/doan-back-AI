import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import 'dotenv/config';

// Khởi tạo Database
const db = require('./config/database');

// Import Master Central Router (Phân luồng router trung tâm)
const apiRouter = require('./routes');

const app: Application = express();
const PORT: number = parseInt(process.env.PORT || '3000', 10);

// Tin tưởng reverse proxy (cần thiết cho Vercel & Express rate limiter)
app.set('trust proxy', 1);

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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Static file handlers
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../public')));

// Phân luồng API qua Central Gateway Router
app.use('/api', apiRouter);

// Health check & System status endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    app: 'WoodHome E-Commerce API',
    version: '1.0.0',
    timestamp: new Date(),
    uptime_seconds: Math.floor(process.uptime()),
    database: {
      engine: db.isFallbackMode() ? 'In-Memory Smart Fallback' : 'MySQL Live Connection',
      mode: process.env.NODE_ENV || 'development'
    }
  });
});

// SPA fallback: Chuyển hướng các trang về index.html (Express 5 compatible)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    // Không trả về index.html cho các file tĩnh bị thiếu để tránh lỗi MIME type
    if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map)$/i.test(req.path)) {
      res.status(404).send('Asset not found');
      return;
    }
    res.sendFile(path.join(__dirname, '../public/index.html'));
    return;
  }
  if (req.path.startsWith('/api')) {
    res.status(404).json({ success: false, message: 'Endpoint không tồn tại.' });
    return;
  }
  next();
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
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
export default app;
