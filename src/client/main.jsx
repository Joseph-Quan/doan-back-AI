import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, useLocation } from 'react-router-dom';
import './react.css';

// ─── CONSTANTS & UTILS ────────────────────────────────────────────────────────
const L = typeof window !== 'undefined' ? window.L : null;
const ROLES = { 1: 'Khách hàng', 2: 'Nhân viên bán hàng', 3: 'Nhân viên kho', 4: 'Admin' };
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=900&q=80';
const money = v => `${Number(v || 0).toLocaleString('vi-VN')} đ`;
const readUser = () => JSON.parse(localStorage.getItem('woodhome_user') || 'null');

const STATUS_MAP = {
  pending:    { label: 'Chờ xác nhận',         cls: 'badge-status-pending' },
  confirmed:  { label: 'Đã xác nhận',           cls: 'badge-status-confirmed' },
  processing: { label: 'Đóng gói & Bốc xếp',   cls: 'badge-status-processing' },
  shipping:   { label: 'Đang vận chuyển',       cls: 'badge-status-shipping' },
  delivered:  { label: 'Giao thành công',       cls: 'badge-status-delivered' },
  cancelled:  { label: 'Đã hủy',               cls: 'badge-status-cancelled' },
  returned:   { label: 'Hoàn trả',             cls: 'badge-status-cancelled' },
};

// ─── SHARED HELPERS ────────────────────────────────────────────────────────────
async function api(endpoint, options = {}) {
  const token = localStorage.getItem('woodhome_token');
  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.message || 'Yêu cầu không thành công.');
  return result;
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Chỉ chấp nhận tệp hình ảnh (JPG, PNG, WEBP, GIF, SVG).'));
    }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1280;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── ATOMIC COMPONENTS ────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const { label, cls } = STATUS_MAP[status] || { label: status, cls: 'badge-status-pending' };
  return <span className={`badge-status ${cls}`}>{label}</span>;
}

/**
 * Modal cơ sở — không unmount khi đóng, chỉ ẩn qua display:none.
 * Ngăn click bên trong bubble ra overlay bằng stopPropagation.
 */
function BaseModal({ isOpen, onClose, size = '', children }) {
  // Khóa scroll body khi modal mở
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`modal-dialog${size ? ` modal-dialog-${size}` : ''}`}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ImageModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="image-lightbox-overlay" onClick={onClose}>
      <div className="image-lightbox-content" onClick={e => e.stopPropagation()}>
        <button type="button" className="image-lightbox-close" onClick={onClose}>✕</button>
        <img src={src} alt="Hình ảnh phóng to" />
      </div>
    </div>
  );
}

