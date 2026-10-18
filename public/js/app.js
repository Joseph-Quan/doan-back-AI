/**
 * WOODHOME E-COMMERCE CLIENT APPLICATION
 * Single-Page Architecture with Full-Feature Suite
 */

// Global Application State
const state = {
  token: localStorage.getItem('woodhome_token') || null,
  user: JSON.parse(localStorage.getItem('woodhome_user') || 'null'),
  products: [],
  categories: [],
  banners: [],
  cart: { items: [], subtotal: 0 },
  wishlist: [],
  activeCategory: 'all',
  searchQuery: '',
  sortOrder: 'newest',
  currentSlide: 0,
  slideInterval: null,
  currentOrderForPayment: null
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ========================================================
// API CLIENT UTILITY
// ========================================================
async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(state.token ? { 'Authorization': `Bearer ${state.token}` } : {}),
    ...(options.headers || {})
  };

  try {
    const res = await fetch(`/api${endpoint}`, {
      ...options,
      headers
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Yêu cầu không thành công.');
    }
    return data;
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err);
    throw err;
  }
}

// Toast notification helper with Hook integration
function showToast(message, type = 'info') {
  if (window.useToast) {
    window.useToast().show(message, type);
    return;
  }
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Format VND currency
function formatCurrency(val) {
  if (!val && val !== 0) return '0 đ';
  return Number(val).toLocaleString('vi-VN') + ' đ';
}

// ========================================================
// AUTHENTICATION CONTROLLER
// ========================================================
function checkAuthGate() {
  const authOverlay = document.getElementById('authOverlay');
  const userNavSection = document.getElementById('userNavSection');
  const adminTabLink = document.getElementById('adminTabLink');

  if (!state.token || !state.user) {
    if (authOverlay) authOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  } else {
    if (authOverlay) authOverlay.style.display = 'none';
    document.body.style.overflow = 'auto';

    // Cập nhật thông tin user trên Header
    const userNameEl = document.getElementById('headerUserName');
    const userRoleEl = document.getElementById('headerUserRole');
    const userAvatarEl = document.getElementById('headerUserAvatar');

    if (userNameEl) userNameEl.textContent = state.user.full_name;
    if (userAvatarEl && state.user.avatar) userAvatarEl.src = state.user.avatar;

    const roleMap = { 1: 'Khách hàng', 2: 'Bán hàng', 3: 'Thủ kho', 4: 'Quản trị viên' };
    if (userRoleEl) userRoleEl.textContent = roleMap[state.user.role_id] || 'Khách hàng';

    // Hiện tab Quản trị nếu có quyền staff/admin (role >= 2)
    if (adminTabLink) {
      adminTabLink.style.display = state.user.role_id >= 2 ? 'inline-block' : 'none';
    }

    // Tải giỏ hàng & wishlist
    loadCart();
    loadWishlist();
  }
}

// Demo account fill helper
function fillDemoAccount(email, password) {
  document.getElementById('loginEmail').value = email;
  document.getElementById('loginPassword').value = password;
  showToast(`Đã điền thông tin tài khoản: ${email}`, 'info');
}

// Đăng nhập
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    state.token = res.data.token;
    state.user = res.data.user;
    localStorage.setItem('woodhome_token', state.token);
    localStorage.setItem('woodhome_user', JSON.stringify(state.user));

    showToast(`Chào mừng bạn quay trở lại, ${state.user.full_name}!`, 'success');
    checkAuthGate();
    loadInitialData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Đăng ký
async function handleRegister(e) {
  e.preventDefault();
  const fullName = document.getElementById('regFullName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const password = document.getElementById('regPassword').value;
  const questionId = document.getElementById('regQuestion').value;
  const answer = document.getElementById('regAnswer').value.trim();

  if (password.length < 8) {
    return showToast('Mật khẩu cần tối thiểu 8 ký tự.', 'error');
  }

  try {
    const res = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        full_name: fullName,
        email,
        phone,
        password,
        security_question_id: questionId,
        security_answer: answer
      })
    });

    state.token = res.data.token;
    state.user = res.data.user;
    localStorage.setItem('woodhome_token', state.token);
    localStorage.setItem('woodhome_user', JSON.stringify(state.user));

    showToast('Tạo tài khoản WoodHome thành công!', 'success');
    checkAuthGate();
    loadInitialData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Đăng xuất
function handleLogout() {
  localStorage.removeItem('woodhome_token');
  localStorage.removeItem('woodhome_user');
  state.token = null;
  state.user = null;
  state.cart = { items: [], subtotal: 0 };
  state.wishlist = [];
  updateCartBadge();
  showToast('Đã đăng xuất thành công.', 'info');
  checkAuthGate();
}

// Quên mật khẩu qua câu hỏi bảo mật (3 bước)
let forgotFlowState = { userId: null, resetToken: null };

function goToForgotStep(step) {
  const step1 = document.getElementById('forgotStep1');
  const step2 = document.getElementById('forgotStep2');
  const step3 = document.getElementById('forgotStep3');
  if (step1) step1.style.display = step === 1 ? 'block' : 'none';
  if (step2) step2.style.display = step === 2 ? 'block' : 'none';
  if (step3) step3.style.display = step === 3 ? 'block' : 'none';
}

function openForgotPasswordModal() {
  forgotFlowState = { userId: null, resetToken: null };
  const form1 = document.getElementById('forgotStep1');
  const form2 = document.getElementById('forgotStep2');
  const form3 = document.getElementById('forgotStep3');
  if (form1) form1.reset();
  if (form2) form2.reset();
  if (form3) form3.reset();
  goToForgotStep(1);
  const modal = document.getElementById('forgotModal');
  if (modal) modal.classList.add('open');
}

