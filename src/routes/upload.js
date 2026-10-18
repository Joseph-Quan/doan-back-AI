const express = require('express');
const router = express.Router();
const { upload } = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');

/**
 * POST /api/upload/single
 * Upload 1 ảnh, trả về base64 data URL (tương thích Vercel serverless)
 */
router.post('/single', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'Lỗi khi tải tệp lên.'
      });
    }
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn một tệp hình ảnh để tải lên.'
      });
    }

    // Trả về base64 data URL để frontend sử dụng trực tiếp
    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

    return res.status(201).json({
      success: true,
      message: 'Tải tệp lên thành công!',
      data: {
        url: dataUrl,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  });
});

/**
 * POST /api/upload/multiple
 * Upload tối đa 5 ảnh (bộ sưu tập ảnh sản phẩm), trả về base64 data URLs
 */
router.post('/multiple', (req, res) => {
  upload.array('files', 5)(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'Lỗi khi tải tệp lên.'
      });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn ít nhất một tệp hình ảnh.'
      });
    }

    const uploadedFiles = req.files.map(f => {
      const base64 = f.buffer.toString('base64');
      const dataUrl = `data:${f.mimetype};base64,${base64}`;
      return {
        url: dataUrl,
        originalName: f.originalname,
        size: f.size,
        mimetype: f.mimetype
      };
    });

    return res.status(201).json({
      success: true,
      message: `Đã tải lên thành công ${uploadedFiles.length} hình ảnh!`,
      data: uploadedFiles
    });
  });
});

/**
 * GET /api/upload/list
 * Danh sách media (trên Vercel không có disk storage, trả về mảng rỗng)
 */
router.get('/list', (req, res) => {
  // Trên Vercel serverless không có filesystem persistent
  // Frontend nên lưu URL ảnh vào database thay vì filesystem
  return res.json({
    success: true,
    total: 0,
    data: [],
    note: 'File storage không khả dụng trên môi trường serverless. Vui lòng lưu URL ảnh trực tiếp vào database.'
  });
});

/**
 * DELETE /api/upload/:filename
 * Xóa tệp (không khả dụng trên Vercel serverless)
 */
router.delete('/:filename', (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Đã xử lý yêu cầu xóa tệp.'
  });
});

module.exports = router;
