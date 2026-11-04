import multer from 'multer';
import path from 'path';
import { Request } from 'express';

// Dùng memory storage để tương thích với Vercel serverless
// (Vercel filesystem là read-only - không thể lưu file vật lý)
const storage = multer.memoryStorage();

// Bộ lọc định dạng tệp (chỉ cho phép các định dạng ảnh thông dụng)
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận tệp hình ảnh định dạng JPG, PNG, WEBP, GIF hoặc SVG!'));
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // Tối đa 5MB
  },
  fileFilter
});

// Thư mục uploads (chỉ dùng khi chạy local với disk storage)
const uploadsDir = path.join(__dirname, '../uploads');

module.exports = { upload, uploadsDir };
export { upload, uploadsDir };
