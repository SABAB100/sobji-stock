# Vegetable Stock — shared live stock board for Vercel

A public link your employees can open to see the **same live remaining stock**.
The seller enters each vegetable once, records sales (including exact gram
amounts like 100 g), and the remaining stock is always visible at a glance.
Price is secondary and optional — remaining stock is the star of every card.

## Features

- **Per-vegetable cards** with a huge remaining-stock figure; price shown small
  and only when set.
- **Add a vegetable**: name, unit (kg or piece), starting stock, optional price.
- **Sold flow**: kg/gram switch with quick chips (100 g, 250 g, 500 g, 750 g,
  1 kg). Gram math is exact — stock is stored as integer grams, so a 100 g
  sale deducts exactly 0.1 kg, never rounded up. The sheet shows the total
  price (when a price is set) and the big **"Left after this sale"** figure
  before confirming, and blocks any sale larger than the remaining stock.
- **Stock added (restock)** flow with the same kg/gram switch.
- **Sales history** list.
- **"How much is left" summary panel** at the top, lowest stock first, with
  warning colors for low stock (at or below 5 kg / 5 pieces) and finished (0).
- **Edit and delete** for vegetables.
- The page refreshes every 30 seconds, so it stays fresh for everyone viewing.

## How it works

```
Browser (index.html, styles.css, app.js — plain static files)
        │  fetch /api/...
        ▼
Vercel Serverless Functions (Node, in api/)
  api/items.js          GET list, POST add
  api/items/[id].js     PUT edit, DELETE
  api/sell.js           POST record a sale (deducts stock, logs the sale)
  api/restock.js        POST add stock
  api/sales.js          GET sales history
        │  Upstash REST API
        ▼
Upstash Redis (Vercel KV) — the ONE shared store:
  hash "items"  (field = vegetable id, value = JSON item)
  list "sales"  (newest first, capped at 200 entries)
```

Every visitor reads and writes the **same** KV store, so everyone sees the
same stock. Nothing is kept in browser localStorage.

### Exact gram math

Stock for kg items is stored as an integer number of grams. A sale of 250 g
subtracts exactly 250; 40 kg − 100 g − 250 g = 39.65 kg, with no float drift.
Piece items are stored as whole pieces.

## Deploy (Vercel Hobby, free tier)

You need a Vercel account and a KV store. No code changes are needed.

### 1. Put the code in GitHub (or use the Vercel CLI path below)

Push this folder to a GitHub repository (any name, e.g. `vegetable-stock`).

### 2. Import it in Vercel

1. Open the [Vercel dashboard](https://vercel.com/dashboard) → **Add New →
   Project** → **Import** your repository.
2. Framework Preset: **Other**. Leave **Build Command** and **Output
   Directory** empty (the site is static files at the project root, and
   `api/` becomes serverless functions automatically).
3. Click **Deploy** once to create the project (the API will report a clear
   error until step 3 is done — that is expected).

### 3. Create the KV store and connect it

1. In the Vercel dashboard, open your project → **Storage** tab →
   **Create Database** → choose **KV** (Upstash Redis) → **Create**.
2. When asked, **connect it to this project**. Vercel automatically adds
   these two environment variables to the project:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
3. Go to **Deployments**, open the latest deployment → **⋯ → Redeploy** so
   the functions pick up the new variables.

If you created the KV store in Upstash directly instead, copy its REST URL
and REST token from the Upstash console and add them manually under
**Project → Settings → Environment Variables** (same two names), then
redeploy.

### 4. Share the link

Open the deployment's `.vercel.app` domain and send that link to your
employees. Everyone opening it sees the same live stock.

### Alternative: deploy with the Vercel CLI

```bash
npm install -g vercel
cd vegetable-stock-app
vercel link          # link to your Vercel project
vercel env add KV_REST_API_URL production
vercel env add KV_REST_API_TOKEN production
vercel --prod
```

(Create the KV store in the dashboard first, as in step 3, and paste the
values when prompted.)

## If the API reports a KV error

If you see *"KV store is not configured…"*, the two environment variables
are missing. Add them under **Project → Settings → Environment Variables**
and redeploy. Every API route returns this same clear message when the
variables are absent, instead of a cryptic failure.

## Important limitation: no login

Anyone with the link can **view and change** the stock — there is no
sign-in in this version. That matches the "shared with everyone who has
this link" model. Only share the link with people you trust with the stock.
If you later need restricted editing, add Vercel Authentication or a simple
shared password in front of the write routes.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | Static frontend (English UI) |
| `api/items.js` | List / add vegetables |
| `api/items/[id].js` | Edit / delete one vegetable |
| `api/sell.js` | Record a sale, deduct stock, log it |
| `api/restock.js` | Add stock |
| `api/sales.js` | Sales history |
| `api/_lib/store.js` | Upstash REST client (env vars only, no hardcoded credentials) |
| `api/_lib/http.js` | Request/response + exact gram/piece math helpers |
| `.env.example` | The two environment variable names (no real values) |
