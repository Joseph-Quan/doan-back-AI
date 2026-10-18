/**
 * ========================================================
 * WOODHOME CLIENT HOOKS SYSTEM (Reactive Architecture)
 * Cung cấp các Hooks nghiệp vụ giúp giao diện mượt mà,
 * phản hồi tức thì (optimistic UI) và hoạt động chuẩn chu.
 * ========================================================
 */

class EventHookBus {
  constructor() {
    this.events = new Map();
  }

  on(event, handler) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (!this.events.has(event)) return;
    this.events.get(event).delete(handler);
  }

  emit(event, payload) {
    if (!this.events.has(event)) return;
    for (const handler of this.events.get(event)) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`Hook Error on [${event}]:`, err);
      }
    }
  }
}

// Global Singleton Hooks Bus
window.WoodHooks = new EventHookBus();

/**
 * 1. useDebounce - Chống giật lag khi tìm kiếm & lọc dữ liệu
 */
function useDebounce(fn, delay = 300) {
  let timeoutId = null;
  return function (...args) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * 2. useToast - Hệ thống thông báo toast mượt mà, xếp tầng
 */
function useToast() {
  const container = () => document.getElementById('toastContainer');

  const show = (message, type = 'info', duration = 3000) => {
    const parent = container();
    if (!parent) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} toast-slide-in`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    else if (type === 'error') icon = '✕';
    else if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `
      <div class="toast-icon-wrap">${icon}</div>
      <div class="toast-content">${message}</div>
      <button class="toast-close-btn" onclick="this.parentElement.remove()">✕</button>
      <div class="toast-progress-bar"></div>
    `;

    parent.appendChild(toast);
    window.WoodHooks.emit('toast:show', { message, type });

    setTimeout(() => {
      toast.classList.add('toast-fade-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  };

  return {
    show,
    success: (msg, dur) => show(msg, 'success', dur),
    error: (msg, dur) => show(msg, 'error', dur),
    warning: (msg, dur) => show(msg, 'warning', dur),
    info: (msg, dur) => show(msg, 'info', dur)
  };
}

/**
 * 3. useModal - Điều khiển đóng mở modal kèm hiệu ứng mượt mà & phím ESC
 */
function useModal(modalId) {
  const getEl = () => (typeof modalId === 'string' ? document.getElementById(modalId) : modalId);

  const open = (onOpenCallback) => {
    const el = getEl();
    if (!el) return;
    el.classList.add('active');
    document.body.style.overflow = 'hidden';
    window.WoodHooks.emit('modal:open', { modalId });
    if (typeof onOpenCallback === 'function') onOpenCallback(el);
  };

  const close = (onCloseCallback) => {
    const el = getEl();
    if (!el) return;
    el.classList.remove('active');
    // Chỉ phục hồi cuộn nếu không còn modal nào khác đang mở
    const anyActive = document.querySelector('.modal-overlay.active, .cart-drawer.active');
    if (!anyActive) {
      document.body.style.overflow = '';
    }
    window.WoodHooks.emit('modal:close', { modalId });
    if (typeof onCloseCallback === 'function') onCloseCallback(el);
  };

  const toggle = () => {
    const el = getEl();
    if (el && el.classList.contains('active')) close();
    else open();
  };

  return { open, close, toggle };
}

// Lắng nghe phím ESC để đóng modal đang mở một cách tiện lợi
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const activeModal = document.querySelector('.modal-overlay.active');
    if (activeModal) {
      activeModal.classList.remove('active');
      document.body.style.overflow = '';
      window.WoodHooks.emit('modal:close', { modalId: activeModal.id });
    }
    const cartDrawer = document.getElementById('cartDrawer');
    if (cartDrawer && cartDrawer.classList.contains('active')) {
      cartDrawer.classList.remove('active');
      const cartBackdrop = document.getElementById('cartBackdrop');
      if (cartBackdrop) cartBackdrop.classList.remove('active');
      document.body.style.overflow = '';
    }
  }
});

/**
 * 4. useUpload - Hook tải ảnh trực tiếp lên server WoodHome (/api/upload/single)
 * Hỗ trợ kéo thả (drag & drop), kiểm tra dung lượng, live preview và loading state.
 */
function useUpload(options = {}) {
  const {
    maxSizeMB = 5,
    onSuccess,
    onError,
    onProgress
  } = options;

  let isUploading = false;

  const validateFile = (file) => {
    if (!file) throw new Error('Vui lòng chọn một tệp hình ảnh.');
    const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!validMimes.includes(file.type)) {
      throw new Error('Định dạng tệp không được hỗ trợ. Hãy chọn tệp JPG, PNG, WEBP, GIF!');
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      throw new Error(`Dung lượng ảnh tối đa ${maxSizeMB}MB.`);
    }
    return true;
  };

  const uploadFile = async (file) => {
    try {
      validateFile(file);
      isUploading = true;
      if (onProgress) onProgress(true);

      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('woodhome_token');
      const res = await fetch('/api/upload/single', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Tải ảnh lên thất bại.');
      }

      window.WoodHooks.emit('upload:success', json.data);
      if (onSuccess) onSuccess(json.data);
      return json.data;
    } catch (err) {
      window.WoodHooks.emit('upload:error', err);
      if (onError) onError(err);
      throw err;
    } finally {
      isUploading = false;
      if (onProgress) onProgress(false);
    }
  };

  const preview = (file) => {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      } catch (e) {
        reject(e);
      }
    });
  };

  return {
    uploadFile,
    preview,
    validateFile,
    get isUploading() {
      return isUploading;
    }
  };
}

/**
 * 5. useCartHook - Đồng bộ và tính toán giỏ hàng phản hồi tức thì
 */
function useCartHook() {
  const getBadge = () => document.getElementById('cartBadge');

  const updateBadge = (count) => {
    const badge = getBadge();
    if (!badge) return;
    const num = Number(count) || 0;
    if (num > 0) {
      badge.textContent = num > 99 ? '99+' : num;
      badge.style.display = 'flex';
      badge.classList.remove('badge-pop');
      void badge.offsetWidth; // trigger reflow
      badge.classList.add('badge-pop');
    } else {
      badge.style.display = 'none';
      badge.textContent = '0';
    }
  };

  return {
    updateBadge
  };
}

// Đăng ký toàn cục
window.useDebounce = useDebounce;
window.useToast = useToast;
window.useModal = useModal;
window.useUpload = useUpload;
window.useCartHook = useCartHook;
