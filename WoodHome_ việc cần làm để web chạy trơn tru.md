# WoodHome: việc cần làm để web chạy trơn tru

Rút ra từ lần chạy thử thật và đối chiếu toàn diện Đặc tả Yêu cầu Sản phẩm (PRD v1.0).
Tiến độ được cập nhật trực tiếp theo từng nhóm công việc.

---

### 📊 Tiến độ tổng thể
- **Nhóm 1 (Ưu tiên Cao - Chặn demo & Lỗi cú pháp/Bảo mật):** 6/6 việc đã hoàn thành (100%)
- **Nhóm 2 (Ưu tiên Vừa - Chuẩn hóa kiến trúc Router & Thiếu theo PRD):** 7/7 việc đã hoàn thành (100%)
- **Nhóm 3 (Ưu tiên Thấp - Nâng cao, Tối ưu & Ổn định dài hạn):** 4/4 việc đã hoàn thành (100%)

---

## 🔴 Nhóm 1: Ưu tiên Cao (Chặn demo, Lỗi cú pháp, Xung đột Router & Bảo mật)

- [x] **1.1. Sửa xung đột đường dẫn `:slug` trong Router Sản phẩm (`routes/products.js`)**
  - *Hiện trạng:* Route `/:slug` được định nghĩa trước các route quản trị `/admin/list` và `/admin/:id`. Khi nhân viên/admin truy cập Quản trị sản phẩm, Express hiểu `:slug = "admin"` dẫn tới lỗi 404 không tải được danh sách sản phẩm quản trị.
  - *Giải pháp:* Đưa các route cụ thể `/admin/*` lên trước các route tham số động `/:slug`, hoặc tách luồng sang router admin riêng.

- [x] **1.2. Sửa lỗi `uuidv4 is not defined` trong luồng Khôi phục Mật khẩu (`controllers/authController.js`)**
  - *Hiện trạng:* Tại bước 2 xác minh câu hỏi bảo mật (`verifySecurityAnswer`), code gọi `uuidv4()` nhưng module chỉ import `{ randomUUID }` từ `crypto`, gây lỗi sập server (500 ReferenceError).
  - *Giải pháp:* Đổi `uuidv4()` thành `randomUUID()`.

- [x] **1.3. Khắc phục lỗi lệch tên bảng và trường dữ liệu Đánh giá sản phẩm (`models/Review.js` & `models/Product.js`)**
  - *Hiện trạng:* `models/Review.js` và `models/Product.js` truy vấn bảng `reviews`, trong khi cơ sở dữ liệu và Fallback Engine dùng bảng `product_reviews`.
  - *Giải pháp:* Chuẩn hóa truy vấn thống nhất tên bảng `product_reviews` (hỗ trợ alias tương thích) giúp tính điểm trung bình sao không bị lỗi.

- [x] **1.4. Chuẩn hóa cấu trúc trường dữ liệu Mã giảm giá (`models/Promotion.js` & `fallbackStore`)**
  - *Hiện trạng:* Model `Promotion.js` dùng `discount_type`, `discount_value`, `used_count` trong khi fallback store dùng `type`, `value`, `usage_count`, gây lỗi khi áp dụng voucher ở chế độ In-Memory DB.
  - *Giải pháp:* Đồng bộ hóa và hỗ trợ map linh hoạt cả 2 định dạng trường để tính toán chiết khấu chính xác 100%.

- [x] **1.5. Cải thiện độ tin cậy của hàm Xác nhận thanh toán VietQR (`orderController.js - verifyPayment`)**
  - *Hiện trạng:* Query kiểm tra cứng `transaction_ref` trong khi body có thể không truyền hoặc đơn hàng chỉ có `order_id`.
  - *Giải pháp:* Kiểm tra linh hoạt theo `order_id`, tự động cập nhật cả `orders (payment_status = 'paid')` và bản ghi trong `transactions`.

- [x] **1.6. Khắc phục sự cố CORS & Headers bảo mật cho Static Assets và VietQR**
  - *Hiện trạng:* Cần đảm bảo hình ảnh QR, ảnh logo tải mượt mà không bị CSP chặn trên production/local.

---

## 🟡 Nhóm 2: Ưu tiên Vừa (Phân luồng Router & Hoàn thiện tính năng theo PRD)

