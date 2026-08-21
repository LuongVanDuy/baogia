(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const nextFrame = fn => requestAnimationFrame(() => requestAnimationFrame(fn));

  function fixPreviewRows() {
    const body = $('previewItems');
    if (!body) return;
    body.querySelectorAll('tr').forEach(row => {
      const cells = row.children;
      // Older app.js rendered the quantity cell twice. Keep the six columns
      // that match the table header: STT, name, unit, qty, unit price, amount.
      if (cells.length === 7) cells[4].remove();
    });
  }

  function makeItemInput(textarea) {
    if (!textarea || textarea.dataset.inputProxy === '1') return;
    textarea.dataset.inputProxy = '1';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'item-input item-name item-name-proxy';
    input.value = textarea.value;
    input.placeholder = textarea.placeholder || 'Tên hàng hóa / dịch vụ';
    input.autocomplete = 'off';
    textarea.parentNode.insertBefore(input, textarea);
    textarea.remove();

    input.addEventListener('input', () => {
      textarea.value = input.value;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function syncItemInputs() {
    document.querySelectorAll('#itemsEditor textarea.item-name, #itemsEditor .item-textarea').forEach(makeItemInput);
  }

  const termsSource = $('termsInput');
  const termsEditor = $('termsEditor');
  let lastTermsSource = '';

  function parseTerms() {
    if (!termsSource) return [];
    return termsSource.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  }

  function writeTermsFromInputs() {
    if (!termsSource || !termsEditor) return;
    const values = [...termsEditor.querySelectorAll('.term-input')]
      .map(input => input.value.trim())
      .filter(Boolean);
    termsSource.value = values.join('\n');
    lastTermsSource = termsSource.value;
    termsSource.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function renderTerms() {
    if (!termsSource || !termsEditor) return;
    const terms = parseTerms();
    const list = terms.length ? terms : [''];
    termsEditor.innerHTML = list.map((term, index) => `
      <div class="term-row">
        <span class="term-index">${index + 1}</span>
        <input class="term-input" type="text" value="${term.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}" placeholder="Nhập điều khoản" />
        <button class="term-remove" type="button" aria-label="Xóa điều khoản" title="Xóa điều khoản">×</button>
      </div>`).join('');

    termsEditor.querySelectorAll('.term-input').forEach(input => {
      input.addEventListener('input', writeTermsFromInputs);
    });
    termsEditor.querySelectorAll('.term-remove').forEach((button, index) => {
      button.addEventListener('click', () => {
        const rows = [...termsEditor.querySelectorAll('.term-row')];
        if (rows.length === 1) {
          rows[0].querySelector('.term-input').value = '';
        } else {
          rows[index]?.remove();
        }
        renumberTerms();
        writeTermsFromInputs();
      });
    });
    lastTermsSource = termsSource.value;
  }

  function renumberTerms() {
    termsEditor?.querySelectorAll('.term-row').forEach((row, index) => {
      const number = row.querySelector('.term-index');
      if (number) number.textContent = index + 1;
    });
  }

  function addTerm() {
    if (!termsEditor) return;
    const row = document.createElement('div');
    row.className = 'term-row';
    row.innerHTML = `
      <span class="term-index"></span>
      <input class="term-input" type="text" placeholder="Nhập điều khoản" />
      <button class="term-remove" type="button" aria-label="Xóa điều khoản" title="Xóa điều khoản">×</button>`;
    termsEditor.appendChild(row);
    const input = row.querySelector('.term-input');
    input.addEventListener('input', writeTermsFromInputs);
    row.querySelector('.term-remove').addEventListener('click', () => {
      row.remove();
      if (!termsEditor.querySelector('.term-row')) addTerm();
      renumberTerms();
      writeTermsFromInputs();
    });
    renumberTerms();
    input.focus();
  }

  $('addTermBtn')?.addEventListener('click', addTerm);

  const itemsEditor = $('itemsEditor');
  if (itemsEditor) {
    new MutationObserver(() => syncItemInputs()).observe(itemsEditor, { childList: true, subtree: true });
  }
  const previewItems = $('previewItems');
  if (previewItems) {
    new MutationObserver(() => fixPreviewRows()).observe(previewItems, { childList: true, subtree: true });
  }

  document.addEventListener('click', event => {
    if (event.target.closest('#addItemBtn, #addItemBottomBtn')) {
      nextFrame(() => document.querySelector('#itemsEditor .item-row:last-child .item-name-proxy')?.focus());
    }
  });

  // app.js writes the hidden terms value directly when a quotation is
  // opened or reset. Keep the visible input list in sync with those writes.
  setInterval(() => {
    if (termsSource && termsSource.value !== lastTermsSource) renderTerms();
  }, 250);

  syncItemInputs();
  renderTerms();
  fixPreviewRows();
})();
