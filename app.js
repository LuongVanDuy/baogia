(() => {
  'use strict';

  const STORAGE_KEY = 'baogia_history_v1';
  const SELLER_DEFAULTS = {
    company: 'CÔNG TY TNHH IN ĐẠI DƯƠNG VIỆT NAM',
    address: 'Số 9A ngách 24 ngõ 162 Phố Khương Đình, Phường Khương Đình, Hà Nội',
    taxCode: '0108834191',
    contact: 'Nguyễn Thị Ánh',
    role: 'Chức Vụ: Nhân viên kinh doanh'
  };
  const DEFAULT_TERMS = [
    'Địa chỉ giao hàng: Theo yêu cầu khách hàng',
    'Sản phẩm được bàn giao trong vào 10 - 12 ngày kể từ ngày đặt cọc và chốt mẫu (trừ T7, CN)',
    'Giấy tờ cho hàng hóa: Biên bản bàn giao, hóa đơn VAT',
    'Quý khách đặt cọc 50% giá trị đơn hàng trước khi làm hàng mẫu và sản xuất.'
  ];

  const state = { items: [] };
  let companyStampSvg = '';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const pad2 = n => String(n).padStart(2, '0');
  const localDateISO = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const makeQuoteNo = date => { const [y,m,d] = (date || localDateISO()).split('-'); return `PO_${d}${m}${y}`; };
  const parseNum = value => { const n = Number(String(value ?? '').replace(/[ ,]/g,'')); return Number.isFinite(n) ? n : 0; };
  const money = (value, currency='VND') => new Intl.NumberFormat('vi-VN', { minimumFractionDigits: currency === 'VND' ? 0 : 2, maximumFractionDigits: currency === 'VND' ? 0 : 2 }).format(parseNum(value));
  const currencyShort = () => $('currency').value === 'VND' ? 'VNĐ' : $('currency').value;
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const formatDateText = date => { const d = date ? new Date(`${date}T00:00:00`) : new Date(); return `Hôm nay, ngày ${pad2(d.getDate())} tháng ${pad2(d.getMonth()+1)} năm ${d.getFullYear()}`; };
  const fileSafe = value => String(value || 'bao-gia').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').replace(/[^a-zA-Z0-9-_]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'') || 'bao-gia';

  function setStatus(message, type='') {
    const el = $('status');
    el.textContent = message;
    el.className = `status ${type}`.trim();
    if (message) setTimeout(() => { if (el.textContent === message) el.textContent = ''; }, 4500);
  }

  async function ensureStampSvg() {
    if (companyStampSvg) return companyStampSvg;
    try {
      const response = await fetch('company-stamp.svg', { cache: 'force-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      companyStampSvg = await response.text();
    } catch (error) {
      console.warn('Không tải được dấu công ty:', error);
    }
    return companyStampSvg;
  }
  const stampDataUri = () => companyStampSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(companyStampSvg)}` : 'company-stamp.svg';

  function addItem(item={}) {
    state.items.push({ id: item.id || uid(), name: item.name ?? '', unit: item.unit ?? 'Cái', quantity: parseNum(item.quantity ?? 1), unitPrice: parseNum(item.unitPrice ?? 0) });
    renderItemEditors();
    renderPreview();
  }

  function removeItem(id) {
    if (state.items.length <= 1) return setStatus('Báo giá cần ít nhất 1 dòng hàng hóa/dịch vụ.', 'error');
    state.items = state.items.filter(item => item.id !== id);
    renderItemEditors();
    renderPreview();
  }

  function updateItemAmount(card, item) {
    const amount = parseNum(item.quantity) * parseNum(item.unitPrice);
    card.querySelector('.item-amount').textContent = `${money(amount, $('currency').value)} ${currencyShort()}`;
    card.querySelector('.money-suffix').textContent = currencyShort();
  }

  function refreshEditorAmounts() {
    document.querySelectorAll('.item-editor').forEach(card => {
      const item = state.items.find(x => x.id === card.dataset.id);
      if (item) updateItemAmount(card, item);
    });
  }

  function renderItemEditors() {
    const currency = currencyShort();
    $('itemsEditor').innerHTML = state.items.map((item, index) => `
      <div class="item-editor" data-id="${item.id}">
        <div class="item-head">
          <span class="item-index" data-index="${index+1}">Hàng hóa / Dịch vụ</span>
          <button type="button" class="btn small danger remove-item" data-id="${item.id}">Xóa dòng</button>
        </div>
        <label class="item-name-label">Tên hàng hóa / dịch vụ</label>
        <textarea class="item-name" rows="2" placeholder="Ví dụ: Dây đeo thẻ (Thuộc chương trình...)">${esc(item.name)}</textarea>
        <div class="item-fields">
          <div class="item-field"><label>Đơn vị</label><input class="item-unit" value="${esc(item.unit)}" placeholder="Cái" /></div>
          <div class="item-field"><label>Số lượng</label><input class="item-qty" type="number" inputmode="decimal" min="0" step="any" value="${item.quantity}" placeholder="0" /></div>
          <div class="item-field"><label>Đơn giá</label><div class="money-input"><input class="item-price" type="number" inputmode="decimal" min="0" step="any" value="${item.unitPrice}" placeholder="0" /><span class="money-suffix">${currency}</span></div></div>
          <div class="item-field"><label>Thành tiền</label><div class="item-amount">${money(item.quantity * item.unitPrice, $('currency').value)} ${currency}</div></div>
        </div>
      </div>`).join('');

    document.querySelectorAll('.remove-item').forEach(btn => btn.addEventListener('click', () => removeItem(btn.dataset.id)));
    document.querySelectorAll('.item-editor').forEach(card => {
      const item = state.items.find(x => x.id === card.dataset.id);
      card.querySelector('.item-name').addEventListener('input', e => { item.name = e.target.value; renderPreview(); });
      card.querySelector('.item-unit').addEventListener('input', e => { item.unit = e.target.value; renderPreview(); });
      card.querySelector('.item-qty').addEventListener('input', e => { item.quantity = parseNum(e.target.value); updateItemAmount(card,item); renderPreview(); });
      card.querySelector('.item-price').addEventListener('input', e => { item.unitPrice = parseNum(e.target.value); updateItemAmount(card,item); renderPreview(); });
    });
  }

  const getTerms = () => $('termsInput').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);

  function getQuoteData() {
    const items = state.items.map(({id,...item}) => ({ ...item, amount: parseNum(item.quantity) * parseNum(item.unitPrice) }));
    const subtotal = items.reduce((sum,item) => sum + item.amount, 0);
    const vatRate = parseNum($('vatRate').value);
    const vatAmount = subtotal * vatRate / 100;
    return {
      id: uid(), createdAt: new Date().toISOString(),
      quoteNo: $('quoteNo').value.trim() || makeQuoteNo($('quoteDate').value),
      quoteDate: $('quoteDate').value || localDateISO(), currency: $('currency').value, vatRate,
      seller: { company: $('sellerCompany').value.trim(), address: $('sellerAddress').value.trim(), taxCode: $('sellerTax').value.trim(), contact: $('sellerContact').value.trim(), role: $('sellerRole').value.trim() },
      buyer: { company: $('buyerCompany').value.trim(), address: $('buyerAddress').value.trim() },
      items, terms: getTerms(), subtotal, vatAmount, total: subtotal + vatAmount
    };
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
    $('pDateText').textContent = formatDateText(q.quoteDate);
    $('pQuoteNo').textContent = q.quoteNo;
    $('pIntro').textContent = `${q.seller.company || 'Chúng tôi'} chúng tôi đồng ý cung cấp đến quý đối tác các mặt hàng theo chi tiết dưới đây`;
    $('pCurrency1').textContent = `(${q.currency === 'VND' ? 'VNĐ' : q.currency})`;
    $('pCurrency2').textContent = `(${q.currency === 'VND' ? 'VNĐ' : q.currency})`;
    $('pVatLabel').textContent = `VAT ${q.vatRate}%`;
    $('pSubtotal').textContent = money(q.subtotal, q.currency);
    $('pVat').textContent = money(q.vatAmount, q.currency);
    $('pTotal').textContent = money(q.total, q.currency);
    $('pSignatureName').textContent = q.seller.contact;
    $('previewItems').innerHTML = q.items.map((item,i) => `<tr><td>${i+1}</td><td class="desc">${esc(item.name)}</td><td>${esc(item.unit)}</td><td>${money(item.quantity,'VND')}</td><td>${money(item.unitPrice,q.currency)}</td><td>${money(item.amount,q.currency)}</td></tr>`).join('');
    $('previewTerms').innerHTML = q.terms.map(term => `<li>${esc(term)}</li>`).join('');
  }

  function historyRead() {
    try { const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(data) ? data : []; }
    catch { return []; }
  }
  function historyWrite(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); renderHistory(); }

  function saveQuote() {
    const q = getQuoteData();
    if (!q.buyer.company) return setStatus('Vui lòng nhập TÊN CTY / Company của bên mua.', 'error');
    if (!q.items.some(item => item.name.trim())) return setStatus('Vui lòng nhập ít nhất một hàng hóa/dịch vụ.', 'error');
    const history = historyRead();
    const index = history.findIndex(item => item.quoteNo === q.quoteNo);
    if (index >= 0) {
      q.id = history[index].id; q.createdAt = history[index].createdAt; q.updatedAt = new Date().toISOString(); history[index] = q;
    } else history.unshift(q);
    historyWrite(history);
    setStatus(`Đã lưu ${q.quoteNo} vào lịch sử.`, 'ok');
  }

  function loadQuote(id) {
    const q = historyRead().find(item => item.id === id); if (!q) return;
    $('buyerCompany').value = q.buyer?.company || '';
    $('buyerAddress').value = q.buyer?.address || '';
    $('quoteNo').value = q.quoteNo || '';
    $('quoteDate').value = q.quoteDate || localDateISO();
    $('vatRate').value = q.vatRate ?? 8;
    $('currency').value = q.currency || 'VND';
    $('sellerCompany').value = q.seller?.company || SELLER_DEFAULTS.company;
    $('sellerAddress').value = q.seller?.address || SELLER_DEFAULTS.address;
    $('sellerTax').value = q.seller?.taxCode || SELLER_DEFAULTS.taxCode;
    $('sellerContact').value = q.seller?.contact || SELLER_DEFAULTS.contact;
    $('sellerRole').value = q.seller?.role || SELLER_DEFAULTS.role;
    $('termsInput').value = (q.terms || DEFAULT_TERMS).join('\n');
    state.items = (q.items || []).map(item => ({ id: uid(), name: item.name || '', unit: item.unit || 'Cái', quantity: parseNum(item.quantity), unitPrice: parseNum(item.unitPrice) }));
    if (!state.items.length) state.items = [{ id: uid(), name:'', unit:'Cái', quantity:1, unitPrice:0 }];
    renderItemEditors(); renderPreview(); window.scrollTo({top:0,behavior:'smooth'}); setStatus(`Đã mở ${q.quoteNo}.`, 'ok');
  }

  function deleteQuote(id) { if (confirm('Xóa báo giá này khỏi lịch sử?')) historyWrite(historyRead().filter(item => item.id !== id)); }

  function renderHistory() {
    const history = historyRead();
    if (!history.length) { $('historyContainer').innerHTML = '<div class="history-empty">Chưa có báo giá nào được lưu.</div>'; return; }
    $('historyContainer').innerHTML = `<table class="history-table"><thead><tr><th>PO số</th><th>Ngày</th><th>Khách hàng</th><th>Tổng tiền</th><th></th></tr></thead><tbody>${history.map(q => `<tr><td><strong>${esc(q.quoteNo)}</strong></td><td>${esc(q.quoteDate || '')}</td><td>${esc(q.buyer?.company || '')}</td><td>${money(q.total || 0,q.currency || 'VND')} ${q.currency === 'VND' ? 'VNĐ' : esc(q.currency || '')}</td><td style="white-space:nowrap"><button class="btn small history-load" data-id="${q.id}">Mở</button> <button class="btn small danger history-delete" data-id="${q.id}">Xóa</button></td></tr>`).join('')}</tbody></table>`;
    document.querySelectorAll('.history-load').forEach(btn => btn.addEventListener('click', () => loadQuote(btn.dataset.id)));
    document.querySelectorAll('.history-delete').forEach(btn => btn.addEventListener('click', () => deleteQuote(btn.dataset.id)));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  const downloadHistoryJson = () => downloadBlob(new Blob([JSON.stringify(historyRead(),null,2)], {type:'application/json;charset=utf-8'}), `lich-su-bao-gia-${localDateISO()}.json`);
  async function importHistoryJson(file) {
    if (!file) return;
    try { const data = JSON.parse(await file.text()); if (!Array.isArray(data)) throw new Error('File JSON phải là một mảng.'); historyWrite(data); setStatus(`Đã nhập ${data.length} báo giá.`, 'ok'); }
    catch (error) { setStatus(`Không thể nhập JSON: ${error.message}`, 'error'); }
  }

  function quoteExportHtml(q) {
    const rows = q.items.map((item,i) => `<tr><td style="text-align:center">${i+1}</td><td>${esc(item.name)}</td><td style="text-align:center">${esc(item.unit)}</td><td style="text-align:center">${item.quantity}</td><td style="text-align:right">${money(item.unitPrice,q.currency)}</td><td style="text-align:right">${money(item.amount,q.currency)}</td></tr>`).join('');
    const terms = q.terms.map(term => `<li>${esc(term)}</li>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:'Times New Roman',serif;font-size:12pt;color:#111}.head{position:relative;height:95px}.stamp{position:absolute;left:85px;top:0;width:82px;height:82px}h1{text-align:center;font-size:20pt;margin:0;padding-top:24px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #111;padding:6px}th{text-align:center}.label{font-weight:bold;margin-top:8px}.row{margin:4px 0}.total{text-align:center;font-weight:bold}.right{text-align:right}</style></head><body><div class="head"><img class="stamp" src="${stampDataUri()}" alt="Dấu đỏ công ty"><h1>BÁO GIÁ</h1></div><div class="label">BÊN BÁN/The Seller</div><div class="row">TÊN CTY/Company: <b>${esc(q.seller.company)}</b></div><div class="row">ĐỊA CHỈ/Address: ${esc(q.seller.address)}</div><div class="row">MÃ SỐ THUẾ/Tax Code: ${esc(q.seller.taxCode)}</div><div class="row">THÔNG TIN LIÊN HỆ: ${esc(q.seller.contact)} &nbsp; ${esc(q.seller.role)}</div><div class="label">BÊN MUA/The buyer</div><div class="row">TÊN CTY/Company: <b>${esc(q.buyer.company)}</b></div><div class="row">ĐỊA CHỈ/Address: ${esc(q.buyer.address)}</div><p>${esc(formatDateText(q.quoteDate))}<br>PO số: ${esc(q.quoteNo)}</p><p>${esc(q.seller.company)} chúng tôi đồng ý cung cấp đến quý đối tác các mặt hàng theo chi tiết dưới đây</p><table><thead><tr><th>STT</th><th>Tên hàng hoá, dịch vụ</th><th>Đơn vị</th><th>Số lượng</th><th>Đơn giá (${q.currency})</th><th>Thành tiền (${q.currency})</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="5" class="total">Tổng tiền trước VAT</td><td class="right">${money(q.subtotal,q.currency)}</td></tr><tr><td colspan="5" class="total">VAT ${q.vatRate}%</td><td class="right">${money(q.vatAmount,q.currency)}</td></tr><tr><td colspan="5" class="total">Tổng tiền sau VAT</td><td class="right"><b>${money(q.total,q.currency)}</b></td></tr></tfoot></table><div class="label">CÁC ĐIỀU KHOẢN ĐẶT HÀNG:</div><ul>${terms}</ul><div style="text-align:right;margin-top:35px"><b>NHÂN VIÊN KINH DOANH</b><br><br><br><i>Ánh</i><br><b>${esc(q.seller.contact)}</b></div></body></html>`;
  }

  async function exportWord() {
    await ensureStampSvg(); const q = getQuoteData();
    downloadBlob(new Blob(['\ufeff',quoteExportHtml(q)], {type:'application/msword;charset=utf-8'}), `${fileSafe(q.quoteNo)}.doc`);
    setStatus('Đã tạo file Word (.doc).', 'ok');
  }

  function exportExcel() {
    if (!window.XLSX) return setStatus('Thư viện Excel chưa tải được. Kiểm tra Internet rồi thử lại.', 'error');
    const q = getQuoteData();
    const aoa = [['BÁO GIÁ'],[],['BÊN BÁN/The Seller'],['TÊN CTY/Company:',q.seller.company],['ĐỊA CHỈ/Address:',q.seller.address],['MÃ SỐ THUẾ/Tax Code:',q.seller.taxCode],['THÔNG TIN LIÊN HỆ:',q.seller.contact,q.seller.role],['BÊN MUA/The buyer'],['TÊN CTY/Company:',q.buyer.company],['ĐỊA CHỈ/Address:',q.buyer.address],[formatDateText(q.quoteDate)],[`PO số: ${q.quoteNo}`],[`${q.seller.company} chúng tôi đồng ý cung cấp đến quý đối tác các mặt hàng theo chi tiết dưới đây`],['STT','Tên hàng hoá, dịch vụ','Đơn vị','Số lượng',`Đơn giá (${q.currency})`,`Thành tiền (${q.currency})`],...q.items.map((item,i)=>[i+1,item.name,item.unit,item.quantity,item.unitPrice,item.amount]),['Tổng tiền trước VAT','','','','',q.subtotal],[`VAT ${q.vatRate}%`,'','','','',q.vatAmount],['Tổng tiền sau VAT','','','','',q.total],['CÁC ĐIỀU KHOẢN ĐẶT HÀNG:'],...q.terms.map(term=>[`• ${term}`]),[],['','','','','NHÂN VIÊN KINH DOANH'],['','','','','Ánh'],['','','','',q.seller.contact]];
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols']=[{wch:8},{wch:48},{wch:14},{wch:13},{wch:18},{wch:20}];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Bao gia'); XLSX.writeFile(wb,`${fileSafe(q.quoteNo)}.xlsx`); setStatus('Đã tạo file Excel (.xlsx).','ok');
  }

  function buildPdfDefinition(q) {
    const currency = q.currency === 'VND' ? 'VNĐ' : q.currency;
    const body = [[{text:'STT',style:'tableHeader'},{text:'Tên hàng hoá, dịch vụ',style:'tableHeader'},{text:'Đơn vị',style:'tableHeader'},{text:'Số lượng',style:'tableHeader'},{text:`Đơn giá\n(${currency})`,style:'tableHeader'},{text:`Thành tiền\n(${currency})`,style:'tableHeader'}],
      ...q.items.map((item,i)=>[{text:String(i+1),alignment:'center'},{text:item.name||''},{text:item.unit||'',alignment:'center'},{text:money(item.quantity,'VND'),alignment:'center'},{text:money(item.unitPrice,q.currency),alignment:'right'},{text:money(item.amount,q.currency),alignment:'right'}]),
      [{text:'Tổng tiền trước VAT',colSpan:5,alignment:'center'},{},{},{},{},{text:money(q.subtotal,q.currency),alignment:'right'}],
      [{text:`VAT ${q.vatRate}%`,colSpan:5,alignment:'center'},{},{},{},{},{text:money(q.vatAmount,q.currency),alignment:'right'}],
      [{text:'Tổng tiền sau VAT',colSpan:5,alignment:'center',bold:true},{},{},{},{},{text:money(q.total,q.currency),alignment:'right',bold:true}]];
    const line = (label,value,bold=false) => ({ columns:[{text:label,width:112},{text:value||'—',bold,width:'*'}], columnGap:3, margin:[0,1.4,0,1.4] });
    return { pageSize:'A4', pageMargins:[28,20,28,18], defaultStyle:{font:'Roboto',fontSize:9.2,lineHeight:1.08}, content:[
      {columns:[{width:124,stack:companyStampSvg?[{svg:companyStampSvg,width:70,height:70,alignment:'right'}]:[{text:''}]},{text:'BÁO GIÁ',fontSize:19,bold:true,alignment:'center',margin:[0,20,0,0]},{text:'',width:124}],columnGap:4,margin:[0,-2,0,2]},
      {text:'BÊN BÁN/The Seller',bold:true,margin:[0,1,0,1]}, line('TÊN CTY/Company:',q.seller.company,true), line('ĐỊA CHỈ/Address:',q.seller.address), line('MÃ SỐ THUẾ/Tax Code:',q.seller.taxCode),
      {columns:[{text:'THÔNG TIN LIÊN HỆ:',width:112},{text:q.seller.contact||'',width:160},{text:q.seller.role||'',width:'*'}],columnGap:3,margin:[0,1.4,0,2]},
      {text:'BÊN MUA/The buyer',bold:true,margin:[0,1,0,1]}, line('TÊN CTY/Company:',q.buyer.company,true), line('ĐỊA CHỈ/Address:',q.buyer.address),
      {text:formatDateText(q.quoteDate),margin:[0,4,0,1]}, {text:`PO số:    ${q.quoteNo}`,margin:[0,0,0,4]}, {text:`${q.seller.company} chúng tôi đồng ý cung cấp đến quý đối tác các mặt hàng theo chi tiết dưới đây`,margin:[0,1,0,5]},
      {table:{headerRows:1,widths:[24,'*',42,45,67,72],body},layout:{hLineWidth:()=>.75,vLineWidth:()=>.75,hLineColor:()=>'#111',vLineColor:()=>'#111',paddingLeft:()=>4,paddingRight:()=>4,paddingTop:()=>4,paddingBottom:()=>4},fontSize:8.8,margin:[0,0,0,5]},
      {text:'CÁC ĐIỀU KHOẢN ĐẶT HÀNG:',bold:true,margin:[0,1,0,1]}, {ul:q.terms.map(term=>({text:term,margin:[0,.7,0,.7]})),margin:[10,0,0,2],fontSize:8.8},
      {columns:[{text:'',width:'*'},{width:180,alignment:'center',margin:[0,5,0,0],stack:[{text:'NHÂN VIÊN KINH DOANH',bold:true},{text:'\nÁnh',italics:true,bold:true},{text:q.seller.contact||'',bold:true,margin:[0,2,0,0]}]}]}
    ], styles:{tableHeader:{bold:true,alignment:'center'}} };
  }

  async function exportPdf() {
    if (!window.pdfMake) return setStatus('Thư viện PDF chưa tải được. Kiểm tra Internet rồi thử lại.', 'error');
    await ensureStampSvg(); const q = getQuoteData(); setStatus('Đang tạo PDF nét, dạng vector…');
    try { pdfMake.createPdf(buildPdfDefinition(q)).download(`${fileSafe(q.quoteNo)}.pdf`); setStatus('Đã tạo PDF nét hơn; báo giá thông thường nằm gọn trên 1 trang A4.','ok'); }
    catch (error) { setStatus(`Không thể tạo PDF: ${error.message}`,'error'); }
  }

  function newQuote() {
    $('buyerCompany').value=''; $('buyerAddress').value=''; $('quoteDate').value=localDateISO(); $('quoteNo').value=makeQuoteNo($('quoteDate').value); $('vatRate').value=8; $('currency').value='VND';
    state.items=[{id:uid(),name:'',unit:'Cái',quantity:1,unitPrice:0}]; renderItemEditors(); renderPreview(); setStatus('Đã tạo biểu mẫu báo giá mới.');
  }

  function init() {
    $('companyStamp').src='company-stamp.svg'; ensureStampSvg();
    $('sellerCompany').value=SELLER_DEFAULTS.company; $('sellerAddress').value=SELLER_DEFAULTS.address; $('sellerTax').value=SELLER_DEFAULTS.taxCode; $('sellerContact').value=SELLER_DEFAULTS.contact; $('sellerRole').value=SELLER_DEFAULTS.role;
    $('termsInput').value=DEFAULT_TERMS.join('\n'); $('quoteDate').value=localDateISO(); $('quoteNo').value=makeQuoteNo($('quoteDate').value); state.items=[{id:uid(),name:'',unit:'Cái',quantity:1,unitPrice:0}];
    ['buyerCompany','buyerAddress','quoteNo','quoteDate','vatRate','currency','termsInput','sellerCompany','sellerAddress','sellerTax','sellerContact','sellerRole'].forEach(id => $(id).addEventListener('input',()=>{ if(id==='quoteDate'&&!$('quoteNo').value.trim()) $('quoteNo').value=makeQuoteNo($('quoteDate').value); if(id==='currency') refreshEditorAmounts(); renderPreview(); }));
    renderItemEditors(); renderPreview(); renderHistory();
    $('addItemBtn').addEventListener('click',()=>addItem()); $('saveBtn').addEventListener('click',saveQuote); $('wordBtn').addEventListener('click',exportWord); $('excelBtn').addEventListener('click',exportExcel); $('pdfBtn').addEventListener('click',exportPdf);
    $('newBtn').addEventListener('click',()=>{ if(confirm('Tạo báo giá mới? Các thay đổi chưa lưu sẽ bị xóa.')) newQuote(); });
    $('downloadJsonBtn').addEventListener('click',downloadHistoryJson); $('importJsonBtn').addEventListener('click',()=>$('jsonFileInput').click());
    $('jsonFileInput').addEventListener('change',e=>{ importHistoryJson(e.target.files?.[0]); e.target.value=''; });
    $('clearHistoryBtn').addEventListener('click',()=>{ if(confirm('Xóa toàn bộ lịch sử báo giá trên trình duyệt này?')) { localStorage.removeItem(STORAGE_KEY); renderHistory(); } });
  }

  init();
})();
