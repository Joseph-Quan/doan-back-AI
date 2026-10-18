# 🌲 WOODHOME - HỆ THỐNG THƯƠNG MẠI ĐIỆN TỬ NỘI THẤT ĐỒ GỖ CAO CẤP
> Đồ án môn học Backend Nâng Cao — Xây dựng website E-Commerce hoàn chỉnh theo Đặc tả Yêu cầu Sản phẩm (PRD v1.0).

🌐 **Live Demo:** [https://doan-back-ai.vercel.app](https://doan-back-ai.vercel.app)

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
- **Khôi phục mật khẩu 3 bước qua câu hỏi bảo mật.**

### 2.2. Trải Nghiệm Mua Sắm & Cửa Hàng
- **Hero Banner Slider:** Trình chiếu bộ sưu tập đồ gỗ với nút Next/Prev, chỉ báo slide (dots), tự động chuyển slide có kiểm soát.
- **Danh mục sản phẩm thông minh:** Lọc theo danh mục, tìm kiếm trực tiếp với kỹ thuật debounce.
- **Sắp xếp linh hoạt:** Theo mới nhất, bán chạy nhất, giá tăng/giảm dần, đánh giá cao nhất.
- **Chi tiết sản phẩm & Thư viện ảnh:** Hiển thị chất liệu gỗ nguyên khối, kích thước, màu sắc, thời gian bảo hành, số lượng tồn kho thực tế và hệ thống đánh giá sao (1-5★).

### 2.3. Giỏ Hàng & Đặt Hàng (Checkout)
- **Giỏ hàng thời gian thực:** Thêm sản phẩm, tăng/giảm số lượng có kiểm tra tồn kho tại server.
- **Mã giảm giá (Promotions):** Hỗ trợ mã giảm theo % hoặc số tiền cố định.
- **Phí vận chuyển thông minh:** Tự động miễn phí vận chuyển cho đơn hàng từ 5.000.000đ.

### 2.4. Đa Dạng Phương Thức Thanh Toán
1. **COD (Tiền mặt khi nhận hàng)**
2. **VietQR (Napas 247):** Tự động sinh mã QR ngân hàng chuẩn Napas 247.
3. **Thẻ Visa / MasterCard:** Giao diện thẻ trực quan sang trọng.

### 2.5. Trang Quản Trị Hệ Thống (Admin Portal)
- **Dashboard phân tích:** Doanh thu hôm nay, doanh thu tháng, số lượng đơn hàng.
- **Doanh thu chỉ tính khi `status = 'delivered'`** (đơn hàng bị hủy `cancelled` không được tính).
- **Quản lý đơn hàng:** Xem chi tiết và cập nhật trạng thái trực tiếp.

---

## 🛠️ 3. CÔNG NGHỆ SỬ DỤNG

- **Backend:** Node.js 18+, Express.js (v5), MySQL2, JWT, Bcryptjs, Helmet, Cors, Multer
- **Database Engine:**
  - Hỗ trợ kết nối **MySQL** chuẩn.
  - Tích hợp sẵn **Smart In-Memory Database Fallback**: Tự động chuyển đổi nếu MySQL chưa bật.
- **Frontend:** Vanilla HTML5, CSS3 (Glassmorphism, Responsive), JavaScript ES6+
- **Deploy:** Vercel (Serverless Functions)

---

## 🔑 4. TÀI KHOẢN TRẢI NGHIỆM MẪU

| Vai trò | Email đăng nhập | Mật khẩu | Chức năng |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (Admin)** | `admin@woodhome.vn` | `Admin@123` | Toàn quyền Dashboard, đơn hàng, kho, doanh thu |
| **Nhân viên bán hàng** | `staff@woodhome.vn` | `Admin@123` | Xử lý đơn hàng, cập nhật vận chuyển |
| **Khách hàng** | `khachhang@gmail.com` | `Admin@123` | Mua hàng, giỏ hàng, VietQR, theo dõi đơn |

*(Tại màn hình đăng nhập, bạn có thể click vào các nút "⚡ Tài khoản mẫu" để điền tự động).*

---

## 💻 5. HƯỚNG DẪN CÀI ĐẶT & CHẠY CỤC BỘ

### Bước 1: Clone và cài dependencies
```bash
git clone https://github.com/Joseph-Quan/doan-back-AI.git
cd doan-back-AI
npm install
```

### Bước 2: Khởi động Server
```bash
npm start
```
Ứng dụng sẽ chạy tại địa chỉ: **`http://localhost:3000`**

### Bước 3 (Tùy chọn - Khi muốn dùng MySQL):
1. Bật MySQL trên XAMPP / Laragon.
2. Sao chép `.env.example` thành `.env` và điền thông tin database.
3. Chạy lệnh tự động tạo bảng và nạp dữ liệu:
   ```bash
   npm run init-db
   ```
4. Khởi động lại server: `npm start`.

---

## ☁️ 6. HƯỚNG DẪN DEPLOY LÊN VERCEL

### Yêu cầu:
- Tài khoản [Vercel](https://vercel.com) (miễn phí)
- Repository đã push lên GitHub

### Các bước:
1. Truy cập [vercel.com/new](https://vercel.com/new)
2. Import repository `doan-back-AI` từ GitHub
3. Trong phần **Environment Variables**, thêm các biến sau:
   ```
   NODE_ENV=production
   JWT_SECRET=<your_random_secret_key>
   ```
   *(Nếu có MySQL cloud, thêm thêm DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)*
4. Click **Deploy**! Vercel sẽ tự động build và deploy.

> **Lưu ý:** Khi không cấu hình MySQL, ứng dụng tự động dùng **In-Memory Database** với dữ liệu mẫu có sẵn - website vẫn hoạt động đầy đủ!

---

## 📁 7. CẤU TRÚC THƯ MỤC

```text
doan-back/
├── vercel.json               # Cấu hình Vercel deployment
├── .env.example              # Template biến môi trường
├── package.json              # Dependencies và scripts
├── src/
│   ├── config/
│   │   └── database.js       # Bộ kết nối MySQL & Fallback Engine
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── productController.js
│   │   ├── cartController.js
│   │   ├── orderController.js
│   │   ├── userController.js
│   │   ├── adminController.js
│   │   └── paymentController.js
│   ├── middleware/
│   │   ├── auth.js           # Xác thực JWT & Phân quyền Role
│   │   └── upload.js         # Multer memory storage (Vercel-compatible)
│   ├── routes/
│   │   ├── auth.js, products.js, cart.js
│   │   ├── orders.js, users.js, admin.js
│   │   ├── payment.js, upload.js
│   ├── utils/
│   │   ├── vietqr.js         # Tạo URL VietQR Napas 247
│   │   └── initDb.js         # Script tự động import database.sql
│   └── server.js             # File khởi động chính
└── public/
    ├── index.html            # Giao diện chính SPA
    ├── images/
    │   └── logo.png          # Logo WoodHome
    ├── css/
    │   └── style.css         # Thiết kế phong cách nội thất gỗ cao cấp
    └── js/
        └── app.js            # Toàn bộ logic Client SPA
```
