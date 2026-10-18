const fs = require('fs');
const path = require('path');

/**
 * VietQR Image URL Generator
 * Đọc trực tiếp hình ảnh QR.png tại src/utils/QR.png và chuyển thành Base64 Data URL
 * giúp hiển thị mã QR trực tiếp trên giao diện thanh toán mà không bị lỗi đường dẫn.
 */
function generateVietQRUrl({ bankCode = 'MB', accountNumber, accountName, amount, memo } = {}) {
  try {
    // Ưu tiên đọc từ public/images/QR.png (nơi người dùng thay thế ảnh), sau đó tới src/utils/QR.png
    const publicQrPath = path.join(__dirname, '../../public/images/QR.png');
    const utilsQrPath = path.join(__dirname, 'QR.png');

    const targetPath = fs.existsSync(publicQrPath)
      ? publicQrPath
      : (fs.existsSync(utilsQrPath) ? utilsQrPath : null);

    if (targetPath) {
      const qrBase64 = fs.readFileSync(targetPath).toString('base64');
      return `data:image/png;base64,${qrBase64}`;
    }
  } catch (err) {
    console.error('Lỗi khi đọc file QR.png:', err);
  }

  // Fallback đường dẫn nếu không đọc được file (kèm query chống cache)
  return `/images/QR.png?v=${Date.now()}`;
}

module.exports = { generateVietQRUrl };

