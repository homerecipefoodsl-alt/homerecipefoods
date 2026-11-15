# Cloudflare Deployment Guide (Home Recipe Foods)

Home Recipe Foods compiles to a static React + Vite single-page application (`dist/`) paired with a lightweight Cloudflare Worker (`worker/index.ts`) for `/api/*` routes (AI concierge via Gemini API, `/api/health`, `/robots.txt`, `/sitemap.xml`) and SPA routing fallback.

All backend data, authentication, and storage remain connected directly to your existing Firebase project **`ai-studio-applet-webapp-e4b0f`** (Firestore DB: `ai-studio-8e160dd1-e90f-4eac-89d5-fbd11fce8ac3`).

---

## Architecture Overview

- **Frontend Build Output**: `dist/` (built via `npm run build`)
- **Cloudflare Workers Static Assets**: Configured in `wrangler.jsonc` with `not_found_handling: "single-page-application"` so `/products`, `/category/*`, `/occasion/*`, `/mahmud`, and `/mahmud/dashboard` all serve cleanly without 404 errors on refresh.
- **Cloudflare Pages Fallback**: `public/_redirects` (`/* /index.html 200`) is included for Cloudflare Pages compatibility.
- **Secret Isolation**: `GEMINI_API_KEY` is stored **only** as a Cloudflare Worker secret (`wrangler secret put GEMINI_API_KEY`) and never bundled into `dist/`.

---

## Option A: Deploy to Cloudflare Workers Static Assets (Recommended)

### 1. Public Firebase Web Config
`firebase-applet-config.json` is already bundled automatically for **`ai-studio-applet-webapp-e4b0f`** (`ai-studio-8e160dd1-e90f-4eac-89d5-fbd11fce8ac3`). Optionally, you can override values via `.env` or Cloudflare build variables:

```env
VITE_FIREBASE_API_KEY="AIzaSyDyYmuR3DdgwFpLQtAQpkkipq-blq9KsaU"
VITE_FIREBASE_AUTH_DOMAIN="ai-studio-applet-webapp-e4b0f.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="ai-studio-applet-webapp-e4b0f"
VITE_FIREBASE_STORAGE_BUCKET="ai-studio-applet-webapp-e4b0f.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="771532162522"
VITE_FIREBASE_APP_ID="1:771532162522:web:8dfcecb6033932861cace3"
VITE_FIREBASE_FIRESTORE_DATABASE_ID="ai-studio-8e160dd1-e90f-4eac-89d5-fbd11fce8ac3"
```

### 2. Build the Production Bundle
```bash
npm install
npm run build
```
Verify that `dist/index.html` and `dist/assets/*` were generated cleanly.

### 3. Configure Secrets & Deploy with Wrangler
Update `"APP_URL"` in `wrangler.jsonc` if using a custom domain, then run:

```bash
npx wrangler login
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
4. Add `functions/api/chat/ai.ts` or route `/api/*` to the included `worker/index.ts` if you want the AI Assistant endpoint active on Cloudflare Pages.
5. Add your Cloudflare Pages domain (`*.pages.dev`) and custom domain to **Firebase Console → Authentication → Settings → Authorized domains**.

---

## Post-Deployment Verification Checklist

After deploying, verify the following URLs on your live Cloudflare domain:

1. `GET /api/health` → Returns `{"ok":true,"brand":"Home Recipe Foods","runtime":"cloudflare-worker"}`
2. `GET /` → Loads dynamic homepage storefront with Bengali + English content and zero console errors
3. `GET /products` & direct refresh (`F5`) → Resolves cleanly to the Products catalog
4. `GET /mahmud` → Displays **Home Recipe Foods — Super Admin / Admin Login** (Email/Username + Password only; no social login)
5. `GET /mahmud/dashboard` while logged out → Immediately redirects to `/mahmud`
6. `GET /admin` → Displays the branded 404 Not Found page
7. `GET /robots.txt` → Confirms `Disallow: /mahmud`
