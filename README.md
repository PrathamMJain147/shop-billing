# Sree Parshwanatha Paper Mart — Billing

One-page billing app. Plain HTML/JS, no build step, works offline.

## Run locally
```
python -m http.server 8000
```
Open http://localhost:8000

## Files
- `products.js` — shop name, GST No, and product list (`name`, `cp` cost price, `price` selling price, optional `unit: "kg"` for items sold by weight — price is then per kg). Edit this to add items.
- `index.html` + `app.js` — billing page (never shows cost price).
- `cost.html` + `cost.js` — Cost Price page (all items with CP and selling price).
- `manifest.webmanifest`, `sw.js`, `pwa.js`, `icons/` — make it installable as a phone app (Chrome menu → Install app). `sw.js` loads fresh files when online and falls back to the saved copy when offline.
- `vendor/` — jsPDF 2.5.1 + jsPDF-AutoTable 3.8.2 (bundled so no internet needed).

## Deploy to GitHub Pages
Push this folder to a repo → Settings → Pages → Deploy from branch `main` / root.