// ─── ORDER TRACKING MODAL (Bản đồ theo dõi đơn hàng) ─────────────────────────
function OrderTrackingModal({ orderId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const truckMarkerRef = useRef(null);
  const simIntervalRef = useRef(null);
  const simProgressRef = useRef(0);

  const fetchTracking = useCallback(async () => {
    try {
      setLoading(true); setError('');
      const res = await api(`/orders/${orderId}/tracking`);
      setData(res.data);
      simProgressRef.current = res.data.courier?.progress_percent || 0;
    } catch (err) {
      setError(err.message || 'Không thể tải thông tin theo dõi.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { if (orderId) fetchTracking(); }, [fetchTracking]);

  // Khởi tạo bản đồ Leaflet khi dữ liệu sẵn sàng
  useEffect(() => {
    if (!data || !mapContainerRef.current || !window.L) return;
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }

    const { warehouse, destination, courier, route, order } = data;
    const map = window.L.map(mapContainerRef.current, { zoomControl: true, scrollWheelZoom: true });
    mapInstanceRef.current = map;

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const mkIcon = (emoji, label, cls) => window.L.divIcon({
      className: 'map-custom-marker',
      html: `<div class="marker-pin ${cls}"><div class="marker-emoji">${emoji}</div><div class="marker-badge">${label}</div></div>`,
      iconSize: [44, 44], iconAnchor: [22, 38], popupAnchor: [0, -34]
    });

    window.L.marker([warehouse.lat, warehouse.lng], { icon: mkIcon('🌲', 'Kho WoodHome', 'pin-warehouse') })
      .addTo(map).bindPopup(`<b>${warehouse.name}</b><br/>${warehouse.address}<br/>Hotline: <b>${warehouse.phone}</b>`);

    window.L.marker([destination.lat, destination.lng], { icon: mkIcon('🏠', 'Địa chỉ nhận', 'pin-destination') })
      .addTo(map).bindPopup(`<b>Khách hàng: ${destination.receiver_name}</b><br/>${destination.address}<br/>SĐT: <b>${destination.phone}</b>`);

    const truckIcon = window.L.divIcon({
      className: 'map-custom-marker',
      html: `<div class="marker-pin pin-truck"><div class="marker-pulse"></div><div class="marker-emoji">🚚</div><div class="marker-badge">Xe WoodHome</div></div>`,
      iconSize: [48, 48], iconAnchor: [24, 40], popupAnchor: [0, -36]
    });

    const polyline = window.L.polyline(route, {
      color: '#c59b27', weight: 6, opacity: 0.88,
      lineCap: 'round', lineJoin: 'round',
      dashArray: order.status === 'delivered' ? null : '10, 8'
    }).addTo(map);

    const truck = window.L.marker([courier.current_lat, courier.current_lng], { icon: truckIcon })
      .addTo(map)
      .bindPopup(`<b>Tài xế: ${courier.name}</b><br/>Xe: ${courier.vehicle}<br/>Biển số: <b>${courier.plate_number}</b><br/>Trạng thái: <i>${courier.status_text}</i>`);
    truckMarkerRef.current = truck;

    map.fitBounds(polyline.getBounds(), { padding: [45, 45] });

    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, [data]);

  const toggleSimulation = () => {
    if (isSimulating) {
      clearInterval(simIntervalRef.current);
      setIsSimulating(false);
      return;
    }
    if (!data || !truckMarkerRef.current) return;
    setIsSimulating(true);
    const { route } = data;
    simIntervalRef.current = setInterval(() => {
      simProgressRef.current = (simProgressRef.current + 1.5) % 101;
      const t = (simProgressRef.current / 100) * (route.length - 1);
      const idx = Math.floor(t);
      const frac = t - idx;
      const p1 = route[idx];
      const p2 = route[Math.min(idx + 1, route.length - 1)];
      truckMarkerRef.current?.setLatLng([p1[0] + (p2[0] - p1[0]) * frac, p1[1] + (p2[1] - p1[1]) * frac]);
    }, 180);
  };

  const handleCancelOrder = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn hủy đơn hàng #${data.order.order_number}?`)) return;
    try {
      await api(`/orders/${orderId}/cancel`, { method: 'PUT', body: JSON.stringify({ reason: 'Khách hàng yêu cầu hủy đơn' }) });
      alert('Đã hủy đơn hàng thành công.');
      fetchTracking();
    } catch (err) { alert(err.message); }
  };

  return (
    <BaseModal isOpen={!!orderId} onClose={onClose} size="large">
      <div className="modal-header">
        <h2>
          🗺️ Theo Dõi Đơn Hàng #{data?.order?.order_number || orderId}
          {data && <StatusBadge status={data.order.status} />}
        </h2>
        <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="modal-body">
        {loading && <div style={{ textAlign: 'center', padding: '40px' }}>⏳ Đang tải bản đồ và dữ liệu lộ trình...</div>}
        {error   && <div className="text-danger" style={{ textAlign: 'center', padding: '30px' }}>{error}</div>}

        {data && (
          <>
            {/* Stepper tiến trình */}
            <div className="tracking-stepper">
              {data.steps.map((st, i) => (
                <div key={st.key} className={`tracking-step ${st.completed ? 'completed' : ''} ${st.active ? 'active' : ''}`}>
                  <div className="tracking-step-dot">{st.completed ? '✓' : i + 1}</div>
                  <div className="tracking-step-title">{st.label}</div>
                  <div className="tracking-step-desc">{st.desc}</div>
                </div>
              ))}
            </div>

            {/* Bản đồ */}
            <div className="tracking-map-wrapper">
              <div ref={mapContainerRef} className="tracking-map-canvas" />
              <div className="tracking-map-toolbar">
                <button type="button" className="tracking-map-btn"
                  onClick={() => mapInstanceRef.current?.setView(truckMarkerRef.current?.getLatLng(), 15, { animate: true })}>
                  🎯 Xe giao hàng
                </button>
                <button type="button" className="tracking-map-btn"
                  onClick={() => mapInstanceRef.current?.fitBounds(window.L?.polyline(data.route).getBounds(), { padding: [45, 45], animate: true })}>
                  🗺️ Toàn cảnh
                </button>
                <button type="button" className={`tracking-map-btn ${isSimulating ? 'active' : ''}`} onClick={toggleSimulation}>
                  {isSimulating ? '⏸ Dừng mô phỏng' : '▶️ Mô phỏng xe chạy'}
                </button>
              </div>
            </div>

            {/* Thông tin tài xế & địa chỉ */}
            <div className="tracking-info-grid">
              <div className="tracking-card">
                <h4>🚚 Đơn vị vận chuyển WoodHome Express</h4>
                <div className="courier-profile-row">
                  <img src={data.courier.avatar} alt={data.courier.name} className="courier-avatar" />
                  <div className="courier-meta">
                    <strong>{data.courier.name}</strong>
                    <small>{data.courier.vehicle}</small>
                    <small>Biển số: <strong>{data.courier.plate_number}</strong></small>
                    <a href={`tel:${data.courier.phone}`} className="courier-phone-link">📞 Gọi tài xế: {data.courier.phone}</a>
                  </div>
                </div>
                <div className="tracking-eta-badge">
                  ⏱ <strong>Dự kiến:</strong> {data.courier.eta} — <i>{data.courier.status_text}</i>
                </div>
              </div>

              <div className="tracking-card">
                <h4>📍 Địa chỉ nhận hàng</h4>
                <p><strong>Người nhận:</strong> {data.destination.receiver_name} ({data.destination.phone})</p>
                <p><strong>Địa chỉ:</strong> {data.destination.address}</p>
                <p><strong>Kho xuất:</strong> {data.warehouse.name}</p>
                <p><strong>Phương thức:</strong> {data.order.payment_method?.toUpperCase()} ({data.order.payment_status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'})</p>
              </div>
            </div>

            {/* Bảng sản phẩm trong đơn */}
            <div className="admin-panel" style={{ marginBottom: '14px' }}>
              <h4 style={{ marginBottom: '10px' }}>📦 Sản phẩm trong đơn</h4>
              <table>
                <thead>
                  <tr><th>Ảnh</th><th>Tên sản phẩm</th><th>Đơn giá</th><th>SL</th><th>Thành tiền</th></tr>
                </thead>
                <tbody>
                  {(data.order.items || []).map(item => (
                    <tr key={item.id}>
                      <td><img src={item.product_image || FALLBACK_IMG} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4 }} /></td>
                      <td>{item.product_name}<br /><small className="text-muted">{item.product_sku}</small></td>
                      <td>{money(item.unit_price)}</td>
                      <td>{item.quantity}</td>
                      <td><strong>{money(item.subtotal)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ textAlign: 'right', marginTop: '12px' }}>
                <span>Tạm tính: <strong>{money(data.order.subtotal)}</strong></span> |{' '}
                <span>Phí ship: <strong>{money(data.order.shipping_fee)}</strong></span> |{' '}
                {Number(data.order.discount_amount) > 0 && <span>Giảm giá: <strong>-{money(data.order.discount_amount)}</strong> | </span>}
                <span style={{ fontSize: '1.1rem', color: 'var(--wood-900)' }}>Tổng: <strong>{money(data.order.total_amount)}</strong></span>
              </div>
            </div>

            {['pending', 'confirmed'].includes(data.order.status) && (
              <div style={{ textAlign: 'right' }}>
                <button type="button" className="btn btn-sm btn-danger" onClick={handleCancelOrder}>
                  Hủy đơn hàng này
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </BaseModal>
  );
}

// ─── CART DRAWER ──────────────────────────────────────────────────────────────
function CartDrawer({ isOpen, onClose, cart, onCartChange, onCheckout }) {
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const subtotal = useMemo(() =>
    (cart.items || []).reduce((sum, item) => sum + (item.sale_price || item.price) * item.quantity, 0),
  [cart]);

  const discount = useMemo(() => {
    if (!appliedPromo) return 0;
    if (appliedPromo.discount_amount !== undefined) return appliedPromo.discount_amount;
    if (appliedPromo.type === 'percentage') {
      const d = subtotal * appliedPromo.value / 100;
      return appliedPromo.max_discount_amount ? Math.min(d, appliedPromo.max_discount_amount) : d;
    }
    if (appliedPromo.type === 'fixed_amount') return Math.min(appliedPromo.value, subtotal);
    return 0;
  }, [appliedPromo, subtotal]);

  const isFreeShip = appliedPromo?.type === 'free_shipping' || subtotal >= 5000000;
  const shippingFee = (subtotal === 0 || isFreeShip) ? 0 : 50000;
  const total = Math.max(0, subtotal - discount + shippingFee);

  const refreshCart = async () => {
    const res = await api('/cart');
    onCartChange(res.data);
  };

  const updateQty = async (itemId, qty, delta) => {
    const next = qty + delta;
    if (next < 1) return;
    try {
      setIsUpdating(true);
      await api(`/cart/${itemId}`, { method: 'PUT', body: JSON.stringify({ quantity: next }) });
      await refreshCart();
    } catch (err) { alert(err.message); } finally { setIsUpdating(false); }
  };

  const removeItem = async itemId => {
    try {
      setIsUpdating(true);
      await api(`/cart/${itemId}`, { method: 'DELETE' });
      await refreshCart();
    } catch (err) { alert(err.message); } finally { setIsUpdating(false); }
  };

  const clearAll = async () => {
    if (!window.confirm('Bạn có chắc muốn xóa tất cả sản phẩm khỏi giỏ?')) return;
    try {
      setIsUpdating(true);
      await api('/cart', { method: 'DELETE' });
      onCartChange({ items: [] });
    } catch (err) { alert(err.message); } finally { setIsUpdating(false); }
  };

  const applyPromo = async codeOverride => {
    const code = (codeOverride || promoCode).trim().toUpperCase();
    if (!code) return;
    setPromoError('');
    try {
      const res = await api('/promotions/validate', {
        method: 'POST',
        body: JSON.stringify({ code, subtotal }),
      });
      setAppliedPromo(res.data);
      setPromoCode(code);
    } catch (err) {
      setPromoError(err.message || 'Mã giảm giá không hợp lệ.');
      setAppliedPromo(null);
    }
  };

  // Ngăn không để overlay click đóng drawer khi đang tương tác
  if (!isOpen) return null;

  return (
    <div className="cart-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="cart-drawer-panel" onClick={e => e.stopPropagation()}>
        <div className="cart-drawer-header">
          <h3>🛒 Giỏ Hàng ({(cart.items || []).reduce((s, i) => s + i.quantity, 0)})</h3>
          <button type="button" className="cart-drawer-close" onClick={onClose}>✕</button>
        </div>

        <div className="cart-drawer-body">
          {(!cart.items || cart.items.length === 0) ? (
            <div className="cart-empty-state">
              <span className="cart-empty-icon">🛋️</span>
              <div className="cart-empty-title">Giỏ hàng của bạn đang trống</div>
              <p>Hãy khám phá các mẫu nội thất gỗ tự nhiên cao cấp tại WoodHome!</p>
              <button className="btn btn-primary" onClick={onClose}>Tiếp tục mua sắm</button>
            </div>
          ) : (
            <>
              {cart.items.map(item => (
                <div key={item.id} className="cart-item-card">
                  <img src={item.image || FALLBACK_IMG} alt={item.name} className="cart-item-img" />
                  <div className="cart-item-info">
                    <span className="cart-item-name" title={item.name}>{item.name}</span>
                    <div className="cart-item-price-row">
                      <span className="cart-item-price">{money(item.sale_price || item.price)}</span>
                      {item.sale_price && <span className="cart-item-old-price">{money(item.price)}</span>}
                    </div>
                    <div className="cart-qty-wrap">
                      <button type="button" className="cart-qty-btn" disabled={isUpdating || item.quantity <= 1}
                        onClick={() => updateQty(item.id, item.quantity, -1)}>−</button>
                      <span className="cart-qty-val">{item.quantity}</span>
                      <button type="button" className="cart-qty-btn" disabled={isUpdating}
                        onClick={() => updateQty(item.id, item.quantity, 1)}>+</button>
                    </div>
                  </div>
                  <button type="button" className="cart-item-remove-btn" onClick={() => removeItem(item.id)}>🗑</button>
                </div>
              ))}

              {/* Mã giảm giá */}
              <div className="cart-promo-section">
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--wood-900)' }}>🎁 Mã ưu đãi WoodHome:</span>
                <div className="cart-promo-form">
                  <input
                    className="form-input cart-promo-input"
                    placeholder="Nhập mã voucher..."
                    value={promoCode}
                    onChange={e => setPromoCode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applyPromo(promoCode)}
                  />
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => applyPromo(promoCode)}>Áp dụng</button>
                </div>
                {promoError  && <small className="text-danger">{promoError}</small>}
                {appliedPromo && <small style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Đã áp dụng: {appliedPromo.name}</small>}
                <div className="cart-promo-chips">
                  <span className="promo-chip" onClick={() => applyPromo('WOOD200K')}>WOOD200K (−200k)</span>
                  <span className="promo-chip" onClick={() => applyPromo('WELCOME10')}>WELCOME10 (−10%)</span>
                  <span className="promo-chip" onClick={() => applyPromo('FREESHIP')}>FREESHIP</span>
                </div>
              </div>
            </>
          )}
        </div>

        {cart.items && cart.items.length > 0 && (
          <div className="cart-drawer-footer">
            <div className="cart-shipping-notice">
              {isFreeShip ? '✨ Đơn hàng đã đạt điều kiện Miễn phí vận chuyển!' : '🚚 Mua thêm để được Miễn phí ship cho đơn từ 5.000.000đ'}
            </div>
            <div className="cart-summary-line"><span>Tạm tính:</span><strong>{money(subtotal)}</strong></div>
            {discount > 0 && <div className="cart-summary-line" style={{ color: 'var(--success)' }}><span>Giảm giá:</span><strong>−{money(discount)}</strong></div>}
            <div className="cart-summary-line"><span>Phí vận chuyển:</span><strong>{shippingFee === 0 ? 'Miễn phí' : money(shippingFee)}</strong></div>
            <div className="cart-summary-line total"><span>Tổng thanh toán:</span><strong>{money(total)}</strong></div>
            <div className="cart-actions-row">
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={clearAll}>Xóa giỏ</button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 2 }}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCheckout({ subtotal, discount, shippingFee, total, promoCode: appliedPromo?.code });
                }}
              >
                Đặt hàng ngay →
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

// ─── CHECKOUT MODAL ───────────────────────────────────────────────────────────
function CheckoutModal({ isOpen, onClose, summary, user, onOrderSuccess }) {
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    province: 'TP. Hồ Chí Minh',
    district: 'Quận 1',
    ward: 'Phường Bến Nghé',
    address_detail: 'Số 45 Lê Duẩn',
    payment_method: 'cod',
    customer_note: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdOrder, setCreatedOrder] = useState(null);
  const [qrInfo, setQrInfo] = useState(null);

  // Đặt thông tin user vào form khi user thay đổi
  useEffect(() => {
    if (user) setForm(f => ({ ...f, full_name: user.full_name || '', phone: user.phone || '' }));
  }, [user]);

  // Reset khi đóng
  useEffect(() => {
    if (!isOpen) { setCreatedOrder(null); setQrInfo(null); setError(''); setSubmitting(false); }
  }, [isOpen]);

  useEffect(() => {
    if (!createdOrder || createdOrder.payment_method !== 'qr_transfer') return;
    api(`/payment/qr-info/${createdOrder.order_id}`)
      .then(res => setQrInfo(res.data))
      .catch(err => setError(err.message || 'Không thể tải thông tin VietQR.'));
  }, [createdOrder]);

  const update = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setError(''); setSubmitting(true);
    try {
      const res = await api('/orders', {
        method: 'POST',
        body: JSON.stringify({ ...form, promotion_code: summary.promoCode || undefined }),
      });
      setCreatedOrder(res.data);
      onOrderSuccess();
    } catch (err) {
      setError(err.message || 'Đặt hàng thất bại.');
    } finally {
      setSubmitting(false);
    }
  };

  const setPayment = method => setForm(f => ({ ...f, payment_method: method }));

  return (
    <BaseModal isOpen={isOpen} onClose={onClose}>
      <div className="modal-header">
        <h2>📦 {createdOrder ? 'Đặt Hàng Thành Công!' : 'Xác Nhận Đặt Hàng WoodHome'}</h2>
        <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="modal-body">
        {createdOrder ? (
          // ── Màn hình thành công ──
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '8px' }}>🎉</div>
            <h3 className="font-serif" style={{ color: 'var(--wood-900)', marginBottom: '8px' }}>
              Cảm ơn quý khách đã tin chọn WoodHome!
            </h3>
            <p className="text-muted" style={{ marginBottom: '16px' }}>
              Đơn hàng <strong>#{createdOrder.order_number}</strong> đã được tạo thành công với tổng số tiền <strong>{money(createdOrder.total_amount)}</strong>.
            </p>

            {createdOrder.payment_method === 'qr_transfer' && (
              <div className="qr-container" style={{ margin: '16px auto', maxWidth: '360px' }}>
                <h4>📱 Quét mã VietQR (Napas 24/7)</h4>
                <img src={qrInfo?.qr_image_url || "/images/QR.png"} alt="Mã VietQR" style={{ width: '190px', margin: '12px auto', display: 'block', borderRadius: '6px' }} />
                <p style={{ fontSize: '0.85rem', lineHeight: '1.5' }}>
                  <strong>Ngân hàng:</strong> {qrInfo?.bank?.bank_name || 'Đang tải...'}<br />
                  <strong>Số tài khoản:</strong> {qrInfo?.bank?.account_number || 'Đang tải...'}<br />
                  <strong>Chủ TK:</strong> {qrInfo?.bank?.account_name || 'Đang tải...'}<br />
                  <strong>Nội dung:</strong> <code style={{ color: 'var(--wood-800)', fontWeight: 'bold' }}>{qrInfo?.bank?.memo || createdOrder.order_number}</code>
                </p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-primary btn-block"
                style={{ fontSize: '1.05rem', padding: '12px' }}
                onClick={() => {
                  onClose();
                  window.dispatchEvent(new CustomEvent('woodhome_open_tracking', { detail: { orderId: createdOrder.order_id } }));
                }}
              >
                🗺️ Theo dõi xe giao hàng trên bản đồ ngay
              </button>
              <button type="button" className="btn btn-outline btn-block" onClick={onClose}>
                Tiếp tục mua sắm
              </button>
            </div>
          </div>
        ) : (
          // ── Form đặt hàng ──
          <form onSubmit={handleSubmit}>
            <h4 style={{ marginBottom: '12px', color: 'var(--wood-900)' }}>1. Thông tin giao hàng</h4>
            <div className="product-form-grid">
              <input className="form-input" name="full_name" placeholder="Họ và tên người nhận *" value={form.full_name} onChange={update} required />
              <input className="form-input" name="phone" placeholder="Số điện thoại *" value={form.phone} onChange={update} required />
              <select className="form-input" name="province" value={form.province} onChange={update} required>
                <option value="TP. Hồ Chí Minh">TP. Hồ Chí Minh</option>
                <option value="Hà Nội">Hà Nội</option>
                <option value="Đà Nẵng">Đà Nẵng</option>
                <option value="Bình Dương">Bình Dương</option>
                <option value="Đồng Nai">Đồng Nai</option>
                <option value="Cần Thơ">Cần Thơ</option>
                <option value="Hải Phòng">Hải Phòng</option>
              </select>
              <input className="form-input" name="district" placeholder="Quận / Huyện *" value={form.district} onChange={update} required />
              <input className="form-input" name="ward" placeholder="Phường / Xã" value={form.ward} onChange={update} />
              <input className="form-input" name="address_detail" placeholder="Địa chỉ chi tiết (Số nhà, đường...) *" value={form.address_detail} onChange={update} required />
            </div>
            <textarea
              className="form-input"
              name="customer_note"
              placeholder="Ghi chú giao hàng (Ví dụ: Giao giờ hành chính, bốc xếp tầng 2...)"
              value={form.customer_note}
              onChange={update}
              style={{ width: '100%', marginTop: '10px', height: '60px' }}
            />

            <h4 style={{ margin: '18px 0 8px', color: 'var(--wood-900)' }}>2. Phương thức thanh toán</h4>
            <div className="payment-methods-grid">
              {[
                { id: 'cod',         icon: '💵', title: 'COD',          desc: 'Thanh toán khi nhận & kiểm tra đồ gỗ' },
                { id: 'qr_transfer', icon: '📱', title: 'VietQR',       desc: 'Quét mã chuyển khoản Napas 24/7' },
                { id: 'visa',        icon: '💳', title: 'Thẻ Quốc Tế', desc: 'Visa, Mastercard bảo mật cao' },
              ].map(pm => (
                <button
                  key={pm.id}
                  type="button"
                  className={`payment-card-opt${form.payment_method === pm.id ? ' active' : ''}`}
                  onClick={() => setPayment(pm.id)}
                >
                  <span className="payment-card-icon">{pm.icon}</span>
                  <span className="payment-card-title">{pm.title}</span>
                  <span className="payment-card-desc">{pm.desc}</span>
                </button>
              ))}
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '14px', borderRadius: '6px', margin: '16px 0' }}>
              <div className="cart-summary-line"><span>Tạm tính:</span><strong>{money(summary.subtotal)}</strong></div>
              {summary.discount > 0 && <div className="cart-summary-line" style={{ color: 'var(--success)' }}><span>Ưu đãi:</span><strong>−{money(summary.discount)}</strong></div>}
              <div className="cart-summary-line"><span>Phí vận chuyển:</span><strong>{summary.shippingFee === 0 ? 'Miễn phí' : money(summary.shippingFee)}</strong></div>
              <div className="cart-summary-line total"><span>Tổng thanh toán:</span><strong>{money(summary.total)}</strong></div>
            </div>

            {error && <p className="text-danger auth-error">{error}</p>}

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Đang tạo đơn hàng...' : `Xác Nhận Đặt Hàng (${money(summary.total)})`}
            </button>
          </form>
        )}
      </div>
    </BaseModal>
  );
}

// ─── MY ORDERS MODAL ──────────────────────────────────────────────────────────
function MyOrdersModal({ isOpen, onClose, onSelectTracking }) {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api('/orders?limit=50')
      .then(res => setOrders(res.data.orders || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen]);

  const filtered = useMemo(() => orders.filter(o => {
    if (filter === 'shipping')  return ['shipping', 'processing', 'confirmed', 'pending'].includes(o.status);
    if (filter === 'delivered') return o.status === 'delivered';
    if (filter === 'cancelled') return o.status === 'cancelled';
    return true;
  }), [orders, filter]);

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="large">
      <div className="modal-header">
        <h2>📋 Danh Sách Đơn Hàng Của Bạn</h2>
        <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="modal-body">
        <div className="orders-list-tabs">
          {[
            { key: 'all',       label: `Tất cả (${orders.length})` },
            { key: 'shipping',  label: 'Đang giao / Xử lý' },
            { key: 'delivered', label: 'Đã giao' },
            { key: 'cancelled', label: 'Đã hủy' },
          ].map(tab => (
            <button key={tab.key} className={`orders-list-tab${filter === tab.key ? ' active' : ''}`}
              onClick={() => setFilter(tab.key)}>{tab.label}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>⏳ Đang tải danh sách đơn hàng...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Không có đơn hàng nào trong mục này.</div>
        ) : filtered.map(order => (
          <div key={order.id} className="order-history-card">
            <div className="order-history-header">
              <div>
                <span className="order-number-title">#{order.order_number}</span>
                <small className="text-muted" style={{ marginLeft: '10px' }}>
                  {new Date(order.created_at).toLocaleDateString('vi-VN')} {new Date(order.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </small>
              </div>
              <StatusBadge status={order.status} />
            </div>
            <div className="order-history-content">
              <img src={order.first_item_image || FALLBACK_IMG} alt="" className="order-history-thumb" />
              <div>
                <strong style={{ color: 'var(--wood-900)' }}>{order.first_item_name || 'Đơn hàng WoodHome'}</strong>
                {order.item_count > 1 && <span className="text-muted" style={{ fontSize: '0.82rem' }}> (+{order.item_count - 1} sản phẩm)</span>}
                <div style={{ marginTop: '4px', fontSize: '0.86rem' }}>
                  PT thanh toán: <span style={{ textTransform: 'uppercase' }}>{order.payment_method}</span> ({order.payment_status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'})
                </div>
                <div style={{ marginTop: '4px', color: 'var(--wood-800)', fontWeight: 'bold' }}>
                  Tổng tiền: {money(order.total_amount)}
                </div>
              </div>
              <div className="order-history-actions">
                <button type="button" className="btn btn-sm btn-primary" onClick={() => onSelectTracking(order.id)}>
                  🗺️ Theo dõi bản đồ
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </BaseModal>
  );
}

// ─── AUTH OVERLAY ─────────────────────────────────────────────────────────────
function AuthOverlay({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [recoveryStep, setRecoveryStep] = useState(0);
  const [recovery, setRecovery] = useState({ identifier: '', user_id: '', question_id: '', answer: '', reset_token: '', new_password: '' });
  const [recoveryQuestions, setRecoveryQuestions] = useState([]);
  const [form, setForm] = useState({ email: '', password: '', full_name: '', phone: '', security_question_id: '1', security_answer: '' });
  const [error, setError] = useState('');
  const update = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const updateRecovery = e => setRecovery(f => ({ ...f, [e.target.name]: e.target.value }));

  const startRecovery = async e => {
    e.preventDefault(); setError('');
    try {
      const result = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ identifier: recovery.identifier }) });
      setRecovery(f => ({ ...f, user_id: result.data.user_id, question_id: String(result.data.questions[0]?.id || '') }));
      setRecoveryQuestions(result.data.questions || []);
      setRecoveryStep(2);
    } catch (err) { setError(err.message); }
  };

  const verifyRecovery = async e => {
    e.preventDefault(); setError('');
    try {
      const result = await api('/auth/verify-security-answer', {
        method: 'POST',
        body: JSON.stringify({ user_id: recovery.user_id, question_id: recovery.question_id, answer: recovery.answer })
      });
      setRecovery(f => ({ ...f, reset_token: result.data.reset_token }));
      setRecoveryStep(3);
    } catch (err) { setError(err.message); }
  };

  const resetRecovery = async e => {
    e.preventDefault(); setError('');
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ reset_token: recovery.reset_token, new_password: recovery.new_password })
      });
      setRecoveryStep(0);
      setMode('login');
      setForm(f => ({ ...f, password: '' }));
      setError('Đặt lại mật khẩu thành công. Bạn có thể đăng nhập.');
    } catch (err) { setError(err.message); }
  };

  const submit = async e => {
    e.preventDefault(); setError('');
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const body = mode === 'login' ? { email: form.email, password: form.password } : { ...form };
      const result = await api(endpoint, { method: 'POST', body: JSON.stringify(body) });
      localStorage.setItem('woodhome_token', result.data.token);
      localStorage.setItem('woodhome_user', JSON.stringify(result.data.user));
      onAuthenticated(result.data.user);
    } catch (err) { setError(err.message); }
  };

  const demo = email => setForm(f => ({ ...f, email, password: 'Admin@123' }));

  return (
    <div className="auth-overlay react-auth-overlay">
      <div className="auth-hero-side">
        <div className="auth-hero-content">
          <div className="auth-hero-logo">🌲 WOOD<span>HOME</span></div>
          <div className="auth-hero-text">
            <h1>Tinh Hoa Gỗ Tự Nhiên Cho Không Gian Sống</h1>
            <p>Trải nghiệm mua sắm nội thất đẳng cấp với gỗ tự nhiên được tuyển chọn khắt khe.</p>
            <ul className="auth-features-list">
              <li>✨ Giá ưu đãi thành viên</li>
              <li>💳 COD, VietQR và Bản đồ theo dõi xe</li>
              <li>🚚 Giao hàng, lắp đặt tận nơi</li>
              <li>🛡️ Bảo mật tài khoản đa lớp</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="auth-form-side">
        <form className="auth-box" onSubmit={e => {
          if (recoveryStep === 1) return startRecovery(e);
          if (recoveryStep === 2) return verifyRecovery(e);
          if (recoveryStep === 3) return resetRecovery(e);
          return submit(e);
        }}>
          <h2 className="font-serif auth-heading">{recoveryStep ? 'Khôi phục mật khẩu' : 'Chào Mừng Đến WoodHome'}</h2>
          <p className="text-muted auth-subheading">Đăng nhập để tiếp tục mua sắm</p>
          {!recoveryStep && <div className="auth-tabs">
            <button type="button" className={`auth-tab-btn${mode === 'login' ? ' active' : ''}`} onClick={() => setMode('login')}>Đăng nhập</button>
            <button type="button" className={`auth-tab-btn${mode === 'register' ? ' active' : ''}`} onClick={() => setMode('register')}>Tạo tài khoản</button>
          </div>}
          {recoveryStep === 1 && (
            <div>
              <input className="form-input form-field" name="identifier" placeholder="Email hoặc số điện thoại" value={recovery.identifier} onChange={updateRecovery} required />
              <button className="btn btn-primary btn-block" type="submit">Tiếp tục</button>
              <button type="button" className="btn btn-outline btn-block" onClick={() => setRecoveryStep(0)}>Quay lại đăng nhập</button>
            </div>
          )}
          {recoveryStep === 2 && (
            <div>
              <select className="form-input form-field" name="question_id" value={recovery.question_id} onChange={updateRecovery}>
                {recoveryQuestions.map(q => <option key={q.id} value={q.id}>{q.question}</option>)}
              </select>
              <input className="form-input form-field" name="answer" placeholder="Câu trả lời bảo mật" value={recovery.answer} onChange={updateRecovery} required />
              <button className="btn btn-primary btn-block" type="submit">Xác minh</button>
            </div>
          )}
          {recoveryStep === 3 && (
            <div>
              <input className="form-input form-field" name="new_password" type="password" placeholder="Mật khẩu mới (ít nhất 8 ký tự)" value={recovery.new_password} onChange={updateRecovery} minLength="8" required />
              <button className="btn btn-primary btn-block" type="submit">Đặt mật khẩu mới</button>
            </div>
          )}
          {error && <p className="text-danger auth-error">{error}</p>}
          {!recoveryStep && <>
          {mode === 'register' && (
            <>
              <input className="form-input form-field" name="full_name" placeholder="Họ và tên *" value={form.full_name} onChange={update} required />
              <input className="form-input form-field" name="phone" placeholder="Số điện thoại" value={form.phone} onChange={update} />
              <select className="form-input form-field" name="security_question_id" value={form.security_question_id} onChange={update}>
                <option value="1">Tên trường tiểu học của bạn?</option>
                <option value="2">Tên thú cưng đầu tiên?</option>
                <option value="3">Tên thành phố bạn sinh ra?</option>
              </select>
              <input className="form-input form-field" name="security_answer" placeholder="Câu trả lời bảo mật *" value={form.security_answer} onChange={update} required />
            </>
          )}
          <input className="form-input form-field" name="email" type="text" placeholder="Email hoặc số điện thoại" value={form.email} onChange={update} required />
          <input className="form-input form-field" name="password" type="password" placeholder="Mật khẩu" value={form.password} onChange={update} required />
          {mode === 'login' && <button type="button" className="auth-link-btn" onClick={() => { setError(''); setRecoveryStep(1); }}>Quên mật khẩu?</button>}
          <button className="btn btn-primary btn-block" type="submit">
            {mode === 'login' ? 'Đăng nhập vào cửa hàng' : 'Hoàn tất đăng ký'}
          </button>
          <div className="demo-account-box">
            <h4>Tài khoản mẫu</h4>
            <button type="button" className="demo-pill-btn" onClick={() => demo('khachhang@gmail.com')}>Khách hàng</button>
            <button type="button" className="demo-pill-btn" onClick={() => demo('staff@woodhome.vn')}>Nhân viên bán hàng</button>
            <button type="button" className="demo-pill-btn" onClick={() => demo('admin@woodhome.vn')}>Admin</button>
          </div>
          </>}
        </form>
      </div>
    </div>
  );
}

// ─── HEADER ───────────────────────────────────────────────────────────────────
function Header({ user, onLogout, cartCount, onOpenCart, onOpenOrders }) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Đóng dropdown khi click ngoài
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <>
      <aside className="announcement-bar">
        <div className="container">
          ✨ <strong>ĐẶC QUYỀN WOODHOME:</strong> Miễn phí vận chuyển từ 5.000.000đ &amp; Theo dõi xe giao hàng trực tuyến trên bản đồ
        </div>
      </aside>
      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" className="header-logo">🌲 WOOD<span>HOME</span></Link>
          <div className="header-actions">
            <button className="icon-btn" onClick={onOpenOrders} title="Đơn hàng & Theo dõi bản đồ">📋</button>
            <button className="icon-btn" onClick={onOpenCart} title="Giỏ hàng">
              🛒<span className="icon-badge">{cartCount}</span>
            </button>
            <div className="user-menu-wrap" onMouseDown={e => e.stopPropagation()}>
              <button type="button" className="user-avatar-btn" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen}>
                <img src={user?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80'} className="user-avatar-img" alt="avatar" />
                <span><strong>{user?.full_name}</strong><small>{ROLES[user?.role_id]}</small></span>
                <span aria-hidden="true">▾</span>
              </button>
              {menuOpen && (
                <div className="react-user-links">
                  {Number(user?.role_id) >= 2 && <a href="/admin.html">⚙️ Admin</a>}
                  {Number(user?.role_id) === 2 && <a href="/support.html">💬 Hỗ trợ khách</a>}
                  <button type="button" onClick={() => { setMenuOpen(false); onOpenOrders(); }}>📋 Đơn hàng & Bản đồ</button>
                  <button type="button" onClick={() => { setMenuOpen(false); onLogout(); }}>Đăng xuất</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

// ─── STOREFRONT ───────────────────────────────────────────────────────────────
function Storefront() {
  const [user, setUser] = useState(readUser());
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('newest');

  // Modal states
  const [cart, setCart] = useState({ items: [] });
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutSummary, setCheckoutSummary] = useState({ subtotal: 0, discount: 0, shippingFee: 0, total: 0 });
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [trackingOrderId, setTrackingOrderId] = useState(null);

  // AI Chat
  const [aiOpen, setAiOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [lightboxImg, setLightboxImg] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef(null);
  const [supportConversationId, setSupportConversationId] = useState(
    () => Number(localStorage.getItem('woodhome_support_conversation') || 0) || null
  );
  const [chat, setChat] = useState([{ sender: 'ai', text: 'Xin chào, mình có thể tư vấn sản phẩm và chính sách cho bạn.' }]);

  const openCheckout = useCallback(summary => {
    setCheckoutSummary(summary);
    setCartOpen(false);
    window.setTimeout(() => setCheckoutOpen(true), 0);
  }, []);

  const refreshCart = useCallback(() => {
    api('/cart').then(res => setCart(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([api('/products?limit=100'), api('/products/categories')])
      .then(([pr, cr]) => { setProducts(pr.data.products || []); setCategories(cr.data || []); })
      .catch(console.error);
    refreshCart();
  }, [user, refreshCart]);

  // Lắng nghe sự kiện mở tracking từ CheckoutModal
  useEffect(() => {
    const handler = e => { if (e.detail?.orderId) setTrackingOrderId(e.detail.orderId); };
    window.addEventListener('woodhome_open_tracking', handler);
    return () => window.removeEventListener('woodhome_open_tracking', handler);
  }, []);

  // Đồng bộ chat hỗ trợ
  const syncConversation = useCallback(async () => {
    if (!supportConversationId) return;
    try {
      const res = await api(`/ai/conversations/${supportConversationId}`);
      setChat(res.data.messages.map(m => ({ sender: m.sender, text: m.message, image_url: m.image_url })));
    } catch (err) {
      if (err.message.includes('không tồn tại')) {
        localStorage.removeItem('woodhome_support_conversation');
        setSupportConversationId(null);
      }
    }
  }, [supportConversationId]);

  useEffect(() => { syncConversation(); }, [syncConversation]);
  useEffect(() => {
    if (!aiOpen || !supportConversationId) return;
    const timer = setInterval(syncConversation, 3000);
    return () => clearInterval(timer);
  }, [aiOpen, syncConversation]);

  const visible = useMemo(() => {
    return products
      .filter(p =>
        (category === 'all' || p.category_slug === category) &&
        (!query || `${p.name} ${p.material || ''}`.toLowerCase().includes(query.toLowerCase()))
      )
      .sort((a, b) => {
        if (sort === 'price_asc')   return (a.sale_price || a.price) - (b.sale_price || b.price);
        if (sort === 'price_desc')  return (b.sale_price || b.price) - (a.sale_price || a.price);
        if (sort === 'bestseller')  return (b.sold_count || 0) - (a.sold_count || 0);
        return 0;
      });
  }, [products, query, category, sort]);

  const addCart = async id => {
    try {
      await api('/cart', { method: 'POST', body: JSON.stringify({ product_id: id, quantity: 1 }) });
      refreshCart();
      setCartOpen(true);
    } catch (err) { alert(err.message); }
  };

  const handleFileChange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setSelectedImage(await readImageAsDataUrl(file)); }
    catch (err) { alert(err.message); }
    finally { e.target.value = ''; }
  };

  const handlePaste = async e => {
    for (const item of e.clipboardData?.items || []) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          try { setSelectedImage(await readImageAsDataUrl(file)); } catch (err) { console.error(err); }
        }
        break;
      }
    }
  };

  const sendChat = async e => {
    e.preventDefault();
    const text = message.trim();
    if (!text && !selectedImage) return;
    const img = selectedImage;
    setMessage(''); setSelectedImage(null); setIsSending(true);
    setChat(c => [...c, { sender: 'customer', text, image_url: img }, { sender: 'ai', text: 'Đang tư vấn...' }]);
    try {
      const res = await api('/ai/chat', { method: 'POST', body: JSON.stringify({ message: text, image_url: img || undefined, conversation_id: supportConversationId }) });
      setSupportConversationId(res.data.conversation_id);
      localStorage.setItem('woodhome_support_conversation', String(res.data.conversation_id));
      setChat(res.data.messages.map(m => ({ sender: m.sender, text: m.message, image_url: m.image_url })));
    } catch (err) {
      setChat(c => [...c.slice(0, -1), { sender: 'ai', text: err.message }]);
    } finally { setIsSending(false); }
  };

  const logout = () => {
    localStorage.removeItem('woodhome_token');
    localStorage.removeItem('woodhome_user');
    localStorage.removeItem('woodhome_support_conversation');
    setUser(null);
    window.location.replace('/');
  };

  if (!user) return <AuthOverlay onAuthenticated={setUser} />;

  return (
    <>
      <Header
        user={user}
        onLogout={logout}
        cartCount={(cart.items || []).reduce((s, i) => s + i.quantity, 0)}
        onOpenCart={() => setCartOpen(true)}
        onOpenOrders={() => setOrdersOpen(true)}
      />

      <main>
        <section className="hero-slider react-hero">
          <div className="hero-content container">
            <span className="section-subtitle">NỘI THẤT GỖ TỰ NHIÊN</span>
            <h1>Sống cùng những đường vân có câu chuyện</h1>
            <p>Thiết kế bền vững cho căn nhà có chiều sâu và cá tính. Theo dõi lộ trình xe giao hàng thời gian thực.</p>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-header">
              <span className="section-subtitle">DANH MỤC NỘI THẤT</span>
              <h2 className="section-title">Bộ Sưu Tập Gỗ Tự Nhiên</h2>
            </div>
            <div className="categories-bar">
              <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>Tất cả</button>
              {categories.map(c => (
                <button key={c.slug} className={category === c.slug ? 'active' : ''} onClick={() => setCategory(c.slug)}>{c.name}</button>
              ))}
            </div>

            <div className="react-toolbar">
              <input className="form-input" placeholder="Tìm sản phẩm..." value={query} onChange={e => setQuery(e.target.value)} />
              <select className="form-input" value={sort} onChange={e => setSort(e.target.value)}>
                <option value="newest">Mới nhất</option>
                <option value="bestseller">Bán chạy</option>
                <option value="price_asc">Giá tăng dần</option>
                <option value="price_desc">Giá giảm dần</option>
              </select>
            </div>

            <div className="product-grid">
              {visible.map(p => (
                <article className="product-card" key={p.id}
                  onClick={() => window.location.href = `/product.html?slug=${encodeURIComponent(p.slug)}`}>
                  <div className="product-thumb-wrap">
                    <img className="product-thumb" src={p.primary_image || FALLBACK_IMG} alt={p.name} />
                    <div className="product-badges">
                      {p.is_featured && <span className="badge badge-gold">Nổi bật</span>}
                    </div>
                  </div>
                  <div className="product-body">
                    <span className="product-category">{p.category_name || 'Nội thất gỗ'}</span>
                    <h3 className="product-name">{p.name}</h3>
                    <p className="product-specs">🌲 {p.material || 'Gỗ tự nhiên'} | 📐 {p.dimensions || 'Tiêu chuẩn'}</p>
                    <div className="product-rating">
                      <span className="stars">★★★★★</span> <span className="text-muted">({p.average_rating || 5})</span>
                    </div>
                    <div className="product-price-row">
                      <span className="price-current">{money(p.sale_price || p.price)}</span>
                      {p.sale_price && <span className="price-old">{money(p.price)}</span>}
                    </div>
                    <button className="btn btn-primary btn-block"
                      onClick={e => { e.stopPropagation(); addCart(p.id); }}>
                      Thêm giỏ
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onCartChange={setCart}
        onCheckout={openCheckout}
      />

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        summary={checkoutSummary}
        user={user}
        onOrderSuccess={refreshCart}
      />

      <MyOrdersModal
        isOpen={ordersOpen}
        onClose={() => setOrdersOpen(false)}
        onSelectTracking={id => { setOrdersOpen(false); setTrackingOrderId(id); }}
      />

      {trackingOrderId && (
        <OrderTrackingModal orderId={trackingOrderId} onClose={() => setTrackingOrderId(null)} />
      )}

      {/* AI Chat Messenger (chỉ hiện với khách hàng) */}
      {Number(user.role_id) === 1 && (
        <>
          <button className="messenger-launcher" onClick={() => setAiOpen(o => !o)} aria-label="Mở trợ lý AI">
            <img className="messenger-icon" src="/images/consultant-chat.png" alt="" />
            <span className="messenger-status" />
            <span className="messenger-label">Chat với WoodHome AI</span>
          </button>
          {aiOpen && (
            <aside className="support-chat open">
              <div className="support-chat-header">
                <strong>Trợ lý WoodHome</strong>
                <button type="button" onClick={() => setAiOpen(false)}>×</button>
              </div>
              <div className="support-chat-messages">
                {chat.map((item, idx) => (
                  <div key={idx} className={`support-message support-message-${item.sender}`}>
                    {item.image_url && <img src={item.image_url} alt="Đính kèm" className="chat-attached-image" onClick={() => setLightboxImg(item.image_url)} />}
                    {item.text && <div>{item.text}</div>}
                  </div>
                ))}
              </div>
              {selectedImage && (
                <div className="chat-image-preview-bar">
                  <div className="chat-preview-item">
                    <img src={selectedImage} alt="Ảnh chuẩn bị gửi" className="chat-preview-thumb" />
                    <button type="button" className="chat-remove-image-btn" onClick={() => setSelectedImage(null)}>✕</button>
                  </div>
                  <span className="chat-preview-hint">Đã chọn 1 ảnh (nhấn nút gửi để gửi kèm)</span>
                </div>
              )}
              <form className="support-chat-form" onSubmit={sendChat}>
                <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
                <button type="button" className="chat-attach-btn" onClick={() => fileInputRef.current?.click()}>📷</button>
                <input value={message} onChange={e => setMessage(e.target.value)} onPaste={handlePaste} placeholder="Bạn cần tư vấn gì?..." />
                <button type="submit" disabled={isSending}>→</button>
              </form>
            </aside>
          )}
          <ImageModal src={lightboxImg} onClose={() => setLightboxImg(null)} />
        </>
      )}
    </>
  );
}

// ─── PRODUCT DETAIL PAGE ──────────────────────────────────────────────────────
function ProductPage() {
  const slug = new URLSearchParams(useLocation().search).get('slug');
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState({ items: [] });
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutSummary, setCheckoutSummary] = useState({ subtotal: 0, discount: 0, shippingFee: 0, total: 0 });
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [trackingOrderId, setTrackingOrderId] = useState(null);
  const user = readUser();

  const openCheckout = useCallback(summary => {
    setCheckoutSummary(summary);
    setCartOpen(false);
    window.setTimeout(() => setCheckoutOpen(true), 0);
  }, []);

  const refreshCart = useCallback(() => {
    if (user) api('/cart').then(res => setCart(res.data)).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (slug) api(`/products/${encodeURIComponent(slug)}`)
      .then(res => setProduct(res.data))
      .catch(err => setProduct({ error: err.message }));
    refreshCart();
  }, [slug, refreshCart]);

  if (!product) return <div className="detail-error">Đang tải thông tin sản phẩm...</div>;
  if (product.error) return <div className="detail-error"><h1>{product.error}</h1><Link to="/">Về cửa hàng</Link></div>;

  const add = async () => {
    if (!localStorage.getItem('woodhome_token')) return window.location.href = '/';
    try {
      await api('/cart', { method: 'POST', body: JSON.stringify({ product_id: product.id, quantity }) });
      refreshCart(); setCartOpen(true);
    } catch (err) { alert(err.message); }
  };

  return (
    <>
      {user && (
        <Header
          user={user}
          onLogout={() => { localStorage.clear(); window.location.replace('/'); }}
          cartCount={(cart.items || []).reduce((s, i) => s + i.quantity, 0)}
          onOpenCart={() => setCartOpen(true)}
          onOpenOrders={() => setOrdersOpen(true)}
        />
      )}
      <main className="detail-page">
        <div className="container">
          <nav className="detail-nav">
            <Link to="/">← Quay lại cửa hàng</Link>
            <strong className="font-serif">WOOD<span className="text-gold">HOME</span></strong>
          </nav>
          <section className="detail-layout">
            <div>
              <img className="detail-main-image" src={product.images?.[0]?.image_url || FALLBACK_IMG} alt={product.name} />
              <div className="detail-thumbs">
                {(product.images || []).map(img => (
                  <img key={img.id} className="detail-thumb" src={img.image_url} alt=""
                    onClick={e => e.currentTarget.parentElement.previousElementSibling.src = img.image_url} />
                ))}
              </div>
            </div>
            <div className="detail-copy">
              <span className="badge badge-wood">{product.category_name || 'Nội thất gỗ'}</span>
              <h1>{product.name}</h1>
              <div className="product-rating">
                <span className="stars">★★★★★</span> <span className="text-muted">{product.average_rating || 5} ({product.review_count || 0} đánh giá)</span>
              </div>
              <div className="product-price-row">
                <span className="price-current">{money(product.sale_price || product.price)}</span>
                {product.sale_price && <span className="price-old">{money(product.price)}</span>}
              </div>
              <p className="detail-description">{product.description || product.short_description || 'Sản phẩm nội thất được tuyển chọn từ gỗ tự nhiên.'}</p>
              <div className="detail-specs">
                <div><span>Chất liệu</span><strong>{product.material || 'Gỗ tự nhiên'}</strong></div>
                <div><span>Kích thước</span><strong>{product.dimensions || 'Tiêu chuẩn'}</strong></div>
                <div><span>Màu sắc</span><strong>{product.color || 'Tự nhiên'}</strong></div>
                <div><span>Bảo hành</span><strong>{product.warranty_months || 12} tháng</strong></div>
              </div>
              <div className="detail-buy">
                <input type="number" min="1" max={product.stock_quantity || 1} value={quantity} onChange={e => setQuantity(Number(e.target.value))} />
                <button className="btn btn-primary" onClick={add}>Thêm vào giỏ hàng</button>
              </div>
              <p className="text-muted">{product.stock_quantity > 0 ? `Còn ${product.stock_quantity} sản phẩm trong kho` : 'Tạm hết hàng'}</p>
            </div>
          </section>

          <section className="detail-section">
            <h2>Đánh giá khách hàng</h2>
            {product.reviews?.length ? product.reviews.map(r => (
              <article className="detail-review" key={r.id}>
                <strong>{r.full_name}</strong> <span className="text-gold">{'★'.repeat(r.rating)}</span>
                <p>{r.content}</p>
              </article>
            )) : <p className="text-muted">Chưa có đánh giá cho sản phẩm này.</p>}
          </section>

          <section className="detail-section">
            <h2>Sản phẩm liên quan</h2>
            <div className="detail-related">
              {(product.related_products || []).map(item => (
                <Link className="related-card" key={item.id} to={`/product.html?slug=${item.slug}`}>
                  <img src={item.primary_image || FALLBACK_IMG} alt={item.name} />
                  <span>{item.name}</span>
                  <small className="text-gold">{money(item.sale_price || item.price)}</small>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>

      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onCartChange={setCart}
        onCheckout={openCheckout}
      />
      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        summary={checkoutSummary}
        user={user}
        onOrderSuccess={refreshCart}
      />
      <MyOrdersModal
        isOpen={ordersOpen}
        onClose={() => setOrdersOpen(false)}
        onSelectTracking={id => { setOrdersOpen(false); setTrackingOrderId(id); }}
      />
      {trackingOrderId && <OrderTrackingModal orderId={trackingOrderId} onClose={() => setTrackingOrderId(null)} />}
    </>
  );
}

// ─── ADMIN PAGE ───────────────────────────────────────────────────────────────
function AdminPage() {
  const user = readUser();
  const [view, setView] = useState('dashboard');
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [trackingOrderId, setTrackingOrderId] = useState(null);

  useEffect(() => {
    if (!user || Number(user.role_id) < 2) window.location.href = '/';
  }, [user]);

  const load = useCallback(async endpoint => {
    try { const res = await api(endpoint); setData(res.data); }
    catch (err) { setData({ error: err.message }); }
  }, []);

  useEffect(() => {
    if (view === 'dashboard') load('/admin/dashboard');
    if (view === 'products') {
      load('/products/admin/list?limit=100');
      api('/products/categories').then(res => setCategories(res.data || [])).catch(() => {});
    }
    if (view === 'orders') load('/admin/orders?limit=100');
    if (view === 'users') api('/users/admin/users?limit=100').then(res => setUsers(res.data.users || [])).catch(() => {});
  }, [view, load]);

  if (!user || Number(user.role_id) < 2) return null;

  const roleChange = async (id, role_id) => {
    await api(`/users/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ role_id: Number(role_id), is_active: 1 }) });
    setUsers(users.map(u => u.id === id ? { ...u, role_id: Number(role_id) } : u));
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      await api(`/admin/orders/${orderId}/status`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
      alert(`Đã cập nhật trạng thái đơn #${orderId} sang ${STATUS_MAP[newStatus]?.label || newStatus}.`);
      load('/admin/orders?limit=100');
    } catch (err) { alert(err.message); }
  };

  const saveProduct = async form => {
    try {
      const endpoint = editingProduct?.id ? `/products/admin/${editingProduct.id}` : '/products/admin/create';
      await api(endpoint, { method: editingProduct?.id ? 'PUT' : 'POST', body: JSON.stringify(form) });
      setEditingProduct(null);
      await load('/products/admin/list?limit=100');
      alert(editingProduct?.id ? 'Đã cập nhật sản phẩm.' : 'Đã thêm sản phẩm.');
    } catch (err) { alert(err.message); }
  };

  const removeProduct = async p => {
    if (!window.confirm(`Xóa sản phẩm "${p.name}"?`)) return;
    try {
      const res = await api(`/products/admin/${p.id}`, { method: 'DELETE' });
      await load('/products/admin/list?limit=100');
      alert(res.message || 'Đã xóa sản phẩm.');
    } catch (err) { alert(err.message); }
  };

  const adjustStock = async product => {
    const change = Number(window.prompt(`Nhập số lượng thay đổi cho "${product.name}" (âm để xuất kho):`, '1'));
    if (!Number.isInteger(change) || change === 0) return;
    try {
      await api(`/products/admin/${product.id}/stock`, {
        method: 'PUT',
        body: JSON.stringify({ quantity_change: change, note: 'Điều chỉnh bởi nhân viên kho' })
      });
      await load('/products/admin/list?limit=100');
    } catch (err) { alert(err.message); }
  };

  const viewLabels = { dashboard: 'Tổng quan', products: 'Quản lý sản phẩm', orders: 'Quản lý đơn hàng & Vận chuyển', users: 'Phân quyền tài khoản' };

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="admin-brand">WOOD<span className="text-gold">HOME</span></div>
        <nav>
          {['dashboard', 'products', 'orders'].map(v => (
            <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{viewLabels[v]}</button>
          ))}
          {Number(user.role_id) === 4 && (
            <button className={view === 'users' ? 'active' : ''} onClick={() => setView('users')}>{viewLabels.users}</button>
          )}
        </nav>
        <a href="/">← Về cửa hàng</a>
      </aside>

      <main className="admin-main">
        <header className="admin-top">
          <h1>{viewLabels[view]}</h1>
          <span className="text-muted">{user.full_name} · {ROLES[user.role_id]}</span>
        </header>

        {view === 'dashboard' && (
          <div className="admin-cards">
            <div className="admin-stat"><small>Doanh thu hôm nay</small><strong>{money(data?.stats?.revenue_today)}</strong></div>
            <div className="admin-stat"><small>Doanh thu tháng</small><strong>{money(data?.stats?.revenue_month)}</strong></div>
            <div className="admin-stat"><small>Đơn hôm nay</small><strong>{data?.stats?.orders_today || 0}</strong></div>
            <div className="admin-stat"><small>Đơn chờ xử lý</small><strong>{data?.stats?.pending_orders || 0}</strong></div>
          </div>
        )}

        {view === 'products' && (
          <>
            <div className="admin-product-toolbar">
              {Number(user.role_id) === 4 && (
                <button className="btn btn-primary" onClick={() => setEditingProduct({})}>+ Thêm sản phẩm</button>
              )}
            </div>
            {editingProduct && (
              <ProductForm
                product={editingProduct}
                categories={categories}
                onSave={saveProduct}
                onCancel={() => setEditingProduct(null)}
              />
            )}
            <div className="admin-panel">
              <table>
                <thead>
                  <tr><th>Ảnh</th><th>Sản phẩm</th><th>Danh mục</th><th>Giá</th><th>Tồn kho</th>{Number(user.role_id) >= 3 && <th>Thao tác</th>}</tr>
                </thead>
                <tbody>
                  {(data?.products || []).map(row => (
                    <tr key={row.id}>
                      <td><img className="admin-product-img" src={row.primary_image || FALLBACK_IMG} alt="" /></td>
                      <td>{row.name}<br /><small>{row.sku}</small></td>
                      <td>{row.category_name}</td>
                      <td>{money(row.sale_price || row.price)}</td>
                      <td>{row.stock_quantity}</td>
                      {Number(user.role_id) === 4 && (
                        <td className="admin-actions">
                          <button className="btn btn-sm btn-outline" onClick={() => setEditingProduct(row)}>Sửa</button>
                          <button className="btn btn-sm btn-danger" onClick={() => removeProduct(row)}>Xóa</button>
                        </td>
                      )}
                      {Number(user.role_id) === 3 && (
                        <td className="admin-actions">
                          <button className="btn btn-sm btn-outline" onClick={() => adjustStock(row)}>Điều chỉnh kho</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {view === 'orders' && (
          <div className="admin-panel">
            <table>
              <thead>
                <tr><th>Mã đơn</th><th>Khách hàng</th><th>Tổng tiền</th><th>PT</th><th>Trạng thái</th><th>Cập nhật</th><th>Bản đồ</th></tr>
              </thead>
              <tbody>
                {(data?.orders || []).map(row => (
                  <tr key={row.id}>
                    <td><strong>#{row.order_number || row.id}</strong><br /><small className="text-muted">{new Date(row.created_at).toLocaleDateString('vi-VN')}</small></td>
                    <td>{row.customer_name || 'Khách hàng'}<br /><small className="text-muted">{row.shipping_phone}</small></td>
                    <td><strong>{money(row.total_amount)}</strong></td>
                    <td><span style={{ textTransform: 'uppercase' }}>{row.payment_method}</span></td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>
                      <select className="form-input" style={{ padding: '4px 8px', fontSize: '0.82rem' }}
                        value={row.status} onChange={e => handleUpdateOrderStatus(row.id, e.target.value)}>
                        <option value="pending">Chờ xác nhận</option>
                        <option value="confirmed">Đã xác nhận</option>
                        <option value="processing">Đang đóng gói</option>
                        <option value="shipping">Đang vận chuyển</option>
                        <option value="delivered">Đã giao thành công</option>
                        <option value="cancelled">Hủy đơn</option>
                      </select>
                    </td>
                    <td>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => setTrackingOrderId(row.id)}>🗺️ Bản đồ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === 'users' && (
          <div className="admin-panel">
            <p className="admin-message">Chỉ admin được thay đổi vai trò.</p>
            <table>
              <thead><tr><th>Email</th><th>Họ tên</th><th>Vai trò</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.full_name}</td>
                    <td>
                      <select className="form-input" value={u.role_id} onChange={e => roleChange(u.id, e.target.value)}>
                        <option value="1">Khách hàng</option>
                        <option value="2">Nhân viên bán hàng</option>
                        <option value="4">Admin</option>
                      </select>
                    </td>
                    <td>{Number(u.is_active) ? 'Hoạt động' : 'Đã khóa'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {trackingOrderId && <OrderTrackingModal orderId={trackingOrderId} onClose={() => setTrackingOrderId(null)} />}
    </div>
  );
}

// ─── PRODUCT FORM (Admin) ─────────────────────────────────────────────────────
function ProductForm({ product, categories, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: product.name || '',
    sku: product.sku || '',
    slug: product.slug || '',
    category_id: product.category_id || categories[0]?.id || 1,
    price: product.price || '',
    sale_price: product.sale_price || '',
    stock_quantity: product.stock_quantity || 0,
    material: product.material || '',
    dimensions: product.dimensions || '',
    color: product.color || '',
    warranty_months: product.warranty_months || 12,
    short_description: product.short_description || '',
    description: product.description || '',
    image_url: product.primary_image || '',
    is_featured: Number(product.is_featured) || 0,
    is_active: product.is_active === undefined ? 1 : Number(product.is_active),
  });

  const update = e => setForm(f => ({
    ...f,
    [e.target.name]: e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : e.target.value,
  }));

  return (
    <div className="admin-panel product-form">
      <h3>{product.id ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h3>
      <div className="product-form-grid">
        <input className="form-input" name="name" placeholder="Tên sản phẩm *" value={form.name} onChange={update} required />
        <input className="form-input" name="sku" placeholder="Mã SKU" value={form.sku} onChange={update} />
        <input className="form-input" name="price" type="number" placeholder="Giá *" value={form.price} onChange={update} required />
        <input className="form-input" name="sale_price" type="number" placeholder="Giá khuyến mãi" value={form.sale_price} onChange={update} />
        <input className="form-input" name="stock_quantity" type="number" min="0" placeholder="Tồn kho" value={form.stock_quantity} onChange={update} />
        <select className="form-input" name="category_id" value={form.category_id} onChange={update}>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="form-input" name="material" placeholder="Chất liệu" value={form.material} onChange={update} />
        <input className="form-input" name="dimensions" placeholder="Kích thước" value={form.dimensions} onChange={update} />
        <input className="form-input" name="color" placeholder="Màu sắc" value={form.color} onChange={update} />
        <input className="form-input" name="warranty_months" type="number" min="0" placeholder="Bảo hành (tháng)" value={form.warranty_months} onChange={update} />
        <input className="form-input product-form-wide" name="image_url" placeholder="URL ảnh đại diện" value={form.image_url} onChange={update} />
        <textarea className="form-input product-form-wide" name="short_description" placeholder="Mô tả ngắn" value={form.short_description} onChange={update} />
        <textarea className="form-input product-form-wide" name="description" placeholder="Mô tả chi tiết" value={form.description} onChange={update} />
      </div>
      <label className="admin-checkbox"><input type="checkbox" name="is_featured" checked={Boolean(form.is_featured)} onChange={update} /> Sản phẩm nổi bật</label>
      {product.id && <label className="admin-checkbox"><input type="checkbox" name="is_active" checked={Boolean(form.is_active)} onChange={update} /> Đang hiển thị</label>}
      <div className="product-form-actions">
        <button className="btn btn-primary" onClick={() => onSave(form)}>{product.id ? 'Lưu thay đổi' : 'Thêm sản phẩm'}</button>
        <button className="btn btn-outline" onClick={onCancel}>Hủy</button>
      </div>
    </div>
  );
}

// ─── SUPPORT PAGE (Staff) ─────────────────────────────────────────────────────
function SupportPage() {
  const user = readUser();
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [reply, setReply] = useState('');

  const refresh = useCallback(() => {
    api('/ai/conversations').then(res => setConversations(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user || Number(user.role_id) !== 2) { window.location.href = '/'; return; }
    refresh();
  }, [user, refresh]);

  const select = id => api(`/ai/conversations/${id}`).then(res => setActive(res.data));

  const send = async e => {
    e.preventDefault();
    if (!reply.trim() || !active) return;
    await api(`/ai/conversations/${active.id}/messages`, { method: 'POST', body: JSON.stringify({ message: reply }) });
    setReply(''); select(active.id); refresh();
  };

  if (!user || Number(user.role_id) !== 2) return null;

  return (
    <div className="support-shell">
      <aside className="support-list">
        <div className="support-brand">WOOD<span className="text-gold">HOME</span></div>
        <h1>Hỗ trợ khách hàng</h1>
        {conversations.map(c => (
          <button className={`conversation-item${active?.id === c.id ? ' active' : ''}`} key={c.id} onClick={() => select(c.id)}>
            <strong>{c.customer_name}</strong>
            <small>{c.last_message?.message}</small>
          </button>
        ))}
        <a href="/">← Về cửa hàng</a>
      </aside>
      <main className="support-main">
        <header className="support-top">
          <h2>{active ? `Hỗ trợ: ${active.customer_name}` : 'Chọn một hội thoại'}</h2>
          <span className="text-muted">{user.full_name} · Nhân viên bán hàng</span>
        </header>
        <section className="conversation-panel">
          <div className="conversation-messages">
            {active ? active.messages.map(m => (
              <div className={`support-bubble${m.sender === 'staff' ? ' staff' : ''}`} key={m.id}>
                <small>{m.sender_name}</small>
                {m.message}
              </div>
            )) : <p className="text-muted">Chọn hội thoại bên trái.</p>}
          </div>
          {active && (
            <form className="support-compose" onSubmit={send}>
              <input className="form-input" value={reply} onChange={e => setReply(e.target.value)} placeholder="Nhập câu trả lời..." />
              <button className="btn btn-primary">Gửi</button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

// ─── APP ROUTER ───────────────────────────────────────────────────────────────
function App() {
  const { pathname } = useLocation();
  if (pathname === '/admin'   || pathname === '/admin.html')   return <AdminPage />;
  if (pathname === '/support' || pathname === '/support.html') return <SupportPage />;
  if (pathname === '/product' || pathname === '/product.html') return <ProductPage />;
  return <Storefront />;
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
