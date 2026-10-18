# 🌲 WOODHOME - HỆ THỐNG THƯƠNG MẠI ĐIỆN TỬ NỘI THẤT ĐỒ GỖ CAO CẤP
> Đồ án môn học Backend Nâng Cao — Xây dựng website E-Commerce hoàn chỉnh theo Đặc tả Yêu cầu Sản phẩm (PRD v1.0).

---

## 🌟 1. TỔNG QUAN DỰ ÁN

WoodHome là nền tảng thương mại điện tử chuyên kinh doanh nội thất đồ gỗ tự nhiên (Bàn ghế, Giường ngủ, Tủ quần áo, Kệ TV, Bàn ăn, Bàn làm việc, Sofa gỗ...). Ứng dụng được thiết kế theo phong cách tối giản, sang trọng với các tông màu ấm đặc trưng của gỗ Sồi, Óc Chó, Gõ Đỏ và điểm nhấn vàng đồng cao cấp.

---

## 🚀 2. TÍNH NĂNG ĐÁP ỨNG ĐẶC TẢ PRD

### 2.1. Cổng Xác Thực & Bảo Mật (Auth Gateway)
- **Bắt buộc đăng nhập ngay khi mở website:** Khách truy cập chưa xác thực không thể bỏ qua để vào cửa hàng trực tiếp.
- **Phân quyền người dùng (Role-Based Access Control):**
  - `Khách hàng (customer)` (Role ID: 1)
  - `Nhân viên bán hàng (staff_sales)` (Role ID: 2)
  - `Nhân viên kho (staff_warehouse)` (Role ID: 3)
  - `Quản trị viên (admin)` (Role ID: 4)
- **Bảo mật mật khẩu:** Băm mật khẩu bằng thuật toán `bcrypt` với muối an toàn, xác thực bằng `JWT (JSON Web Token)`.
- **Khôi phục mật khẩu 3 bước qua câu hỏi bảo mật:**
  1. Nhập Email hoặc Số điện thoại.
  2. Hệ thống hiển thị câu hỏi bảo mật tài khoản đã chọn khi đăng ký -> Khách trả lời câu hỏi.
  3. Xác thực thành công -> Cấp quyền đặt mật khẩu mới với giới hạn thời gian (15 phút).

### 2.2. Trải Nghiệm Mua Sắm & Cửa Hàng
- **Hero Banner Slider:** Trình chiếu bộ sưu tập đồ gỗ với nút Next/Prev, chỉ báo slide (dots), tự động chuyển slide có kiểm soát.
- **Danh mục sản phẩm thông minh:** Lọc theo danh mục (Bàn ghế, Giường ngủ, Tủ kệ, Bàn ăn, Sofa...), tìm kiếm trực tiếp với kỹ thuật debounce.
- **Sắp xếp linh hoạt:** Sắp xếp theo mới nhất, bán chạy nhất, giá tăng/giảm dần, đánh giá cao nhất.
- **Chi tiết sản phẩm & Thư viện ảnh:** Hiển thị chất liệu gỗ nguyên khối, kích thước, màu sắc, thời gian bảo hành, số lượng tồn kho thực tế và hệ thống đánh giá sao (1-5★).
- **Danh sách yêu thích (Wishlist):** Lưu sản phẩm yêu thích chỉ bằng 1 cú click.

### 2.3. Giỏ Hàng & Đặt Hàng (Checkout)
- **Giỏ hàng thời gian thực:** Thêm sản phẩm, tăng/giảm số lượng có kiểm tra tồn kho tại server.
- **Mã giảm giá (Promotions):** Hỗ trợ mã giảm theo % hoặc số tiền cố định (`WELCOME10`, `FREESHIP`, `WOOD200K`).
- **Phí vận chuyển thông minh:** Tự động miễn phí vận chuyển cho đơn hàng từ 5.000.000đ.
- **Địa chỉ giao hàng:** Lưu trữ và tự động điền địa chỉ mặc định của khách hàng.

### 2.4. Đa Dạng Phương Thức Thanh Toán (PRD Mục 13)
1. **COD (Tiền mặt khi nhận hàng):** Tạo đơn hàng, không đánh dấu đã thanh toán trước khi giao nhận thành công.
2. **VietQR (Napas 247):** Tự động sinh mã QR ngân hàng chuẩn Napas 247 kèm số tiền, số tài khoản, tên đơn vị thụ hưởng và cú pháp chuyển khoản chính xác `WH + Mã đơn`. Khách hàng có thể quét và bấm xác nhận chuyển khoản.
3. **Thẻ Visa / MasterCard:** Giao diện thẻ trực quan sang trọng, mô phỏng cổng thanh toán quốc tế bảo mật chuẩn 3D-Secure.

### 2.5. Theo Dõi Đơn Hàng & Vận Chuyển (PRD Mục 15)
- Quản lý danh sách đơn hàng đã mua.
- Tiến độ giao hàng trực quan dạng thanh tiến trình (Timeline): `Chờ xác nhận` ➔ `Đã xác nhận` ➔ `Đang đóng gói` ➔ `Đang giao hàng` ➔ `Đã giao thành công`.
- Cho phép khách hàng hủy đơn hàng khi đơn còn ở trạng thái `pending`.

