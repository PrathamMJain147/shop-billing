(function () {
  'use strict';

  // Shop name / GST No are set in products.js
  var SHOP = window.SHOP || { name: 'Sree Parshwanatha Paper Mart', gst: '' };

  var STORE_BILL = 'spm_bill_v1';
  var STORE_SIZE = 'spm_size_v1';
  var MAX_SUGGEST = 10;
  var MAX_QTY_DIGITS = 5;
  var MAX_PRICE_DIGITS = 7;

  // ---------- helpers ----------
  function toInt(v) {
    var n = parseInt(String(v == null ? '' : v).replace(/\D/g, ''), 10);
    return isFinite(n) ? n : 0;
  }
  function fmt(n) { return Number(n || 0).toLocaleString('en-IN'); }
  function $(id) { return document.getElementById(id); }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { /* storage blocked: app still works, just no autosave */ }
    return null;
  }

  // ---------- products (cost price is deliberately NOT read here) ----------
  function normKey(s) { return String(s).trim().toLowerCase().replace(/\s+/g, ' '); }

  var PRODUCTS = (Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [])
    .filter(function (p) { return p && typeof p.name === 'string' && p.name.trim(); })
    .map(function (p) {
      var name = p.name.trim().replace(/\s+/g, ' ');
      var unit = String(p.unit || '').trim().toLowerCase() === 'kg' ? 'kg' : 'pcs';
      return { name: name, price: toInt(p.price), unit: unit, key: normKey(name) };
    })
    // number-aware A-Z: "6x4x4" before "10x8x6"
    .sort(function (a, b) { return a.key.localeCompare(b.key, 'en', { numeric: true }); });

  function findExact(name) {
    var k = normKey(name);
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].key === k) return PRODUCTS[i];
    return null;
  }

  // true if q appears at the start of any word in key ("pap" matches "a4 paper")
  function wordStartsWith(key, q) {
    var from = 0, at;
    while ((at = key.indexOf(q, from)) !== -1) {
      if (at === 0 || /[^a-z0-9]/.test(key.charAt(at - 1))) return true;
      from = at + 1;
    }
    return false;
  }

  // 1st: names starting with what is typed, 2nd: a word starting with it. Each A-Z.
  function search(q) {
    q = normKey(q);
    if (!q) return [];
    var starts = [], words = [];
    for (var i = 0; i < PRODUCTS.length; i++) {
      var p = PRODUCTS[i];
      if (p.key.indexOf(q) === 0) starts.push(p);
      else if (wordStartsWith(p.key, q)) words.push(p);
    }
    return starts.concat(words).slice(0, MAX_SUGGEST);
  }

  // ---------- state ----------
  // row: { name: string, qty: number|'' , price: number|'' }
  var rows = [];
  var customer = '';

  function blankRow() { return { name: '', unit: 'pcs', qty: 1, price: '' }; }

  function loadBill() {
    try {
      var saved = JSON.parse(store(STORE_BILL) || 'null');
      if (saved && !Array.isArray(saved)) {
        customer = typeof saved.customer === 'string' ? saved.customer : '';
        saved = saved.rows;
      }
      if (Array.isArray(saved)) {
        rows = saved
          .filter(function (r) { return r && typeof r.name === 'string'; })
          .map(function (r) {
            var unit = r.unit === 'kg' ? 'kg' : 'pcs';
            return {
              name: r.name,
              unit: unit,
              qty: r.qty === '' ? '' : (unit === 'kg' ? (parseFloat(r.qty) || 0) : toInt(r.qty)),
              price: r.price === '' ? '' : toInt(r.price),
            };
          });
      }
    } catch (e) { rows = []; }
    ensureTrailingBlank();
  }

  function saveBill() { store(STORE_BILL, JSON.stringify({ customer: customer, rows: rows })); }

  function ensureTrailingBlank() {
    var last = rows[rows.length - 1];
    if (!last || last.name.trim() !== '') rows.push(blankRow());
  }

  // a row's name was just cleared: if the row below is the untouched blank row,
  // drop it so there is only ever ONE empty entry row at the bottom
  function trimTrailingBlank(i) {
    var last = rows[rows.length - 1];
    if (i === rows.length - 2 && last && !last.name.trim() && last.price === '') {
      rows.pop();
      if (rowsEl.lastElementChild) rowsEl.removeChild(rowsEl.lastElementChild);
    }
  }

  function filledRows() {
    return rows.filter(function (r) { return r.name.trim() !== ''; });
  }

  // ---------- quantity / units ----------
  // pcs: whole numbers.  kg: up to 3 decimals (grams). Amount is rounded to whole rupees.
  function isKg(r) { return r.unit === 'kg'; }
  function qtyNum(r) { return isKg(r) ? (parseFloat(r.qty) || 0) : toInt(r.qty); }
  function kgText(q) { return String(Math.round((parseFloat(q) || 0) * 1000) / 1000); }
  function qtyShown(r) { return r.qty === '' ? '' : (isKg(r) ? kgText(r.qty) : String(r.qty)); }
  function amount(r) { return Math.round(qtyNum(r) * toInt(r.price)); }

  // ---------- rendering ----------
  var rowsEl = $('rows');

  function rowHtml() {
    return '' +
      '<span class="sn"></span>' +
      '<div class="item-wrap"><input type="text" class="item" placeholder="Type item name…" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="next"></div>' +
      '<div class="f qty"><span>Qty</span><div class="qbox">' +
        '<button type="button" class="step minus" aria-label="Less" tabindex="-1">&minus;</button>' +
        '<input type="text" inputmode="decimal" autocomplete="off" enterkeyhint="next" aria-label="Quantity">' +
        '<button type="button" class="step plus" aria-label="More" tabindex="-1">+</button>' +
        '<button type="button" class="unit" title="Switch pcs / kg"></button></div></div>' +
      '<label class="f price"><span>Price &#8377;</span><input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="next"></label>' +
      '<span class="amt"></span>' +
      '<button type="button" class="del" title="Remove row" aria-label="Remove row">&times;</button>';
  }

  function buildRowEl(i) {
    var el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = rowHtml();
    fillRowEl(el, i);
    return el;
  }

  function fillRowEl(el, i) {
    var r = rows[i];
    el.dataset.i = i;
    el.querySelector('.sn').textContent = i + 1;
    el.querySelector('.item').value = r.name;
    var qi = el.querySelector('.qty input');
    qi.value = qtyShown(r);
    // phone keypad: digits only for pcs, digits + point for kg
    qi.setAttribute('inputmode', isKg(r) ? 'decimal' : 'numeric');
    el.classList.toggle('is-kg', isKg(r));
    var u = el.querySelector('.unit');
    u.textContent = isKg(r) ? 'kg' : 'pcs';
    u.classList.toggle('kg', isKg(r));
    el.querySelector('.price input').value = r.price;
    updateAmt(el, i);
  }

  function updateAmt(el, i) {
    var r = rows[i];
    el.querySelector('.amt').textContent = r.name.trim() || r.price !== '' ? fmt(amount(r)) : '';
  }

  function renderAll() {
    rowsEl.textContent = '';
    for (var i = 0; i < rows.length; i++) rowsEl.appendChild(buildRowEl(i));
    updateTotal();
  }

  function updateTotal() {
    var t = 0;
    filledRows().forEach(function (r) { t += amount(r); });
    $('grandTotal').textContent = fmt(t);
  }

  function rowElAt(i) { return rowsEl.children[i]; }

  // after a row's name becomes non-empty, make sure there is an empty row below
  function maybeAppendRow() {
    var before = rows.length;
    ensureTrailingBlank();
    if (rows.length > before) rowsEl.appendChild(buildRowEl(rows.length - 1));
  }

  function onChange(i) {
    var el = rowElAt(i);
    if (el) updateAmt(el, i);
    updateTotal();
    saveBill();
  }

  // ---------- suggestions ----------
  var sugEl = $('suggest');
  var sug = { input: null, index: -1, items: [], active: -1, hideTimer: null };

  function showSuggest(input, i) {
    var items = search(input.value);
    sug.input = input; sug.index = i; sug.items = items; sug.active = items.length ? 0 : -1;
    if (!items.length) { hideSuggest(); return; }
    sugEl.textContent = '';
    items.forEach(function (p, k) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.dataset.k = k;
      var n = document.createElement('span'); n.textContent = p.name;
      var pr = document.createElement('span'); pr.className = 'p';
      pr.textContent = '₹' + fmt(p.price) + (p.unit === 'kg' ? '/kg' : '');
      li.appendChild(n); li.appendChild(pr);
      if (k === sug.active) li.className = 'active';
      sugEl.appendChild(li);
    });
    positionSuggest();
    sugEl.hidden = false;
  }

  function positionSuggest() {
    if (!sug.input) return;
    var r = sug.input.getBoundingClientRect();
    var width = Math.max(r.width, Math.min(320, window.innerWidth - 32));
    var left = Math.min(r.left, window.innerWidth - width - 16);
    sugEl.style.left = (Math.max(16, left) + window.scrollX) + 'px';
    sugEl.style.top = (r.bottom + 4 + window.scrollY) + 'px';
    sugEl.style.width = width + 'px';
  }

  function hideSuggest() {
    sugEl.hidden = true;
    sug.items = []; sug.active = -1;
  }

  function setActive(k) {
    var lis = sugEl.children;
    if (!lis.length) return;
    sug.active = (k + lis.length) % lis.length;
    for (var x = 0; x < lis.length; x++) lis[x].className = x === sug.active ? 'active' : '';
    lis[sug.active].scrollIntoView({ block: 'nearest' });
  }

  function pick(k) {
    var p = sug.items[k];
    var i = sug.index;
    if (!p || rows[i] == null) return;
    applyProduct(i, p);
    hideSuggest();
    maybeAppendRow();
    onChange(i);
    focusItem(i + 1);
  }

  function applyProduct(i, p) {
    var r = rows[i];
    r.name = p.name;
    r.price = p.price;
    if (r.unit !== p.unit) { r.unit = p.unit; r.qty = 1; }
    if (r.qty === '' || r.qty === 0) r.qty = 1;
    fillRowEl(rowElAt(i), i);
  }

  function setUnit(i, unit) {
    var r = rows[i];
    if (r.unit === unit) return;
    r.unit = unit;
    if (unit === 'pcs' && r.qty !== '') r.qty = Math.max(1, Math.round(parseFloat(r.qty) || 0));
    fillRowEl(rowElAt(i), i);
    onChange(i);
  }

  function focusItem(i) {
    var el = rowElAt(i);
    if (el) el.querySelector('.item').focus();
  }

  // keep focus in the input while tapping a suggestion
  sugEl.addEventListener('mousedown', function (e) { e.preventDefault(); });
  sugEl.addEventListener('click', function (e) {
    var li = e.target.closest('li');
    if (li) pick(+li.dataset.k);
  });
  window.addEventListener('resize', function () { if (!sugEl.hidden) positionSuggest(); });

  // ---------- row events (delegated) ----------
  function rowIndex(target) {
    var el = target.closest('.row');
    return el && el.dataset.i != null ? +el.dataset.i : -1;
  }

  rowsEl.addEventListener('input', function (e) {
    var t = e.target, i = rowIndex(t);
    if (i < 0) return;
    if (t.classList.contains('item')) {
      rows[i].name = t.value;
      showSuggest(t, i);
      if (t.value.trim()) maybeAppendRow(); else trimTrailingBlank(i);
    } else if (t.closest('.qty') || t.closest('.price')) {
      var isQty = !!t.closest('.qty');
      var kg = isQty && isKg(rows[i]);
      var raw = t.value.replace(/[^\d.]/g, '');
      var dot = raw.indexOf('.');
      var digits = (dot >= 0 ? raw.slice(0, dot) : raw).slice(0, isQty ? MAX_QTY_DIGITS : MAX_PRICE_DIGITS);
      // kg: up to 3 decimals (grams). pcs + price: whole numbers, anything after a point is dropped
      var dec = kg && dot >= 0 ? raw.slice(dot + 1).replace(/\./g, '').slice(0, 3) : '';
      var shown = kg && dot >= 0 ? digits + '.' + dec : digits;
      if (t.value !== shown) t.value = shown;
      var v;
      if (kg) v = digits === '' && dec === '' ? '' : parseFloat((digits || '0') + '.' + (dec || '0'));
      else v = digits === '' ? '' : toInt(digits);
      if (isQty) rows[i].qty = v; else rows[i].price = v;
    }
    onChange(i);
  });

  // block non-digits as they are typed (the point is allowed only in kg qty)
  rowsEl.addEventListener('beforeinput', function (e) {
    var t = e.target, i = rowIndex(t);
    if (i < 0 || t.tagName !== 'INPUT' || t.classList.contains('item')) return;
    if (e.inputType.indexOf('delete') === 0) { t._afterPoint = false; return; }
    // only single typed keys are checked here; paste / autofill / multi-char text is
    // cleaned by the input handler (keeps the whole-number part: "4.75" -> 4)
    if (e.inputType !== 'insertText' || !e.data || e.data.length !== 1) return;
    var isQty = !!t.closest('.qty');
    var kgQty = isQty && isKg(rows[i]);
    // after a blocked point, swallow the digits that follow it, so "2.5" stays 2 (not 25)
    // and "45.50" stays 45 (not 4550)
    if (!kgQty && t._afterPoint && /^\d+$/.test(e.data)) { e.preventDefault(); return; }
    var allowed = kgQty ? /^[\d.]+$/ : /^\d+$/;
    if (allowed.test(e.data)) return;
    e.preventDefault();
    if (/[.,]/.test(e.data)) {
      t._afterPoint = true;
      toast(isQty ? 'Pieces are whole numbers only — tap "pcs" to switch to kg'
                  : 'Price is whole rupees only (no paise)');
    }
  });

  rowsEl.addEventListener('focusin', function (e) {
    var t = e.target;
    if (t.classList.contains('item')) {
      clearTimeout(sug.hideTimer);
      if (t.value.trim()) showSuggest(t, rowIndex(t));
    } else if (t.tagName === 'INPUT') {
      t._afterPoint = false;
      // select number so typing replaces it
      setTimeout(function () { try { t.select(); } catch (err) {} }, 0);
    }
  });

  rowsEl.addEventListener('focusout', function (e) {
    var t = e.target, i = rowIndex(t);
    if (i < 0 || !rows[i]) return;
    if (t.classList.contains('item')) {
      sug.hideTimer = setTimeout(hideSuggest, 150);
      // typed an exact product name without picking -> fill price
      var p = findExact(t.value);
      if (p && rows[i].price === '') {
        applyProduct(i, p);
        onChange(i);
      }
    } else if (t.closest('.qty') && t.tagName === 'INPUT') {
      if ((rows[i].qty === '' || rows[i].qty === 0) && rows[i].name.trim()) { rows[i].qty = 1; onChange(i); }
      t.value = qtyShown(rows[i]);
    } else if (t.closest('.price')) {
      t.value = rows[i].price;
    }
  });

  rowsEl.addEventListener('keydown', function (e) {
    var t = e.target, i = rowIndex(t);
    if (i < 0) return;
    if (t.classList.contains('item') && !sugEl.hidden && sug.items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(sug.active + 1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(sug.active - 1); return; }
      if (e.key === 'Escape') { hideSuggest(); return; }
      if (e.key === 'Enter') { e.preventDefault(); pick(Math.max(0, sug.active)); return; }
    }
    if (e.key === 'Enter' && t.tagName === 'INPUT') {
      e.preventDefault();
      var el = rowElAt(i);
      if (t.classList.contains('item')) el.querySelector('.qty input').focus();
      else if (t.closest('.qty')) el.querySelector('.price input').focus();
      else focusItem(i + 1);
    }
  });

  rowsEl.addEventListener('click', function (e) {
    var sb = e.target.closest('.step');
    if (sb) {
      var si = rowIndex(sb);
      if (si < 0 || isKg(rows[si])) return;
      var cur = toInt(rows[si].qty) || 0;
      var next = sb.classList.contains('plus') ? cur + 1 : cur - 1;
      rows[si].qty = Math.min(Math.max(1, next), Math.pow(10, MAX_QTY_DIGITS) - 1);
      rowElAt(si).querySelector('.qty input').value = rows[si].qty;
      onChange(si);
      return;
    }
    var ub = e.target.closest('.unit');
    if (ub) {
      var ui = rowIndex(ub);
      if (ui >= 0) setUnit(ui, isKg(rows[ui]) ? 'pcs' : 'kg');
      return;
    }
    var btn = e.target.closest('.del');
    if (!btn) return;
    var i = rowIndex(btn);
    if (i < 0 || i === rows.length - 1) return; // bottom entry row stays
    hideSuggest();
    rows.splice(i, 1);
    ensureTrailingBlank();
    renderAll();
    saveBill();
  });

  // ---------- PDF ----------
  var SIZES = {
    '4x6': { format: [101.6, 152.4], m: 5, title: 13, sub: 8, body: 8, pad: 1.2,
             cols: { 0: 6, 2: 13, 3: 16, 4: 17 } },
    'a4':  { format: 'a4', m: 15, title: 20, sub: 10, body: 10, pad: 2.2,
             cols: { 0: 10, 2: 24, 3: 30, 4: 32 } },
  };

  function currentSize() {
    var el = document.querySelector('input[name="size"]:checked');
    return el && SIZES[el.value] ? el.value : '4x6';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function buildPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF library not loaded. Refresh the page.');
    var items = filledRows();
    if (!items.length) throw new Error('Add at least one item first.');

    var S = SIZES[currentSize()];
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: S.format, orientation: 'portrait' });
    if (typeof doc.autoTable !== 'function') throw new Error('PDF table plugin not loaded. Refresh the page.');

    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var ptToMm = 0.3528;
    var now = new Date();
    var dateStr = pad2(now.getDate()) + '-' + pad2(now.getMonth() + 1) + '-' + now.getFullYear();
    var timeStr = pad2(now.getHours()) + ':' + pad2(now.getMinutes());

    var y = S.m + S.title * ptToMm;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(S.title);
    var titleLines = doc.splitTextToSize(SHOP.name, W - 2 * S.m);
    doc.text(titleLines, W / 2, y, { align: 'center' });
    y += (titleLines.length - 1) * S.title * ptToMm * 1.15 + S.sub * ptToMm * 1.6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(S.sub);
    doc.text('GST No: ' + SHOP.gst, W / 2, y, { align: 'center' });
    y += S.sub * ptToMm * 1.8;
    var cust = customer.trim();
    if (cust) {
      var custLines = doc.splitTextToSize('Customer: ' + cust, W - 2 * S.m);
      doc.text(custLines, S.m, y);
      y += custLines.length * S.sub * ptToMm * 1.4;
    }
    doc.text('Date: ' + dateStr, S.m, y);
    doc.text('Time: ' + timeStr, W - S.m, y, { align: 'right' });
    y += S.sub * ptToMm * 0.9;
    doc.setLineWidth(0.3);
    doc.line(S.m, y, W - S.m, y);

    var total = 0, totalQty = 0, anyKg = false;
    var body = items.map(function (r, k) {
      var a = amount(r);
      total += a;
      if (isKg(r)) anyKg = true; else totalQty += toInt(r.qty);
      return [
        k + 1,
        r.name.trim(),
        isKg(r) ? kgText(r.qty) + ' kg' : fmt(toInt(r.qty)),
        fmt(toInt(r.price)) + (isKg(r) ? '/kg' : ''),
        fmt(a),
      ];
    });

    var colStyles = {};
    Object.keys(S.cols).forEach(function (c) {
      colStyles[c] = { cellWidth: S.cols[c], halign: c === '0' ? 'center' : 'right' };
    });
    colStyles[1] = { cellWidth: 'auto', halign: 'left' };

    doc.autoTable({
      startY: y + 2,
      margin: { left: S.m, right: S.m, top: S.m, bottom: S.m },
      head: [['#', 'Item', 'Qty', 'Rate', 'Amount']],
      body: body,
      // pcs + kg can't be added together, so the qty total is left blank on mixed bills
      foot: [['', 'Total (Rs.)', anyKg ? '' : fmt(totalQty), '', fmt(total)]],
      showFoot: 'lastPage',
      showHead: 'everyPage',
      theme: 'grid',
      styles: {
        font: 'helvetica', fontSize: S.body, cellPadding: S.pad, overflow: 'linebreak',
        textColor: 0, lineColor: 120, lineWidth: 0.15, fillColor: false, valign: 'middle',
      },
      headStyles: { fontStyle: 'bold', fillColor: [235, 235, 235], textColor: 0 },
      footStyles: { fontStyle: 'bold', fillColor: [235, 235, 235], textColor: 0, fontSize: S.body + 1 },
      columnStyles: colStyles,
      didParseCell: function (d) {
        if (d.section === 'head' || d.section === 'foot') {
          d.cell.styles.halign = d.column.index === 1 ? 'left' : (d.column.index === 0 ? 'center' : 'right');
        }
      },
    });

    var endY = doc.lastAutoTable.finalY + S.sub * ptToMm * 2.2;
    if (endY > H - S.m) { doc.addPage(); endY = S.m + S.sub * ptToMm; }
    doc.setFontSize(S.sub);
    doc.text('Thank you! Visit again.', W / 2, endY, { align: 'center' });

    var custTag = cust.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 30);
    var filename = 'Bill_' + (custTag ? custTag + '_' : '') + now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate()) +
      '_' + pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds()) + '.pdf';
    return { doc: doc, filename: filename };
  }

  function downloadPdf() {
    try {
      var r = buildPdf();
      r.doc.save(r.filename);
    } catch (e) { toast(e.message || 'Could not create PDF.'); }
  }

  function sharePdf() {
    var r;
    try { r = buildPdf(); } catch (e) { toast(e.message || 'Could not create PDF.'); return; }
    var file;
    try { file = new File([r.doc.output('blob')], r.filename, { type: 'application/pdf' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: r.filename }).catch(function (err) {
        if (err && err.name !== 'AbortError') { r.doc.save(r.filename); toast('Share failed — PDF downloaded instead.'); }
      });
    } else {
      r.doc.save(r.filename);
      toast('Sharing not supported here — PDF downloaded instead.');
    }
  }

  // ---------- toast ----------
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3000);
  }

  // ---------- init ----------
  $('shopName').textContent = SHOP.name;
  $('shopGst').textContent = SHOP.gst;
  $('today').textContent = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  var savedSize = store(STORE_SIZE);
  if (savedSize && SIZES[savedSize]) {
    var radio = document.querySelector('input[name="size"][value="' + savedSize + '"]');
    if (radio) radio.checked = true;
  }
  document.querySelectorAll('input[name="size"]').forEach(function (r) {
    r.addEventListener('change', function () { store(STORE_SIZE, currentSize()); });
  });

  $('btnDownload').addEventListener('click', downloadPdf);
  $('btnShare').addEventListener('click', sharePdf);
  $('btnNew').addEventListener('click', function () {
    if (filledRows().length && !confirm('Clear this bill and start a new one?')) return;
    hideSuggest();
    rows = [];
    customer = '';
    custEl.value = '';
    ensureTrailingBlank();
    renderAll();
    saveBill();
    custEl.focus();
  });

  var custEl = $('customer');
  custEl.addEventListener('input', function () { customer = custEl.value; saveBill(); });
  custEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); focusItem(0); }
  });

  if (!PRODUCTS.length) toast('No products loaded — check products.js for a typo');

  loadBill();
  custEl.value = customer;
  renderAll();
})();
