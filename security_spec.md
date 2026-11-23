# Security Specification — Home Recipe Foods RBAC & Media Architecture

## 1. Authoritative RBAC Model (`/admins/{uid}` Primary + `/rbac_roles/{email}` Fallback)
1. **Primary Authority (`/admins/{uid}`)**:
   - All backend routes (`/api/*`), Firestore Security Rules, and frontend RBAC checks evaluate `/admins/{request.auth.uid}` FIRST.
   - An admin document is valid ONLY when:
     - `request.auth != null` and `request.auth.token.email_verified == true`
     - `email` field (if present on `admins/{uid}`) matches the verified token email (`request.auth.token.email.lower()`)
     - Active flag is enabled (`active == true` or `isActive == true`) and `status != 'disabled'` and `status != 'suspended'`
     - `role in ['primary_super_admin', 'super_admin', 'admin', 'manager', 'support_agent']`
2. **Legacy Fallback (`/rbac_roles/{email}`)**:
   - Evaluated when `/admins/{uid}` is absent (e.g., pending first-login staff accounts).
   - Never blocks or overrides an active `/admins/{uid}` record.
3. **Zero Email-Only Privilege Bypass**:
   - No client component, Cloudflare Worker endpoint, Express server route, or Firestore Security Rule may grant administrative privilege solely from `email == 'mdmahmudulhashan0@gmail.com'` without a verified active Firestore `/admins/{uid}` (or fallback `/rbac_roles/{email}`) record.
   - Clients can never self-create `/admins/{uid}` (`adminUid != request.auth.uid`). Server-side Admin SDK bootstrap (via `/api/auth/session-init` when `FIREBASE_SERVICE_ACCOUNT_JSON` is configured) or direct Firebase Console provisioning creates missing primary Super Admin `/admins/{uid}` documents safely.

## 2. Role Hierarchy & Data Invariants
1. **Primary Super Admin / Super Admin (`primary_super_admin`, `super_admin`)**:
   - Full access to all collections, role assignments (`/rbac_roles`, `/admins`), user management (`/users`), catalog, banners, greetings, site settings, AI support config, complaints, and live support chat.
   - `mdmahmudulhashan0@gmail.com` / `primary_super_admin` is immutable and cannot be demoted, disabled, or deleted by any user.
2. **Admin (`admin`)**:
   - Full Catalog & CMS management (`/products`, `/categories`, `/occasions`, `/showrooms`, `/hero_banners`, `/homepage_sections`, `/greetings`, `/media_library`, `/jobPostings`) plus delegated Manager management where granted.
   - Strictly denied from managing `/users` or modifying Super Admin records.
3. **Manager (`manager`)**:
   - Granular permission-checked access (e.g., `products_add`, `products_edit`, `categories_manage`, `showrooms_manage`, `complaints_manage`, `recruitment_manage`).
4. **Support Agent (`support_agent`)**:
   - Strictly scoped to `/complaints`, `/chat_sessions` & `messages`, and `supportOnline` status. Denied catalog, role, or settings writes.
5. **Customer (`customer`)**:
   - Default role on `/users/{uid}`. Can never self-assign elevated roles or access admin collections.

## 3. Product Catalog & Media Architecture (Cloudflare R2)
1. **Product Catalog (`/products/{productId}`)**:
   - Writes validate `hasPermission('products_add')` (create), `hasPermission('products_edit')` (update), and `hasPermission('products_delete')` (delete) backed by `/admins/{uid}` / `/rbac_roles/{email}`.
   - Optional audit fields `createdBy` (immutable once set) and `updatedBy` (set on create/update) are permitted and bounded in `isValidProduct(data)` and update diff allowlists.
2. **Product & Catalog Media Storage (Cloudflare R2)**:
   - Firebase Storage (`getStorage`, `uploadBytes`, `getDownloadURL`) is completely removed from catalog/CMS uploads.
   - Images upload through `/api/r2/upload` (bound to Worker R2 binding `PRODUCT_IMAGES` / bucket `home-recipe-product-images`), protected by verified Firebase ID Token + verified Firestore `/admins/{uid}` (or fallback `/rbac_roles/{email}`) catalog authority.
   - Uploaded assets are served publicly via `/api/r2/file/{key}` (or configured `R2_PUBLIC_URL`) and cleaned up cleanly on rollback via `/api/r2/delete`.
