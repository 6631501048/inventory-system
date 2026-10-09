'use strict';

/* ---------- ตัวช่วย ---------- */

// สร้าง element แบบปลอดภัย: ข้อความทั้งหมดใส่ผ่าน textContent จึงไม่เกิด XSS จากชื่อสินค้า/เหตุผล
function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

const $ = (sel) => document.querySelector(sel);

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });
const integer = new Intl.NumberFormat('th-TH');
const dateFmt = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' });

class ApiError extends Error {
  constructor(status, error) {
    super((error && error.message) || 'เกิดข้อผิดพลาด');
    this.status = status;
    this.code = error && error.code;
    this.details = error && error.details;
  }
}

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, { message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบว่า API ทำงานอยู่แล้วลองอีกครั้ง' });
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body && body.error);
  return body;
}

function toast(message, type = 'ok') {
  const t = h('div', { class: `toast ${type === 'error' ? 'error' : ''}`, text: message });
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 3500);
}

function setError(node, message) {
  node.textContent = message || '';
  node.hidden = !message;
}

/* ---------- ธีม (สว่าง/มืด) ---------- */

const THEME_KEY = 'theme';
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
const themeToggle = $('#themeToggle');

function savedTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null; // เช่น โหมดส่วนตัวที่บล็อก storage ใช้ค่าตามระบบแทน
  }
}

function currentTheme() {
  return document.documentElement.dataset.theme || (prefersDark.matches ? 'dark' : 'light');
}

function syncThemeSwitch() {
  themeToggle.setAttribute('aria-checked', String(currentTheme() === 'dark'));
}

themeToggle.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  const root = document.documentElement;
  root.classList.add('theme-changing');
  root.dataset.theme = next;
  setTimeout(() => root.classList.remove('theme-changing'), 200);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* จำค่าไม่ได้ก็ยังสลับได้ในหน้านี้ */
  }
  syncThemeSwitch();
});

// ถ้าผู้ใช้ยังไม่เคยเลือกเอง ให้ตามระบบเมื่อระบบเปลี่ยนโหมด
prefersDark.addEventListener('change', () => {
  if (!savedTheme()) syncThemeSwitch();
});
syncThemeSwitch();

/* ---------- state ---------- */

const state = {
  page: 1,
  limit: 10,
  search: '',
  category: '',
  threshold: 5,
  requestId: 0,
  categories: [],
  adjusting: null,
  history: { product: null, page: 1, totalPages: 1 },
};

/* ---------- หมวดหมู่ ---------- */

async function loadCategories() {
  const { data } = await api('/api/categories');
  state.categories = data;

  const filter = $('#categoryFilter');
  filter.replaceChildren(
    h('option', { value: '', text: 'ทุกหมวดหมู่' }),
    ...data.map((c) => h('option', { value: c.id, text: c.name }))
  );
  $('#addCategory').replaceChildren(
    h('option', { value: '', text: 'เลือกหมวดหมู่' }),
    ...data.map((c) => h('option', { value: c.id, text: c.name }))
  );
}

/* ---------- รายการสินค้า ---------- */

function stockCell(p) {
  const isLow = p.stock_quantity < state.threshold;
  const cell = h('span', { class: `stock-cell ${isLow ? 'low' : ''} ${p.stock_quantity === 0 ? 'empty-stock' : ''}` });

  if (isLow) {
    const pips = h('span', { class: 'pips', 'aria-hidden': 'true' });
    for (let i = 0; i < state.threshold - 1; i++) {
      pips.append(h('span', { class: `pip ${i < p.stock_quantity ? 'on' : ''}` }));
    }
    cell.append(
      pips,
      h('span', { class: 'qty', text: integer.format(p.stock_quantity) }),
      h('span', { class: `tag ${p.stock_quantity === 0 ? 'out' : ''}`, text: p.stock_quantity === 0 ? 'หมด' : 'ใกล้หมด' })
    );
  } else {
    cell.append(h('span', { class: 'qty', text: integer.format(p.stock_quantity) }));
  }
  return cell;
}

