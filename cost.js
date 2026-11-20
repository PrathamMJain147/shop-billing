(function () {
  'use strict';

  // Cost prices live ENCRYPTED in cost-data.js (window.COST_ENC), made by build.js.
  // They are decrypted here, in the browser, only after the right password is typed.
  var SESSION_KEY = 'spm_cp_pw'; // remembered only until the app/tab is closed

  function $(id) { return document.getElementById(id); }
  function money(n) { return n == null ? '—' : Number(n).toLocaleString('en-IN'); }
  function normKey(s) { return String(s).trim().toLowerCase().replace(/\s+/g, ' '); }
  function session(val) {
    try {
      if (val === undefined) return sessionStorage.getItem(SESSION_KEY);
      if (val === null) sessionStorage.removeItem(SESSION_KEY);
      else sessionStorage.setItem(SESSION_KEY, val);
    } catch (e) { /* storage blocked: just ask every time */ }
    return null;
  }

  var products = (Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [])
    .filter(function (p) { return p && typeof p.name === 'string' && p.name.trim(); })
    .map(function (p) {
      var name = p.name.trim().replace(/\s+/g, ' ');
      var sp = parseInt(p.price, 10);
      return { name: name, key: normKey(name), sp: isFinite(sp) ? sp : null,
               per: String(p.unit || '').trim().toLowerCase() === 'kg' ? '/kg' : '' };
    })
    .sort(function (a, b) { return a.key.localeCompare(b.key, 'en', { numeric: true }); });

  $('shopName').textContent = (window.SHOP && window.SHOP.name) || '';
  $('count').textContent = products.length + ' items';

  // ---------- decryption (AES-256-GCM, key from PBKDF2-SHA256) — matches build.js ----------
  function b64(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function decrypt(pw) {
    var E = window.COST_ENC;
    if (!E) return Promise.reject(new Error('nodata'));
    if (!window.crypto || !crypto.subtle) return Promise.reject(new Error('insecure'));
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: b64(E.salt), iterations: E.iter, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      })
      .then(function (key) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(E.iv) }, key, b64(E.data)); })
      .then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
  }

  // ---------- table ----------
  var cpMap = null;
  var list = $('list'), empty = $('empty'), filter = $('filter');

  function render() {
    var q = normKey(filter.value);
    var frag = document.createDocumentFragment();
    var shown = 0;
    products.forEach(function (p) {
      if (q && p.key.indexOf(q) === -1) return;
      shown++;
      var cp = cpMap && cpMap.hasOwnProperty(p.key) ? cpMap[p.key] : null;
      var tr = document.createElement('tr');
      [shown, p.name, money(cp) + (cp != null ? p.per : ''), money(p.sp) + (p.sp != null ? p.per : '')].forEach(function (v, c) {
        var td = document.createElement('td');
        td.textContent = v;
        if (c === 0) td.className = 'n';
        if (c >= 2) td.className = 'r';
        if (c === 2 && cp != null && p.sp != null && cp > p.sp) td.className = 'r loss';
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    });
    list.textContent = '';
    list.appendChild(frag);
    empty.hidden = shown > 0;
  }

  function showTable(pairs) {
    cpMap = {};
    pairs.forEach(function (x) { cpMap[normKey(x[0])] = x[1]; });
    $('lockBox').hidden = true;
    $('cpBox').hidden = false;
    filter.value = '';
    render();
  }

  function lock() {
    session(null);
    cpMap = null;
    list.textContent = '';
    $('cpBox').hidden = true;
    $('lockBox').hidden = false;
    $('pw').value = '';
    $('lockMsg').textContent = '';
    $('pw').focus();
  }

  function errorText(err) {
    var m = err && err.message;
    if (m === 'nodata') return 'Cost data not found. Run "node build.js" and upload again.';
    if (m === 'insecure') return 'Open this page over https (or localhost) to unlock.';
    return 'Wrong password';
  }

  // ---------- events ----------
  $('lockForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = $('pw').value;
    if (!pw) return;
    var btn = $('unlockBtn');
    btn.disabled = true; btn.textContent = 'Checking…';
    $('lockMsg').textContent = '';
    decrypt(pw).then(function (pairs) {
      session(pw);
      showTable(pairs);
    }).catch(function (err) {
      $('lockMsg').textContent = errorText(err);
      $('pw').select();
    }).then(function () {
      btn.disabled = false; btn.textContent = 'Unlock';
    });
  });

  $('btnLock').addEventListener('click', lock);
  filter.addEventListener('input', render);

  // already unlocked earlier in this session?
  var saved = session();
  if (saved) decrypt(saved).then(showTable).catch(function () { session(null); });
})();
