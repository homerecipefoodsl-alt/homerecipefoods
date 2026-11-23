# Cloudflare Deployment Guide (Home Recipe Foods)

Home Recipe Foods compiles to a static React + Vite single-page application (`dist/`) paired with a lightweight Cloudflare Worker (`worker/index.ts`) for `/api/*` routes (AI concierge via Gemini API, `/api/health`, `/robots.txt`, `/sitemap.xml`) and SPA routing fallback.

All backend database and authentication remain connected directly to your existing Firebase project **`ai-studio-applet-webapp-e4b0f`** (Firestore DB: `ai-studio-8e160dd1-e90f-4eac-89d5-fbd11fce8ac3`), while product & catalog images are stored in **Cloudflare R2** (`home-recipe-foods-images` via the `PRODUCT_IMAGES` Worker binding) and served via **`https://images.homerecipefoods.com.bd`**.

---

## Architecture Overview

- **Frontend Build Output**: `dist/` (built via `npm run build` or `bun run build`)
- **Cloudflare Workers Static Assets**: Configured in `wrangler.jsonc` (`"name": "homerecipefoods"`) with `not_found_handling: "single-page-application"` so `/`, `/products`, `/about`, `/contact`, `/complaint`, `/admin`, `/mahmud`, and `/mahmud/dashboard` all serve cleanly without `_redirects` infinite-loop errors.
- **Secret Isolation**: `FIREBASE_SERVICE_ACCOUNT_JSON` and `GEMINI_API_KEY` are stored **only** as Cloudflare Worker secrets (`wrangler secret put ...`) and never bundled into `dist/`.

---

## Option A: Deploy to Cloudflare Workers Static Assets (Recommended)

### 1. Public Firebase Web Config
`firebase-applet-config.json` is already bundled automatically for **`ai-studio-applet-webapp-e4b0f`** (`ai-studio-8e160dd1-e90f-4eac-89d5-fbd11fce8ac3`). Optionally, you can override values via `.env` or Cloudflare build variables:

```env
VITE_FIREBASE_API_KEY="AIzaSyDyYmuR3DdgwFpLQtAQpkkipq-blq9KsaU"
VITE_FIREBASE_AUTH_DOMAIN="ai-studio-applet-webapp-e4b0f.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="ai-studio-applet-webapp-e4b0f"
VITE_FIREBASE_MESSAGING_SENDER_ID="771532162522"
VITE_FIREBASE_APP_ID="1:771532162522:web:8dfcecb6033932861cace3"
VITE_FIREBASE_FIRESTORE_DATABASE_ID="ai-studio-8e160dd1-e90f-4eac-89d5-fbd11fce8ac3"
```

### 2. Build & Deploy (Cloudflare Workers Builds / GitHub CI)
```bash
npm ci
npm run build
npx wrangler deploy
```
(Or with Bun: `bun install --frozen-lockfile && bun run build && npx wrangler deploy`.)
Verify that `dist/index.html` and `dist/assets/*` were generated cleanly (without `_redirects`).

### 3. Cloudflare R2 Media Bucket & Custom Domain (One-Time)
Product, category, and media images are stored in Cloudflare R2 via the `PRODUCT_IMAGES` binding in `wrangler.jsonc`:
1. In **Cloudflare Dashboard → R2 Object Storage → `home-recipe-foods-images`** (already created in APAC)
2. Under **Settings → Custom Domains**, ensure **`images.homerecipefoods.com.bd`** is connected & Active (`Public Development URL` *.r2.dev disabled)
3. Under **Worker `homerecipefoods` → Settings → Bindings**, confirm R2 bucket binding **`PRODUCT_IMAGES`** → **`home-recipe-foods-images`**

### 4. Configure Secrets (One-Time)
Upload your Firebase Service Account JSON (for project `ai-studio-applet-webapp-e4b0f`) and Gemini API key as Worker Secrets:

```bash
npx wrangler login
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

---

## Option B: Deploy Static Frontend via Cloudflare Pages

If deploying via Cloudflare Pages Git integration:
1. **Build command**: `npm run build`
2. **Build output directory**: `dist`
3. **Environment variables (Optional overrides)**:
   By default `firebase-applet-config.json` connects to `ai-studio-applet-webapp-e4b0f`. If overriding per environment, add `VITE_FIREBASE_*` variables from `FIREBASE_SETUP.md`.
4. Route `/api/*` to the included `worker/index.ts` so `/api/media/*`, `/api/admin/*`, and AI Assistant endpoints remain protected and bound to `PRODUCT_IMAGES`.
5. Add your custom domain (`homerecipefoods.com.bd`, `www.homerecipefoods.com.bd`) to **Firebase Console → Authentication → Settings → Authorized domains**.

---

## Post-Deployment Verification Checklist

After deploying, verify the following URLs on your live Cloudflare domain (`https://homerecipefoods.com.bd`):

1. `GET /api/health` → Returns `{"ok":true,"brand":"Home Recipe Foods","runtime":"cloudflare-worker","r2MediaBound":true}`
2. `GET /api/media/health` → Returns `{"ok":true,"provider":"cloudflare-r2","bindingName":"PRODUCT_IMAGES","bucketName":"home-recipe-foods-images","bindingActive":true}`
3. `GET /` → Loads dynamic homepage storefront with Bengali + English content and zero console errors
4. `GET /products` & direct refresh (`F5`) → Resolves cleanly to the Products catalog
5. `GET /mahmud` → Displays **Home Recipe Foods — Super Admin / Admin Login** (Email/Username + Password only; no social login)
6. `GET /mahmud/dashboard` while logged out → Immediately redirects to `/mahmud`
7. `GET /admin` → Displays the branded 404 Not Found page
8. `GET /robots.txt` → Confirms `Disallow: /mahmud`
