(function () {
  'use strict';

  function toInt(v) {
    var n = parseInt(String(v == null ? '' : v).replace(/\D/g, ''), 10);
    return isFinite(n) ? n : null;
  }
  function money(n) { return n == null ? '—' : n.toLocaleString('en-IN'); }

  var items = (Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [])
    .filter(function (p) { return p && typeof p.name === 'string' && p.name.trim(); })
    .map(function (p) {
      var name = p.name.trim().replace(/\s+/g, ' ');
      var kg = String(p.unit || '').trim().toLowerCase() === 'kg';
      return { name: name, key: name.toLowerCase(), cp: toInt(p.cp), sp: toInt(p.price), per: kg ? '/kg' : '' };
    })
    .sort(function (a, b) { return a.key.localeCompare(b.key, 'en', { numeric: true }); });

  var list = document.getElementById('list');
  var empty = document.getElementById('empty');
  var filter = document.getElementById('filter');

  document.getElementById('shopName').textContent = (window.SHOP && window.SHOP.name) || '';
  document.getElementById('count').textContent = items.length + ' items';

  function render() {
    var q = filter.value.trim().toLowerCase().replace(/\s+/g, ' ');
    var frag = document.createDocumentFragment();
    var shown = 0;
    items.forEach(function (p) {
      if (q && p.key.indexOf(q) === -1) return;
      shown++;
      var tr = document.createElement('tr');
      [shown, p.name, money(p.cp) + (p.cp != null ? p.per : ''), money(p.sp) + (p.sp != null ? p.per : '')].forEach(function (v, c) {
        var td = document.createElement('td');
        td.textContent = v;
        if (c === 0) td.className = 'n';
        if (c >= 2) td.className = 'r';
        if (c === 2 && p.cp != null && p.sp != null && p.cp > p.sp) td.className = 'r loss';
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    });
    list.textContent = '';
    list.appendChild(frag);
    empty.hidden = shown > 0;
  }

  filter.addEventListener('input', render);
  render();
})();