function productRow(p) {
  return h(
    'tr',
    {},
    h('td', { class: 'name-cell' }, h('div', { class: 'pname', text: p.name }), h('div', { class: 'sku', text: p.sku })),
    h('td', { 'data-label': 'หมวดหมู่', text: p.category_name }),
    h('td', { class: 'num', 'data-label': 'ราคาทุน', text: money.format(p.cost_price) }),
    h('td', { class: 'num', 'data-label': 'คงเหลือ' }, stockCell(p)),
    h(
      'td',
      { class: 'act-cell' },
      h(
        'div',
        { class: 'row-actions' },
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openAdjust(p) }, 'ปรับสต็อก'),
        h('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: () => openHistory(p) }, 'ประวัติ')
      )
    )
  );
}

function stateRow(message, retry) {
  return h(
    'tr',
    { class: 'state-row' },
    h(
      'td',
      { colspan: '5' },
      h('div', { text: message }),
      retry && h('button', { class: 'btn btn-quiet', type: 'button', onclick: retry }, 'ลองอีกครั้ง')
    )
  );
}

async function loadProducts() {
  const id = ++state.requestId; // ทิ้งผลของคำขอเก่าที่ตอบช้ากว่า
  const qs = new URLSearchParams({ page: state.page, limit: state.limit });
  if (state.search) qs.set('search', state.search);
  if (state.category) qs.set('category_id', state.category);

  try {
    const { data, meta } = await api(`/api/products?${qs}`);
    if (id !== state.requestId) return;

    const filtered = state.search || state.category;
    $('#rows').replaceChildren(
      ...(data.length
        ? data.map(productRow)
        : [stateRow(filtered ? 'ไม่พบสินค้าที่ตรงกับเงื่อนไข ลองเปลี่ยนคำค้นหาหรือหมวดหมู่' : 'ยังไม่มีสินค้า เริ่มจากกด “เพิ่มสินค้า”')])
    );
    $('#summary').textContent = filtered
      ? `พบ ${integer.format(meta.total)} รายการ`
      : `สินค้าทั้งหมด ${integer.format(meta.total)} รายการ`;

    $('#pager').hidden = meta.total_pages <= 1;
    $('#pageInfo').textContent = `หน้า ${meta.page} จาก ${meta.total_pages}`;
    $('#prev').disabled = meta.page <= 1;
    $('#next').disabled = meta.page >= meta.total_pages;
  } catch (err) {
    if (id !== state.requestId) return;
    $('#rows').replaceChildren(stateRow(`โหลดรายการไม่สำเร็จ: ${err.message}`, loadProducts));
    $('#summary').textContent = '';
    $('#pager').hidden = true;
  }
}

async function loadLowStock() {
  try {
    const { data, meta } = await api('/api/products/low-stock');
    state.threshold = meta.threshold;
    const box = $('#lowStock');
    box.hidden = data.length === 0;
    if (!data.length) return;

    $('#lowStockTitle').textContent = `สินค้าใกล้หมด ${integer.format(data.length)} รายการ (เหลือน้อยกว่า ${meta.threshold} ชิ้น)`;
    $('#lowStockList').replaceChildren(
      ...data.map((p) =>
        h(
          'li',
          {},
          h(
            'button',
            { class: 'alert-item', type: 'button', title: 'เปิดหน้าปรับสต็อก', onclick: () => openAdjust(p) },
            `${p.name} เหลือ `,
            h('b', { text: integer.format(p.stock_quantity) })
          )
        )
      )
    );
  } catch {
    $('#lowStock').hidden = true; // แถบเตือนเป็นส่วนเสริม ถ้าโหลดไม่ได้ไม่ต้องขวางหน้าหลัก
  }
}

const refresh = () => Promise.all([loadProducts(), loadLowStock()]);

/* ---------- Dialog ทั่วไป ---------- */

function wireDialog(dialog) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close(); // คลิกพื้นหลัง
    if (e.target.closest('[data-close]')) dialog.close();
  });
}
['#addDialog', '#adjustDialog', '#historyDialog'].forEach((s) => wireDialog($(s)));

/* ---------- เพิ่มสินค้า ---------- */

const addForm = $('#addForm');

