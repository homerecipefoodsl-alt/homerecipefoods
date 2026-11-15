# Firebase Setup Guide (`ai-studio-applet-webapp-e4b0f`)

This application connects strictly to the existing Firebase project **`ai-studio-applet-webapp-e4b0f`** (using `firebase-applet-config.json` by default, with optional `VITE_FIREBASE_*` overrides). No credentials, passwords, or service-account private keys are stored in source control.

---

## 1. Detected Existing Firebase Services (`ai-studio-applet-webapp-e4b0f`)

- **Web App**: Configured via `firebase-applet-config.json` (`appId: 1:771532162522:web:8dfcecb6033932861cace3`).
- **Cloud Firestore**: Active on named database **`ai-studio-8e160dd1-e90f-4eac-89d5-fbd11fce8ac3`** with existing business collections preserved in place.
- **Firebase Storage**: Configured with bucket `ai-studio-applet-webapp-e4b0f.firebasestorage.app` (with graceful data-URL image upload fallback if Storage bucket rules or billing are uninitialized).
- **Firebase Realtime Database**: Optional (not enabled by default; set `VITE_FIREBASE_DATABASE_URL` only if RTDB is enabled in the project).
- **Firebase Authentication**: Required for `/mahmud` Admin Panel login (Email/Password provider).

---

## 2. Enable Email/Password Authentication & Authorized Domains

1. Open [Firebase Console](https://console.firebase.google.com/) and select **`ai-studio-applet-webapp-e4b0f`**.
2. Go to **Build → Authentication → Sign-in method**.
3. Enable **Email/Password** (Google/Facebook/social login providers are intentionally omitted from `/mahmud`).
4. Go to **Authentication → Settings → Authorized domains** and add:
   - `localhost` (for local development)
   - Your Cloudflare Workers / Pages domain (e.g. `home-recipe-foods.workers.dev` or `home-recipe-foods.pages.dev`)
   - Your production custom domain (e.g. `homerecipefoods.com` and `www.homerecipefoods.com`)

---

## 3. Create & Verify the Super Admin User Safely

Never hardcode a password in source files or environment variables.

1. In Firebase Console → **Authentication → Users**, click **Add user** (or use the existing account if `mdmahmudulhashan0@gmail.com` already exists).
2. Enter Email: `mdmahmudulhashan0@gmail.com` and a strong password.
3. **Verify the email address**:
   - Firestore Security Rules require `request.auth.token.email_verified == true` for all privileged admin operations.
   - If the user was created manually in Firebase Console with `emailVerified: false`, sign in once at **`/mahmud`** and click **"Send Verification Email"**, check the Gmail inbox, then click **"I Verified · Refresh"**. (Alternatively, set `emailVerified: true` via Firebase Admin SDK.)
4. Adding extra Admins or Support Agents:
   - Sign in as Super Admin at `/mahmud` → open **Admin Management (`/mahmud/admins`)**.
   - Create each staff member's Firebase Auth Email/Password user in Firebase Console → **Authentication → Users**, then register their email, optional username (e.g. `mahmud`, `support1`), and role (`admin` or `support_agent`) in **Admin Management**.

---

## 4. Public Firebase Web Config (`firebase-applet-config.json` & Optional Overrides)

The repository already includes `firebase-applet-config.json` wired to `ai-studio-applet-webapp-e4b0f` and Firestore database `ai-studio-8e160dd1-e90f-4eac-89d5-fbd11fce8ac3`. You do not need to duplicate these values unless overriding them per-environment in `.env` or Cloudflare build variables:

```env
VITE_FIREBASE_API_KEY="AIzaSyDyYmuR3DdgwFpLQtAQpkkipq-blq9KsaU"
VITE_FIREBASE_AUTH_DOMAIN="ai-studio-applet-webapp-e4b0f.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="ai-studio-applet-webapp-e4b0f"
VITE_FIREBASE_STORAGE_BUCKET="ai-studio-applet-webapp-e4b0f.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="771532162522"
VITE_FIREBASE_APP_ID="1:771532162522:web:8dfcecb6033932861cace3"
VITE_FIREBASE_FIRESTORE_DATABASE_ID="ai-studio-8e160dd1-e90f-4eac-89d5-fbd11fce8ac3"
# Optional if Realtime Database is enabled:
VITE_FIREBASE_DATABASE_URL=""
```

> All `VITE_FIREBASE_*` keys are **public** client identifiers designed by Firebase for browser apps. Security is enforced server-side by `firestore.rules` and Firebase Auth ID tokens.

---

## 5. Non-Destructive Firestore Security Rules

Your existing data in `ai-studio-applet-webapp-e4b0f` (`ai-studio-8e160dd1-e90f-4eac-89d5-fbd11fce8ac3`) is **never deleted or overwritten** by `firestore.rules`.

If you ever update `firestore.rules` manually outside AI Studio:
```bash
firebase use ai-studio-applet-webapp-e4b0f
firebase deploy --only firestore:rules
```

---

## 6. First Sign-In & Safe Data Handling

1. Navigate to **`/mahmud`**.
2. Sign in with `mdmahmudulhashan0@gmail.com` (or username `mahmud` once mapped) and your Firebase Auth password.
3. On first Super Admin login, the app verifies your token and safely initializes missing RBAC entries (`rbac_roles/mdmahmudulhashan0@gmail.com`, `admin_usernames/mahmud`, `admins/{uid}`) without modifying existing records.
4. All existing catalog, showroom, greeting, and site-setting documents in Firestore are preserved and read automatically without overwriting.