- [x] **2.1. Tái cấu trúc Central Router (`src/routes/index.js`)**
  - *Hiện trạng:* `server.js` import thủ công 8 router riêng lẻ, thiếu tính đóng gói và khó mở rộng.
  - *Giải pháp:* Tạo bộ định tuyến trung tâm `src/routes/index.js`, `server.js` chỉ cần mount duy nhất `app.use('/api', apiRouter)`.

- [x] **2.2. Phân luồng rõ ràng 3 tầng nghiệp vụ:**
  - **Tầng 1 - Public Gateway:** `/api/auth`, `/api/products`, `/api/categories`, `/api/banners`, `/api/promotions/validate`, `/api/health`.
  - **Tầng 2 - Authenticated Customer Gateway (JWT):** `/api/cart`, `/api/orders`, `/api/users` (profile, address, wishlist, notifications), `/api/payment`, `/api/upload`.
  - **Tầng 3 - Staff/Admin Portal Gateway (RBAC):** Gom tập trung vào `/api/admin/*` với middleware phân quyền chặt chẽ (`requireStaff`, `requireAdmin`).

- [x] **2.3. Tách Router Danh mục sản phẩm chuyên biệt (`src/routes/categories.js`)**
  - *Hiện trạng:* Danh mục đang ghép chung trong `products.js`. PRD yêu cầu thực thể Categories độc lập (PRD 13.4).
  - *Giải pháp:* Tách route `/api/categories` riêng biệt, hỗ trợ lấy danh sách danh mục có đếm số lượng sản phẩm và cho phép Admin quản lý danh mục.

- [x] **2.4. Tách Router Banner & Khuyến mãi khỏi `admin.js` cho phía Khách hàng**
  - *Hiện trạng:* Khách hàng xem banner hay kiểm tra mã giảm giá phải gọi vào `/api/admin/banners/public` và `/api/admin/promotions/validate`.
  - *Giải pháp:* Cung cấp route chuẩn `/api/banners` và `/api/promotions/validate`, đồng thời giữ route cũ tại `/api/admin` để đảm bảo tương thích ngược 100%.

- [x] **2.5. Hoàn thiện toàn bộ Route CRUD Danh mục & Banner trong Admin**
  - *Giải pháp:* Bổ sung đầy đủ endpoint thêm/sửa/xóa danh mục, banner slider trực quan.

- [x] **2.6. Đồng bộ hóa kiểm soát tồn kho và hoàn trả kho khi hủy đơn (`orderController.js`)**
  - *Giải pháp:* Đảm bảo khi khách hàng hoặc nhân viên hủy đơn (status = `'cancelled'`), số lượng tồn kho tự động cộng trả lại và ghi nhận vào `inventory_logs`.

- [x] **2.7. Đảm bảo doanh thu Dashboard đúng quy tắc PRD**
  - *Quy tắc:* Đơn bị hủy (`cancelled`) không được tính doanh thu; chỉ đơn đã giao thành công (`status = 'delivered'`) mới được tính vào doanh thu.

---

## 🟢 Nhóm 3: Ưu tiên Thấp (Nâng cao, Tối ưu & Ổn định dài hạn)

- [x] **3.1. Chuẩn hóa format phản hồi JSON thống nhất trên toàn bộ hệ thống**
  - Quy chuẩn: Luôn trả về `{ success: boolean, message: string, data?: any }` kèm mã HTTP status chính xác (200, 201, 400, 401, 403, 404, 409, 500).

- [x] **3.2. Bảo vệ chống tấn công Brute-force & Spam API**
  - Áp dụng `express-rate-limit` cho các endpoint nhạy cảm (Đăng nhập, Đăng ký, Quên mật khẩu).

- [x] **3.3. Tích hợp Audit Logs (`admin_logs`, `inventory_logs`) theo PRD 13.15**
  - Tự động ghi vết các thao tác quản trị: thay đổi giá, sửa sản phẩm, đổi tài khoản ngân hàng QR, cập nhật trạng thái đơn hàng.

- [x] **3.4. Cải tiến API Health Check & System Status (`/api/health`)**
  - Bổ sung thông tin trạng thái cơ sở dữ liệu (MySQL / In-Memory Fallback), thời gian hoạt động (uptime) và phiên bản API.