### 2.6. Trang Quản Trị Hệ Thống (Admin Portal - PRD Mục 16)
- **Dashboard phân tích:** Doanh thu hôm nay, doanh thu tháng, số lượng đơn hàng, số đơn chờ xử lý, số sản phẩm sắp hết hàng.
- **Quản lý đơn hàng:** Xem chi tiết đơn và cập nhật trạng thái đơn hàng trực tiếp qua dropdown.
- **Kiểm soát giao dịch:** Đối soát thanh toán, xác nhận tiền về qua QR / thẻ.

---

## 🛠️ 3. CÔNG NGHỆ SỬ DỤNG

- **Backend:** Node.js, Express.js (v5), MySQL2, JWT, Bcryptjs, Express-Rate-Limit, Helmet, Cors, Morgan, UUID.
- **Database Engine:**
  - Hỗ trợ kết nối cơ sở dữ liệu **MySQL** chuẩn qua file `database.sql`.
  - Tích hợp sẵn cơ chế **Smart In-Memory Database Fallback**: Tự động chuyển đổi nếu MySQL local chưa bật, giúp website có thể chạy thử nghiệm và chấm điểm ngay lập tức mà không gặp lỗi kết nối.
- **Frontend:** Vanilla HTML5, CSS3 hiện đại (Flexbox, CSS Grid, Glassmorphism, Responsive), JavaScript ES6+ (Fetch API, DOM manipulation).
- **Thanh toán tích hợp:** VietQR Image API (chuẩn Napas 247).

---

## 🔑 4. TÀI KHOẢN TRẢI NGHIỆM MẪU

| Vai trò | Email đăng nhập | Mật khẩu | Chức năng |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (Admin)** | `admin@woodhome.vn` | `Admin@123` | Toàn quyền Dashboard, đơn hàng, kho, doanh thu |
| **Nhân viên bán hàng** | `staff@woodhome.vn` | `Admin@123` | Xử lý đơn hàng, cập nhật vận chuyển |
| **Khách hàng** | `khachhang@gmail.com` | `Admin@123` | Mua hàng, giỏ hàng, VietQR, theo dõi đơn |

*(Tại màn hình đăng nhập, bạn có thể click vào các nút "⚡ Tài khoản mẫu" để điền tự động).*

---

## 💻 5. HƯỚNG DẪN CÀI ĐẶT & CHẠY ỨNG DỤNG

### Bước 1: Khởi động Server
```bash
npm start
```
Ứng dụng sẽ chạy tại địa chỉ: **`http://localhost:3000`**

### Bước 2 (Tùy chọn - Khi bạn muốn dùng MySQL của riêng mình):
1. Bật MySQL trên XAMPP / Laragon hoặc Windows Service.
2. Kiểm tra thông tin trong file `.env`:
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=woodhome
   ```
3. Chạy lệnh tự động tạo bảng và nạp dữ liệu:
   ```bash
   npm run init-db
   ```
4. Khởi động lại server: `npm start`.

---

## 📁 6. CẤU TRÚC THƯ MỤC

```text
doan-back/
├── PRD - backend nâng cao.docx   # File đặc tả gốc của đề tài
├── database.sql                  # Toàn bộ cấu trúc CSDL và dữ liệu mẫu
├── .env                          # File cấu hình biến môi trường
├── package.json                  # Dependencies và scripts
├── src/
│   ├── config/
│   │   └── database.js           # Bộ kết nối MySQL & Fallback Engine
│   ├── controllers/
│   │   ├── authController.js     # Đăng ký, đăng nhập, khôi phục MK
│   │   ├── productController.js  # Sản phẩm, danh mục, đánh giá
│   │   ├── cartController.js     # Giỏ hàng và tồn kho
│   │   ├── orderController.js    # Đặt hàng, theo dõi đơn, hủy đơn
│   │   ├── userController.js     # Địa chỉ, hồ sơ, danh sách yêu thích
│   │   ├── adminController.js    # Thống kê, quản lý đơn, banner
│   │   └── paymentController.js  # Xử lý VietQR & Thẻ Visa
│   ├── middleware/
│   │   └── auth.js               # Xác thực JWT & Phân quyền Role
│   ├── routes/
│   │   ├── auth.js
│   │   ├── products.js
│   │   ├── cart.js
│   │   ├── orders.js
│   │   ├── users.js
│   │   ├── admin.js
│   │   └── payment.js
│   ├── utils/
│   │   ├── vietqr.js             # Tạo URL VietQR Napas 247
│   │   └── initDb.js             # Script tự động import database.sql
│   └── server.js                 # File khởi động chính của ứng dụng
└── public/
    ├── index.html                # Giao diện chính của ứng dụng
    ├── css/
    │   └── style.css             # Thiết kế phong cách nội thất gỗ cao cấp
    └── js/
        └── app.js                # Toàn bộ logic Client SPA
```
