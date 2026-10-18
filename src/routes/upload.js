const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { upload, uploadsDir } = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');

/**
 * POST /api/upload/single
 * Upload 1 ảnh (ảnh sản phẩm, avatar, bill thanh toán VietQR...)
 */
router.post('/single', (req, res, next) => {
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

    const fileUrl = `/uploads/${req.file.filename}`;
    return res.status(201).json({
      success: true,
      message: 'Tải tệp lên thành công!',
      data: {
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  });
});

/**
 * POST /api/upload/multiple
 * Upload tối đa 5 ảnh (bộ sưu tập ảnh sản phẩm)
 */
router.post('/multiple', (req, res, next) => {
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

    const uploadedFiles = req.files.map(f => ({
      url: `/uploads/${f.filename}`,
      filename: f.filename,
      originalName: f.originalname,
      size: f.size,
      mimetype: f.mimetype
    }));

    return res.status(201).json({
      success: true,
      message: `Đã tải lên thành công ${uploadedFiles.length} hình ảnh!`,
      data: uploadedFiles
    });
  });
});

/**
 * GET /api/upload/list
 * Danh sách các tệp đã upload (phục vụ thư viện ảnh media)
 */
router.get('/list', (req, res) => {
  try {
    if (!fs.existsSync(uploadsDir)) {
      return res.json({ success: true, data: [] });
    }
    const files = fs.readdirSync(uploadsDir);
    const fileList = files
      .filter(f => !f.startsWith('.'))
      .map(filename => {
        const filePath = path.join(uploadsDir, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          url: `/uploads/${filename}`,
          size: stats.size,
          created_at: stats.birthtime
        };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.json({
      success: true,
      total: fileList.length,
      data: fileList
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Không thể đọc danh sách tệp: ' + error.message
    });
  }
});

/**
 * DELETE /api/upload/:filename
 * Xóa một tệp đã upload
 */
router.delete('/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const targetPath = path.join(uploadsDir, filename);

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return res.json({
        success: true,
        message: 'Đã xóa tệp thành công!'
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tệp cần xóa.'
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Không thể xóa tệp: ' + error.message
    });
  }
});

module.exports = router;
