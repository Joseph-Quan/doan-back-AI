/**
 * Database connection & compatibility layer
 * Tự động kết nối MySQL. Nếu MySQL chưa được bật, tự động chuyển sang chế độ
 * Fallback Database Engine với toàn bộ dữ liệu mẫu WoodHome để ứng dụng chạy ngay lập tức!
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

let pool = null;
let isUsingFallback = false;

// Bộ nhớ giả lập (Fallback Storage) khi MySQL chưa khởi động
const fallbackStore = {
  roles: [
    { id: 1, name: 'customer', description: 'Khách hàng' },
    { id: 2, name: 'staff_sales', description: 'Nhân viên bán hàng' },
    { id: 3, name: 'staff_warehouse', description: 'Nhân viên kho' },
    { id: 4, name: 'admin', description: 'Quản trị viên' }
  ],
  security_questions: [
    { id: 1, question: 'Tên trường tiểu học của bạn là gì?', is_active: 1 },
    { id: 2, question: 'Tên thú cưng đầu tiên của bạn là gì?', is_active: 1 },
    { id: 3, question: 'Tên thành phố bạn sinh ra là gì?', is_active: 1 },
    { id: 4, question: 'Biệt danh thời thơ ấu của bạn là gì?', is_active: 1 },
    { id: 5, question: 'Tên người thầy/cô giáo yêu thích của bạn là gì?', is_active: 1 }
  ],
  users: [
    {
      id: 1,
      email: 'admin@woodhome.vn',
      phone: '0900000001',
      // Mật khẩu: Admin@123
      password_hash: '$2b$10$5i1HQD.6A73rgMqnCrNymeXcB9RegMbkSPa7NjhbFTXH4sTgEBsXa',
      full_name: 'Quản trị viên WoodHome',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      role_id: 4,
      is_active: 1,
      created_at: new Date('2026-01-01'),
      last_login: new Date()
    },
    {
      id: 2,
      email: 'staff@woodhome.vn',
      phone: '0900000002',
      password_hash: '$2b$10$5i1HQD.6A73rgMqnCrNymeXcB9RegMbkSPa7NjhbFTXH4sTgEBsXa',
      full_name: 'Nguyễn Văn Bán Hàng',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      role_id: 2,
      is_active: 1,
      created_at: new Date('2026-01-05'),
      last_login: new Date()
    },
    {
      id: 3,
      email: 'khachhang@gmail.com',
      phone: '0912345678',
      password_hash: '$2b$10$5i1HQD.6A73rgMqnCrNymeXcB9RegMbkSPa7NjhbFTXH4sTgEBsXa',
      full_name: 'Trần Thị Thu Thảo',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
      role_id: 1,
      is_active: 1,
      created_at: new Date('2026-02-10'),
      last_login: new Date()
    }
  ],
  user_security_answers: [
    {
      id: 1,
      user_id: 3,
      question_id: 1,
      // hash của 'nguyen hue' (bcrypt 10)
      answer_hash: '$2a$10$wT8Kz45XwNn7280xY/14/u94qGz9k2yvL4V2U2R7nC89xGz04.cWy' // hoặc so sánh mềm
    }
  ],
  password_reset_tokens: [],
  user_addresses: [
    {
      id: 1,
      user_id: 3,
      full_name: 'Trần Thị Thu Thảo',
      phone: '0912345678',
      province: 'TP. Hồ Chí Minh',
      district: 'Quận 1',
      ward: 'Phường Bến Nghé',
      address_detail: 'Số 45 Lê Duẩn, Căn hộ 12B',
      is_default: 1
    }
  ],
  categories: [
    { id: 1, name: 'Bàn ghế', slug: 'ban-ghe', description: 'Bàn ghế phòng khách & phòng làm việc', sort_order: 1, is_active: 1 },
    { id: 2, name: 'Giường ngủ', slug: 'giuong-ngu', description: 'Giường ngủ gỗ tự nhiên cao cấp', sort_order: 2, is_active: 1 },
    { id: 3, name: 'Tủ và kệ', slug: 'tu-va-ke', description: 'Tủ quần áo, kệ tivi, tủ bếp', sort_order: 3, is_active: 1 },
    { id: 4, name: 'Bàn ăn', slug: 'ban-an', description: 'Bộ bàn ăn gỗ nguyên tấm & sồi', sort_order: 4, is_active: 1 },
    { id: 5, name: 'Bàn làm việc', slug: 'ban-lam-viec', description: 'Bàn giám đốc, bàn học gỗ tự nhiên', sort_order: 5, is_active: 1 },
    { id: 6, name: 'Đồ trang trí', slug: 'do-trang-tri', description: 'Đồ thủ công mỹ nghệ, tượng gỗ', sort_order: 6, is_active: 1 },
    { id: 7, name: 'Sofa gỗ', slug: 'sofa-go', description: 'Sofa gỗ sồi, gõ đỏ đệm nỉ cao cấp', sort_order: 7, is_active: 1 }
  ],
  products: [
    {
      id: 1,
      sku: 'WH-BAN-001',
      name: 'Bàn ăn gỗ sồi tự nhiên Scandinavian 6 chỗ',
      slug: 'ban-an-go-soi-tu-nhien-scandinavian-6-cho',
      category_id: 4,
      description: 'Bàn ăn được gia công từ 100% gỗ sồi Nga nhập khẩu, bề mặt phủ 5 lớp sơn lau PU an toàn sức khỏe. Kiểu dáng thanh thoát, góc cạnh bo tròn an toàn cho gia đình có trẻ nhỏ.',
      short_description: 'Bàn ăn 6 chỗ phong cách Bắc Âu, gỗ sồi Nga nguyên khối bền đẹp.',
      price: 8500000,
      sale_price: 7200000,
      stock_quantity: 15,
      reserved_quantity: 0,
      material: 'Gỗ Sồi Nga (Oak)',
      dimensions: '180 x 90 x 75 cm',
      color: 'Nâu Sồi Tự Nhiên',
      warranty_months: 24,
      is_active: 1,
      is_featured: 1,
      views: 1420,
      sold_count: 38,
      average_rating: 4.9,
      review_count: 14,
      created_at: new Date('2026-01-10')
    },
    {
      id: 2,
      sku: 'WH-GIU-001',
      name: 'Giường ngủ King Size gỗ Óc Chó hoàng gia',
      slug: 'giuong-ngu-king-size-go-oc-cho-hoang-gia',
      category_id: 2,
      description: 'Kiệt tác giường ngủ từ gỗ Óc Chó Bắc Mỹ (Walnut). Vân gỗ cuộn sóng độc bản, thành đầu giường bọc da bò Ý cao cấp, dát phản gỗ tự nhiên chịu tải hơn 500kg.',
      short_description: 'Giường ngủ King Size 1m8 x 2m, gỗ Óc Chó Mỹ bọc da sang trọng.',
      price: 22000000,
      sale_price: 19800000,
      stock_quantity: 6,
      reserved_quantity: 0,
      material: 'Gỗ Óc Chó Bắc Mỹ & Da Bò Ý',
      dimensions: '200 x 180 x 115 cm',
      color: 'Nâu Hạt Dẻ Trầm',
      warranty_months: 36,
      is_active: 1,
      is_featured: 1,
      views: 2890,
      sold_count: 19,
      average_rating: 5.0,
      review_count: 8,
      created_at: new Date('2026-01-12')
    },
    {
      id: 3,
      sku: 'WH-SOF-001',
      name: 'Sofa góc chữ L khung Gỗ Sồi đệm nỉ Bỉ cao cấp',
      slug: 'sofa-goc-chu-l-khung-go-soi-dem-ni-bi-cao-cap',
      category_id: 7,
      description: 'Sofa góc L thời thượng kết hợp khung gỗ sồi nguyên khối và đệm mút D40 chống xẹp lún. Vải bọc nỉ nhập khẩu từ Bỉ thoáng mát mùa hè, ấm áp mùa đông.',
      short_description: 'Sofa chữ L phòng khách rộng rãi, tựa lưng công thái học.',
      price: 16500000,
      sale_price: 14200000,
      stock_quantity: 8,
      reserved_quantity: 0,
      material: 'Gỗ Sồi Tự Nhiên & Nỉ Bỉ',
      dimensions: '280 x 170 x 85 cm',
      color: 'Gỗ Mộc Phối Nỉ Be',
      warranty_months: 24,
      is_active: 1,
      is_featured: 1,
      views: 3100,
      sold_count: 24,
      average_rating: 4.8,
      review_count: 16,
      created_at: new Date('2026-01-15')
    },
    {
      id: 4,
      sku: 'WH-TU-001',
      name: 'Tủ quần áo 4 cánh lùa cánh gỗ Gõ Đỏ cao cấp',
      slug: 'tu-quan-ao-4-canh-lua-canh-go-go-do-cao-cap',
      category_id: 3,
      description: 'Tủ áo gỗ Gõ Đỏ nguyên tấm với kết cấu mộng truyền thống siêu bền bỉ. Ray trượt giảm chấn Hafele êm ái, ngăn chứa thông minh có khóa an toàn.',
      short_description: 'Tủ áo 4 cánh ray trượt êm ái, gỗ Gõ Đỏ chống mối mọt trọn đời.',
      price: 18500000,
      sale_price: null,
      stock_quantity: 5,
      reserved_quantity: 0,
      material: 'Gỗ Gõ Đỏ Nam Phi',
      dimensions: '220 x 200 x 60 cm',
      color: 'Nâu Đỏ Tự Nhiên',
      warranty_months: 60,
      is_active: 1,
      is_featured: 0,
      views: 1250,
      sold_count: 11,
      average_rating: 4.7,
      review_count: 7,
      created_at: new Date('2026-01-18')
    },
    {
      id: 5,
      sku: 'WH-KE-001',
      name: 'Kệ Tivi phòng khách tối giản vân Gỗ Teak chống ẩm',
      slug: 'ke-tivi-phong-khach-toi-gian-van-go-teak-chong-am',
      category_id: 3,
      description: 'Kệ TV thiết kế đương đại với gỗ Teak (Giá Tỵ) có khả năng kháng nước và chịu thời tiết cực tốt. 3 hộc kéo đóng mở êm nhẹ, chân kim loại mạ đồng chống trầy.',
      short_description: 'Kệ Tivi 1m8 chân mạ đồng, tương thích TV đến 75 inch.',
      price: 5800000,
      sale_price: 4950000,
      stock_quantity: 20,
      reserved_quantity: 0,
      material: 'Gỗ Teak Tự Nhiên',
      dimensions: '180 x 42 x 50 cm',
      color: 'Vàng Nâu Mật Ong',
      warranty_months: 24,
      is_active: 1,
      is_featured: 1,
      views: 1890,
      sold_count: 42,
      average_rating: 4.9,
      review_count: 21,
      created_at: new Date('2026-01-20')
    },
    {
      id: 6,
      sku: 'WH-BLV-001',
      name: 'Bàn làm việc Giám Đốc gỗ Ash cạnh lượn Live Edge',
      slug: 'ban-lam-viec-giam-doc-go-ash-canh-luon-live-edge',
      category_id: 5,
      description: 'Mặt bàn nguyên tấm giữ trọn đường cong tự nhiên (Live Edge) của thân cây Tần Bì (Ash). Tích hợp cổng sạc không dây ẩn dưới mặt gỗ và hộp quản lý dây điện gọn gàng.',
      short_description: 'Bàn làm việc Live Edge đẳng cấp, tích hợp cổng sạc thông minh.',
      price: 11200000,
      sale_price: 9900000,
      stock_quantity: 9,
      reserved_quantity: 0,
      material: 'Gỗ Tần Bì (Ash) Cạnh Tự Nhiên',
      dimensions: '160 x 80 x 75 cm',
      color: 'Nâu Vàng Sáng',
      warranty_months: 24,
      is_active: 1,
      is_featured: 1,
      views: 2410,
      sold_count: 17,
      average_rating: 5.0,
      review_count: 12,
      created_at: new Date('2026-01-25')
    },
    {
      id: 7,
      sku: 'WH-TRG-001',
      name: 'Đèn sàn trang trí đế gỗ Mun hoa độc bản',
      slug: 'den-san-trang-tri-de-go-mun-hoa-doc-ban',
      category_id: 6,
      description: 'Đèn cây trang trí góc đọc sách với trụ gỗ Mun hoa quý hiếm, chao đèn vải lanh thủ công tỏa ánh sáng vàng ấm cúng, sang trọng.',
      short_description: 'Đèn cây trang trí cao 1m6, gỗ Mun hoa tinh xảo.',
      price: 2400000,
      sale_price: 1950000,
      stock_quantity: 25,
      reserved_quantity: 0,
      material: 'Gỗ Mun Hoa & Chao Vải Lanh',
      dimensions: '40 x 40 x 160 cm',
      color: 'Đen Vân Hoa & Trắng Ngà',
      warranty_months: 12,
      is_active: 1,
      is_featured: 0,
      views: 950,
      sold_count: 29,
      average_rating: 4.6,
      review_count: 9,
      created_at: new Date('2026-02-01')
    },
    {
      id: 8,
      sku: 'WH-BAN-002',
      name: 'Bộ bàn trà đôi Noguchi gỗ Óc Chó mặt kính cường lực',
      slug: 'bo-ban-tra-doi-noguchi-go-oc-cho-mat-kinh-cuong-luc',
      category_id: 1,
      description: 'Thiết kế bàn trà điêu khắc kinh điển với 2 chân gỗ uốn cong mềm mại đối xứng. Mặt kính cường lực 12mm chịu va đập mạnh, dễ lau chùi.',
      short_description: 'Bàn trà sofa điêu khắc nghệ thuật cho phòng khách tinh tế.',
      price: 4900000,
      sale_price: 4200000,
      stock_quantity: 14,
      reserved_quantity: 0,
      material: 'Gỗ Óc Chó & Kính 12mm',
      dimensions: '120 x 90 x 40 cm',
      color: 'Nâu Óc Chó',
      warranty_months: 24,
      is_active: 1,
      is_featured: 0,
      views: 1670,
      sold_count: 31,
      average_rating: 4.9,
      review_count: 15,
      created_at: new Date('2026-02-05')
    }
  ],
  product_images: [
    { id: 1, product_id: 1, image_url: 'https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?auto=format&fit=crop&w=800&q=80', is_primary: 1 },
    { id: 2, product_id: 2, image_url: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80', is_primary: 1 },
    { id: 3, product_id: 3, image_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80', is_primary: 1 },
    { id: 4, product_id: 4, image_url: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=800&q=80', is_primary: 1 },
    { id: 5, product_id: 5, image_url: 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=800&q=80', is_primary: 1 },
    { id: 6, product_id: 6, image_url: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=800&q=80', is_primary: 1 },
    { id: 7, product_id: 7, image_url: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=800&q=80', is_primary: 1 },
    { id: 8, product_id: 8, image_url: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=800&q=80', is_primary: 1 }
  ],
  product_reviews: [
    {
      id: 1,
      product_id: 1,
      user_id: 3,
      rating: 5,
      title: 'Chất gỗ sồi rất đẹp và dày dặn',
      content: 'Bàn ăn giao đúng hẹn, nhân viên lắp đặt cẩn thận. Màu gỗ sồi sáng rất hợp với căn hộ phong cách hiện đại của mình!',
      is_approved: 1,
      created_at: new Date('2026-02-15')
    },
    {
      id: 2,
      product_id: 2,
      user_id: 3,
      rating: 5,
      title: 'Đáng từng đồng tiền bỏ ra',
      content: 'Giường óc chó vân gỗ quá đỉnh, chắc chắn không hề có tiếng cọt kẹt khi nằm.',
      is_approved: 1,
      created_at: new Date('2026-02-20')
    }
  ],
  cart_items: [],
  wishlists: [],
  promotions: [
    { id: 1, code: 'WELCOME10', name: 'Chào mừng khách hàng mới - Giảm 10%', type: 'percentage', value: 10, min_order_amount: 1000000, max_discount_amount: 1000000, usage_limit: 100, usage_count: 5, is_active: 1 },
    { id: 2, code: 'FREESHIP', name: 'Miễn phí vận chuyển toàn quốc', type: 'free_shipping', value: 0, min_order_amount: 500000, usage_limit: 200, usage_count: 14, is_active: 1 },
    { id: 3, code: 'WOOD200K', name: 'Tri ân khách hàng - Giảm 200.000đ', type: 'fixed_amount', value: 200000, min_order_amount: 3000000, usage_limit: 500, usage_count: 22, is_active: 1 }
  ],
  orders: [
    {
      id: 1,
      order_number: 'WH202602120001',
      user_id: 3,
      status: 'delivered',
      shipping_full_name: 'Trần Thị Thu Thảo',
      shipping_phone: '0912345678',
      shipping_province: 'TP. Hồ Chí Minh',
      shipping_district: 'Quận 1',
      shipping_ward: 'Phường Bến Nghé',
      shipping_address_detail: 'Số 45 Lê Duẩn',
      subtotal: 7200000,
      shipping_fee: 0,
      discount_amount: 720000,
      total_amount: 6480000,
      payment_method: 'qr_transfer',
      payment_status: 'paid',
      customer_note: 'Giao trong giờ hành chính',
      created_at: new Date('2026-02-12'),
      confirmed_at: new Date('2026-02-12'),
      shipped_at: new Date('2026-02-13'),
      delivered_at: new Date('2026-02-14')
    }
  ],
  order_items: [
    {
      id: 1,
      order_id: 1,
      product_id: 1,
      product_name: 'Bàn ăn gỗ sồi tự nhiên Scandinavian 6 chỗ',
      product_sku: 'WH-BAN-001',
      product_image: 'https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?auto=format&fit=crop&w=800&q=80',
      unit_price: 7200000,
      quantity: 1,
      subtotal: 7200000
    }
  ],
  order_status_history: [
    { id: 1, order_id: 1, status: 'pending', note: 'Đơn hàng được tạo', created_at: new Date('2026-02-12 09:00:00') },
    { id: 2, order_id: 1, status: 'confirmed', note: 'Đã xác nhận thanh toán QR', created_at: new Date('2026-02-12 09:15:00') },
    { id: 3, order_id: 1, status: 'shipping', note: 'Đang vận chuyển từ tổng kho', created_at: new Date('2026-02-13 14:00:00') },
    { id: 4, order_id: 1, status: 'delivered', note: 'Khách hàng đã nhận và nghiệm thu', created_at: new Date('2026-02-14 16:30:00') }
  ],
  bank_accounts: [
    {
      id: 1,
      bank_name: 'MB Bank',
      account_number: '0979958935',
      account_name: 'CONG TY CP NOI THAT WOODHOME',
      branch: 'Chi nhánh Hà Nội',
      is_active: 1
    },
    {
      id: 2,
      bank_name: 'MB Bank',
      account_number: '0979958935',
      account_name: 'CONG TY CP NOI THAT WOODHOME',
      branch: 'Chi nhánh Tân Bình TP.HCM',
      is_active: 1
    }
  ],
  transactions: [
    {
      id: 1,
      order_id: 1,
      transaction_ref: 'TXN-QR-892147',
      payment_method: 'qr_transfer',
      amount: 6480000,
      status: 'success',
      note: 'Thanh toán thành công qua VietQR',
      created_at: new Date('2026-02-12 09:10:00')
    }
  ],
  banners: [
    {
      id: 1,
      title: 'Tuyệt Tác Nội Thất Gỗ Tự Nhiên 2026',
      subtitle: 'Bộ Sưu Tập Mới — Phòng Khách & Phòng Ăn',
      description: 'Chạm khắc tỉ mỉ từ gỗ Sồi nguyên khối — Kiến tạo không gian sống thượng lưu với đẳng cấp thế kỷ 21.',
      image_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1920&q=90',
      cta_text: 'Khám Phá Bộ Sưu Tập',
      cta_link: '#products',
      sort_order: 1,
      is_active: 1
    },
    {
      id: 2,
      title: 'Phòng Ngủ — Nghệ Thuật Của Sự Nghỉ Ngơi',
      subtitle: 'Ưu Đãi Tân Gia & Mùa Cưới 2026',
      description: 'Ưu đãi lên đến 20% cho trọn bộ phòng ngủ cao cấp từ gỗ Óc Chó & Gõ Đỏ nhập khẩu.',
      image_url: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=1920&q=90',
      cta_text: 'Nhận Ưu Đãi Ngay',
      cta_link: '#products',
      sort_order: 2,
      is_active: 1
    },
    {
      id: 3,
      title: 'Thiết Kế Riêng — Đặc Trưng Chỉ Của Bạn',
      subtitle: 'Dịch Vụ Tư Vấn & May Đo Miễn Phí',
      description: 'Đội ngũ kiến trúc sư 10+ năm kinh nghiệm hỗ trợ khảo sát, thiết kế 3D và thi công trọn gói.',
      image_url: 'https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=1920&q=90',
      cta_text: 'Đặt Lịch Tư Vấn',
      cta_link: '#products',
      sort_order: 3,
      is_active: 1
    }
  ],
  notifications: [
    {
      id: 1,
      user_id: 3,
      title: 'Chào mừng bạn đến với WoodHome!',
      message: 'Nhập mã WELCOME10 để được giảm 10% cho đơn hàng đầu tiên từ 1 triệu đồng.',
      type: 'promotion',
      is_read: 0,
      created_at: new Date()
    }
  ],
  admin_logs: [
    {
      id: 1,
      user_id: 1,
      action: 'init_system',
      entity_type: 'system',
      entity_id: 1,
      new_values: JSON.stringify({ note: 'Khởi tạo hệ thống WoodHome' }),
      created_at: new Date()
    }
  ]
};

// Fallback Query Executor mô phỏng SQL queries cơ bản
async function executeFallbackQuery(sql, params = []) {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();

  // 1. SELECT user by email or phone
  if (lower.startsWith('select id, email, phone, password_hash, full_name, avatar, role_id, is_active from users where email = ?')) {
    const email = params[0];
    const user = fallbackStore.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase());
    return [user ? [user] : []];
  }

  // SELECT user by id
  if (lower.includes('from users where id = ?')) {
    const id = params[0];
    const user = fallbackStore.users.find(u => u.id === Number(id));
    return [user ? [user] : []];
  }

  // SELECT user by email
  if (lower.includes('from users where email = ?')) {
    const email = params[0];
    const user = fallbackStore.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase());
    return [user ? [user] : []];
  }

  // SELECT user by email or phone (forgot password)
  if (lower.includes('where email = ? or phone = ?')) {
    const val = params[0];
    const user = fallbackStore.users.find(u => u.email === val || u.phone === val);
    return [user ? [user] : []];
  }

  // UPDATE users last_login
  if (lower.startsWith('update users set last_login')) {
    const id = params[0];
    const u = fallbackStore.users.find(user => user.id === Number(id));
    if (u) u.last_login = new Date();
    return [{ affectedRows: 1 }];
  }

  // SELECT security questions
  if (lower.includes('from security_questions')) {
    return [fallbackStore.security_questions];
  }

  // SELECT user security answers
  if (lower.includes('from user_security_answers usa')) {
    const userId = Number(params[0]);
    const answers = fallbackStore.user_security_answers
      .filter(a => a.user_id === userId)
      .map(a => {
        const sq = fallbackStore.security_questions.find(q => q.id === a.question_id);
        return { id: a.id, question_id: a.question_id, question: sq ? sq.question : '' };
      });
    return [answers];
  }

  if (lower.includes('from user_security_answers where user_id = ? and question_id = ?')) {
    const [userId, qId] = params;
    const a = fallbackStore.user_security_answers.find(ans => ans.user_id === Number(userId) && ans.question_id === Number(qId));
    return [a ? [a] : []];
  }

  // INSERT INTO users
  if (lower.startsWith('insert into users')) {
    const [email, phone, passwordHash, fullName] = params;
    const newId = fallbackStore.users.length + 1;
    const newUser = {
      id: newId,
      email,
      phone,
      password_hash: passwordHash,
      full_name: fullName,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
      role_id: 1,
      is_active: 1,
      created_at: new Date()
    };
    fallbackStore.users.push(newUser);
    return [{ insertId: newId, affectedRows: 1 }];
  }

  // INSERT INTO user_security_answers
  if (lower.startsWith('insert into user_security_answers')) {
    const [userId, questionId, answerHash] = params;
    const newId = fallbackStore.user_security_answers.length + 1;
    fallbackStore.user_security_answers.push({ id: newId, user_id: Number(userId), question_id: Number(questionId), answer_hash: answerHash });
    return [{ insertId: newId }];
  }

  // INSERT INTO password_reset_tokens
  if (lower.startsWith('insert into password_reset_tokens')) {
    const [userId, token, expiresAt] = params;
    const id = fallbackStore.password_reset_tokens.length + 1;
    fallbackStore.password_reset_tokens.push({ id, user_id: Number(userId), token, expires_at: expiresAt, used: 0 });
    return [{ insertId: id }];
  }

  // SELECT password_reset_tokens
  if (lower.includes('from password_reset_tokens where token = ?')) {
    const token = params[0];
    const tok = fallbackStore.password_reset_tokens.find(t => t.token === token && !t.used && new Date(t.expires_at) > new Date());
    return [tok ? [tok] : []];
  }

  // UPDATE users set password_hash
  if (lower.startsWith('update users set password_hash = ? where id = ?')) {
    const [pw, id] = params;
    const u = fallbackStore.users.find(user => user.id === Number(id));
    if (u) u.password_hash = pw;
    return [{ affectedRows: 1 }];
  }

  // UPDATE password_reset_tokens set used = 1
  if (lower.startsWith('update password_reset_tokens set used = 1')) {
    const id = params[0];
    const t = fallbackStore.password_reset_tokens.find(tok => tok.id === Number(id));
    if (t) t.used = 1;
    return [{ affectedRows: 1 }];
  }

  // SELECT categories
  if (lower.includes('from categories')) {
    const list = fallbackStore.categories.map(c => {
      const count = fallbackStore.products.filter(p => p.category_id === c.id && p.is_active).length;
      return { ...c, product_count: count };
    });
    return [list];
  }

  // SELECT product by ID
  if (lower.includes('from products') && lower.includes('where id = ?')) {
    const pid = Number(params[0]);
    const p = fallbackStore.products.find(item => item.id === pid);
    return [p ? [p] : []];
  }

  // SELECT products list
  if (lower.includes('from products p') && lower.includes('select count(*) as total')) {
    let prods = fallbackStore.products.filter(p => p.is_active === 1);
    return [[{ total: prods.length }]];
  }

  if (lower.includes('from products p') && !lower.includes('count(*)')) {
    // Check if slug query
    if (lower.includes('where p.slug = ?')) {
      const slug = params[0];
      const p = fallbackStore.products.find(item => item.slug === slug && item.is_active);
      if (p) {
        const cat = fallbackStore.categories.find(c => c.id === p.category_id);
        return [[{ ...p, category_name: cat ? cat.name : '', category_slug: cat ? cat.slug : '' }]];
      }
      return [[]];
    }

    let prods = fallbackStore.products.filter(p => p.is_active === 1);
    const enriched = prods.map(p => {
      const cat = fallbackStore.categories.find(c => c.id === p.category_id);
      const img = fallbackStore.product_images.find(i => i.product_id === p.id && i.is_primary) || fallbackStore.product_images.find(i => i.product_id === p.id);
      return {
        ...p,
        category_name: cat ? cat.name : '',
        category_slug: cat ? cat.slug : '',
        primary_image: img ? img.image_url : 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=800&q=80'
      };
    });
    return [enriched];
  }

  // SELECT product_images
  if (lower.includes('from product_images where product_id = ?')) {
    const pid = Number(params[0]);
    const imgs = fallbackStore.product_images.filter(i => i.product_id === pid);
    return [imgs];
  }

  // SELECT product_reviews
  if (lower.includes('from product_reviews pr')) {
    const pid = Number(params[0]);
    const revs = fallbackStore.product_reviews
      .filter(r => r.product_id === pid)
      .map(r => {
        const u = fallbackStore.users.find(user => user.id === r.user_id);
        return { ...r, full_name: u ? u.full_name : 'Khách hàng', avatar: u ? u.avatar : null };
      });
    return [revs];
  }

  // CART queries
  if (lower.includes('from cart_items ci')) {
    const userId = Number(params[0]);
    const items = fallbackStore.cart_items
      .filter(ci => ci.user_id === userId)
      .map(ci => {
        const p = fallbackStore.products.find(prod => prod.id === ci.product_id);
        const img = fallbackStore.product_images.find(i => i.product_id === ci.product_id && i.is_primary);
        return {
          id: ci.id,
          quantity: ci.quantity,
          product_id: ci.product_id,
          name: p ? p.name : '',
          slug: p ? p.slug : '',
          price: p ? p.price : 0,
          sale_price: p ? p.sale_price : null,
          stock_quantity: p ? p.stock_quantity : 0,
          image: img ? img.image_url : ''
        };
      });
    return [items];
  }

  if (lower.includes('select id, quantity from cart_items where user_id = ? and product_id = ?')) {
    const [userId, pid] = params;
    const item = fallbackStore.cart_items.find(ci => ci.user_id === Number(userId) && ci.product_id === Number(pid));
    return [item ? [item] : []];
  }

  if (lower.startsWith('insert into cart_items')) {
    const [userId, pid, qty] = params;
    const newId = fallbackStore.cart_items.length + 1;
    fallbackStore.cart_items.push({ id: newId, user_id: Number(userId), product_id: Number(pid), quantity: Number(qty), added_at: new Date() });
    return [{ insertId: newId }];
  }

  if (lower.startsWith('update cart_items set quantity = ?')) {
    const [qty, ...rest] = params;
    if (rest.length === 2 && lower.includes('where id = ? and user_id = ?')) {
      const [id, userId] = rest;
      const ci = fallbackStore.cart_items.find(item => item.id === Number(id) && item.user_id === Number(userId));
      if (ci) ci.quantity = Number(qty);
    } else {
      const [userId, pid] = rest;
      const ci = fallbackStore.cart_items.find(item => item.user_id === Number(userId) && item.product_id === Number(pid));
      if (ci) ci.quantity = Number(qty);
    }
    return [{ affectedRows: 1 }];
  }

  if (lower.startsWith('delete from cart_items where id = ?')) {
    const [id, userId] = params;
    const idx = fallbackStore.cart_items.findIndex(item => item.id === Number(id) && item.user_id === Number(userId));
    if (idx !== -1) fallbackStore.cart_items.splice(idx, 1);
    return [{ affectedRows: 1 }];
  }

  if (lower.startsWith('delete from cart_items where user_id = ?')) {
    const userId = Number(params[0]);
    fallbackStore.cart_items = fallbackStore.cart_items.filter(item => item.user_id !== userId);
    return [{ affectedRows: 1 }];
  }

  // ORDERS & PROMOTIONS
  if (lower.includes('from promotions where code = ?')) {
    const code = params[0];
    const promo = fallbackStore.promotions.find(p => p.code.toUpperCase() === (code || '').toUpperCase() && p.is_active);
    return [promo ? [promo] : []];
  }

  if (lower.includes('from bank_accounts')) {
    return [fallbackStore.bank_accounts.filter(b => b.is_active)];
  }

  if (lower.includes('from user_addresses where user_id = ?')) {
    const userId = Number(params[0]);
    return [fallbackStore.user_addresses.filter(a => a.user_id === userId)];
  }

  if (lower.includes('from user_addresses where id = ? and user_id = ?')) {
    const [id, userId] = params;
    const a = fallbackStore.user_addresses.find(addr => addr.id === Number(id) && addr.user_id === Number(userId));
    return [a ? [a] : []];
  }

  // INSERT INTO orders
  if (lower.startsWith('insert into orders')) {
    const newId = fallbackStore.orders.length + 1;
    const [
      orderNumber, userId, shippingFullName, shippingPhone,
      shippingProvince, shippingDistrict, shippingWard, shippingAddressDetail,
      subtotal, shippingFee, discount, totalAmount,
      paymentMethod, promoId, promoCode, customerNote
    ] = params;

    const order = {
      id: newId,
      order_number: orderNumber,
      user_id: Number(userId),
      shipping_full_name: shippingFullName,
      shipping_phone: shippingPhone,
      shipping_province: shippingProvince,
      shipping_district: shippingDistrict,
      shipping_ward: shippingWard,
      shipping_address_detail: shippingAddressDetail,
      subtotal,
      shipping_fee: shippingFee,
      discount_amount: discount,
      total_amount: totalAmount,
      payment_method: paymentMethod,
      payment_status: paymentMethod === 'cod' ? 'pending' : (paymentMethod === 'visa' ? 'paid' : 'pending'),
      status: 'pending',
      promotion_id: promoId,
      promotion_code: promoCode,
      customer_note: customerNote,
      created_at: new Date()
    };
    fallbackStore.orders.push(order);
    return [{ insertId: newId }];
  }

  // INSERT INTO order_items
  if (lower.startsWith('insert into order_items')) {
    const [orderId, pid, name, sku, img, price, qty, subtotal] = params;
    const id = fallbackStore.order_items.length + 1;
    fallbackStore.order_items.push({
      id, order_id: Number(orderId), product_id: Number(pid), product_name: name,
      product_sku: sku, product_image: img, unit_price: price, quantity: qty, subtotal
    });
    return [{ insertId: id }];
  }

  // INSERT INTO order_status_history
  if (lower.startsWith('insert into order_status_history')) {
    const [orderId, status, note, changedBy] = params;
    fallbackStore.order_status_history.push({
      id: fallbackStore.order_status_history.length + 1,
      order_id: Number(orderId),
      status,
      note,
      changed_by: changedBy || null,
      created_at: new Date()
    });
    return [{ affectedRows: 1 }];
  }

  // INSERT INTO transactions
  if (lower.startsWith('insert into transactions')) {
    const [orderId, txnRef, paymentMethod, amount] = params;
    fallbackStore.transactions.push({
      id: fallbackStore.transactions.length + 1,
      order_id: Number(orderId),
      transaction_ref: txnRef,
      payment_method: paymentMethod,
      amount,
      status: paymentMethod === 'visa' ? 'success' : 'pending',
      created_at: new Date()
    });
    return [{ affectedRows: 1 }];
  }

  // SELECT orders for user
  if (lower.includes('from orders o where o.user_id = ?')) {
    const userId = Number(params[0]);
    const list = fallbackStore.orders
      .filter(o => o.user_id === userId)
      .map(o => {
        const items = fallbackStore.order_items.filter(oi => oi.order_id === o.id);
        return {
          ...o,
          item_count: items.length,
          first_item_name: items[0] ? items[0].product_name : '',
          first_item_image: items[0] ? items[0].product_image : ''
        };
      });
    return [list];
  }

  if (lower.includes('from orders') && (lower.includes('where id = ?') || lower.includes('where o.id = ?'))) {
    const id = Number(params[0]);
    const o = fallbackStore.orders.find(ord => ord.id === id);
    const txn = fallbackStore.transactions.find(t => t.order_id === id);
    if (o) {
      return [[{ ...o, transaction_ref: txn ? txn.transaction_ref : null, transaction_status: txn ? txn.status : null }]];
    }
    return [[]];
  }

  if (lower.includes('from order_items where order_id = ?')) {
    const id = Number(params[0]);
    return [fallbackStore.order_items.filter(oi => oi.order_id === id)];
  }

  if (lower.includes('from order_status_history where order_id = ?')) {
    const id = Number(params[0]);
    return [fallbackStore.order_status_history.filter(h => h.order_id === id)];
  }

  // Banners
  if (lower.includes('from banners')) {
    return [fallbackStore.banners.filter(b => b.is_active)];
  }

  // Wishlist
  if (lower.includes('from wishlists w')) {
    const userId = Number(params[0]);
    const items = fallbackStore.wishlists.filter(w => w.user_id === userId).map(w => {
      const p = fallbackStore.products.find(prod => prod.id === w.product_id);
      const img = fallbackStore.product_images.find(i => i.product_id === w.product_id && i.is_primary);
      return { ...w, ...(p || {}), image: img ? img.image_url : '' };
    });
    return [items];
  }

  if (lower.includes('from wishlists where user_id = ? and product_id = ?')) {
    const [userId, pid] = params;
    const w = fallbackStore.wishlists.find(item => item.user_id === Number(userId) && item.product_id === Number(pid));
    return [w ? [w] : []];
  }

  if (lower.startsWith('insert into wishlists')) {
    const [userId, pid] = params;
    fallbackStore.wishlists.push({ id: fallbackStore.wishlists.length + 1, user_id: Number(userId), product_id: Number(pid), created_at: new Date() });
    return [{ affectedRows: 1 }];
  }

  if (lower.startsWith('delete from wishlists where user_id = ? and product_id = ?')) {
    const [userId, pid] = params;
    fallbackStore.wishlists = fallbackStore.wishlists.filter(w => !(w.user_id === Number(userId) && w.product_id === Number(pid)));
    return [{ affectedRows: 1 }];
  }

  // Notifications
  if (lower.includes('from notifications where user_id = ?')) {
    const userId = Number(params[0]);
    return [fallbackStore.notifications.filter(n => n.user_id === userId)];
  }

  // Admin dashboard metrics
  if (lower.includes('as revenue_today') || lower.includes('revenue_month')) {
    // Chỉ tính đơn hàng đã giao thành công (status = 'delivered'), đơn huỷ (status = 'cancelled') không được tính
    const totalRev = fallbackStore.orders
      .filter(o => o.status === 'delivered')
      .reduce((sum, o) => sum + Number(o.total_amount), 0);
    const activeOrders = fallbackStore.orders.filter(o => o.status !== 'cancelled');
    return [[{
      orders_today: activeOrders.length,
      revenue_today: totalRev,
      pending_orders: fallbackStore.orders.filter(o => o.status === 'pending').length,
      total_customers: fallbackStore.users.filter(u => u.role_id === 1).length,
      total_products: fallbackStore.products.length,
      low_stock_count: fallbackStore.products.filter(p => p.stock_quantity <= 5).length,
      revenue_month: totalRev,
      orders_month: activeOrders.length
    }]];
  }

  // Fallback payment methods breakdown
  if (lower.includes('from orders') && lower.includes('group by payment_method')) {
    const summary = {};
    fallbackStore.orders.forEach(o => {
      if (o.status === 'cancelled') return; // Loại bỏ hoàn toàn đơn huỷ
      const pm = o.payment_method || 'cod';
      if (!summary[pm]) summary[pm] = { payment_method: pm, total_orders: 0, total_revenue: 0 };
      summary[pm].total_orders += 1;
      // Chỉ tính doanh thu khi đã giao thành công
      if (o.status === 'delivered') {
        summary[pm].total_revenue += Number(o.total_amount) || 0;
      }
    });
    return [Object.values(summary)];
  }

  // Fallback generic handler
  return [[]];
}

let initPromise = null;
let retryTimer = null;

// Khởi tạo và kiểm tra kết nối MySQL
function initDatabase() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const testPool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'woodhome',
        waitForConnections: true,
        connectionLimit: 10,
        connectTimeout: 5000
      });

      const conn = await testPool.getConnection();
      console.log('✅ Đã kết nối thành công MySQL Server trên XAMPP (Database: ' + (process.env.DB_NAME || 'woodhome') + ')');
      conn.release();
      pool = testPool;
      isUsingFallback = false;
      if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
      }
      return true;
    } catch (err) {
      if (!isUsingFallback) {
        console.log('💡 Lưu ý: MySQL Server (port ' + (process.env.DB_PORT || 3306) + ') chưa mở hoặc chưa tạo DB: ' + err.message);
        console.log('⚡ Hệ thống tự động kích hoạt [WoodHome Smart In-Memory Database] với đầy đủ dữ liệu mẫu để chạy website ngay lập tức!');
        console.log('👉 Khi bạn bật MySQL hoặc XAMPP, hệ thống sẽ tự động chuyển sang lưu vào CSDL MySQL XAMPP.');
      }
      isUsingFallback = true;
      initPromise = null; // Cho phép retry tiếp theo

      if (!retryTimer) {
        retryTimer = setInterval(() => {
          if (isUsingFallback) {
            initDatabase();
          }
        }, 5000);
      }
      return false;
    }
  })();

  return initPromise;
}

// Connection object with query, getConnection and transactions
const dbProxy = {
  async query(sql, params) {
    if (initPromise) {
      await initPromise;
    }
    if (pool && !isUsingFallback) {
      try {
        return await pool.query(sql, params);
      } catch (err) {
        // Nếu lỗi mất kết nối MySQL đột ngột, chuyển sang fallback
        if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
          console.warn('⚠️ Mất kết nối MySQL, kích hoạt chế độ Fallback Engine.');
          isUsingFallback = true;
          return await executeFallbackQuery(sql, params);
        }
        throw err;
      }
    }
    return await executeFallbackQuery(sql, params);
  },

  async getConnection() {
    if (initPromise) {
      await initPromise;
    }
    if (pool && !isUsingFallback) {
      try {
        const conn = await pool.getConnection();
        return conn;
      } catch (e) {
        isUsingFallback = true;
      }
    }

    // Mock connection object for transactions
    return {
      query: (sql, params) => executeFallbackQuery(sql, params),
      beginTransaction: async () => { },
      commit: async () => { },
      rollback: async () => { },
      release: () => { }
    };
  },

  isFallbackMode() {
    return isUsingFallback;
  },

  getFallbackStore() {
    return fallbackStore;
  },

  initDatabase
};

initDatabase();

module.exports = dbProxy;
