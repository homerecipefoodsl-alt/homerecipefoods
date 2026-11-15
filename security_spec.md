# Security Specification — Home Recipe Foods RBAC

## 1. Role Hierarchy & Data Invariants
1. **Super Admin (`super_admin`)**:
   - Exclusively anchored to `mdmahmudulhashan0@gmail.com` (`request.auth.token.email_verified == true`).
   - Full access to all collections, role assignments (`/rbac_roles`), user management (`/users`), catalog, banners, greetings, site settings, AI support config, complaints, and live support chat.
   - Immutable: Cannot be demoted, disabled, or removed by any user (including Admin or self).
2. **Admin (`admin`)**:
   - Authorized in `/rbac_roles/{email}` with `role == 'admin'` and `status == 'active'`.
   - Can manage `/products`, `/categories`, `/occasions`, `/showrooms`, `/greetings`, and ONLY `heroSlides` on `/site_settings/main`.
   - Strictly DENIED from managing `/rbac_roles`, `/users`, full `/site_settings` / AI support config, `/complaints`, or `/chat_sessions`.
3. **Support Agent (`support_agent`)**:
   - Authorized in `/rbac_roles/{email}` with `role == 'support_agent'` and `status == 'active'`.
   - Can manage `/complaints` (`get`, `list`, update `status` & `adminNote`), `/chat_sessions` & `messages` (view, reply, assign, close), and toggle `supportOnline` on `/site_settings/main`.
   - Strictly DENIED from modifying `/products`, `/categories`, `/occasions`, `/showrooms`, `/greetings`, `heroSlides`, `/rbac_roles`, `/users`, or site/AI settings.
4. **Customer (`customer`)**:
   - Default role on `/users/{uid}`. Can never self-assign `admin`, `support_agent`, or `super_admin`.
   - Can create complaints and read ONLY complaints where `submittedByUid == request.auth.uid` (cannot read another customer's complaints).
   - Can never list `/chat_sessions` or access another customer's authenticated chat session/messages.

## 2. Verification Matrix (Must All Enforce Strictly)
1. `mdmahmudulhashan0@gmail.com` (verified) -> `super_admin`
2. Normal customer -> Denied `/admin`, denied catalog writes, denied role escalation
3. Support Agent -> Allowed `/complaints` & `/chat_sessions` only; denied catalog/role/settings writes
4. Admin -> Allowed catalog, banners (`heroSlides`), & greetings; denied `/rbac_roles`, `/users`, AI/site settings
5. Admin cannot modify or delete Super Admin `/rbac_roles/mdmahmudulhashan0@gmail.com` or `/users/{superAdminUid}`
6. Admin cannot promote self or others to `super_admin`
7. Customer cannot modify `role` or `status` on `/users/{uid}` or create `/rbac_roles/*`
8. Customer cannot `get` or `list` another customer's complaint
9. Customer cannot `list` `/chat_sessions` or `get`/`list` another authenticated customer's chat session/messages
10. Super Admin can add, change role (`admin` <-> `support_agent`), disable/enable, and remove non-Super-Admin roles
