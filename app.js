(() => {
  'use strict';

  const STORAGE_KEY = 'baogia_history_v2';
  const LEGACY_STORAGE_KEY = 'baogia_history_v1';
  const HANDLE_DB = 'baogia_storage_handles';
  const HANDLE_STORE = 'handles';
  const HANDLE_KEY = 'workspace';
  const DATA_DIR_NAME = 'data';
  const DATA_INDEX_NAME = 'index.json';

  const SELLER_DEFAULTS = {
    company: 'CÔNG TY TNHH IN ĐẠI DƯƠNG VIỆT NAM',
    address: 'Số 9A ngách 24 ngõ 162 Phố Khương Đình, Phường Khương Đình, Hà Nội',
    taxCode: '0108834191',
    contact: 'NGUYỄN THỊ ÁNH',
    role: 'Chức Vụ: NHÂN VIÊN KINH DOANH',
    bankAccountName: 'CÔNG TY TNHH IN ĐẠI DƯƠNG VIỆT NAM',
    bankAccountNo: '115002776534',
    bankName: 'Viettinbank chi nhánh Quang Trung'
  };

  const DEFAULT_TERMS = [
    'Địa chỉ giao hàng: Theo yêu cầu khách hàng',
    'Sản phẩm được bàn giao trong vào 5-7 ngày kể từ ngày đặt cọc và chốt mẫu (trừ T7, CN và các ngày lễ tết)',
    'Giấy tờ cho hàng hóa: Báo giá, hóa đơn bán lẻ, hóa đơn VAT',
    'Quý khách đặt cọc 50% giá trị đơn hàng trước khi làm hàng mẫu và sản xuất.'
  ];

  const state = {
    items: [],
    currentQuoteId: null,
    currentCreatedAt: null,
    currentFileName: null,
    workspaceHandle: null,
    dataDirHandle: null,
    storageConnected: false,
    historyFilter: ''
  };

  const $ = id => document.getElementById(id);
  const pad2 = n => String(n).padStart(2, '0');
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const parseNum = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const n = Number(String(value ?? '').replace(/[ ,]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const localDateISO = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const makeQuoteNo = dateStr => {
    const [y, m, d] = (dateStr || localDateISO()).split('-');
    return `PO_${d}${m}${String(y).slice(-2)}`;
  };
  const formatDateText = dateStr => {
    const d = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
    return `Hôm nay, ngày ${pad2(d.getDate())} tháng ${pad2(d.getMonth() + 1)} năm ${d.getFullYear()}`;
  };
  const money = (value, currency = 'VND') => {
    const decimals = currency === 'VND' ? 0 : 2;
    return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(parseNum(value));
  };
  const currencyLabel = currency => currency === 'VND' ? 'VNĐ' : currency;
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const fileSafe = value => String(value || 'bao-gia')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'bao-gia';

  let statusTimer = null;
  function setStatus(message, type = '', persistent = false) {
    clearTimeout(statusTimer);
    const el = $('status');
    if (!el) return;
    el.textContent = message;
    el.className = `status ${type}`.trim();
    if (message && !persistent) {
      statusTimer = setTimeout(() => {
        if (el.textContent === message) {
          el.textContent = '';
          el.className = 'status';
        }
      }, 5200);
    }
  }

  function setPreviewState(text = 'Đã cập nhật') {
    const el = $('previewState');
    if (!el) return;
    el.textContent = text;
    clearTimeout(setPreviewState.timer);
    setPreviewState.timer = setTimeout(() => { if (el) el.textContent = 'Sẵn sàng'; }, 1200);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function stampPngBlob(size = 700) {
    const response = await fetch('company-stamp.svg', { cache: 'force-cache' });
    if (!response.ok) throw new Error('Không tải được dấu công ty');
    const svgText = await response.text();
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      const ratio = Math.min(size / img.naturalWidth, size / img.naturalHeight);
      const w = img.naturalWidth * ratio;
      const h = img.naturalHeight * ratio;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không tạo được ảnh dấu')), 'image/png', 1));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function historyRead() {
    try {
      const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (Array.isArray(current)) return current;
      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
      if (Array.isArray(legacy) && legacy.length) {
        const migrated = legacy.map(q => normalizeQuote(q));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      return [];
    } catch {
      return [];
    }
  }

  function historyWrite(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    renderHistory();
  }

  function normalizeQuote(q = {}) {
    const items = Array.isArray(q.items) ? q.items.map(i => ({
      name: i.name || '',
      unit: i.unit || 'Cái',
      quantity: parseNum(i.quantity),
      unitPrice: parseNum(i.unitPrice),
      amount: parseNum(i.amount || parseNum(i.quantity) * parseNum(i.unitPrice))
    })) : [];
    const subtotal = Number.isFinite(Number(q.subtotal)) ? parseNum(q.subtotal) : items.reduce((s, i) => s + i.amount, 0);
    const vatRate = q.vatRate == null ? 8 : parseNum(q.vatRate);
    const vatAmount = Number.isFinite(Number(q.vatAmount)) ? parseNum(q.vatAmount) : subtotal * vatRate / 100;
    return {
      schemaVersion: 2,
      id: q.id || uid(),
      createdAt: q.createdAt || new Date().toISOString(),
      updatedAt: q.updatedAt || q.createdAt || new Date().toISOString(),
      quoteNo: q.quoteNo || '',
      quoteDate: q.quoteDate || localDateISO(),
      currency: q.currency || 'VND',
      vatRate,
      seller: {
        company: q.seller?.company || SELLER_DEFAULTS.company,
        address: q.seller?.address || SELLER_DEFAULTS.address,
        taxCode: q.seller?.taxCode || SELLER_DEFAULTS.taxCode,
        contact: q.seller?.contact || SELLER_DEFAULTS.contact,
        role: q.seller?.role || SELLER_DEFAULTS.role,
        bankAccountName: q.seller?.bankAccountName || SELLER_DEFAULTS.bankAccountName,
        bankAccountNo: q.seller?.bankAccountNo || SELLER_DEFAULTS.bankAccountNo,
        bankName: q.seller?.bankName || SELLER_DEFAULTS.bankName
      },
      buyer: {
        company: q.buyer?.company || '',
        address: q.buyer?.address || '',
        taxCode: q.buyer?.taxCode || ''
      },
      items,
      terms: Array.isArray(q.terms) ? q.terms : DEFAULT_TERMS,
      subtotal,
      vatAmount,
      total: Number.isFinite(Number(q.total)) ? parseNum(q.total) : subtotal + vatAmount,
      storageFile: q.storageFile || null
    };
  }

  function getTerms() {
    return $('termsInput').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  }

  function getQuoteData() {
    const items = state.items.map(({ id, ...item }) => ({
      name: item.name || '',
      unit: item.unit || '',
      quantity: parseNum(item.quantity),
      unitPrice: parseNum(item.unitPrice),
      amount: parseNum(item.quantity) * parseNum(item.unitPrice)
    }));
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const vatRate = parseNum($('vatRate').value);
    const vatAmount = subtotal * vatRate / 100;
    return {
      schemaVersion: 2,
      id: state.currentQuoteId || uid(),
      createdAt: state.currentCreatedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      quoteNo: $('quoteNo').value.trim() || makeQuoteNo($('quoteDate').value),
      quoteDate: $('quoteDate').value || localDateISO(),
      currency: $('currency').value,
      vatRate,
      seller: {
        company: $('sellerCompany').value.trim(),
        address: $('sellerAddress').value.trim(),
        taxCode: $('sellerTax').value.trim(),
        contact: $('sellerContact').value.trim(),
        role: $('sellerRole').value.trim(),
        bankAccountName: $('bankAccountName').value.trim(),
        bankAccountNo: $('bankAccountNo').value.trim(),
        bankName: $('bankName').value.trim()
      },
      buyer: {
        company: $('buyerCompany').value.trim(),
        address: $('buyerAddress').value.trim(),
        taxCode: $('buyerTax').value.trim()
      },
      items,
      terms: getTerms(),
      subtotal,
      vatAmount,
      total: subtotal + vatAmount,
      storageFile: state.currentFileName
    };
  }

  function validateQuote(q) {
    if (!q.buyer.company) return 'Vui lòng nhập Tên công ty của bên mua.';
    if (!q.items.some(item => item.name.trim())) return 'Vui lòng nhập ít nhất một hàng hóa / dịch vụ.';
    if (!q.quoteNo) return 'Vui lòng nhập PO số.';
    return '';
  }

  function addItem(item = {}, focus = false) {
    state.items.push({
      id: item.id || uid(),
      name: item.name ?? '',
      unit: item.unit ?? 'Chiếc',
      quantity: parseNum(item.quantity ?? 1),
      unitPrice: parseNum(item.unitPrice ?? 0)
    });
    renderItemEditors();
    renderPreview();
    if (focus) {
      requestAnimationFrame(() => {
        const last = document.querySelector('.item-row:last-child .item-textarea');
        last?.focus();
      });
    }
  }

  function removeItem(id) {
    if (state.items.length <= 1) return setStatus('Báo giá cần ít nhất một dòng hàng hóa / dịch vụ.', 'error');
    state.items = state.items.filter(item => item.id !== id);
    renderItemEditors();
    renderPreview();
  }

  function renderItemEditors() {
    const currency = currencyLabel($('currency').value);
    $('itemsEditor').innerHTML = state.items.map((item, index) => `
      <div class="item-row" data-id="${item.id}">
        <div class="item-cell index">${index + 1}</div>
        <div class="item-cell name">
          <label>Tên hàng hóa / dịch vụ</label>
          <textarea class="item-textarea item-name" rows="2" placeholder="Nhập tên hàng hóa / dịch vụ">${esc(item.name)}</textarea>
        </div>
        <div class="item-cell">
          <label>Đơn vị</label>
          <input class="item-input item-unit" value="${esc(item.unit)}" placeholder="Chiếc" />
        </div>
        <div class="item-cell">
          <label>Số lượng</label>
          <input class="item-input number item-qty" type="number" inputmode="decimal" min="0" step="any" value="${item.quantity}" />
        </div>
        <div class="item-cell">
          <label>Đơn giá</label>
          <input class="item-input number item-price" type="number" inputmode="decimal" min="0" step="any" value="${item.unitPrice}" />
        </div>
        <div class="item-cell amount">
          <label>Thành tiền</label>
          <div class="item-amount">${money(item.quantity * item.unitPrice, $('currency').value)} ${currency}</div>
        </div>
        <div class="item-cell action">
          <button class="remove-item" type="button" data-id="${item.id}" title="Xóa dòng" aria-label="Xóa dòng">×</button>
        </div>
      </div>`).join('');

    document.querySelectorAll('.remove-item').forEach(btn => btn.addEventListener('click', () => removeItem(btn.dataset.id)));
    document.querySelectorAll('.item-row').forEach(row => {
      const item = state.items.find(x => x.id === row.dataset.id);
      const updateAmount = () => {
        row.querySelector('.item-amount').textContent = `${money(item.quantity * item.unitPrice, $('currency').value)} ${currencyLabel($('currency').value)}`;
      };
      row.querySelector('.item-name').addEventListener('input', e => { item.name = e.target.value; renderPreview(); });
      row.querySelector('.item-unit').addEventListener('input', e => { item.unit = e.target.value; renderPreview(); });
      row.querySelector('.item-qty').addEventListener('input', e => { item.quantity = parseNum(e.target.value); updateAmount(); renderPreview(); });
      row.querySelector('.item-price').addEventListener('input', e => { item.unitPrice = parseNum(e.target.value); updateAmount(); renderPreview(); });
    });
  }

  function renderPreview() {
    const q = getQuoteData();
    $('pSellerCompany').textContent = q.seller.company;
    $('pSellerAddress').textContent = q.seller.address;
    $('pSellerTax').textContent = q.seller.taxCode;
    $('pSellerContact').textContent = q.seller.contact;
    $('pSellerRole').textContent = q.seller.role;
    $('pBuyerCompany').textContent = q.buyer.company || '—';
    $('pBuyerAddress').textContent = q.buyer.address || '—';
    $('pBuyerTax').textContent = q.buyer.taxCode || '—';
    $('pBuyerTaxRow').classList.toggle('hidden', !q.buyer.taxCode);
    $('pDateText').textContent = formatDateText(q.quoteDate);
    $('pQuoteNo').textContent = q.quoteNo;
    $('pIntro').textContent = `${q.seller.company || 'Chúng tôi'} chúng tôi đồng ý cung cấp đến quý đối tác các mặt hàng theo chi tiết dưới đây`;
    $('pCurrency1').textContent = `(${currencyLabel(q.currency)})`;
    $('pCurrency2').textContent = `(${currencyLabel(q.currency)})`;
    $('pVatLabel').textContent = `VAT ${q.vatRate}%`;
    $('pSubtotal').textContent = money(q.subtotal, q.currency);
    $('pVat').textContent = money(q.vatAmount, q.currency);
    $('pTotal').textContent = money(q.total, q.currency);
    $('pBankAccountName').textContent = q.seller.bankAccountName;
    $('pBankAccountNo').textContent = q.seller.bankAccountNo;
    $('pBankName').textContent = q.seller.bankName;
    $('pSignatureName').textContent = q.seller.contact;
    $('previewItems').innerHTML = q.items.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td class="desc">${esc(item.name)}</td>
        <td>${esc(item.unit)}</td>
        <td>${money(item.quantity, 'VND')}</td>
        <td>${money(item.unitPrice, q.currency)}</td>
        <td>${money(item.amount, q.currency)}</td>
      </tr>`).join('');
    $('previewTerms').innerHTML = q.terms.map(term => `<li>${esc(term)}</li>`).join('');
    setPreviewState();
  }

  function applyQuoteToForm(q) {
    q = normalizeQuote(q);
    state.currentQuoteId = q.id;
    state.currentCreatedAt = q.createdAt;
    state.currentFileName = q.storageFile || null;
    $('buyerCompany').value = q.buyer.company;
    $('buyerAddress').value = q.buyer.address;
    $('buyerTax').value = q.buyer.taxCode;
    $('quoteNo').value = q.quoteNo;
    $('quoteDate').value = q.quoteDate;
    $('vatRate').value = q.vatRate;
    $('currency').value = q.currency;
    $('sellerCompany').value = q.seller.company;
    $('sellerAddress').value = q.seller.address;
    $('sellerTax').value = q.seller.taxCode;
    $('sellerContact').value = q.seller.contact;
    $('sellerRole').value = q.seller.role;
    $('bankAccountName').value = q.seller.bankAccountName;
    $('bankAccountNo').value = q.seller.bankAccountNo;
    $('bankName').value = q.seller.bankName;
    $('termsInput').value = q.terms.join('\n');
    state.items = q.items.map(item => ({ id: uid(), name: item.name, unit: item.unit, quantity: item.quantity, unitPrice: item.unitPrice }));
    if (!state.items.length) state.items = [{ id: uid(), name: '', unit: 'Chiếc', quantity: 1, unitPrice: 0 }];
    renderItemEditors();
    renderPreview();
  }

  function newQuote(skipConfirm = false) {
    if (!skipConfirm && !confirm('Tạo báo giá mới? Các thay đổi chưa lưu sẽ bị xóa.')) return;
    state.currentQuoteId = null;
    state.currentCreatedAt = null;
    state.currentFileName = null;
    $('buyerCompany').value = '';
    $('buyerAddress').value = '';
    $('buyerTax').value = '';
    $('quoteDate').value = localDateISO();
    $('quoteNo').value = makeQuoteNo($('quoteDate').value);
    $('vatRate').value = 8;
    $('currency').value = 'VND';
    $('termsInput').value = DEFAULT_TERMS.join('\n');
    state.items = [{ id: uid(), name: '', unit: 'Chiếc', quantity: 1, unitPrice: 0 }];
    renderItemEditors();
    renderPreview();
    setStatus('Đã tạo biểu mẫu báo giá mới.');
    $('buyerCompany').focus();
  }

  async function saveQuote() {
    const q = getQuoteData();
    const validation = validateQuote(q);
    if (validation) return setStatus(validation, 'error');

    const history = historyRead();
    let index = history.findIndex(item => item.id === q.id);
    if (index < 0) index = history.findIndex(item => item.quoteNo === q.quoteNo);
    if (index >= 0) {
      q.id = history[index].id;
      q.createdAt = history[index].createdAt;
      q.storageFile = history[index].storageFile || state.currentFileName;
      history[index] = q;
    } else {
      history.unshift(q);
    }

    state.currentQuoteId = q.id;
    state.currentCreatedAt = q.createdAt;

    if (state.storageConnected) {
      try {
        const fileName = await writeQuoteToDataFolder(q);
        q.storageFile = fileName;
        state.currentFileName = fileName;
        const targetIndex = history.findIndex(item => item.id === q.id);
        if (targetIndex >= 0) history[targetIndex] = q;
        await writeDataIndex(history);
        historyWrite(history);
        setStatus(`Đã lưu ${q.quoteNo} → data/${fileName}`, 'ok');
        return;
      } catch (error) {
        console.error(error);
        setStatus(`Đã lưu cache trình duyệt, nhưng chưa ghi được thư mục data: ${error.message}`, 'error', true);
      }
    }

    historyWrite(history);
    setStatus(`Đã lưu ${q.quoteNo} trong trình duyệt. Hãy kết nối thư mục data để có file JSON riêng.`, 'ok');
  }

  function loadQuote(id) {
    const q = historyRead().find(item => item.id === id);
    if (!q) return;
    applyQuoteToForm(q);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setStatus(`Đã mở ${q.quoteNo}.`, 'ok');
  }

  async function deleteQuote(id) {
    const history = historyRead();
    const q = history.find(item => item.id === id);
    if (!q) return;
    if (!confirm(`Xóa báo giá ${q.quoteNo}?${state.storageConnected && q.storageFile ? ' File JSON trong data/ cũng sẽ bị xóa.' : ''}`)) return;
    const next = history.filter(item => item.id !== id);
    if (state.storageConnected && q.storageFile) {
      try {
        await state.dataDirHandle.removeEntry(q.storageFile);
        await writeDataIndex(next);
      } catch (error) {
        console.warn('Không xóa được file data:', error);
      }
    }
    historyWrite(next);
    if (state.currentQuoteId === id) newQuote(true);
  }

  function renderHistory() {
    const all = historyRead();
    const query = state.historyFilter.trim().toLocaleLowerCase('vi');
    const history = query ? all.filter(q => `${q.quoteNo} ${q.buyer?.company || ''}`.toLocaleLowerCase('vi').includes(query)) : all;
    const container = $('historyContainer');
    if (!history.length) {
      container.innerHTML = `<div class="history-empty">${query ? 'Không tìm thấy báo giá phù hợp.' : 'Chưa có báo giá nào được lưu.'}</div>`;
      return;
    }
    container.innerHTML = `
      <table class="history-table">
        <thead><tr><th>PO số</th><th>Ngày</th><th>Khách hàng</th><th>Nguồn</th><th style="text-align:right">Tổng tiền</th><th></th></tr></thead>
        <tbody>${history.map(q => `
          <tr>
            <td><strong>${esc(q.quoteNo)}</strong></td>
            <td>${esc(q.quoteDate || '')}</td>
            <td>${esc(q.buyer?.company || '')}</td>
            <td><span class="history-source">${q.storageFile ? `data/${esc(q.storageFile)}` : 'Browser cache'}</span></td>
            <td class="money">${money(q.total || 0, q.currency || 'VND')} ${currencyLabel(q.currency || 'VND')}</td>
            <td><div class="row-actions"><button class="btn compact history-load" data-id="${q.id}" type="button">Mở</button><button class="btn compact danger-soft history-delete" data-id="${q.id}" type="button">Xóa</button></div></td>
          </tr>`).join('')}</tbody>
      </table>`;
    container.querySelectorAll('.history-load').forEach(btn => btn.addEventListener('click', () => loadQuote(btn.dataset.id)));
    container.querySelectorAll('.history-delete').forEach(btn => btn.addEventListener('click', () => deleteQuote(btn.dataset.id)));
  }

  // --------- Physical data/ folder via File System Access API ---------
  function openHandleDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(HANDLE_DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(HANDLE_STORE)) req.result.createObjectStore(HANDLE_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function handleDbGet(key) {
    try {
      const db = await openHandleDb();
      return await new Promise((resolve, reject) => {
        const req = db.transaction(HANDLE_STORE, 'readonly').objectStore(HANDLE_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  async function handleDbSet(key, value) {
    const db = await openHandleDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function updateStorageUi(mode = 'cache', detail = '') {
    const banner = $('dataBanner');
    const title = $('storageTitle');
    const text = $('storageText');
    const sync = $('syncDataBtn');
    banner.classList.remove('connected', 'warn');
    if (mode === 'connected') {
      banner.classList.add('connected');
      title.textContent = 'Đã kết nối database file JSON';
      text.innerHTML = `Đang ghi từng báo giá vào <code>${esc(detail || 'data/')}</code>. Cache trình duyệt vẫn được giữ để mở nhanh.`;
      $('connectDataBtn').textContent = 'Đổi thư mục';
      sync.disabled = false;
    } else if (mode === 'permission') {
      banner.classList.add('warn');
      title.textContent = 'Thư mục data cần cấp quyền lại';
      text.textContent = 'Nhấn “Kết nối thư mục data” để cấp lại quyền đọc/ghi cho thư mục đã chọn.';
      $('connectDataBtn').textContent = 'Cấp quyền data';
      sync.disabled = true;
    } else if (mode === 'unsupported') {
      banner.classList.add('warn');
      title.textContent = 'Trình duyệt chưa hỗ trợ ghi trực tiếp vào thư mục';
      text.textContent = 'Hãy dùng Chrome hoặc Edge trên máy tính để lưu từng báo giá thành file JSON trong data/. Hiện tại dữ liệu vẫn được lưu trong trình duyệt.';
      $('connectDataBtn').disabled = true;
      sync.disabled = true;
    } else {
      title.textContent = 'Dữ liệu đang lưu tạm trên trình duyệt';
      text.innerHTML = 'Kết nối thư mục dự án để hệ thống tự tạo <code>data/</code> và lưu mỗi báo giá thành một file JSON riêng.';
      $('connectDataBtn').textContent = 'Kết nối thư mục data';
      sync.disabled = true;
    }
  }

  async function activateWorkspaceHandle(handle, requestPermission = false) {
    if (!handle) return false;
    let permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && requestPermission) permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      state.workspaceHandle = handle;
      state.dataDirHandle = null;
      state.storageConnected = false;
      updateStorageUi('permission');
      return false;
    }
    const dataDir = await handle.getDirectoryHandle(DATA_DIR_NAME, { create: true });
    state.workspaceHandle = handle;
    state.dataDirHandle = dataDir;
    state.storageConnected = true;
    await handleDbSet(HANDLE_KEY, handle);
    updateStorageUi('connected', `${handle.name}/${DATA_DIR_NAME}/`);
    return true;
  }

  async function connectDataFolder() {
    if (!('showDirectoryPicker' in window)) return updateStorageUi('unsupported');
    try {
      if (state.workspaceHandle) {
        const ok = await activateWorkspaceHandle(state.workspaceHandle, true);
        if (ok) {
          await syncFromDataFolder();
          return setStatus('Đã kết nối lại thư mục data và đồng bộ dữ liệu.', 'ok');
        }
      }
      const handle = await window.showDirectoryPicker({ id: 'baogia-workspace', mode: 'readwrite', startIn: 'documents' });
      const ok = await activateWorkspaceHandle(handle, true);
      if (ok) {
        await syncFromDataFolder();
        setStatus(`Đã kết nối ${handle.name}/data/. Từ bây giờ mỗi báo giá sẽ có một file JSON riêng.`, 'ok');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setStatus(`Không kết nối được thư mục data: ${error.message}`, 'error');
    }
  }

  async function restoreDataFolder() {
    if (!('showDirectoryPicker' in window)) {
      updateStorageUi('unsupported');
      return;
    }
    const handle = await handleDbGet(HANDLE_KEY);
    if (!handle) return updateStorageUi('cache');
    state.workspaceHandle = handle;
    try {
      const ok = await activateWorkspaceHandle(handle, false);
      if (ok) await syncFromDataFolder(false);
    } catch {
      updateStorageUi('permission');
    }
  }

  function fileNameForQuote(q) {
    return `${fileSafe(q.quoteNo || q.id)}.json`;
  }

  async function writeJsonFile(dirHandle, fileName, data) {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }

  async function writeQuoteToDataFolder(q) {
    if (!state.dataDirHandle) throw new Error('Chưa kết nối data/');
    const newFileName = fileNameForQuote(q);
    const oldFileName = q.storageFile || state.currentFileName;
    q.storageFile = newFileName;
    await writeJsonFile(state.dataDirHandle, newFileName, q);
    if (oldFileName && oldFileName !== newFileName) {
      try { await state.dataDirHandle.removeEntry(oldFileName); } catch { /* ignore */ }
    }
    return newFileName;
  }

  async function writeDataIndex(history = historyRead()) {
    if (!state.dataDirHandle) return;
    const index = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      count: history.length,
      quotes: history.map(q => ({
        id: q.id,
        file: q.storageFile || fileNameForQuote(q),
        quoteNo: q.quoteNo,
        quoteDate: q.quoteDate,
        buyerCompany: q.buyer?.company || '',
        total: q.total || 0,
        currency: q.currency || 'VND',
        updatedAt: q.updatedAt || q.createdAt
      }))
    };
    await writeJsonFile(state.dataDirHandle, DATA_INDEX_NAME, index);
  }

  async function syncFromDataFolder(showMessage = true) {
    if (!state.dataDirHandle) return;
    const found = [];
    for await (const [name, handle] of state.dataDirHandle.entries()) {
      if (handle.kind !== 'file' || !name.toLowerCase().endsWith('.json') || name === DATA_INDEX_NAME) continue;
      try {
        const file = await handle.getFile();
        const q = normalizeQuote(JSON.parse(await file.text()));
        q.storageFile = name;
        found.push(q);
      } catch (error) {
        console.warn(`Bỏ qua ${name}:`, error);
      }
    }
    if (found.length) {
      found.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
      historyWrite(found);
    } else {
      const local = historyRead();
      if (local.length) {
        for (const q of local) {
          const fileName = await writeQuoteToDataFolder(q);
          q.storageFile = fileName;
        }
        await writeDataIndex(local);
        historyWrite(local);
      } else {
        await writeDataIndex([]);
      }
    }
    if (showMessage) setStatus(`Đã đồng bộ ${historyRead().length} báo giá với thư mục data/.`, 'ok');
  }

  // --------- DOCX export ---------
  function docText(text, options = {}) {
    const d = window.docx;
    return new d.TextRun({ text: String(text ?? ''), font: 'Times New Roman', size: options.size || 22, bold: !!options.bold, italics: !!options.italics, underline: options.underline ? { type: d.UnderlineType.SINGLE } : undefined });
  }

  function docParagraph(textOrRuns = '', options = {}) {
    const d = window.docx;
    const children = Array.isArray(textOrRuns) ? textOrRuns : [docText(textOrRuns, options)];
    return new d.Paragraph({
      children,
      alignment: options.alignment,
      spacing: { before: options.before || 0, after: options.after ?? 20, line: options.line || 260 },
      indent: options.indent,
      bullet: options.bullet
    });
  }

  function docCell(content, options = {}) {
    const d = window.docx;
    const children = Array.isArray(content) ? content : [docParagraph(content, { alignment: options.alignment })];
    return new d.TableCell({
      children,
      columnSpan: options.colSpan,
      rowSpan: options.rowSpan,
      verticalAlign: d.VerticalAlign.CENTER,
      margins: { top: 70, bottom: 70, left: 80, right: 80 },
      borders: options.noBorder ? {
        top: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' }
      } : undefined
    });
  }

  function infoTableRows(label, value, boldValue = false) {
    const d = window.docx;
    return new d.TableRow({ children: [
      docCell([docParagraph([docText(label, { underline: true })], { after: 0 })], { noBorder: true }),
      docCell([docParagraph([docText(value || '—', { bold: boldValue })], { after: 0 })], { noBorder: true })
    ] });
  }

  async function exportWord() {
    if (!window.docx) return setStatus('Thư viện Word chưa tải được. Kiểm tra Internet và thử lại.', 'error');
    const q = getQuoteData();
    const validation = validateQuote(q);
    if (validation) return setStatus(validation, 'error');
    setStatus('Đang tạo file Word DOCX với bố cục báo giá...', '', true);

    try {
      const d = window.docx;
      let stampBytes = null;
      try { stampBytes = new Uint8Array(await (await stampPngBlob(600)).arrayBuffer()); } catch { /* no stamp */ }
      const noBorders = {
        top: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideHorizontal: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' }
      };
      const tableBorders = {
        top: { style: d.BorderStyle.SINGLE, size: 10, color: '000000' }, bottom: { style: d.BorderStyle.SINGLE, size: 10, color: '000000' },
        left: { style: d.BorderStyle.SINGLE, size: 10, color: '000000' }, right: { style: d.BorderStyle.SINGLE, size: 10, color: '000000' },
        insideHorizontal: { style: d.BorderStyle.SINGLE, size: 10, color: '000000' }, insideVertical: { style: d.BorderStyle.SINGLE, size: 10, color: '000000' }
      };

      const headerCells = [
        docCell(stampBytes ? [new d.Paragraph({ alignment: d.AlignmentType.RIGHT, children: [new d.ImageRun({ type: 'png', data: stampBytes, transformation: { width: 86, height: 86 } })] })] : [docParagraph('')], { noBorder: true }),
        docCell([docParagraph([docText('BÁO GIÁ', { size: 36, bold: true })], { alignment: d.AlignmentType.CENTER, after: 0 })], { noBorder: true }),
        docCell('', { noBorder: true })
      ];

      const infoRows = [
        new d.TableRow({ children: [docCell([docParagraph([docText('BÊN BÁN/The Seller', { bold: true })], { after: 0 })], { colSpan: 2, noBorder: true })] }),
        infoTableRows('TÊN CTY/Company:', q.seller.company, true),
        infoTableRows('ĐỊA CHỈ/Address:', q.seller.address),
        infoTableRows('MÃ SỐ THUẾ/Tax Code:', q.seller.taxCode),
        infoTableRows('THÔNG TIN LIÊN HỆ:', `${q.seller.contact}    ${q.seller.role}`),
        new d.TableRow({ children: [docCell([docParagraph([docText('BÊN MUA/The buyer', { bold: true })], { after: 0 })], { colSpan: 2, noBorder: true })] }),
        infoTableRows('TÊN CTY/Company:', q.buyer.company, true),
        infoTableRows('ĐỊA CHỈ/Address:', q.buyer.address),
        ...(q.buyer.taxCode ? [infoTableRows('MÃ SỐ THUẾ/Tax Code:', q.buyer.taxCode)] : [])
      ];

      const quoteRows = [
        new d.TableRow({ tableHeader: true, children: [
          docCell([docParagraph([docText('STT', { bold: true })], { alignment: d.AlignmentType.CENTER, after: 0 })]),
          docCell([docParagraph([docText('Tên hàng hoá, dịch vụ', { bold: true })], { alignment: d.AlignmentType.CENTER, after: 0 })]),
          docCell([docParagraph([docText('Đơn vị', { bold: true })], { alignment: d.AlignmentType.CENTER, after: 0 })]),
          docCell([docParagraph([docText('Số lượng', { bold: true })], { alignment: d.AlignmentType.CENTER, after: 0 })]),
          docCell([docParagraph([docText('Đơn giá', { bold: true })], { alignment: d.AlignmentType.CENTER, after: 0 }), docParagraph([docText(`(${currencyLabel(q.currency)})`, { bold: true })], { alignment: d.AlignmentType.CENTER, after: 0 })]),
          docCell([docParagraph([docText('Thành tiền', { bold: true })], { alignment: d.AlignmentType.CENTER, after: 0 }), docParagraph([docText(`(${currencyLabel(q.currency)})`, { bold: true })], { alignment: d.AlignmentType.CENTER, after: 0 })])
        ] })
      ];
      q.items.forEach((item, index) => quoteRows.push(new d.TableRow({ children: [
        docCell(String(index + 1), { alignment: d.AlignmentType.CENTER }),
        docCell([docParagraph([docText(item.name, { bold: true })], { after: 0 })]),
        docCell(item.unit, { alignment: d.AlignmentType.CENTER }),
        docCell(money(item.quantity, 'VND'), { alignment: d.AlignmentType.CENTER }),
        docCell(money(item.unitPrice, q.currency), { alignment: d.AlignmentType.RIGHT }),
        docCell(money(item.amount, q.currency), { alignment: d.AlignmentType.RIGHT })
      ] })));
      [
        ['Tổng tiền trước VAT', q.subtotal, false],
        [`VAT ${q.vatRate}%`, q.vatAmount, false],
        ['Tổng tiền sau VAT', q.total, true]
      ].forEach(([label, value, bold]) => quoteRows.push(new d.TableRow({ children: [
        docCell([docParagraph([docText(label, { bold })], { alignment: d.AlignmentType.CENTER, after: 0 })], { colSpan: 5 }),
        docCell([docParagraph([docText(money(value, q.currency), { bold })], { alignment: d.AlignmentType.RIGHT, after: 0 })])
      ] })));

      const children = [
        new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, columnWidths: [2200, 5200, 2200], borders: noBorders, rows: [new d.TableRow({ children: headerCells })] }),
        new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, columnWidths: [3500, 6100], borders: noBorders, rows: infoRows }),
        docParagraph(formatDateText(q.quoteDate), { after: 0 }),
        docParagraph(`PO số:    ${q.quoteNo}`, { after: 20 }),
        docParagraph(`${q.seller.company} chúng tôi đồng ý cung cấp đến quý đối tác các mặt hàng theo chi tiết dưới đây`, { after: 50 }),
        new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, columnWidths: [500, 3500, 1000, 1100, 1800, 1900], borders: tableBorders, rows: quoteRows }),
        docParagraph([docText('CÁC ĐIỀU KHOẢN ĐẶT HÀNG:', { bold: true, underline: true })], { before: 50, after: 10 }),
        ...q.terms.map(term => docParagraph(term, { bullet: { level: 0 }, indent: { left: 240 }, after: 10 })),
        docParagraph(`CTK: ${q.seller.bankAccountName}`, { after: 5 }),
        docParagraph(`STK: ${q.seller.bankAccountNo}`, { after: 5 }),
        docParagraph(`Ngân hàng: ${q.seller.bankName}`, { after: 25 }),
        new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, columnWidths: [5600, 4000], borders: noBorders, rows: [
          new d.TableRow({ children: [docCell('', { noBorder: true }), docCell([
            docParagraph([docText('NHÂN VIÊN KINH DOANH', { bold: true, underline: true })], { alignment: d.AlignmentType.CENTER, after: 180 }),
            docParagraph([docText(q.seller.contact, { bold: true })], { alignment: d.AlignmentType.CENTER, after: 0 })
          ], { noBorder: true })] })
        ] })
      ];

      const doc = new d.Document({
        creator: 'In Đại Dương Việt Nam',
        title: `Báo giá ${q.quoteNo}`,
        styles: { default: { document: { run: { font: 'Times New Roman', size: 22 }, paragraph: { spacing: { after: 0, line: 260 } } } } },
        sections: [{
          properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 500, right: 620, bottom: 520, left: 620 } } },
          children
        }]
      });
      const blob = await d.Packer.toBlob(doc);
      downloadBlob(blob, `${fileSafe(q.quoteNo)}.docx`);
      setStatus('Đã tạo Word .docx với font Times New Roman, bảng và căn lề theo mẫu.', 'ok');
    } catch (error) {
      console.error(error);
      setStatus(`Không thể tạo Word: ${error.message}`, 'error');
    }
  }

  // --------- XLSX export ---------
  async function exportExcel() {
    if (!window.ExcelJS) return setStatus('Thư viện Excel chưa tải được. Kiểm tra Internet và thử lại.', 'error');
    const q = getQuoteData();
    const validation = validateQuote(q);
    if (validation) return setStatus(validation, 'error');
    setStatus('Đang tạo Excel có định dạng chuyên nghiệp...', '', true);

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'In Đại Dương Việt Nam';
      workbook.created = new Date();
      const ws = workbook.addWorksheet('Báo giá', {
        pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true },
        properties: { defaultRowHeight: 19 },
        views: [{ showGridLines: false }]
      });
      ws.pageMargins = { left: 0.35, right: 0.35, top: 0.35, bottom: 0.4, header: 0.1, footer: 0.1 };
      ws.columns = [
        { key: 'a', width: 7 }, { key: 'b', width: 31 }, { key: 'c', width: 13 },
        { key: 'd', width: 14 }, { key: 'e', width: 19 }, { key: 'f', width: 21 }
      ];

      const thin = { style: 'thin', color: { argb: 'FF111111' } };
      const medium = { style: 'medium', color: { argb: 'FF111111' } };
      const allThin = { top: thin, left: thin, bottom: thin, right: thin };
      const baseFont = { name: 'Times New Roman', size: 12, color: { argb: 'FF111111' } };
      const setFont = (cell, opts = {}) => { cell.font = { ...baseFont, ...opts }; };
      const setInfo = (row, label, value, boldValue = false) => {
        ws.mergeCells(`A${row}:B${row}`);
        ws.mergeCells(`C${row}:F${row}`);
        const lc = ws.getCell(`A${row}`); lc.value = label; setFont(lc, { underline: true, bold: label.includes('BÊN ') });
        const vc = ws.getCell(`C${row}`); vc.value = value || ''; setFont(vc, { bold: boldValue });
        ws.getRow(row).height = 20;
        vc.alignment = { vertical: 'middle', wrapText: true };
      };

      ws.mergeCells('C2:E3');
      ws.getCell('C2').value = 'BÁO GIÁ';
      setFont(ws.getCell('C2'), { size: 20, bold: true });
      ws.getCell('C2').alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(2).height = 30;
      ws.getRow(3).height = 26;

      try {
        const stampData = await blobToDataUrl(await stampPngBlob(700));
        const imageId = workbook.addImage({ base64: stampData, extension: 'png' });
        ws.addImage(imageId, { tl: { col: 1.05, row: 0.15 }, ext: { width: 105, height: 105 } });
      } catch (error) { console.warn('Không chèn được dấu vào Excel', error); }

      let r = 5;
      ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = 'BÊN BÁN/The Seller'; setFont(ws.getCell(`A${r}`), { bold: true }); r++;
      setInfo(r++, 'TÊN CTY/Company:', q.seller.company, true);
      setInfo(r++, 'ĐỊA CHỈ/Address:', q.seller.address);
      setInfo(r++, 'MÃ SỐ THUẾ/Tax Code:', q.seller.taxCode);
      setInfo(r++, 'THÔNG TIN LIÊN HỆ:', `${q.seller.contact}     ${q.seller.role}`);
      ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = 'BÊN MUA/The buyer'; setFont(ws.getCell(`A${r}`), { bold: true }); r++;
      setInfo(r++, 'TÊN CTY/Company:', q.buyer.company, true);
      setInfo(r++, 'ĐỊA CHỈ/Address:', q.buyer.address);
      if (q.buyer.taxCode) setInfo(r++, 'MÃ SỐ THUẾ/Tax Code:', q.buyer.taxCode);

      ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = formatDateText(q.quoteDate); setFont(ws.getCell(`A${r}`)); r++;
      ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = `PO số:    ${q.quoteNo}`; setFont(ws.getCell(`A${r}`)); r++;
      ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = `${q.seller.company} chúng tôi đồng ý cung cấp đến quý đối tác các mặt hàng theo chi tiết dưới đây`;
      setFont(ws.getCell(`A${r}`)); ws.getCell(`A${r}`).alignment = { wrapText: true }; ws.getRow(r).height = 31; r++;

      const headerStart = r;
      ws.mergeCells(`A${r}:A${r + 1}`); ws.mergeCells(`B${r}:B${r + 1}`); ws.mergeCells(`C${r}:C${r + 1}`); ws.mergeCells(`D${r}:D${r + 1}`);
      ['A','B','C','D','E','F'].forEach((col, i) => {
        const texts = ['STT', 'Tên hàng hoá, dịch vụ', 'Đơn vị', 'Số lượng', 'Đơn giá', 'Thành tiền'];
        const c = ws.getCell(`${col}${r}`); c.value = texts[i]; setFont(c, { bold: true }); c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
      ws.getCell(`E${r + 1}`).value = `(${currencyLabel(q.currency)})`;
      ws.getCell(`F${r + 1}`).value = `(${currencyLabel(q.currency)})`;
      ['E','F'].forEach(col => { setFont(ws.getCell(`${col}${r + 1}`), { bold: true }); ws.getCell(`${col}${r + 1}`).alignment = { horizontal: 'center', vertical: 'middle' }; });
      for (let rr = r; rr <= r + 1; rr++) for (let cc = 1; cc <= 6; cc++) ws.getCell(rr, cc).border = allThin;
      ws.getRow(r).height = 24; ws.getRow(r + 1).height = 21; r += 2;

      q.items.forEach((item, index) => {
        const values = [index + 1, item.name, item.unit, item.quantity, item.unitPrice, item.amount];
        values.forEach((value, i) => {
          const c = ws.getCell(r, i + 1); c.value = value; setFont(c, { bold: i === 1 }); c.border = allThin;
          c.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : (i >= 4 ? 'right' : 'center'), wrapText: true };
        });
        ws.getCell(r, 4).numFmt = '#,##0.##';
        ws.getCell(r, 5).numFmt = q.currency === 'VND' ? '#,##0' : '#,##0.00';
        ws.getCell(r, 6).numFmt = q.currency === 'VND' ? '#,##0' : '#,##0.00';
        ws.getRow(r).height = Math.max(31, 19 + Math.ceil((item.name || '').length / 44) * 13);
        r++;
      });

      const totals = [
        ['Tổng tiền trước VAT', q.subtotal, false],
        [`VAT ${q.vatRate}%`, q.vatAmount, false],
        ['Tổng tiền sau VAT', q.total, true]
      ];
      totals.forEach(([label, value, bold]) => {
        ws.mergeCells(`A${r}:E${r}`);
        const lc = ws.getCell(`A${r}`); lc.value = label; setFont(lc, { bold }); lc.alignment = { horizontal: 'center', vertical: 'middle' };
        const vc = ws.getCell(`F${r}`); vc.value = value; setFont(vc, { bold }); vc.numFmt = q.currency === 'VND' ? '#,##0' : '#,##0.00'; vc.alignment = { horizontal: 'right', vertical: 'middle' };
        for (let cc = 1; cc <= 6; cc++) ws.getCell(r, cc).border = allThin;
        ws.getRow(r).height = 23; r++;
      });
      const tableEnd = r - 1;
      for (let cc = 1; cc <= 6; cc++) {
        ws.getCell(headerStart, cc).border = { ...ws.getCell(headerStart, cc).border, top: medium };
        ws.getCell(tableEnd, cc).border = { ...ws.getCell(tableEnd, cc).border, bottom: medium };
      }

      ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = 'CÁC ĐIỀU KHOẢN ĐẶT HÀNG:'; setFont(ws.getCell(`A${r}`), { bold: true, underline: true }); r++;
      q.terms.forEach(term => {
        ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = `•  ${term}`; setFont(ws.getCell(`A${r}`)); ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: 'top' };
        ws.getRow(r).height = Math.max(20, 17 + Math.ceil(term.length / 95) * 12); r++;
      });
      ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = `CTK: ${q.seller.bankAccountName}`; setFont(ws.getCell(`A${r}`)); r++;
      ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = `STK: ${q.seller.bankAccountNo}`; setFont(ws.getCell(`A${r}`)); r++;
      ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = `Ngân hàng: ${q.seller.bankName}`; setFont(ws.getCell(`A${r}`)); r += 2;
      ws.mergeCells(`E${r}:F${r}`); ws.getCell(`E${r}`).value = 'NHÂN VIÊN KINH DOANH'; setFont(ws.getCell(`E${r}`), { bold: true, underline: true }); ws.getCell(`E${r}`).alignment = { horizontal: 'center' };
      ws.getRow(r).height = 22; r += 3;
      ws.mergeCells(`E${r}:F${r}`); ws.getCell(`E${r}`).value = q.seller.contact; setFont(ws.getCell(`E${r}`), { bold: true }); ws.getCell(`E${r}`).alignment = { horizontal: 'center' };

      ws.pageSetup.printArea = `A1:F${r}`;
      ws.headerFooter.oddFooter = '';
      const buffer = await workbook.xlsx.writeBuffer();
      downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileSafe(q.quoteNo)}.xlsx`);
      setStatus('Đã tạo Excel .xlsx có merge, border, font Times New Roman, định dạng tiền và dấu công ty.', 'ok');
    } catch (error) {
      console.error(error);
      setStatus(`Không thể tạo Excel: ${error.message}`, 'error');
    }
  }

  function exportPdf() {
    const q = getQuoteData();
    const validation = validateQuote(q);
    if (validation) return setStatus(validation, 'error');
    const oldTitle = document.title;
    document.title = fileSafe(q.quoteNo);
    setStatus('Đang mở bản in PDF chất lượng cao. Chọn “Save as PDF / Lưu thành PDF”.', 'ok');
    const restore = () => { document.title = oldTitle; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    setTimeout(() => { if (document.title !== oldTitle) document.title = oldTitle; }, 120000);
  }

  function downloadHistoryJson() {
    downloadBlob(new Blob([JSON.stringify(historyRead(), null, 2)], { type: 'application/json;charset=utf-8' }), `lich-su-bao-gia-${localDateISO()}.json`);
  }

  async function importHistoryJson(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const normalized = list.map(normalizeQuote);
      const existing = historyRead();
      const map = new Map(existing.map(q => [q.id, q]));
      normalized.forEach(q => map.set(q.id, q));
      const merged = Array.from(map.values()).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
      historyWrite(merged);
      if (state.storageConnected) {
        for (const q of normalized) {
          q.storageFile = await writeQuoteToDataFolder(q);
        }
        await writeDataIndex(merged);
        historyWrite(merged);
      }
      setStatus(`Đã nhập ${normalized.length} báo giá từ JSON.`, 'ok');
    } catch (error) {
      setStatus(`Không thể nhập JSON: ${error.message}`, 'error');
    }
  }

  async function clearHistory() {
    const history = historyRead();
    if (!history.length) return;
    const message = state.storageConnected
      ? 'Xóa toàn bộ lịch sử? Các file JSON báo giá trong data/ cũng sẽ bị xóa. Hành động này không thể hoàn tác.'
      : 'Xóa toàn bộ lịch sử đang lưu trên trình duyệt?';
    if (!confirm(message)) return;
    if (state.storageConnected) {
      for (const q of history) {
        if (!q.storageFile) continue;
        try { await state.dataDirHandle.removeEntry(q.storageFile); } catch { /* ignore */ }
      }
      await writeDataIndex([]);
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    renderHistory();
    newQuote(true);
    setStatus('Đã xóa dữ liệu báo giá.', 'ok');
  }

  function bindLiveInputs() {
    const ids = ['buyerCompany', 'buyerAddress', 'buyerTax', 'quoteNo', 'quoteDate', 'vatRate', 'currency', 'termsInput', 'sellerCompany', 'sellerAddress', 'sellerTax', 'sellerContact', 'sellerRole', 'bankAccountName', 'bankAccountNo', 'bankName'];
    ids.forEach(id => $(id).addEventListener('input', () => {
      if (id === 'currency') renderItemEditors();
      renderPreview();
    }));
    $('quoteDate').addEventListener('change', () => {
      if (!state.currentQuoteId) $('quoteNo').value = makeQuoteNo($('quoteDate').value);
      renderPreview();
    });
  }

  async function init() {
    $('sellerCompany').value = SELLER_DEFAULTS.company;
    $('sellerAddress').value = SELLER_DEFAULTS.address;
    $('sellerTax').value = SELLER_DEFAULTS.taxCode;
    $('sellerContact').value = SELLER_DEFAULTS.contact;
    $('sellerRole').value = SELLER_DEFAULTS.role;
    $('bankAccountName').value = SELLER_DEFAULTS.bankAccountName;
    $('bankAccountNo').value = SELLER_DEFAULTS.bankAccountNo;
    $('bankName').value = SELLER_DEFAULTS.bankName;
    $('termsInput').value = DEFAULT_TERMS.join('\n');
    $('quoteDate').value = localDateISO();
    $('quoteNo').value = makeQuoteNo($('quoteDate').value);
    state.items = [{ id: uid(), name: '', unit: 'Chiếc', quantity: 1, unitPrice: 0 }];

    bindLiveInputs();
    renderItemEditors();
    renderPreview();
    renderHistory();

    $('addItemBtn').addEventListener('click', () => addItem({}, true));
    $('addItemBottomBtn').addEventListener('click', () => addItem({}, true));
    $('saveBtn').addEventListener('click', saveQuote);
    $('newBtn').addEventListener('click', () => newQuote(false));
    $('wordBtn').addEventListener('click', exportWord);
    $('excelBtn').addEventListener('click', exportExcel);
    $('pdfBtn').addEventListener('click', exportPdf);
    $('connectDataBtn').addEventListener('click', connectDataFolder);
    $('syncDataBtn').addEventListener('click', () => syncFromDataFolder(true));
    $('downloadJsonBtn').addEventListener('click', downloadHistoryJson);
    $('importJsonBtn').addEventListener('click', () => $('jsonFileInput').click());
    $('jsonFileInput').addEventListener('change', e => { importHistoryJson(e.target.files?.[0]); e.target.value = ''; });
    $('clearHistoryBtn').addEventListener('click', clearHistory);
    $('historySearch').addEventListener('input', e => { state.historyFilter = e.target.value; renderHistory(); });
    $('scrollHistoryBtn').addEventListener('click', () => $('historySection').scrollIntoView({ behavior: 'smooth', block: 'start' }));

    await restoreDataFolder();
  }

  init();
})();
