# Sree Parshwanatha Paper Mart — Billing

One-page billing app. Plain HTML/JS, works offline, hosted on GitHub Pages.

## Changing products / prices
1. Edit `products-master.js` (name, cp, price, optional `unit: "kg"`).
2. Run `node build.js`
3. `git add .` → `git commit -m "Update products"` → `git push`

## Run locally
```
python -m http.server 8000
```
Open http://localhost:8000

## Files
- `products-master.js` — **private** master list with cost prices. Never uploaded (`.gitignore`).
- `build-password.txt` — **private** password for the Cost Price page. Never uploaded.
- `build.js` — makes `products.js` (no cost prices) and `cost-data.js` (cost prices encrypted, AES-256-GCM).
- `products.js`, `cost-data.js` — generated; don't edit by hand.
- `index.html` + `app.js` — billing page.
- `cost.html` + `cost.js` — Cost Price page; asks for the password and decrypts in the browser.
- `manifest.webmanifest`, `sw.js`, `pwa.js`, `icons/` — installable phone app + offline.
- `vendor/` — jsPDF 2.5.1 + jsPDF-AutoTable 3.8.2.

## Changing the password
Edit `build-password.txt`, run `node build.js`, push.
