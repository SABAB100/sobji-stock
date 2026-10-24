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

## Password protection: one shared password

The app is protected by **one shared password** for everyone. The shop
owner chooses the password, tells it to employees, and everyone opening
the link types the same password before any stock is shown. The password
is kept for the browser tab only (sessionStorage) and sent as an
`x-app-password` header on every API call.

**Set it up (required — the app refuses all access until this is done):**

1. In the Vercel dashboard, open your project → **Settings →
   Environment Variables**.
2. Add a variable named **`APP_PASSWORD`** with the password you choose
   (any value; keep it private and share it only with people you trust).
3. Go to **Deployments** → latest deployment → **⋯ → Redeploy** so the
   functions pick up the new variable.

How it fails, by design (fail closed):

- `APP_PASSWORD` not set at all → every API call returns **401 with a
  "password not configured" message**. There is no open-access fallback.
- Wrong password → **401 "Unauthorized"**, with no hint about the correct
  value.
- On any 401 the frontend shows the login screen again.

The password value never appears in the code, the frontend, the logs, or
any API response — it lives only in that environment variable.

## If the API reports a password error

If you see *"App password is not configured…"*, the `APP_PASSWORD`
variable is missing. Add it under **Project → Settings → Environment
Variables** (as above) and redeploy.

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
| `api/_lib/auth.js` | Shared-password gate: verifies `x-app-password` against `APP_PASSWORD` (fail closed) |
| `api/_lib/http.js` | Request/response + exact gram/piece math helpers |
| `.env.example` | The environment variable names (no real values) |
