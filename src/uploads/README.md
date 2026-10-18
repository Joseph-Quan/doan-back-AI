# 📁 Thư mục Lưu Trữ Tệp Tải Lên (Uploads)

Thư mục này được sử dụng bởi hệ thống tải ảnh của WoodHome (`/api/upload`).
- Hỗ trợ ảnh đại diện, ảnh sản phẩm, ảnh banner và hóa đơn thanh toán chuyển khoản.
- Định dạng chấp nhận: JPG, JPEG, PNG, WEBP, GIF, SVG.
- Kích thước tối đa: 5MB / tệp.
- Các tệp được phục vụ tĩnh qua endpoint `/uploads/<tên_tệp>` trong `src/server.js`.
