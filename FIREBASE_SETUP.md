# Firebase Setup Guide (`homerecipefoods`)

This application connects strictly to the Firebase project **`homerecipefoods`** (using `firebase-applet-config.json` by default, with optional `VITE_FIREBASE_*` overrides). No credentials, passwords, or service-account private keys are stored in source control.

---

## 1. Active Firebase Services (`homerecipefoods`)

- **Web App**: Configured via `firebase-applet-config.json` (`appId: 1:45658754633:web:f5ed9aa0adf10de3bc3998`).
- **Cloud Firestore**: Provisioned on database **`ai-studio-8e160dd1-e90f-4eac-89d5-fbd11fce8ac3`** inside project `homerecipefoods`.
- **Product & Media Storage (Cloudflare R2)**: Handled via Cloudflare R2 bucket **`home-recipe-foods-images`** (`PRODUCT_IMAGES` Worker binding) and served via **`https://images.homerecipefoods.com.bd`**. Firebase Storage is not required or used.
- **Firebase Realtime Database**: Optional (not enabled by default; set `VITE_FIREBASE_DATABASE_URL` only if RTDB is enabled in the project).
- **Firebase Authentication**: Required for `/mahmud` Admin Panel login (Email/Password provider).

---

## 2. Enable Email/Password Authentication & Authorized Domains

1. Open [Firebase Console](https://console.firebase.google.com/) and select **`homerecipefoods`**.
2. Go to **Build → Authentication → Sign-in method**.
3. Enable **Email/Password** (Google/Facebook/social login providers are intentionally omitted from `/mahmud`).
4. Go to **Authentication → Settings → Authorized domains** and add:
   - `localhost` (for local development)
   - Your Cloudflare Workers domain (e.g. `homerecipefoods.<subdomain>.workers.dev`)
   - Your production custom domains (`homerecipefoods.com.bd` and `www.homerecipefoods.com.bd`)

---

## 3. Create & Verify the Super Admin User Safely

Never hardcode a password in source files or environment variables.

1. In Firebase Console → **Authentication → Users**, click **Add user** for `mdmahmudulhashan0@gmail.com` with a strong password.
2. **Verify the email address**:
   - Firestore Security Rules require `request.auth.token.email_verified == true` for all privileged admin operations.
   - If the user was created manually in Firebase Console with `emailVerified: false`, sign in once at **`/mahmud`** and click **"Send Verification Email"**, check the Gmail inbox, then click **"I Verified · Refresh"**. (Alternatively, set `emailVerified: true` via Firebase Admin SDK.)
3. Provisioning Super Admin record & adding extra Admins, Managers, or Staff:
   - Generate a Service Account key from **Firebase Console → `homerecipefoods` → Project Settings → Service Accounts** and configure `FIREBASE_SERVICE_ACCOUNT_JSON` as a Cloudflare Worker secret via `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON`.
   - On first verified sign-in at `/mahmud`, `/api/auth/session-init` automatically creates `/admins/{uid}` (`primary_super_admin`) and syncs custom claims.
   - From **Admin Management (`/mahmud/admins`)**, use **Add New User** to create pre-verified Admin, Manager (with Unique Manager ID), and Staff accounts without signing out of your Super Admin session.

---

## 4. Public Firebase Web Config (`firebase-applet-config.json` & Optional Overrides)

The repository includes `firebase-applet-config.json` wired to `homerecipefoods` and Firestore database `ai-studio-8e160dd1-e90f-4eac-89d5-fbd11fce8ac3`. You do not need to duplicate these values unless overriding them per-environment in `.env` or Cloudflare build variables (make sure no stale `VITE_FIREBASE_*` overrides for any old project exist in Cloudflare Dashboard):

```env
VITE_FIREBASE_API_KEY="AIzaSyALirhFTopDUiKLdvdtsUN3iCsBe5wmqUg"
VITE_FIREBASE_AUTH_DOMAIN="homerecipefoods.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="homerecipefoods"
VITE_FIREBASE_MESSAGING_SENDER_ID="45658754633"
VITE_FIREBASE_APP_ID="1:45658754633:web:f5ed9aa0adf10de3bc3998"
VITE_FIREBASE_FIRESTORE_DATABASE_ID="ai-studio-8e160dd1-e90f-4eac-89d5-fbd11fce8ac3"
# Optional if Realtime Database is enabled:
VITE_FIREBASE_DATABASE_URL=""
```

> All `VITE_FIREBASE_*` keys are **public** client identifiers designed by Firebase for browser apps. Security is enforced server-side by `firestore.rules` and Firebase Auth ID tokens.

---

## 5. Non-Destructive Firestore Security Rules

`firestore.rules` enforces default-deny and strict RBAC without deleting or overwriting database records.

If you ever update `firestore.rules` manually outside AI Studio:
```bash
firebase use homerecipefoods
firebase deploy --only firestore:rules
```

---

## 6. First Sign-In & Safe Data Handling

1. Navigate to **`/mahmud`**.
2. Sign in with `mdmahmudulhashan0@gmail.com` (or username `mahmud` once mapped) and your Firebase Auth password.
3. On first Super Admin login, the app verifies your token and safely initializes missing RBAC entries (`rbac_roles/mdmahmudulhashan0@gmail.com`, `admin_usernames/mahmud`, `admins/{uid}`) without modifying existing records.