async function handleForgotStep1(e) {
  e.preventDefault();
  const identifier = document.getElementById('forgotIdentifier').value.trim();

  try {
    const res = await api('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identifier })
    });

    forgotFlowState.userId = res.data.user_id;

    // Hiển thị câu hỏi bảo mật
    const select = document.getElementById('forgotQuestionsSelect');
    select.innerHTML = res.data.questions.map(q => `<option value="${q.id}">${q.question}</option>`).join('');

    goToForgotStep(2);
    showToast('Đã tìm thấy tài khoản. Vui lòng trả lời câu hỏi bảo mật.', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleForgotStep2(e) {
  e.preventDefault();
  const questionId = document.getElementById('forgotQuestionsSelect').value;
  const answer = document.getElementById('forgotAnswer').value.trim();

  try {
    const res = await api('/auth/verify-security-answer', {
      method: 'POST',
      body: JSON.stringify({
        user_id: forgotFlowState.userId,
        question_id: questionId,
        answer
      })
    });

    forgotFlowState.resetToken = res.data.reset_token;

    goToForgotStep(3);
    showToast('Xác minh chính xác! Hãy nhập mật khẩu mới.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleForgotStep3(e) {
  e.preventDefault();
  const newPassword = document.getElementById('forgotNewPassword').value;
  const confirmPassword = document.getElementById('forgotConfirmPassword')?.value;

  if (newPassword.length < 8) {
    return showToast('Mật khẩu mới tối thiểu 8 ký tự.', 'error');
  }

  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    return showToast('Mật khẩu xác nhận không trùng khớp.', 'error');
  }

  try {
    const res = await api('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        reset_token: forgotFlowState.resetToken,
        new_password: newPassword
      })
    });

    showToast('Đã đặt lại mật khẩu! Bạn có thể đăng nhập ngay.', 'success');
    closeModal('forgotModal');
    // Chuyển về tab đăng nhập và tự động điền tài khoản
    switchAuthTab('login');
    const idVal = document.getElementById('forgotIdentifier')?.value.trim();
    if (idVal) {
      const loginEmailInput = document.getElementById('loginEmail');
      if (loginEmailInput) loginEmailInput.value = idVal;
      const loginPasswordInput = document.getElementById('loginPassword');
      if (loginPasswordInput) {
        loginPasswordInput.value = '';
        loginPasswordInput.focus();
      }
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tabBtn${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');

  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '👁';
  } else {
    input.type = 'password';
    btn.textContent = '👁‍🗨';
  }
}

// ========================================================
// HERO SLIDER CONTROLLER
// ========================================================
const SLIDE_TAGS = ['Gỗ Sồi Trắng', 'Gỗ Óc Chó', 'Gỗ Gõ Đỏ'];
const SLIDE_NUMS = ['01', '02', '03'];

function renderHeroSlider() {
  const track = document.getElementById('heroSlideTrack');
  const dots = document.getElementById('heroSlideDots');
  if (!track || !state.banners.length) return;

  track.innerHTML = state.banners.map((b, i) => `
    <div class="slide-item ${i === 0 ? 'active' : ''}">
      <img src="${b.image_url}" alt="${b.title}" class="slide-bg" loading="${i === 0 ? 'eager' : 'lazy'}">
      <div class="slide-overlay"></div>
      <div class="container">
        <div class="slide-content">
          <div class="slide-badge">WOODHOME COLLECTION 2026</div>
          <span class="slide-subtitle">${b.subtitle || 'Nội Thất Gỗ Tự Nhiên Cao Cấp'}</span>
          <h2 class="slide-title">${b.title}</h2>
          <p class="slide-desc">${b.description || ''}</p>
          <div class="slide-cta-group">
            <a href="${b.cta_link || '#products'}" class="btn btn-gold">${b.cta_text || 'Khám Phá Ngay'} →</a>
            <a href="#products" class="btn" style="background:rgba(255,255,255,0.1);color:#fff;border:1.5px solid rgba(255,255,255,0.3);backdrop-filter:blur(6px);">Xem Tất Cả</a>
          </div>
        </div>
      </div>
      <div class="slide-meta">
        <span class="slide-num">${SLIDE_NUMS[i] || '0' + (i+1)}</span>
        <span class="slide-tag">${SLIDE_TAGS[i] || 'Gỗ Tự Nhiên'}</span>
      </div>
    </div>
  `).join('');

  if (dots) {
    dots.innerHTML = state.banners.map((_, i) => `
      <div class="slider-dot ${i === 0 ? 'active' : ''}" onclick="goToSlide(${i})" aria-label="Slide ${i+1}"></div>
    `).join('');
  }

  startSliderAutoplay();
}

function goToSlide(index) {
  const prev = state.currentSlide;
  state.currentSlide = (index + state.banners.length) % state.banners.length;
  const track = document.getElementById('heroSlideTrack');
  if (track) {
    track.style.transform = `translateX(-${state.currentSlide * 100}%)`;
    // Ken Burns & animation: cập nhật active class
    const items = track.querySelectorAll('.slide-item');
    items.forEach((item, i) => {
      item.classList.toggle('active', i === state.currentSlide);
    });
  }
  document.querySelectorAll('.slider-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === state.currentSlide);
  });
  // Reset progress bar
  resetProgressBar();
}

function nextSlide() { goToSlide(state.currentSlide + 1); }
function prevSlide() { goToSlide(state.currentSlide - 1); }

let progressInterval = null;
let progressValue = 0;
const SLIDE_DURATION = 5000;

function resetProgressBar() {
  clearInterval(progressInterval);
  progressValue = 0;
  const bar = document.getElementById('sliderProgressBar');
  if (bar) bar.style.width = '0%';
  progressInterval = setInterval(() => {
    progressValue += 100 / (SLIDE_DURATION / 100);
    if (progressValue >= 100) progressValue = 100;
    if (bar) bar.style.width = progressValue + '%';
  }, 100);
}

function startSliderAutoplay() {
  clearInterval(state.slideInterval);
  resetProgressBar();
  state.slideInterval = setInterval(nextSlide, SLIDE_DURATION);
}

// ========================================================
// PRODUCTS & CATALOG CONTROLLER
// ========================================================
async function loadCategories() {
  try {
    const res = await api('/products/categories');
    state.categories = res.data;
    renderCategories();
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

function renderCategories() {
  const bar = document.getElementById('categoriesBar');
  if (!bar) return;

  bar.innerHTML = `
    <button class="cat-pill ${state.activeCategory === 'all' ? 'active' : ''}" onclick="filterCategory('all')">
      Tất cả danh mục
    </button>
    ${state.categories.map(c => `
      <button class="cat-pill ${state.activeCategory === c.slug ? 'active' : ''}" onclick="filterCategory('${c.slug}')">
        ${c.name} (${c.product_count || 0})
      </button>
    `).join('')}
  `;
}

function filterCategory(slug) {
  state.activeCategory = slug;
  renderCategories();
  renderProducts();
}

async function loadProducts() {
  try {
    const res = await api('/products');
    state.products = res.data.products;
    renderProducts();
  } catch (err) {
    console.error('Failed to load products:', err);
  }
}

function renderProducts() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  let filtered = [...state.products];

  // Filter category
  if (state.activeCategory !== 'all') {
    filtered = filtered.filter(p => p.category_slug === state.activeCategory);
  }

  // Filter search
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || (p.material && p.material.toLowerCase().includes(q)));
  }

  // Sort
  if (state.sortOrder === 'price_asc') {
    filtered.sort((a, b) => (a.sale_price || a.price) - (b.sale_price || b.price));
  } else if (state.sortOrder === 'price_desc') {
    filtered.sort((a, b) => (b.sale_price || b.price) - (a.sale_price || a.price));
  } else if (state.sortOrder === 'bestseller') {
    filtered.sort((a, b) => (b.sold_count || 0) - (a.sold_count || 0));
  } else if (state.sortOrder === 'rating') {
    filtered.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
  }

  if (!filtered.length) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
        <p style="font-size: 1.2rem; color: var(--text-muted);">Không tìm thấy sản phẩm nội thất phù hợp.</p>
        <button class="btn btn-outline" style="margin-top: 14px;" onclick="resetFilters()">Xem tất cả sản phẩm</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const isWishlisted = state.wishlist.some(w => w.product_id === p.id);
    const hasDiscount = p.sale_price && p.sale_price < p.price;
    const discountPercent = hasDiscount ? Math.round(((p.price - p.sale_price) / p.price) * 100) : 0;

    return `
      <div class="product-card">
        <div class="product-thumb-wrap">
          <img src="${p.primary_image || 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=800&q=80'}" alt="${p.name}" class="product-thumb" loading="lazy">
          <div class="product-badges">
            ${p.is_featured ? '<span class="badge badge-gold">Nổi bật</span>' : ''}
            ${hasDiscount ? `<span class="badge badge-danger">-${discountPercent}%</span>` : ''}
          </div>
          <button class="wishlist-btn ${isWishlisted ? 'active' : ''}" onclick="toggleWishlist(${p.id})" title="Yêu thích">
            ♥
          </button>
        </div>
        <div class="product-body">
          <span class="product-category">${p.category_name || 'Nội thất gỗ'}</span>
          <h3 class="product-name" title="${p.name}">${p.name}</h3>
          <p class="product-specs">
            🌲 ${p.material || 'Gỗ tự nhiên'} | 📐 ${p.dimensions || 'Tiêu chuẩn'}
          </p>
          <div class="product-rating">
            <span class="stars">★★★★★</span>
            <span class="text-muted">(${p.average_rating || 5.0}) · Đã bán ${p.sold_count || 0}</span>
          </div>
          <div class="product-price-row">
            <span class="price-current">${formatCurrency(p.sale_price || p.price)}</span>
            ${hasDiscount ? `<span class="price-old">${formatCurrency(p.price)}</span>` : ''}
          </div>
          <div class="product-actions">
            <button class="btn btn-outline btn-block" onclick="openProductDetail('${p.slug}')">Chi tiết</button>
            <button class="btn btn-primary btn-block" onclick="addToCart(${p.id})">Thêm giỏ</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function resetFilters() {
  state.activeCategory = 'all';
  state.searchQuery = '';
  const searchInput = document.getElementById('headerSearchInput');
  if (searchInput) searchInput.value = '';
  renderCategories();
  renderProducts();
}

// Quick View / Product Detail Modal
async function openProductDetail(slug) {
  try {
    const res = await api(`/products/${slug}`);
    const p = res.data;

    const modalBody = document.getElementById('productDetailBody');
    const hasDiscount = p.sale_price && p.sale_price < p.price;

    modalBody.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;" class="product-modal-grid">
        <div>
          <img src="${p.images?.[0]?.image_url || 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=800&q=80'}" style="width: 100%; border-radius: var(--radius-md); object-fit: cover; aspect-ratio: 4/3; margin-bottom: 12px;">
          <div style="display: flex; gap: 8px;">
            ${(p.images || []).map(img => `
              <img src="${img.image_url}" style="width: 60px; height: 60px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border); cursor: pointer;">
            `).join('')}
          </div>
        </div>
        <div>
          <span class="badge badge-wood" style="margin-bottom: 8px;">${p.category_name}</span>
          <h2 class="font-serif" style="font-size: 1.6rem; margin-bottom: 10px;">${p.name}</h2>
          <div class="product-price-row" style="margin-bottom: 16px;">
            <span class="price-current" style="font-size: 1.5rem;">${formatCurrency(p.sale_price || p.price)}</span>
            ${hasDiscount ? `<span class="price-old">${formatCurrency(p.price)}</span>` : ''}
          </div>
          <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 20px;">${p.description}</p>
          <div style="background: var(--wood-50); padding: 16px; border-radius: 8px; margin-bottom: 20px; font-size: 0.88rem; line-height: 1.8;">
            <div><strong>Chất liệu:</strong> ${p.material || 'Gỗ tự nhiên'}</div>
            <div><strong>Kích thước:</strong> ${p.dimensions || 'N/A'}</div>
            <div><strong>Màu sắc:</strong> ${p.color || 'Tự nhiên'}</div>
            <div><strong>Bảo hành:</strong> ${p.warranty_months} tháng chính hãng WoodHome</div>
            <div><strong>Tình trạng:</strong> <span class="text-success">Còn ${p.stock_quantity} sản phẩm trong kho</span></div>
          </div>
          <div style="display: flex; gap: 12px;">
            <input type="number" id="detailQtyInput" value="1" min="1" max="${p.stock_quantity}" style="width: 70px; padding: 10px; border: 1px solid var(--border); border-radius: 6px; text-align: center;">
            <button class="btn btn-primary" style="flex: 1;" onclick="addToCart(${p.id}, document.getElementById('detailQtyInput').value)">
              Thêm Vào Giỏ Hàng
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('productDetailModal').classList.add('open');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// CART CONTROLLER
// ========================================================
async function loadCart() {
  if (!state.token) return;
  try {
    const res = await api('/cart');
    state.cart = res.data;
    updateCartBadge();
    renderCartDrawer();
  } catch (err) {
    console.error('Failed to load cart:', err);
  }
}

function updateCartBadge() {
  const count = (state.cart.items || []).reduce((sum, i) => sum + i.quantity, 0);
  if (window.useCartHook) {
    window.useCartHook().updateBadge(count);
  } else {
    const badge = document.getElementById('cartBadge');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  }
}

async function addToCart(productId, quantity = 1) {
  if (!state.token) {
    showToast('Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng.', 'warning');
    return checkAuthGate();
  }

  try {
    const res = await api('/cart', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, quantity: Number(quantity) })
    });
    showToast(res.message, 'success');
    loadCart();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateCartQty(cartItemId, newQty) {
  if (newQty < 1) return;
  try {
    await api(`/cart/${cartItemId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity: newQty })
    });
    loadCart();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeCartItem(cartItemId) {
  try {
    await api(`/cart/${cartItemId}`, { method: 'DELETE' });
    showToast('Đã xóa sản phẩm khỏi giỏ hàng.', 'info');
    loadCart();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openCartDrawer() {
  renderCartDrawer();
  document.getElementById('cartDrawer').classList.add('open');
}

function closeCartDrawer() {
  document.getElementById('cartDrawer').classList.remove('open');
}

function renderCartDrawer() {
  const list = document.getElementById('cartItemsList');
  const subtotalEl = document.getElementById('cartDrawerSubtotal');
  if (!list) return;

  const items = state.cart.items || [];
  if (!items.length) {
    list.innerHTML = `
      <div style="text-align: center; padding: 40px 10px; color: var(--text-muted);">
        <p style="font-size: 2.5rem; margin-bottom: 10px;">🛒</p>
        <p>Giỏ hàng của bạn đang trống.</p>
        <button class="btn btn-outline" style="margin-top: 14px;" onclick="closeCartDrawer()">Tiếp tục mua sắm</button>
      </div>
    `;
    if (subtotalEl) subtotalEl.textContent = '0 đ';
    return;
  }

  list.innerHTML = items.map(i => `
    <div class="cart-item">
      <img src="${i.image || 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=200&q=80'}" class="cart-item-img">
      <div class="cart-item-info">
        <h4 class="cart-item-name">${i.name}</h4>
        <div class="cart-item-price">${formatCurrency(i.sale_price || i.price)}</div>
        <div class="cart-qty-control">
          <button class="qty-btn" onclick="updateCartQty(${i.id}, ${i.quantity - 1})">-</button>
          <span style="font-size: 0.9rem; font-weight: 600;">${i.quantity}</span>
          <button class="qty-btn" onclick="updateCartQty(${i.id}, ${i.quantity + 1})">+</button>
          <button class="icon-btn" style="width: 26px; height: 26px; margin-left: auto; color: var(--danger);" onclick="removeCartItem(${i.id})">✕</button>
        </div>
      </div>
    </div>
  `).join('');

  if (subtotalEl) subtotalEl.textContent = formatCurrency(state.cart.subtotal);
}

// ========================================================
// CHECKOUT & PAYMENT CONTROLLER
// ========================================================
let checkoutState = {
  discount: 0,
  promoCode: '',
  shippingFee: 0,
  finalTotal: 0
};

async function openCheckoutModal() {
  if (!state.cart.items.length) {
    return showToast('Giỏ hàng trống. Vui lòng thêm sản phẩm trước khi thanh toán.', 'warning');
  }

  closeCartDrawer();

  // Load địa chỉ của user nếu có
  try {
    const res = await api('/users/addresses');
    const addresses = res.data || [];
    if (addresses.length) {
      const defaultAddr = addresses.find(a => a.is_default) || addresses[0];
      document.getElementById('checkoutFullName').value = defaultAddr.full_name;
      document.getElementById('checkoutPhone').value = defaultAddr.phone;
      document.getElementById('checkoutProvince').value = defaultAddr.province;
      document.getElementById('checkoutDistrict').value = defaultAddr.district;
      document.getElementById('checkoutWard').value = defaultAddr.ward;
      document.getElementById('checkoutDetail').value = defaultAddr.address_detail;
    } else if (state.user) {
      document.getElementById('checkoutFullName').value = state.user.full_name || '';
      document.getElementById('checkoutPhone').value = state.user.phone || '';
    }
  } catch (e) {}

  updateCheckoutSummary();
  document.getElementById('checkoutModal').classList.add('open');
}

function updateCheckoutSummary() {
  const subtotal = state.cart.subtotal;
  checkoutState.shippingFee = subtotal >= 5000000 ? 0 : 50000;
  checkoutState.finalTotal = Math.max(0, subtotal - checkoutState.discount + checkoutState.shippingFee);

  document.getElementById('checkoutSubtotal').textContent = formatCurrency(subtotal);
  document.getElementById('checkoutDiscount').textContent = `-${formatCurrency(checkoutState.discount)}`;
  document.getElementById('checkoutShipping').textContent = checkoutState.shippingFee === 0 ? 'Miễn phí' : formatCurrency(checkoutState.shippingFee);
  document.getElementById('checkoutFinalTotal').textContent = formatCurrency(checkoutState.finalTotal);
}

async function applyPromoCode() {
  const code = document.getElementById('checkoutPromoInput').value.trim();
  if (!code) return;

  try {
    const res = await api('/admin/promotions/validate', {
      method: 'POST',
      body: JSON.stringify({ code, order_amount: state.cart.subtotal })
    });

    checkoutState.discount = res.data.discount_amount;
    checkoutState.promoCode = code;
    showToast(res.message, 'success');
    updateCheckoutSummary();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Chuyển đổi phương thức thanh toán
function onPaymentMethodChange() {
  const method = document.querySelector('input[name="payment_method"]:checked').value;
  document.getElementById('visaCardForm').style.display = method === 'visa' ? 'block' : 'none';
  document.getElementById('qrNoticeBox').style.display = method === 'qr_transfer' ? 'block' : 'none';
}

// Thực hiện đặt hàng
async function handlePlaceOrder(e) {
  e.preventDefault();

  const fullName = document.getElementById('checkoutFullName').value.trim();
  const phone = document.getElementById('checkoutPhone').value.trim();
  const province = document.getElementById('checkoutProvince').value.trim();
  const district = document.getElementById('checkoutDistrict').value.trim();
  const ward = document.getElementById('checkoutWard').value.trim();
  const addressDetail = document.getElementById('checkoutDetail').value.trim();
  const note = document.getElementById('checkoutNote').value.trim();
  const paymentMethod = document.querySelector('input[name="payment_method"]:checked').value;

  if (!fullName || !phone || !province || !district || !ward || !addressDetail) {
    return showToast('Vui lòng điền đầy đủ địa chỉ giao hàng.', 'error');
  }

  try {
    const res = await api('/orders', {
      method: 'POST',
      body: JSON.stringify({
        full_name: fullName,
        phone,
        province,
        district,
        ward,
        address_detail: addressDetail,
        payment_method: paymentMethod,
        customer_note: note,
        promotion_code: checkoutState.promoCode
      })
    });

    const orderData = res.data;
    closeModal('checkoutModal');
    loadCart();

    // Điều hướng theo phương thức thanh toán
    if (paymentMethod === 'qr_transfer') {
      openVietQRModal(orderData.order_id);
    } else if (paymentMethod === 'visa') {
      openVisaModal(orderData.order_id, orderData.total_amount);
    } else {
      // COD
      showToast(`Đặt hàng thành công! Mã đơn: #${orderData.order_number}`, 'success');
      openOrderSuccessModal(orderData);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// VietQR Payment Modal
async function openVietQRModal(orderId) {
  try {
    const res = await api(`/payment/qr-info/${orderId}`);
    const data = res.data;
    state.currentOrderForPayment = orderId;

    const modalBody = document.getElementById('vietQRModalBody');
    modalBody.innerHTML = `
      <div class="qr-container">
        <div class="qr-image-frame">
          <img src="${data.qr_image_url}" alt="Mã VietQR Thanh Toán" class="qr-img">
        </div>
        <p style="font-weight: 700; font-size: 1.25rem; color: var(--wood-800); margin-bottom: 8px;">
          ${formatCurrency(data.total_amount)}
        </p>
        <div style="background: var(--wood-50); padding: 14px; border-radius: 8px; text-align: left; font-size: 0.88rem; line-height: 1.7; margin-bottom: 20px;">
          <div>🏦 <strong>Ngân hàng:</strong> ${data.bank.bank_name}</div>
          <div>💳 <strong>Số tài khoản:</strong> <span style="font-family: monospace; font-size: 1rem; color: var(--wood-900);">${data.bank.account_number}</span></div>
          <div>👤 <strong>Chủ tài khoản:</strong> ${data.bank.account_name}</div>
          <div>📝 <strong>Nội dung:</strong> <span style="background: #fff8e6; padding: 2px 6px; font-weight: 700; color: var(--gold-500);">${data.bank.memo}</span></div>
        </div>
        <p class="text-muted" style="font-size: 0.82rem; margin-bottom: 16px;">
          ⏳ Vui lòng mở ứng dụng ngân hàng và quét mã trong vòng 15 phút.
        </p>
        <button class="btn btn-gold btn-block" onclick="confirmQRTransfer(${orderId})">
          ✓ Tôi Đã Chuyển Khoản Xong
        </button>
      </div>
    `;

    document.getElementById('vietQRModal').classList.add('open');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function confirmQRTransfer(orderId) {
  try {
    const res = await api('/payment/confirm-qr', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId })
    });
    showToast(res.message, 'success');
    closeModal('vietQRModal');
    loadOrdersHistory();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Visa Card 3D Secure Simulator Modal
function openVisaModal(orderId, amount) {
  state.currentOrderForPayment = orderId;
  document.getElementById('visaAmountDisplay').textContent = formatCurrency(amount);
  document.getElementById('visaPaymentModal').classList.add('open');
}

async function handleVisaSubmit(e) {
  e.preventDefault();
  const cardNumber = document.getElementById('visaCardNumber').value;
  const cardHolder = document.getElementById('visaCardHolder').value;
  const expiry = document.getElementById('visaExpiry').value;
  const cvv = document.getElementById('visaCvv').value;

  try {
    const res = await api('/payment/visa-process', {
      method: 'POST',
      body: JSON.stringify({
        order_id: state.currentOrderForPayment,
        card_number: cardNumber,
        card_holder: cardHolder,
        expiry_date: expiry,
        cvv
      })
    });

    showToast(res.message, 'success');
    closeModal('visaPaymentModal');
    loadOrdersHistory();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openOrderSuccessModal(orderData) {
  document.getElementById('successOrderNumber').textContent = `#${orderData.order_number}`;
  document.getElementById('successOrderTotal').textContent = formatCurrency(orderData.total_amount);
  document.getElementById('orderSuccessModal').classList.add('open');
}

// ========================================================
// ORDER TRACKING & HISTORY CONTROLLER
// ========================================================
async function loadOrdersHistory() {
  if (!state.token) return;
  try {
    const res = await api('/orders');
    renderOrdersList(res.data.orders);
  } catch (err) {
    console.error('Failed to load orders:', err);
  }
}

function renderOrdersList(orders) {
  const container = document.getElementById('ordersListContainer');
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <p style="font-size: 2rem;">📦</p>
        <p>Bạn chưa có đơn hàng nào.</p>
      </div>
    `;
    return;
  }

  const statusMap = {
    pending: { label: 'Chờ xác nhận', badge: 'badge-warning' },
    confirmed: { label: 'Đã xác nhận', badge: 'badge-info' },
    processing: { label: 'Đang đóng gói', badge: 'badge-info' },
    shipping: { label: 'Đang giao hàng', badge: 'badge-warning' },
    delivered: { label: 'Đã giao thành công', badge: 'badge-success' },
    cancelled: { label: 'Đã hủy', badge: 'badge-danger' }
  };

  container.innerHTML = orders.map(o => {
    const st = statusMap[o.status] || { label: o.status, badge: 'badge-wood' };
    return `
      <div style="background: #fff; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 12px;">
          <div>
            <strong style="color: var(--wood-900);">#${o.order_number}</strong>
            <span class="text-muted" style="font-size: 0.85rem; margin-left: 10px;">Ngày đặt: ${new Date(o.created_at).toLocaleDateString('vi-VN')}</span>
          </div>
          <span class="badge ${st.badge}">${st.label}</span>
        </div>
        <div style="display: flex; gap: 16px; align-items: center;">
          <img src="${o.first_item_image || 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=150&q=80'}" style="width: 60px; height: 60px; border-radius: 6px; object-fit: cover;">
          <div style="flex: 1;">
            <p style="font-weight: 600;">${o.first_item_name || 'Sản phẩm nội thất'}</p>
            <span class="text-muted" style="font-size: 0.85rem;">${o.item_count > 1 ? `và ${o.item_count - 1} sản phẩm khác` : ''}</span>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 700; color: var(--wood-800);">${formatCurrency(o.total_amount)}</div>
            <button class="btn btn-outline" style="padding: 6px 14px; font-size: 0.82rem; margin-top: 6px;" onclick="viewOrderDetail(${o.id})">Xem Chi Tiết</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function viewOrderDetail(orderId) {
  try {
    const res = await api(`/orders/${orderId}`);
    const o = res.data;

    const modalBody = document.getElementById('orderDetailBody');

    // Timeline calculation
    const steps = [
      { key: 'pending', label: 'Đặt Hàng' },
      { key: 'confirmed', label: 'Xác Nhận' },
      { key: 'shipping', label: 'Đang Giao' },
      { key: 'delivered', label: 'Đã Nhận' }
    ];

    const currentIdx = steps.findIndex(s => s.key === o.status);

    modalBody.innerHTML = `
      <div class="order-timeline">
        ${steps.map((s, i) => `
          <div class="timeline-step ${i <= currentIdx ? 'completed' : ''} ${i === currentIdx ? 'active' : ''}">
            <div class="timeline-dot">${i + 1}</div>
            <div class="timeline-label">${s.label}</div>
          </div>
        `).join('')}
      </div>

      <div style="background: var(--wood-50); padding: 16px; border-radius: 8px; margin-bottom: 20px; font-size: 0.88rem; line-height: 1.7;">
        <div><strong>Mã đơn hàng:</strong> #${o.order_number}</div>
        <div><strong>Người nhận:</strong> ${o.shipping_full_name} (${o.shipping_phone})</div>
        <div><strong>Địa chỉ:</strong> ${o.shipping_address_detail}, ${o.shipping_ward}, ${o.shipping_district}, ${o.shipping_province}</div>
        <div><strong>Phương thức thanh toán:</strong> ${o.payment_method.toUpperCase()} (${o.payment_status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'})</div>
      </div>

      <h4 style="margin-bottom: 12px;">Sản phẩm trong đơn</h4>
      <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
        ${(o.items || []).map(item => `
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
            <div>
              <div style="font-weight: 600;">${item.product_name}</div>
              <div class="text-muted" style="font-size: 0.82rem;">Số lượng: ${item.quantity} x ${formatCurrency(item.unit_price)}</div>
            </div>
            <div style="font-weight: 700;">${formatCurrency(item.subtotal)}</div>
          </div>
        `).join('')}
      </div>

      <div style="display: flex; justify-content: space-between; font-size: 1.15rem; font-weight: 700; color: var(--wood-800);">
        <span>Tổng thanh toán:</span>
        <span>${formatCurrency(o.total_amount)}</span>
      </div>

      ${o.status === 'pending' ? `
        <button class="btn btn-outline" style="color: var(--danger); border-color: var(--danger); margin-top: 20px; width: 100%;" onclick="cancelOrder(${o.id})">
          Hủy Đơn Hàng Này
        </button>
      ` : ''}
    `;

    document.getElementById('orderDetailModal').classList.add('open');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function cancelOrder(orderId) {
  if (!confirm('Bạn có chắc chắn muốn hủy đơn hàng này?')) return;
  try {
    await api(`/orders/${orderId}/cancel`, { method: 'PUT', body: JSON.stringify({ reason: 'Khách hàng hủy trên website' }) });
    showToast('Đã hủy đơn hàng thành công.', 'info');
    closeModal('orderDetailModal');
    loadOrdersHistory();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// WISHLIST CONTROLLER
// ========================================================
async function loadWishlist() {
  if (!state.token) return;
  try {
    const res = await api('/users/wishlist');
    state.wishlist = res.data || [];
    renderProducts();
  } catch (err) {
    console.error('Failed to load wishlist:', err);
  }
}

async function toggleWishlist(productId) {
  if (!state.token) return showToast('Vui lòng đăng nhập để lưu sản phẩm yêu thích.', 'warning');
  try {
    const res = await api(`/users/wishlist/${productId}`, { method: 'POST' });
    showToast(res.message, 'info');
    loadWishlist();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================================
// ADMIN PORTAL CONTROLLER
// ========================================================
let adminPaymentChartInstance = null;
const sampleFurnitureImages = [
  'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1540518614846-7ede433c4ef0?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=800&q=80'
];
let currentSampleIndex = 0;

function switchAdminTab(tabName) {
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-tab-pane').forEach(p => p.style.display = 'none');

  const btn = document.getElementById(`tabBtn-${tabName}`);
  const pane = document.getElementById(`adminTab-${tabName}`);
  if (btn) btn.classList.add('active');
  if (pane) pane.style.display = 'block';

  if (tabName === 'stats') loadAdminDashboard();
  if (tabName === 'products') loadAdminProducts();
  if (tabName === 'orders') loadAdminOrders();
}

async function loadAdminDashboard() {
  try {
    const res = await api('/admin/dashboard');
    const data = res.data;

    // Cập nhật huy hiệu CSDL XAMPP
    const badge = document.getElementById('adminDbStatusBadge');
    if (badge && data.db_status) {
      if (data.db_status.is_mysql) {
        badge.innerHTML = `🟢 CSDL: ${data.db_status.engine} (Database: ${data.db_status.database_name})`;
        badge.style.background = '#e6f7ed';
        badge.style.color = '#0d8a43';
        badge.style.borderColor = '#a3e0be';
      } else {
        badge.innerHTML = `🟡 Đang chạy Fallback Mock Database (Bật MySQL XAMPP để đồng bộ)`;
        badge.style.background = '#fef3c7';
        badge.style.color = '#92400e';
        badge.style.borderColor = '#fde68a';
      }
    }

    // Cập nhật 5 thẻ KPI
    document.getElementById('adminStatRevenueToday').textContent = formatCurrency(data.stats.revenue_today || 0);
    document.getElementById('adminStatRevenueMonth').textContent = formatCurrency(data.stats.revenue_month || 0);
    document.getElementById('adminStatOrdersToday').textContent = data.stats.orders_today || 0;
    document.getElementById('adminStatPending').textContent = data.stats.pending_orders || 0;
    document.getElementById('adminStatLowStock').textContent = data.stats.low_stock_count || 0;

    // Cập nhật thông số thống kê thanh toán
    const totalOrders = data.total_payment_orders || 0;
    const totalRevenue = data.total_payment_revenue || 0;
    const badgeOrders = document.getElementById('paymentTotalOrdersBadge');
    if (badgeOrders) badgeOrders.textContent = `Tổng: ${totalOrders} đơn hàng`;

    const centerRev = document.getElementById('donutCenterRevenue');
    if (centerRev) centerRev.textContent = formatCurrency(totalRevenue);

    // Cập nhật 3 thẻ phương thức thanh toán chi tiết
    if (data.payment_methods_stats && data.payment_methods_stats.length) {
      data.payment_methods_stats.forEach(stat => {
        if (stat.key === 'cod') {
          document.getElementById('statCodPercent').textContent = `${stat.percentage}%`;
          document.getElementById('statCodCount').textContent = `${stat.count} đơn`;
          document.getElementById('statCodRevenue').textContent = formatCurrency(stat.revenue);
        } else if (stat.key === 'qr_transfer') {
          document.getElementById('statQrPercent').textContent = `${stat.percentage}%`;
          document.getElementById('statQrCount').textContent = `${stat.count} đơn`;
          document.getElementById('statQrRevenue').textContent = formatCurrency(stat.revenue);
        } else if (stat.key === 'visa') {
          document.getElementById('statVisaPercent').textContent = `${stat.percentage}%`;
          document.getElementById('statVisaCount').textContent = `${stat.count} đơn`;
          document.getElementById('statVisaRevenue').textContent = formatCurrency(stat.revenue);
        }
      });
    }

    // Vẽ biểu đồ hình vòng (Donut Chart)
    renderPaymentDonutChart(data.payment_methods_stats || [], totalOrders, totalRevenue);

    // Bảng đơn hàng gần đây
    renderAdminOrdersTable(data.recent_orders || []);
  } catch (err) {
    showToast('Không thể tải dữ liệu quản trị: ' + err.message, 'error');
  }
}

// Vẽ biểu đồ hình vòng Donut so sánh 3 phương thức thanh toán
function renderPaymentDonutChart(stats, totalOrders, totalRevenue) {
  const canvas = document.getElementById('paymentDonutCanvas');
  if (!canvas) return;

  const cod = stats.find(s => s.key === 'cod') || { count: 0, revenue: 0 };
  const qr = stats.find(s => s.key === 'qr_transfer') || { count: 0, revenue: 0 };
  const visa = stats.find(s => s.key === 'visa') || { count: 0, revenue: 0 };

  const counts = [cod.count, qr.count, visa.count];
  const labels = ['Tiền mặt (COD)', 'Chuyển khoản (VietQR)', 'Thẻ quốc tế (Visa/Master)'];
  const colors = ['#10b981', '#d97706', '#2563eb'];

  // Nếu đã nạp thư viện Chart.js
  if (typeof Chart !== 'undefined') {
    if (adminPaymentChartInstance) {
      adminPaymentChartInstance.destroy();
      adminPaymentChartInstance = null;
    }

    const hasData = counts.some(c => c > 0);
    const chartData = hasData ? counts : [1, 1, 1];
    const chartColors = hasData ? colors : ['#e5e7eb', '#e5e7eb', '#e5e7eb'];

    adminPaymentChartInstance = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: chartData,
          backgroundColor: chartColors,
          borderWidth: 3,
          borderColor: '#ffffff',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: hasData,
            callbacks: {
              label: function(context) {
                const idx = context.dataIndex;
                const s = stats[idx];
                return ` ${labels[idx]}: ${s ? s.count : 0} đơn (${s ? s.percentage : 0}%) - ${formatCurrency(s ? s.revenue : 0)}`;
              }
            }
          }
        },
        animation: {
          animateScale: true,
          animateRotate: true
        }
      }
    });
  } else {
    // Fallback vẽ bằng Canvas 2D thuần
    drawFallbackDonutCanvas(canvas, counts, colors);
  }
}

function drawFallbackDonutCanvas(canvas, counts, colors) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const total = counts.reduce((a, b) => a + b, 0);
  const cx = width / 2;
  const cy = height / 2;
  const radius = 105;
  const lineWidth = 34;

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    return;
  }

  let startAngle = -0.5 * Math.PI;
  counts.forEach((val, idx) => {
    if (val > 0) {
      const sliceAngle = (val / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.strokeStyle = colors[idx];
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'butt';
      ctx.stroke();
      startAngle += sliceAngle;
    }
  });
}

// Bảng đơn hàng gần đây trong Tab Tổng Quan
function renderAdminOrdersTable(orders) {
  const tbody = document.getElementById('adminOrdersTableBody');
  if (!tbody) return;

  if (!orders || orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">Chưa có đơn hàng nào cần xử lý.</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(o => `
    <tr>
      <td><strong>#${o.order_number}</strong></td>
      <td>${o.full_name || 'Khách hàng'}</td>
      <td><strong class="text-gold">${formatCurrency(o.total_amount)}</strong></td>
      <td>${formatPaymentMethodBadge(o.payment_method)}</td>
      <td>
        <select onchange="updateAdminOrderStatus(${o.id}, this.value)" style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border); font-size: 0.85rem;">
          <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>⏳ Chờ xác nhận</option>
          <option value="confirmed" ${o.status === 'confirmed' ? 'selected' : ''}>✅ Đã xác nhận</option>
          <option value="shipping" ${o.status === 'shipping' ? 'selected' : ''}>🚚 Đang giao hàng</option>
          <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>🎉 Đã giao thành công</option>
          <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>❌ Đã hủy</option>
        </select>
      </td>
      <td>
        <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.8rem;" onclick="viewOrderDetail(${o.id})">Chi tiết</button>
      </td>
    </tr>
  `).join('');
}

function formatPaymentMethodBadge(method) {
  if (method === 'cod') return `<span style="background: #e6f7ed; color: #10b981; font-weight: 600; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem;">💵 COD</span>`;
  if (method === 'qr_transfer') return `<span style="background: #fef3c7; color: #d97706; font-weight: 600; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem;">📲 VietQR</span>`;
  if (method === 'visa') return `<span style="background: #dbeafe; color: #2563eb; font-weight: 600; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem;">💳 Visa</span>`;
  return method.toUpperCase();
}

// ========================================================
// QUẢN LÝ SẢN PHẨM (THÊM, SỬA, XOÁ)
// ========================================================
async function loadAdminProducts() {
  const tbody = document.getElementById('adminProductsTableBody');
  if (!tbody) return;

  try {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px;">Đang tải danh sách sản phẩm từ CSDL...</td></tr>`;

    const search = document.getElementById('adminProductSearchInput')?.value || '';
    const category = document.getElementById('adminProductCategoryFilter')?.value || '';
    const status = document.getElementById('adminProductStatusFilter')?.value || '';

    let url = `/products/admin/list?limit=100`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;

    const res = await api(url);
    let products = res.data.products || [];

    if (status !== '') {
      products = products.filter(p => Number(p.is_active) === Number(status));
    }

    populateAdminCategorySelect();

    if (products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">Không tìm thấy sản phẩm nào phù hợp.</td></tr>`;
      return;
    }

    tbody.innerHTML = products.map(p => {
      const img = p.primary_image || '/images/banner1.jpg';
      const isActive = Number(p.is_active) === 1;
      const isLowStock = p.stock_quantity <= 5;

      return `
        <tr>
          <td>
            <img src="${img}" alt="${escapeHtml(p.name)}" class="product-thumb-preview" onerror="this.src='/images/banner1.jpg'">
          </td>
          <td>
            <div style="font-weight: 600; color: var(--wood-900);">${escapeHtml(p.name)} ${p.is_featured ? '⭐' : ''}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted); font-family: monospace;">SKU: ${p.sku || 'N/A'}</div>
          </td>
          <td>${p.category_name || 'Nội thất'}</td>
          <td>
            <div><strong>${formatCurrency(p.sale_price || p.price)}</strong></div>
            ${p.sale_price ? `<div style="text-decoration: line-through; font-size: 0.78rem; color: var(--text-muted);">${formatCurrency(p.price)}</div>` : ''}
          </td>
          <td>
            <span style="font-weight: 600; color: ${isLowStock ? '#dc2626' : 'var(--wood-900)'};">
              ${p.stock_quantity}
            </span>
            ${isLowStock ? `<div style="font-size: 0.72rem; color: #dc2626;">Sắp hết hàng</div>` : ''}
          </td>
          <td>
            ${isActive
              ? `<span style="background: #e6f7ed; color: #0d8a43; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">Đang bán</span>`
              : `<span style="background: #f3f4f6; color: #6b7280; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">Đã ẩn</span>`
            }
          </td>
          <td style="text-align: center;">
            <div style="display: inline-flex; gap: 8px;">
              <button class="btn-action-icon" title="Sửa sản phẩm" onclick="openEditProductModal(${p.id})">
                ✏️
              </button>
              <button class="btn-action-icon delete" title="Xóa sản phẩm" onclick="confirmDeleteProduct(${p.id}, '${escapeHtml(p.name).replace(/'/g, "\\'")}', '${p.sku || ''}')">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #dc2626; padding: 20px;">Lỗi tải sản phẩm: ${err.message}</td></tr>`;
  }
}

// Đổ dữ liệu categories vào dropdown lọc và form thêm sản phẩm
async function populateAdminCategorySelect() {
  const catFilter = document.getElementById('adminProductCategoryFilter');
  const catForm = document.getElementById('adminProductFormCategory');
  if (!catForm) return;

  if (catForm.children.length <= 1) {
    try {
      const res = await api('/products/categories');
      const cats = res.data || [];
      const formOptions = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      catForm.innerHTML = formOptions;

      if (catFilter && catFilter.children.length <= 1) {
        catFilter.innerHTML = `<option value="">-- Tất cả danh mục --</option>` +
          cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      }
    } catch (e) {
      console.error(e);
    }
  }
}

function updateProductImagePreview(url) {
  const preview = document.getElementById('adminProductImagePreview');
  if (preview) {
    preview.src = url && url.trim() ? url.trim() : '/images/banner1.jpg';
  }
}

function chooseSampleImage() {
  const url = sampleFurnitureImages[currentSampleIndex % sampleFurnitureImages.length];
  currentSampleIndex++;
  const input = document.getElementById('adminProductFormImage');
  if (input) input.value = url;
  updateProductImagePreview(url);
}

// Mở Modal Thêm Sản Phẩm Mới
function openAddProductModal() {
  document.getElementById('adminProductModalTitle').textContent = 'Thêm Sản Phẩm Gỗ Mới';
  document.getElementById('adminProductFormId').value = '';
  document.getElementById('adminProductForm').reset();
  document.getElementById('adminProductFormWarranty').value = '12';
  document.getElementById('adminProductFormActive').checked = true;
  document.getElementById('adminProductSaveBtn').textContent = 'Thêm Sản Phẩm';
  updateProductImagePreview('/images/banner1.jpg');

  populateAdminCategorySelect();
  document.getElementById('adminProductModal').classList.add('open');
}

// Mở Modal Sửa Sản Phẩm
async function openEditProductModal(productId) {
  try {
    const res = await api(`/products/admin/${productId}`);
    const product = res.data;

    document.getElementById('adminProductModalTitle').textContent = `Chỉnh Sửa Sản Phẩm: ${product.name}`;
    document.getElementById('adminProductFormId').value = product.id;
    document.getElementById('adminProductFormName').value = product.name || '';
    document.getElementById('adminProductFormCategory').value = product.category_id || 1;
    document.getElementById('adminProductFormPrice').value = Math.round(product.price || 0);
    document.getElementById('adminProductFormSalePrice').value = product.sale_price ? Math.round(product.sale_price) : '';
    document.getElementById('adminProductFormStock').value = product.stock_quantity || 0;
    document.getElementById('adminProductFormSku').value = product.sku || '';
    document.getElementById('adminProductFormWarranty').value = product.warranty_months || 12;

    const imgUrl = product.primary_image || (product.images && product.images[0] ? product.images[0].image_url : '');
    document.getElementById('adminProductFormImage').value = imgUrl || '';
    updateProductImagePreview(imgUrl);

    document.getElementById('adminProductFormMaterial').value = product.material || '';
    document.getElementById('adminProductFormDimensions').value = product.dimensions || '';
    document.getElementById('adminProductFormColor').value = product.color || '';
    document.getElementById('adminProductFormShortDesc').value = product.short_description || '';
    document.getElementById('adminProductFormDesc').value = product.description || '';
    document.getElementById('adminProductFormFeatured').checked = Boolean(product.is_featured);
    document.getElementById('adminProductFormActive').checked = Number(product.is_active) === 1;
    document.getElementById('adminProductSaveBtn').textContent = 'Cập Nhật Thay Đổi';

    document.getElementById('adminProductModal').classList.add('open');
  } catch (err) {
    showToast('Lỗi khi tải thông tin sản phẩm: ' + err.message, 'error');
  }
}

// Xử lý lưu sản phẩm (Thêm mới hoặc Cập nhật)
async function handleSaveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('adminProductFormId').value;
  const isEdit = Boolean(id);

  const payload = {
    name: document.getElementById('adminProductFormName').value.trim(),
    category_id: Number(document.getElementById('adminProductFormCategory').value),
    price: Number(document.getElementById('adminProductFormPrice').value),
    sale_price: document.getElementById('adminProductFormSalePrice').value ? Number(document.getElementById('adminProductFormSalePrice').value) : null,
    stock_quantity: Number(document.getElementById('adminProductFormStock').value),
    sku: document.getElementById('adminProductFormSku').value.trim() || undefined,
    warranty_months: Number(document.getElementById('adminProductFormWarranty').value) || 12,
    image_url: document.getElementById('adminProductFormImage').value.trim() || undefined,
    material: document.getElementById('adminProductFormMaterial').value.trim(),
    dimensions: document.getElementById('adminProductFormDimensions').value.trim(),
    color: document.getElementById('adminProductFormColor').value.trim(),
    short_description: document.getElementById('adminProductFormShortDesc').value.trim(),
    description: document.getElementById('adminProductFormDesc').value.trim(),
    is_featured: document.getElementById('adminProductFormFeatured').checked ? 1 : 0,
    is_active: document.getElementById('adminProductFormActive').checked ? 1 : 0
  };

  try {
    const url = isEdit ? `/products/admin/${id}` : `/products/admin/create`;
    const method = isEdit ? 'PUT' : 'POST';

    const res = await api(url, {
      method,
      body: JSON.stringify(payload)
    });

    showToast(res.message || 'Thao tác sản phẩm thành công!', 'success');
    closeModal('adminProductModal');
    loadAdminProducts();
    loadProducts(); // Đồng bộ lại trang chủ
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Xóa sản phẩm
let pendingDeleteProductId = null;

function confirmDeleteProduct(id, name, sku) {
  pendingDeleteProductId = id;
  document.getElementById('adminDeleteProductName').innerHTML = `Bạn có chắc chắn muốn xóa sản phẩm:<br><strong style="color: var(--gold-600);">${name}</strong> (SKU: ${sku || id})?`;

  const btn = document.getElementById('adminConfirmDeleteBtn');
  btn.onclick = () => executeDeleteProduct(id);

  document.getElementById('adminDeleteModal').classList.add('open');
}

async function executeDeleteProduct(id) {
  try {
    const res = await api(`/products/admin/${id}`, { method: 'DELETE' });
    showToast(res.message || 'Đã xóa sản phẩm thành công!', 'success');
    closeModal('adminDeleteModal');
    loadAdminProducts();
    loadProducts(); // Đồng bộ lại giao diện cửa hàng
  } catch (err) {
    showToast('Lỗi khi xóa sản phẩm: ' + err.message, 'error');
  }
}

// ========================================================
// QUẢN LÝ ĐƠN HÀNG (LƯU TRỰC TIẾP MySQL XAMPP)
// ========================================================
async function loadAdminOrders() {
  const tbody = document.getElementById('adminFullOrdersTableBody');
  if (!tbody) return;

  try {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px;">Đang tải danh sách đơn hàng từ CSDL MySQL...</td></tr>`;

    const search = document.getElementById('adminOrderSearchInput')?.value || '';
    const status = document.getElementById('adminOrderStatusFilter')?.value || '';
    const payment = document.getElementById('adminOrderPaymentFilter')?.value || '';

    let url = `/orders/admin/list?limit=100`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;
    if (payment) url += `&payment_method=${encodeURIComponent(payment)}`;

    const res = await api(url);
    const orders = res.data.orders || [];

    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">Không tìm thấy đơn hàng nào trong CSDL.</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => {
      const orderDate = new Date(o.created_at).toLocaleString('vi-VN');
      const address = [o.shipping_address_detail, o.shipping_ward, o.shipping_district, o.shipping_province].filter(Boolean).join(', ');

      return `
        <tr>
          <td><strong style="color: var(--gold-600);">#${o.order_number}</strong></td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">${orderDate}</td>
          <td>
            <div style="font-weight: 600;">${escapeHtml(o.shipping_full_name || o.customer_name || 'Khách hàng')}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">${o.shipping_phone || ''}</div>
          </td>
          <td style="max-width: 200px; font-size: 0.8rem; line-height: 1.4;">${escapeHtml(address)}</td>
          <td>${formatPaymentMethodBadge(o.payment_method)}</td>
          <td><strong style="color: var(--wood-900);">${formatCurrency(o.total_amount)}</strong></td>
          <td>
            <select onchange="updateAdminOrderStatus(${o.id}, this.value)" style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border); font-size: 0.82rem;">
              <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>⏳ Chờ xác nhận</option>
              <option value="confirmed" ${o.status === 'confirmed' ? 'selected' : ''}>✅ Đã xác nhận</option>
              <option value="shipping" ${o.status === 'shipping' ? 'selected' : ''}>🚚 Đang giao hàng</option>
              <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>🎉 Đã giao thành công</option>
              <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>❌ Đã hủy</option>
            </select>
          </td>
          <td style="text-align: center;">
            <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.8rem;" onclick="viewOrderDetail(${o.id})">
              Chi tiết
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #dc2626; padding: 20px;">Lỗi tải đơn hàng: ${err.message}</td></tr>`;
  }
}

async function updateAdminOrderStatus(orderId, status) {
  try {
    await api(`/orders/admin/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, note: `Cập nhật trạng thái sang ${status} bởi admin` })
    });
    showToast('Cập nhật trạng thái đơn thành công vào CSDL MySQL!', 'success');
    loadAdminDashboard();
    loadAdminOrders();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Modal helper
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('open');
    modal.classList.remove('active');
    // Phục hồi scroll nếu không còn modal nào mở
    if (!document.querySelector('.modal-overlay.open, .modal-overlay.active, .cart-drawer.open, .cart-drawer.active')) {
      document.body.style.overflow = '';
    }
    if (window.WoodHooks) {
      window.WoodHooks.emit('modal:close', { modalId });
    }
  }
}

// Image Upload Handler cho Sản phẩm trong Admin Modal
async function handleProductFileUpload(input) {
  const file = input.files?.[0];
  if (!file) return;

  const statusText = document.getElementById('uploadStatusText');
  const previewImg = document.getElementById('adminProductImagePreview');
  const urlInput = document.getElementById('adminProductFormImage');

  try {
    if (statusText) statusText.innerHTML = `⏳ Đang tải <strong>${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)...`;

    // Hiển thị preview ngay lập tức
    const reader = new FileReader();
    reader.onload = (e) => {
      if (previewImg) previewImg.src = e.target.result;
    };
    reader.readAsDataURL(file);

    let uploadData;
    if (window.useUpload) {
      const uploader = window.useUpload();
      uploadData = await uploader.uploadFile(file);
    } else {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload/single', {
        method: 'POST',
        headers: state.token ? { 'Authorization': `Bearer ${state.token}` } : {},
        body: formData
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Lỗi tải ảnh lên.');
      uploadData = json.data;
    }

    if (urlInput) urlInput.value = uploadData.url;
    if (statusText) statusText.innerHTML = `✓ Đã lưu thành công: <strong>${uploadData.filename}</strong>`;
    showToast('Tải ảnh sản phẩm lên server thành công!', 'success');
  } catch (err) {
    if (statusText) statusText.textContent = '✕ Lỗi tải ảnh: ' + err.message;
    showToast(err.message, 'error');
  }
}

// Switch between User Portal views (Store, Orders, Profile, Admin)
function switchMainView(viewName) {
  document.querySelectorAll('.main-view').forEach(v => v.style.display = 'none');
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.style.display = 'block';

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (viewName === 'orders') loadOrdersHistory();
  if (viewName === 'admin') {
    switchAdminTab('stats');
    loadAdminDashboard();
    loadAdminProducts();
    loadAdminOrders();
  }
}

// ========================================================
// INITIALIZATION
// ========================================================
async function loadInitialData() {
  try {
    const [bannersRes] = await Promise.all([
      api('/admin/banners/public').catch(() => ({ data: [] }))
    ]);

    state.banners = bannersRes.data?.length ? bannersRes.data : [
      {
        id: 1,
        title: 'Tuyệt Tác Nội Thất Gỗ Tự Nhiên 2026',
        description: 'Chạm khắc tỉ mỉ từ gỗ Sồi, Óc Chó và Gõ Đỏ nguyên khối - Đẳng cấp không gian sống thượng lưu.',
        image_url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1600&q=80',
        cta_text: 'Khám Phá Ngay',
        cta_link: '#products'
      }
    ];

    renderHeroSlider();
    await loadCategories();
    await loadProducts();
  } catch (e) {
    console.error('Initial load error:', e);
  }
}

// DOM Ready Listener
document.addEventListener('DOMContentLoaded', () => {
  // Setup event listeners
  document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
  document.getElementById('registerForm')?.addEventListener('submit', handleRegister);
  document.getElementById('checkoutForm')?.addEventListener('submit', handlePlaceOrder);
  document.getElementById('visaPaymentForm')?.addEventListener('submit', handleVisaSubmit);

  // Forgot password listeners
  document.getElementById('forgotStep1')?.addEventListener('submit', handleForgotStep1);
  document.getElementById('forgotStep2')?.addEventListener('submit', handleForgotStep2);
  document.getElementById('forgotStep3')?.addEventListener('submit', handleForgotStep3);

  // Đóng modal khi bấm vào nền overlay
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal.id);
      }
    });
  });

  // Setup drag & drop cho upload ảnh sản phẩm
  const dropzone = document.getElementById('adminProductDropzone');
  if (dropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });
    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        const fileInput = document.getElementById('adminProductFileInput');
        if (fileInput) {
          fileInput.files = files;
          handleProductFileUpload(fileInput);
        }
      }
    });
  }

  // Search input with debounce hook
  const searchInput = document.getElementById('headerSearchInput');
  if (searchInput) {
    const performSearch = (val) => {
      state.searchQuery = val.trim();
      renderProducts();
    };

    if (window.useDebounce) {
      searchInput.addEventListener('input', window.useDebounce((e) => performSearch(e.target.value), 250));
    } else {
      let searchTimeout = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => performSearch(e.target.value), 250);
      });
    }
  }

  // Check auth & load data
  checkAuthGate();
  loadInitialData();
});
