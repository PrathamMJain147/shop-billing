#!/usr/bin/env node
// =====================================================================
//  node build.js
//
//  Reads   products-master.js   (private: name, cp, price, unit)
//  Writes  products.js          (public: name, price, unit — NO cost price)
//          cost-data.js         (public: cost prices ENCRYPTED with the password)
//
//  Password comes from build-password.txt (private, never uploaded).
//  To change the password: edit build-password.txt, run node build.js, push.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const DIR = __dirname;
const MASTER = path.join(DIR, 'products-master.js');
const PASSFILE = path.join(DIR, 'build-password.txt');
const OUT_PUBLIC = path.join(DIR, 'products.js');
const OUT_COST = path.join(DIR, 'cost-data.js');
const ITER = 600000; // PBKDF2 rounds: makes every password guess slow

function fail(msg) {
  console.error('\n  ✗ ' + msg + '\n');
  process.exit(1);
}

// ---------- read master ----------
function loadMaster() {
  if (!fs.existsSync(MASTER)) fail('products-master.js not found in ' + DIR);
  const src = fs.readFileSync(MASTER, 'utf8');
  const sandbox = { window: {} };
  try {
    vm.runInNewContext(src, sandbox, { filename: 'products-master.js', timeout: 2000 });
  } catch (e) {
    const m = String(e.stack || '').match(/products-master\.js:(\d+)/);
    fail('products-master.js has a typo' + (m ? ' near line ' + m[1] : '') + ':\n    ' + e.message +
         '\n    (check for a missing comma or quote)');
  }
  return sandbox.window;
}

function isWhole(n) { return typeof n === 'number' && Number.isInteger(n) && n >= 0; }

function validate(win) {
  const shop = win.SHOP || {};
  const list = win.PRODUCTS;
  if (!Array.isArray(list)) fail('window.PRODUCTS = [ ... ] is missing in products-master.js');
  const problems = [];
  const seen = new Map();
  const items = list.map(function (p, i) {
    const where = 'item #' + (i + 1) + (p && p.name ? ' "' + String(p.name).trim() + '"' : '');
    if (!p || typeof p.name !== 'string' || !p.name.trim()) { problems.push(where + ': name is missing'); return null; }
    const name = p.name.trim().replace(/\s+/g, ' ');
    const key = name.toLowerCase();
    if (seen.has(key)) problems.push(where + ': same name as item #' + seen.get(key));
    else seen.set(key, i + 1);
    if (!isWhole(p.price)) problems.push(where + ': price must be a whole number');
    if (p.cp !== undefined && !isWhole(p.cp)) problems.push(where + ': cp must be a whole number');
    const unit = p.unit === undefined ? '' : String(p.unit).trim().toLowerCase();
    if (unit && unit !== 'kg') problems.push(where + ': unit can only be "kg" (or left out)');
    return { name: name, price: p.price, cp: p.cp, kg: unit === 'kg' };
  });
  if (problems.length) fail('Fix these in products-master.js:\n    - ' + problems.join('\n    - '));
  return {
    shop: { name: String(shop.name || ''), gst: String(shop.gst || '') },
    items: items,
  };
}

// ---------- password ----------
function readPassword() {
  if (process.env.CP_PASSWORD) return process.env.CP_PASSWORD;
  if (!fs.existsSync(PASSFILE)) fail('build-password.txt not found. Create it with the password on the first line.');
  const pw = fs.readFileSync(PASSFILE, 'utf8').split(/\r?\n/)[0].trim();
  if (!pw) fail('build-password.txt is empty.');
  return pw;
}

// ---------- encryption (AES-256-GCM, key from PBKDF2-SHA256) — matches cost.js ----------
function deriveKey(pw, salt, iter) { return crypto.pbkdf2Sync(pw, salt, iter, 32, 'sha256'); }

function encrypt(plain, pw) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', deriveKey(pw, salt, ITER), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final(), c.getAuthTag()]);
  return { v: 1, iter: ITER, salt: salt.toString('base64'), iv: iv.toString('base64'), data: data.toString('base64') };
}

function decrypt(enc, pw) {
  const buf = Buffer.from(enc.data, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', deriveKey(pw, Buffer.from(enc.salt, 'base64'), enc.iter), Buffer.from(enc.iv, 'base64'));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString('utf8');
}

function readExistingCost() {
  try {
    const src = fs.readFileSync(OUT_COST, 'utf8');
    const sandbox = { window: {} };
    vm.runInNewContext(src, sandbox);
    return sandbox.window.COST_ENC || null;
  } catch (e) { return null; }
}

// ---------- write files ----------
function main() {
  const { shop, items } = validate(loadMaster());
  const pw = readPassword();

  // public list: no cost price
  const lines = items.map(function (p) {
    return '  { name: ' + JSON.stringify(p.name) + ', price: ' + p.price + (p.kg ? ', unit: "kg"' : '') + ' },';
  });
  const publicJs =
    '// GENERATED by build.js from products-master.js - do not edit this file.\n' +
    '// Edit products-master.js, then run:  node build.js\n' +
    'window.SHOP = {\n' +
    '  name: ' + JSON.stringify(shop.name) + ',\n' +
    '  gst: ' + JSON.stringify(shop.gst) + ',\n' +
    '};\n\n' +
    'window.PRODUCTS = [\n' + lines.join('\n') + '\n];\n';

  // cost prices -> encrypted
  const plain = JSON.stringify(items.filter(function (p) { return p.cp !== undefined; }).map(function (p) { return [p.name, p.cp]; }));
  let enc = readExistingCost();
  let unchanged = false;
  if (enc) {
    try { unchanged = decrypt(enc, pw) === plain && enc.iter === ITER; } catch (e) { unchanged = false; }
  }
  if (!unchanged) enc = encrypt(plain, pw);
  // safety: must decrypt back with the same password
  if (decrypt(enc, pw) !== plain) fail('Encryption self-check failed — nothing was written.');

  const costJs =
    '// GENERATED by build.js - cost prices, encrypted (AES-256-GCM). Needs the password to read.\n' +
    'window.COST_ENC = ' + JSON.stringify(enc) + ';\n';

  // safety: no cost price may leak into the public product list
  const leakCheck = { window: {} };
  vm.runInNewContext(publicJs, leakCheck);
  if (leakCheck.window.PRODUCTS.some(function (p) { return 'cp' in p; })) fail('Safety check failed: cp found in products.js — nothing was written.');

  fs.writeFileSync(OUT_PUBLIC, publicJs);
  fs.writeFileSync(OUT_COST, costJs);

  const kg = items.filter(function (p) { return p.kg; }).length;
  const withCp = items.filter(function (p) { return p.cp !== undefined; }).length;
  console.log('\n  ✓ ' + items.length + ' products (' + kg + ' sold by kg) -> products.js   (no cost prices)');
  console.log('  ✓ ' + withCp + ' cost prices -> cost-data.js   (' + (unchanged ? 'unchanged' : 'encrypted') + ')');
  console.log('\n  Next:  git add .   git commit -m "Update products"   git push\n');
}

main();