function clearFieldErrors(form) {
  form.querySelectorAll('[data-err]').forEach((n) => (n.textContent = ''));
  form.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
}

$('#openAdd').addEventListener('click', () => {
  addForm.reset();
  clearFieldErrors(addForm);
  setError($('#addError'), '');
  $('#addDialog').showModal();
  addForm.elements.name.focus();
});

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors(addForm);
  setError($('#addError'), '');

  const f = addForm.elements;
  const body = {
    name: f.name.value,
    sku: f.sku.value,
    category_id: f.category_id.value,
    cost_price: f.cost_price.value,
    stock_quantity: f.stock_quantity.value === '' ? 0 : f.stock_quantity.value,
  };
  // ส่งตัวเลขเป็น number (ถ้าแปลงไม่ได้ปล่อยเป็นข้อความให้ API ตรวจและแจ้ง error)
  for (const k of ['category_id', 'cost_price', 'stock_quantity']) {
    if (body[k] !== '' && !Number.isNaN(Number(body[k]))) body[k] = Number(body[k]);
  }

  const submit = addForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await api('/api/products', { method: 'POST', body });
    $('#addDialog').close();
    toast('เพิ่มสินค้าแล้ว');
    state.page = 1;
    await loadCategories(); // อัปเดตจำนวนสินค้าต่อหมวด (เผื่อใช้ภายหลัง)
    await refresh();
  } catch (err) {
    if (Array.isArray(err.details) && err.details.length) {
      let unmatched = false;
      for (const d of err.details) {
        const slot = addForm.querySelector(`[data-err="${d.field}"]`);
        if (slot) {
          slot.textContent = d.message;
          const input = addForm.elements[d.field];
          if (input) input.setAttribute('aria-invalid', 'true');
        } else unmatched = true;
      }
      if (unmatched) setError($('#addError'), err.message);
    } else {
      setError($('#addError'), err.message);
      if (err.code === 'DUPLICATE_SKU') {
        addForm.querySelector('[data-err="sku"]').textContent = 'SKU นี้มีอยู่แล้ว ใช้ SKU อื่น';
        addForm.elements.sku.setAttribute('aria-invalid', 'true');
        setError($('#addError'), '');
      }
    }
  } finally {
    submit.disabled = false;
  }
});

/* ---------- ปรับสต็อก ---------- */

const adjustForm = $('#adjustForm');

function readAdjust() {
  const f = adjustForm.elements;
  const raw = f.qty.value.trim();
  const qty = /^\d+$/.test(raw) ? Number(raw) : null;
  const sign = f.mode.value === 'out' ? -1 : 1;
  return { qty, change: qty === null ? null : sign * qty, reason: f.reason.value };
}

function updatePreview() {
  const p = state.adjusting;
  const { qty, change } = readAdjust();
  const preview = $('#adjustPreview');
  const submit = $('#adjustSubmit');
  setError($('#adjustError'), '');

  if (qty === null || qty < 1) {
    preview.textContent = `คงเหลือตอนนี้ ${integer.format(p.stock_quantity)} ชิ้น`;
    preview.classList.remove('bad');
    submit.disabled = true;
    return;
  }
  const after = p.stock_quantity + change;
  if (after < 0) {
    preview.textContent = `ลดไม่ได้: คงเหลือ ${integer.format(p.stock_quantity)} ชิ้น แต่ต้องการลด ${integer.format(qty)} ชิ้น`;
    preview.classList.add('bad');
    submit.disabled = true;
  } else {
    preview.textContent = `คงเหลือหลังปรับ ${integer.format(p.stock_quantity)} → ${integer.format(after)} ชิ้น`;
    preview.classList.remove('bad');
    submit.disabled = false;
  }
}

function openAdjust(product) {
  state.adjusting = product;
  adjustForm.reset();
  $('#adjustProduct').replaceChildren(h('b', { text: product.name }), ` (${product.sku})`);
  updatePreview();
  $('#adjustDialog').showModal();
  adjustForm.elements.qty.focus();
}

adjustForm.addEventListener('input', updatePreview);
adjustForm.addEventListener('change', updatePreview);

adjustForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { change, reason } = readAdjust();
  if (change === null || change === 0) return;

  const submit = $('#adjustSubmit');
  submit.disabled = true;
  try {
    await api('/api/stock/adjust', {
      method: 'PATCH',
      body: { product_id: state.adjusting.id, change, reason },
    });
    $('#adjustDialog').close();
    toast('ปรับสต็อกแล้ว');
    await refresh();
  } catch (err) {
    if (err.code === 'INSUFFICIENT_STOCK' && err.details) {
      // สต็อกเปลี่ยนไประหว่างที่เปิดหน้านี้ (มีคนอื่นปรับพร้อมกัน): อัปเดตตัวเลขแล้วให้ตัดสินใจใหม่
      state.adjusting = { ...state.adjusting, stock_quantity: err.details.available };
      updatePreview();
      setError($('#adjustError'), `${err.message} ตัวเลขถูกอัปเดตแล้ว ตรวจสอบจำนวนอีกครั้ง`);
      refresh();
    } else {
      setError($('#adjustError'), err.message);
      submit.disabled = false;
    }
  }
});

/* ---------- ประวัติรายการ ---------- */

function historyRow(t) {
  const isIn = t.type === 'IN';
  return h(
    'tr',
    {},
    h('td', { text: dateFmt.format(new Date(t.created_at)) }),
    h('td', {}, h('span', { class: isIn ? 'chip-in' : 'chip-out', text: isIn ? 'เพิ่ม' : 'ลด' })),
    h('td', { class: 'num', text: `${isIn ? '+' : '−'}${integer.format(t.quantity)}` }),
    h('td', { class: 'num', text: `${integer.format(t.stock_before)} → ${integer.format(t.stock_after)}` }),
    h('td', { class: t.reason ? '' : 'muted', text: t.reason || 'ไม่ได้ระบุ' })
  );
}

async function loadHistory(reset) {
  const hs = state.history;
  if (reset) {
    hs.page = 1;
    $('#historyRows').replaceChildren();
  } else {
    hs.page += 1;
  }
  setError($('#historyError'), '');
  const more = $('#historyMore');
  more.disabled = true;

  try {
    const { data, meta } = await api(`/api/products/${hs.product.id}/transactions?page=${hs.page}&limit=10`);
    $('#historyRows').append(...data.map(historyRow));
    if (reset && data.length === 0) {
      $('#historyRows').append(
        h('tr', {}, h('td', { colspan: '5', class: 'muted', text: 'ยังไม่มีรายการเคลื่อนไหวของสินค้านี้' }))
      );
    }
    hs.totalPages = meta.total_pages;
    more.hidden = hs.page >= hs.totalPages;
  } catch (err) {
    if (!reset) hs.page -= 1;
    setError($('#historyError'), `โหลดประวัติไม่สำเร็จ: ${err.message}`);
    more.hidden = false;
  } finally {
    more.disabled = false;
  }
}

function openHistory(product) {
  state.history.product = product;
  $('#historyProduct').replaceChildren(
    h('b', { text: product.name }),
    ` (${product.sku}) คงเหลือ ${integer.format(product.stock_quantity)} ชิ้น`
  );
  $('#historyMore').hidden = true;
  $('#historyDialog').showModal();
  loadHistory(true);
}

$('#historyMore').addEventListener('click', () => loadHistory(false));

/* ---------- ค้นหา / กรอง / แบ่งหน้า ---------- */

let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = e.target.value.trim();
    state.page = 1;
    loadProducts();
  }, 300);
});

$('#categoryFilter').addEventListener('change', (e) => {
  state.category = e.target.value;
  state.page = 1;
  loadProducts();
});

$('#prev').addEventListener('click', () => {
  if (state.page > 1) {
    state.page -= 1;
    loadProducts();
  }
});
$('#next').addEventListener('click', () => {
  state.page += 1;
  loadProducts();
});

/* ---------- เริ่มทำงาน ---------- */

(async function init() {
  try {
    await loadCategories();
  } catch (err) {
    toast(err.message, 'error');
  }
  await loadLowStock(); // ต้องรู้ threshold ก่อนวาดแถวสินค้า
  await loadProducts();
})();