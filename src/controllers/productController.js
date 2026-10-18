const db = require('../config/database');

// GET /api/products - Danh sách sản phẩm với filter, sort, search, pagination
const getProducts = async (req, res) => {
  try {
    const {
      page = 1, limit = 12, search, category, min_price, max_price,
      sort = 'newest', material, is_featured
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereConditions = ['p.is_active = 1'];
    let params = [];

    if (search) {
      whereConditions.push('(p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category) {
      whereConditions.push('c.slug = ?');
      params.push(category);
    }
    if (min_price) { whereConditions.push('COALESCE(p.sale_price, p.price) >= ?'); params.push(min_price); }
    if (max_price) { whereConditions.push('COALESCE(p.sale_price, p.price) <= ?'); params.push(max_price); }
    if (material) { whereConditions.push('p.material LIKE ?'); params.push(`%${material}%`); }
    if (is_featured) { whereConditions.push('p.is_featured = 1'); }

    const whereClause = whereConditions.length ? 'WHERE ' + whereConditions.join(' AND ') : '';

    let orderBy = 'p.created_at DESC';
    if (sort === 'price_asc') orderBy = 'COALESCE(p.sale_price, p.price) ASC';
    else if (sort === 'price_desc') orderBy = 'COALESCE(p.sale_price, p.price) DESC';
    else if (sort === 'bestseller') orderBy = 'p.sold_count DESC';
    else if (sort === 'rating') orderBy = 'p.average_rating DESC';
    else if (sort === 'views') orderBy = 'p.views DESC';

    const countQuery = `
      SELECT COUNT(*) as total FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${whereClause}
    `;
    const [countResult] = await db.query(countQuery, params);
    const total = countResult[0].total;

    const query = `
      SELECT p.id, p.sku, p.name, p.slug, p.price, p.sale_price, p.stock_quantity,
             p.material, p.dimensions, p.color, p.is_featured, p.sold_count,
             p.average_rating, p.review_count, p.created_at,
             c.name as category_name, c.slug as category_slug,
             (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) as primary_image,
             p.short_description
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const [products] = await db.query(query, [...params, parseInt(limit), offset]);

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// GET /api/products/:slug - Chi tiết sản phẩm
const getProductBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const [products] = await db.query(`
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.slug = ? AND p.is_active = 1
    `, [slug]);

    if (!products.length) {
      return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại.' });
    }

    const product = products[0];

    // Lấy ảnh sản phẩm
    const [images] = await db.query(
      'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC',
      [product.id]
    );

    // Lấy đánh giá
    const [reviews] = await db.query(`
      SELECT pr.*, u.full_name, u.avatar
      FROM product_reviews pr
      JOIN users u ON u.id = pr.user_id
      WHERE pr.product_id = ? AND pr.is_approved = 1
      ORDER BY pr.created_at DESC
      LIMIT 10
    `, [product.id]);

    // Sản phẩm liên quan
    const [related] = await db.query(`
      SELECT p.id, p.name, p.slug, p.price, p.sale_price, p.average_rating,
             (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) as primary_image
      FROM products p
      WHERE p.category_id = ? AND p.id != ? AND p.is_active = 1
      ORDER BY RAND()
      LIMIT 4
    `, [product.category_id, product.id]);

    // Tăng lượt xem
    await db.query('UPDATE products SET views = views + 1 WHERE id = ?', [product.id]);

    res.json({
      success: true,
      data: { ...product, images, reviews, related_products: related }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// GET /api/categories
const getCategories = async (req, res) => {
  try {
    const [categories] = await db.query(`
      SELECT c.*, COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
      WHERE c.is_active = 1
      GROUP BY c.id
      ORDER BY c.sort_order ASC
    `);
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// POST /api/products/:id/reviews - Đánh giá sản phẩm
const addReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, title, content, order_id } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Đánh giá phải từ 1-5 sao.' });
    }

    // Kiểm tra đã đánh giá chưa
    const [existing] = await db.query(
      'SELECT id FROM product_reviews WHERE product_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Bạn đã đánh giá sản phẩm này rồi.' });
    }

    // Kiểm tra đã mua sản phẩm chưa (nếu có order_id)
    let isVerified = 0;
    if (order_id) {
      const [orders] = await db.query(
        `SELECT oi.id FROM order_items oi 
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.product_id = ? AND o.user_id = ? AND o.id = ? AND o.status = 'delivered'`,
        [id, req.user.id, order_id]
      );
      isVerified = orders.length ? 1 : 0;
    }

    await db.query(
      'INSERT INTO product_reviews (product_id, user_id, order_id, rating, title, content, is_verified_purchase, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      [id, req.user.id, order_id || null, rating, title, content, isVerified]
    );

    // Cập nhật điểm trung bình
    await db.query(`
      UPDATE products SET
        average_rating = (SELECT AVG(rating) FROM product_reviews WHERE product_id = ? AND is_approved = 1),
        review_count = (SELECT COUNT(*) FROM product_reviews WHERE product_id = ? AND is_approved = 1)
      WHERE id = ?
    `, [id, id, id]);

    res.status(201).json({ success: true, message: 'Cảm ơn bạn đã đánh giá sản phẩm!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// Admin: POST /api/products/admin/create
const createProduct = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const {
      name, slug, category_id, description, short_description, price, sale_price,
      stock_quantity, material, dimensions, color, warranty_months, is_featured, sku, image_url
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'Tên và giá sản phẩm là bắt buộc.' });
    }

    const generatedSku = sku && sku.trim() ? sku.trim() : `WH-SP-${Date.now().toString().slice(-6)}`;
    const generatedSlug = slug && slug.trim() ? slug.trim() : `${slugify(name)}-${Math.floor(100 + Math.random() * 900)}`;

    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO products (sku, name, slug, category_id, description, short_description, price, sale_price, stock_quantity, material, dimensions, color, warranty_months, is_featured, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [generatedSku, name, generatedSlug, category_id || 1, description || '', short_description || '', price, sale_price || null, stock_quantity || 0, material || '', dimensions || '', color || '', warranty_months || 12, is_featured ? 1 : 0]
    );

    const productId = result.insertId;

    // Thêm ảnh đại diện vào bảng product_images
    if (image_url && image_url.trim()) {
      await conn.query(
        'INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order) VALUES (?, ?, ?, 1, 0)',
        [productId, image_url.trim(), name]
      );
    }

    // Log inventory
    if (stock_quantity > 0) {
      await conn.query(
        'INSERT INTO inventory_logs (product_id, change_type, quantity_change, quantity_before, quantity_after, note, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [productId, 'restock', stock_quantity, 0, stock_quantity, 'Nhập kho ban đầu', req.user.id]
      );
    }

    // Admin log
    await conn.query(
      'INSERT INTO admin_logs (user_id, action, entity_type, entity_id, new_values) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'create_product', 'product', productId, JSON.stringify(req.body)]
    );

    await conn.commit();
    res.status(201).json({ success: true, message: 'Thêm sản phẩm thành công!', data: { id: productId } });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Mã SKU hoặc Slug sản phẩm đã tồn tại.' });
    }
    res.status(500).json({ success: false, message: 'Lỗi server khi thêm sản phẩm: ' + err.message });
  } finally {
    conn.release();
  }
};

// Admin: PUT /api/products/admin/:id
const updateProduct = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;
    const {
      name, category_id, description, short_description, price, sale_price,
      stock_quantity, material, dimensions, color, warranty_months, is_featured, is_active, image_url
    } = req.body;

    const [old] = await conn.query('SELECT * FROM products WHERE id = ?', [id]);
    if (!old.length) return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại.' });

    await conn.beginTransaction();

    const updateParams = [
      name, category_id, description || '', short_description || '', price, sale_price || null,
      material || '', dimensions || '', color || '', warranty_months || 12,
      is_featured ? 1 : 0, is_active !== undefined ? Number(is_active) : 1
    ];

    let sql = `UPDATE products SET name=?, category_id=?, description=?, short_description=?, price=?, sale_price=?,
               material=?, dimensions=?, color=?, warranty_months=?, is_featured=?, is_active=?, updated_at=NOW()`;

    if (stock_quantity !== undefined && stock_quantity !== null && stock_quantity !== '') {
      sql += `, stock_quantity=?`;
      updateParams.push(Number(stock_quantity));
    }

    sql += ` WHERE id=?`;
    updateParams.push(id);

    await conn.query(sql, updateParams);

    // Cập nhật ảnh đại diện nếu có
    if (image_url && image_url.trim()) {
      const [existingImgs] = await conn.query('SELECT id FROM product_images WHERE product_id = ? AND is_primary = 1', [id]);
      if (existingImgs.length) {
        await conn.query('UPDATE product_images SET image_url = ?, alt_text = ? WHERE id = ?', [image_url.trim(), name, existingImgs[0].id]);
      } else {
        await conn.query('INSERT INTO product_images (product_id, image_url, alt_text, is_primary, sort_order) VALUES (?, ?, ?, 1, 0)', [id, image_url.trim(), name]);
      }
    }

    await conn.query(
      'INSERT INTO admin_logs (user_id, action, entity_type, entity_id, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, 'update_product', 'product', id, JSON.stringify(old[0]), JSON.stringify(req.body)]
    );

    await conn.commit();
    res.json({ success: true, message: 'Cập nhật thông tin sản phẩm thành công!' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server khi cập nhật sản phẩm: ' + err.message });
  } finally {
    conn.release();
  }
};

// Admin: DELETE /api/products/admin/:id
const deleteProduct = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;
    const { force } = req.query;

    const [products] = await conn.query('SELECT * FROM products WHERE id = ?', [id]);
    if (!products.length) {
      return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại.' });
    }
    const product = products[0];

    // Kiểm tra sản phẩm đã phát sinh đơn hàng chưa
    const [orders] = await conn.query('SELECT COUNT(*) as c FROM order_items WHERE product_id = ?', [id]);
    const hasOrders = orders[0] && orders[0].c > 0;

    await conn.beginTransaction();

    if (hasOrders && force !== 'hard') {
      // Đã có đơn hàng: xóa mềm (is_active = 0) để bảo toàn hóa đơn
      await conn.query('UPDATE products SET is_active = 0, updated_at = NOW() WHERE id = ?', [id]);
      await conn.query('DELETE FROM cart_items WHERE product_id = ?', [id]);
      await conn.query('DELETE FROM wishlists WHERE product_id = ?', [id]);

      await conn.query(
        'INSERT INTO admin_logs (user_id, action, entity_type, entity_id, old_values) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, 'soft_delete_product', 'product', id, JSON.stringify(product)]
      );

      await conn.commit();
      return res.json({
        success: true,
        message: `Sản phẩm "${product.name}" đã phát sinh trong ${orders[0].c} đơn hàng. Hệ thống đã ẩn sản phẩm khỏi gian hàng để bảo vệ toàn vẹn lịch sử đơn hàng!`
      });
    }

    // Chưa có đơn hàng: Xóa hoàn toàn
    await conn.query('DELETE FROM cart_items WHERE product_id = ?', [id]);
    await conn.query('DELETE FROM wishlists WHERE product_id = ?', [id]);
    await conn.query('DELETE FROM product_images WHERE product_id = ?', [id]);
    await conn.query('DELETE FROM product_reviews WHERE product_id = ?', [id]);
    await conn.query('DELETE FROM inventory_logs WHERE product_id = ?', [id]);
    await conn.query('DELETE FROM products WHERE id = ?', [id]);

    await conn.query(
      'INSERT INTO admin_logs (user_id, action, entity_type, entity_id, old_values) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'hard_delete_product', 'product', id, JSON.stringify(product)]
    );

    await conn.commit();
    res.json({ success: true, message: `Đã xóa vĩnh viễn sản phẩm "${product.name}" thành công!` });
  } catch (err) {
    await conn.rollback();
    console.error('deleteProduct error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server khi xóa sản phẩm: ' + err.message });
  } finally {
    conn.release();
  }
};

// Admin: GET /api/products/admin/:id
const adminGetProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const [products] = await db.query(`
      SELECT p.*, c.name as category_name,
             (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) as primary_image
      FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?
    `, [id]);

    if (!products.length) {
      return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại.' });
    }

    const [images] = await db.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC', [id]);
    res.json({ success: true, data: { ...products[0], images } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// Admin: GET /api/admin/products
const adminGetProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '1=1';
    const params = [];

    if (search) { where += ' AND (p.name LIKE ? OR p.sku LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (category) { where += ' AND p.category_id = ?'; params.push(category); }

    const [total] = await db.query(`SELECT COUNT(*) as c FROM products p WHERE ${where}`, params);
    const [products] = await db.query(`
      SELECT p.*, c.name as category_name,
             (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) as primary_image
      FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${where}
      ORDER BY p.created_at DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    res.json({ success: true, data: { products, total: total[0].c, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

// Admin: Cập nhật tồn kho
const updateStock = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;
    const { quantity_change, note } = req.body;

    await conn.beginTransaction();

    const [products] = await conn.query('SELECT stock_quantity FROM products WHERE id = ? FOR UPDATE', [id]);
    if (!products.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại.' });
    }

    const before = products[0].stock_quantity;
    const after = before + parseInt(quantity_change);

    if (after < 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Tồn kho không đủ.' });
    }

    await conn.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [after, id]);
    await conn.query(
      'INSERT INTO inventory_logs (product_id, change_type, quantity_change, quantity_before, quantity_after, note, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, quantity_change > 0 ? 'restock' : 'adjustment', quantity_change, before, after, note, req.user.id]
    );

    await conn.commit();
    res.json({ success: true, message: 'Cập nhật tồn kho thành công!', data: { stock_quantity: after } });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  } finally {
    conn.release();
  }
};

function slugify(text) {
  const from = 'àáâãäåèéêëìíîïòóôõöùúûüýñçàáâãäåèéêëìíîïòóôõöùúûüýñç';
  const to   = 'aaaaaaeeeeiiiiooooouuuuynçaaaaaaeeeeiiiiooooouuuuync';
  let slug = text.toLowerCase();
  for (let i = 0; i < from.length; i++) slug = slug.replace(new RegExp(from[i], 'g'), to[i]);
  return slug.replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

module.exports = {
  getProducts,
  getProductBySlug,
  getCategories,
  addReview,
  createProduct,
  updateProduct,
  deleteProduct,
  adminGetProducts,
  adminGetProductById,
  updateStock
};
