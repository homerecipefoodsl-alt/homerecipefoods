import {
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  type CollectionReference,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';
import { auth, firebasePublicInfo, requireDb } from './firebase';
import {
  deleteCatalogImageFromStorage,
  extractR2ImageKey,
  isForbiddenInlineImageUrl,
  isR2ImageUrl,
} from './productStorage';
import {
  DEFAULT_ROLE_PERMISSIONS,
  isSuperAdminRole,
  type Category,
  type HeroSlide,
  type MediaItem,
  type PermissionKey,
  type Product,
  type SeoSettings,
  type Showroom,
  type SiteSettings,
  type StaffRole,
} from '../types';

export class AdminAuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AdminAuthError';
  }
}

export interface VerifiedWriteSession {
  uid: string;
  email: string;
  emailVerified: boolean;
  tokenEmailVerified: boolean;
  tokenEmail: string;
  claimsRole: string | null;
  hrfStaffClaim: boolean;
  rbacSource: 'admins' | 'rbac_roles';
  rbacRole: string | null;
  rbacStatus: string | null;
}

export interface AdminErrorDiag {
  collection?: string;
  documentId?: string;
  path?: string;
  operation?: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'WRITE';
  staffRole?: string | null;
  existingIssues?: string[];
  preflightIssues?: string[];
  authSession?: VerifiedWriteSession | null;
}

export function isValidFirestoreId(id: string | null | undefined): boolean {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id.trim());
}

export function hasValidFirestoreTimestamp(val: unknown): boolean {
  if (!val || typeof val !== 'object') return false;
  return (
    typeof (val as { toMillis?: unknown }).toMillis === 'function' ||
    (typeof (val as { seconds?: unknown }).seconds === 'number' &&
      typeof (val as { nanoseconds?: unknown }).nanoseconds === 'number')
  );
}

export function extractFirestoreErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code?: unknown }).code || '')
      .trim()
      .toLowerCase();
  }
  return '';
}

function isOfflineOrPreconditionError(err: unknown): boolean {
  const code = extractFirestoreErrorCode(err);
  return (
    code === 'unavailable' ||
    code.endsWith('/unavailable') ||
    code.includes('failed-precondition')
  );
}

export async function fetchDocFromServer<T = Record<string, unknown>>(
  docRef: DocumentReference<T>
): Promise<DocumentSnapshot<T>> {
  try {
    return await getDocFromServer(docRef);
  } catch (err) {
    if (isOfflineOrPreconditionError(err)) {
      return await getDoc(docRef);
    }
    throw err;
  }
}

export async function fetchCollectionFromServer<T = Record<string, unknown>>(
  targetQuery: Query<T> | CollectionReference<T>
): Promise<QuerySnapshot<T>> {
  try {
    return await getDocsFromServer(targetQuery);
  } catch (err) {
    if (isOfflineOrPreconditionError(err)) {
      return await getDocs(targetQuery);
    }
    throw err;
  }
}

export function hasRolePermissionFallback(
  role: string | undefined,
  perm: PermissionKey
): boolean {
  if (isSuperAdminRole(role)) return true;
  if (
    role === 'admin' ||
    role === 'manager' ||
    role === 'editor' ||
    role === 'moderator' ||
    role === 'support_agent'
  ) {
    return (DEFAULT_ROLE_PERMISSIONS[role as StaffRole] ?? []).includes(perm);
  }
  return false;
}

export async function ensureVerifiedAdminWriteSession(params: {
  hasPermission: (perm: PermissionKey) => boolean;
  requiredPermission: PermissionKey;
  superAdminOnly?: boolean;
}): Promise<VerifiedWriteSession> {
  const currentUser = auth?.currentUser;
  if (!currentUser || !currentUser.email) {
    throw new AdminAuthError(
      'auth/unauthenticated',
      'আপনার লগইন সেশন পাওয়া যায়নি বা শেষ হয়ে গেছে। অনুগ্রহ করে পুনরায় লগইন করুন।'
    );
  }

  if (
    currentUser.providerData.length > 0 &&
    !currentUser.providerData.some((p) => p.providerId === 'password')
  ) {
    throw new AdminAuthError(
      'auth/unauthenticated',
      'অ্যাডমিন পরিবর্তনের জন্য ইমেইল ও পাসওয়ার্ড দিয়ে লগইন থাকা প্রয়োজন।'
    );
  }

  if (!currentUser.emailVerified) {
    try {
      await currentUser.reload();
    } catch {
      // Proceed to check existing emailVerified flag
    }
  }

  const refreshedUser = auth?.currentUser || currentUser;
  if (!refreshedUser.emailVerified) {
    throw new AdminAuthError(
      'auth/email-unverified',
      'আপনার অ্যাডমিন ইমেইল এখনো ভেরিফাইড নয়। অনুগ্রহ করে ইমেইল ভেরিফাই করে আবার চেষ্টা করুন।'
    );
  }

  const emailLower = (refreshedUser.email || currentUser.email).trim().toLowerCase();
  let claimsRole: string | null = null;
  let hrfStaffClaim = false;
  let tokenEmailVerified = false;
  let tokenEmail = '';

  try {
    let tokenResult = await refreshedUser.getIdTokenResult();
    if (tokenResult.claims.email_verified !== true) {
      await refreshedUser.getIdToken(true);
      tokenResult = await refreshedUser.getIdTokenResult();
    }
    tokenEmailVerified = tokenResult.claims.email_verified === true;
    tokenEmail =
      typeof tokenResult.claims.email === 'string'
        ? tokenResult.claims.email.trim().toLowerCase()
        : '';
    claimsRole = typeof tokenResult.claims.role === 'string' ? tokenResult.claims.role : null;
    hrfStaffClaim = tokenResult.claims.hrf_staff === true;
  } catch {
    throw new AdminAuthError(
      'auth/token-refresh-failed',
      'লগইন সেশন টোকেন যাচাই করা যায়নি। অনুগ্রহ করে সাইন আউট করে পুনরায় লগইন করুন।'
    );
  }

  if (!tokenEmailVerified) {
    throw new AdminAuthError(
      'auth/email-unverified',
      'আপনার অ্যাডমিন সেশন টোকেনে ইমেইল ভেরিফায়েড পাওয়া যায়নি। সাইন আউট করে পুনরায় লগইন করুন।'
    );
  }
  if (tokenEmail && tokenEmail !== emailLower) {
    throw new AdminAuthError(
      'auth/token-claim-mismatch',
      'অ্যাডমিন টোকেনের ইমেইল ও লগইন সেশনের ইমেইল মেলেনি। অনুগ্রহ করে পুনরায় লগইন করুন।'
    );
  }

  const firestore = requireDb();

  let adminSnap: DocumentSnapshot;
  try {
    adminSnap = await fetchDocFromServer(doc(firestore, 'admins', refreshedUser.uid));
  } catch {
    throw new AdminAuthError(
      'rbac/read-failed',
      `Firestore থেকে admins/${refreshedUser.uid} ডকুমেন্ট পড়া যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।`
    );
  }

  if (adminSnap.exists()) {
    const adminData = adminSnap.data() as Record<string, unknown>;
    const adminEmail =
      typeof adminData.email === 'string' ? adminData.email.trim().toLowerCase() : '';
    const adminRole = typeof adminData.role === 'string' ? adminData.role : undefined;
    const adminStatus =
      typeof adminData.status === 'string' ? adminData.status : 'active';
    const isAdminFlagActive =
      adminData.active !== false &&
      adminData.isActive !== false &&
      adminStatus === 'active';

    if (adminEmail && adminEmail !== emailLower) {
      throw new AdminAuthError(
        'rbac/account-mismatch',
        'অ্যাডমিন অ্যাকাউন্টের ইমেইল রেকর্ডের সাথে মেলেনি। অনুগ্রহ করে সুপার অ্যাডমিনের সাথে যোগাযোগ করুন।'
      );
    }
    if (!isAdminFlagActive) {
      throw new AdminAuthError(
        'rbac/account-inactive',
        'আপনার অ্যাডমিন অ্যাকাউন্টটি বর্তমানে নিষ্ক্রিয় বা সাসপেন্ড অবস্থায় আছে।'
      );
    }

    let rbacRoleDoc: Record<string, unknown> | null = null;
    try {
      const rbacSnap = await fetchDocFromServer(doc(firestore, 'rbac_roles', emailLower));
      if (rbacSnap.exists()) {
        rbacRoleDoc = rbacSnap.data() as Record<string, unknown>;
      }
    } catch {
      // admins/{uid} already verified
    }

    if (rbacRoleDoc) {
      const rbacStatus =
        typeof rbacRoleDoc.status === 'string' ? rbacRoleDoc.status : 'active';
      if (rbacStatus !== 'active') {
        throw new AdminAuthError(
          'rbac/account-inactive',
          'আপনার স্টাফ রোলটি বর্তমানে সাসপেন্ড বা নিষ্ক্রিয় রয়েছে।'
        );
      }
    }

    const effectiveRole =
      adminRole ||
      (typeof rbacRoleDoc?.role === 'string' ? rbacRoleDoc.role : undefined);

    if (params.superAdminOnly && !isSuperAdminRole(effectiveRole)) {
      throw new AdminAuthError(
        'rbac/missing-permission',
        'এই কাজটি শুধুমাত্র Super Admin করতে পারবেন।'
      );
    }

    const adminPermsList = Array.isArray(adminData.permissions)
      ? (adminData.permissions as PermissionKey[])
      : [];
    const rbacPermsList =
      rbacRoleDoc && Array.isArray(rbacRoleDoc.permissions)
        ? (rbacRoleDoc.permissions as PermissionKey[])
        : [];
    const hasDocPermission =
      isSuperAdminRole(effectiveRole) ||
      adminPermsList.includes(params.requiredPermission) ||
      rbacPermsList.includes(params.requiredPermission) ||
      hasRolePermissionFallback(effectiveRole, params.requiredPermission) ||
      params.hasPermission(params.requiredPermission);

    if (!hasDocPermission) {
      throw new AdminAuthError(
        'rbac/missing-permission',
        'আপনার অ্যাকাউন্টে এই মডিউল পরিবর্তনের অনুমতি নেই। অনুগ্রহ করে সুপার অ্যাডমিনের সাথে যোগাযোগ করুন।'
      );
    }

    return {
      uid: refreshedUser.uid,
      email: emailLower,
      emailVerified: refreshedUser.emailVerified,
      tokenEmailVerified,
      tokenEmail,
      claimsRole,
      hrfStaffClaim,
      rbacSource: 'admins',
      rbacRole: effectiveRole ?? null,
      rbacStatus: adminStatus,
    };
  }

  let rbacSnap: DocumentSnapshot;
  try {
    rbacSnap = await fetchDocFromServer(doc(firestore, 'rbac_roles', emailLower));
  } catch {
    throw new AdminAuthError(
      'rbac/read-failed',
      `Firestore থেকে rbac_roles/${emailLower} ডকুমেন্ট পড়া যায়নি।`
    );
  }

  if (!rbacSnap.exists()) {
    throw new AdminAuthError(
      'rbac/admin-record-missing',
      `Firestore-এ আপনার অ্যাডমিন ডকুমেন্ট (admins/${refreshedUser.uid} বা rbac_roles/${emailLower}) পাওয়া যায়নি। সুপার অ্যাডমিনকে আপনার অ্যাকাউন্ট সক্রিয় করতে বলুন।`
    );
  }

  const rbacData = rbacSnap.data() as Record<string, unknown>;
  const rbacStatus = typeof rbacData.status === 'string' ? rbacData.status : 'active';
  const rbacRole = typeof rbacData.role === 'string' ? rbacData.role : undefined;
  const rbacPerms = Array.isArray(rbacData.permissions)
    ? (rbacData.permissions as PermissionKey[])
    : [];

  if (rbacStatus !== 'active') {
    throw new AdminAuthError(
      'rbac/account-inactive',
      'আপনার স্টাফ অ্যাকাউন্টটি নিষ্ক্রিয় বা সাসপেন্ড অবস্থায় আছে।'
    );
  }

  if (params.superAdminOnly && !isSuperAdminRole(rbacRole)) {
    throw new AdminAuthError(
      'rbac/missing-permission',
      'এই কাজটি শুধুমাত্র Super Admin করতে পারবেন।'
    );
  }

  const permitted =
    isSuperAdminRole(rbacRole) ||
    rbacPerms.includes(params.requiredPermission) ||
    hasRolePermissionFallback(rbacRole, params.requiredPermission) ||
    params.hasPermission(params.requiredPermission);

  if (!permitted) {
    throw new AdminAuthError(
      'rbac/missing-permission',
      'আপনার অ্যাকাউন্টে এই মডিউল পরিবর্তনের অনুমতি নেই।'
    );
  }

  return {
    uid: refreshedUser.uid,
    email: emailLower,
    emailVerified: refreshedUser.emailVerified,
    tokenEmailVerified,
    tokenEmail,
    claimsRole,
    hrfStaffClaim,
    rbacSource: 'rbac_roles',
    rbacRole: rbacRole ?? null,
    rbacStatus,
  };
}

export function formatAdminFirestoreError(
  err: unknown,
  context: string,
  diag?: AdminErrorDiag
): string {
  const rawCode = extractFirestoreErrorCode(err);
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lowerMessage = rawMessage.toLowerCase();
  const activeUser = auth?.currentUser;

  const resolvedCollection =
    diag?.collection ?? (diag?.path ? diag.path.split('/')[0] : null);
  const resolvedDocumentId =
    diag?.documentId ??
    (diag?.path && diag.path.includes('/')
      ? diag.path.split('/').slice(1).join('/')
      : null);
  const resolvedAdminRole =
    diag?.authSession?.rbacRole ?? diag?.staffRole ?? null;

  const safeDiag = {
    errorCode: rawCode || 'unknown',
    message: rawMessage,
    projectId: firebasePublicInfo.projectId,
    collection: resolvedCollection,
    documentId: resolvedDocumentId,
    path: diag?.path ?? null,
    operation: diag?.operation ?? null,
    uid: diag?.authSession?.uid ?? activeUser?.uid ?? null,
    email: diag?.authSession?.email ?? activeUser?.email ?? null,
    emailVerified:
      diag?.authSession?.emailVerified ?? activeUser?.emailVerified ?? null,
    tokenEmailVerified: diag?.authSession?.tokenEmailVerified ?? null,
    adminRole: resolvedAdminRole,
    rbacSource: diag?.authSession?.rbacSource ?? null,
    rbacStatus: diag?.authSession?.rbacStatus ?? null,
    existingIssues: diag?.existingIssues ?? [],
    preflightIssues: diag?.preflightIssues ?? [],
  };

  console.error(`[AdminDB:${context}]`, safeDiag);

  const categoryPrefix = context.startsWith('category_')
    ? 'Category could not be saved. '
    : '';

  if (
    rawCode === 'auth/unauthenticated' ||
    rawCode === 'unauthenticated' ||
    rawCode.endsWith('/unauthenticated') ||
    lowerMessage.includes('unauthenticated')
  ) {
    return 'আপনার লগইন সেশন পাওয়া যায়নি বা শেষ হয়ে গেছে (unauthenticated)। অনুগ্রহ করে পুনরায় লগইন করুন।';
  }
  if (rawCode === 'auth/email-unverified') {
    return err instanceof Error && err.message
      ? err.message
      : 'আপনার অ্যাডমিন ইমেইল এখনো ভেরিফাইড নয় (auth/email-unverified)। ইমেইল ভেরিফাই করে পুনরায় চেষ্টা করুন।';
  }
  if (rawCode === 'auth/token-claim-mismatch') {
    return err instanceof Error && err.message
      ? err.message
      : 'অ্যাডমিন টোকেন ও সেশনের ইমেইল মেলেনি। অনুগ্রহ করে সাইন আউট করে পুনরায় লগইন করুন।';
  }
  if (rawCode === 'auth/token-refresh-failed') {
    return 'লগইন টোকেন যাচাই করা যায়নি (auth/token-refresh-failed)। অনুগ্রহ করে সাইন আউট করে পুনরায় লগইন করুন।';
  }
  if (rawCode === 'rbac/admin-record-missing') {
    return err instanceof Error && err.message
      ? `${err.message} (rbac/admin-record-missing)`
      : 'Firestore-এ আপনার সক্রিয় অ্যাডমিন অথরিটি ডকুমেন্ট পাওয়া যায়নি (rbac/admin-record-missing)।';
  }
  if (rawCode === 'rbac/read-failed') {
    return err instanceof Error && err.message
      ? `${err.message} (rbac/read-failed)`
      : 'Firestore থেকে অ্যাডমিন অথরিটি যাচাই করা যায়নি (rbac/read-failed)।';
  }
  if (rawCode === 'rbac/account-mismatch') {
    return 'অ্যাডমিন রেকর্ডের ইমেইলের সাথে বর্তমান সেশনের ইমেইল মেলেনি (rbac/account-mismatch)।';
  }
  if (rawCode === 'rbac/account-inactive') {
    return 'আপনার অ্যাডমিন অ্যাকাউন্টটি নিষ্ক্রিয় বা সাসপেন্ড অবস্থায় আছে (rbac/account-inactive)।';
  }
  if (rawCode === 'rbac/missing-permission') {
    return err instanceof Error && err.message
      ? `${err.message} (rbac/missing-permission)`
      : 'আপনার অ্যাকাউন্টে এই কাজটি করার অনুমতি নেই (rbac/missing-permission)।';
  }
  if (rawCode === 'validation/preflight-failed' || rawCode.startsWith('validation/')) {
    return err instanceof Error && err.message
      ? err.message
      : 'আবশ্যকীয় তথ্য Firestore নিয়মের সাথে মিলছে না। অনুগ্রহ করে ঘরগুলো যাচাই করুন।';
  }
  if (
    rawCode === 'permission-denied' ||
    rawCode.endsWith('/permission-denied') ||
    lowerMessage.includes('missing or insufficient permissions')
  ) {
    const diagParts = [
      safeDiag.operation && safeDiag.path ? `${safeDiag.operation} ${safeDiag.path}` : null,
      safeDiag.email ? `user:${safeDiag.email}` : null,
      `verified:${String(safeDiag.emailVerified)}/${String(safeDiag.tokenEmailVerified)}`,
      safeDiag.adminRole
        ? `rbac:${safeDiag.adminRole}(${safeDiag.rbacSource || 'admins'})`
        : safeDiag.rbacSource
        ? `rbac:${safeDiag.rbacSource}`
        : null,
      safeDiag.preflightIssues.length > 0
        ? `preflight:${safeDiag.preflightIssues.slice(0, 3).join(';')}`
        : null,
      safeDiag.existingIssues.length > 0
        ? `docIssues:${safeDiag.existingIssues.slice(0, 3).join(';')}`
        : null,
    ].filter(Boolean);
    const diagSuffix = diagParts.length > 0 ? ` [${diagParts.join(' · ')}]` : '';
    return `${categoryPrefix}Firestore সংরক্ষণের অনুমতি দেয়নি (permission-denied)। অ্যাডমিন অ্যাকাউন্ট যাচাই, Firestore Security Rules অথবা আবশ্যকীয় ফিল্ড যাচাই করে আবার চেষ্টা করুন।${diagSuffix}`;
  }
  if (rawCode === 'failed-precondition' || rawCode.endsWith('/failed-precondition')) {
    return 'Firestore-এর পূর্বশর্ত পূরণ হয়নি (failed-precondition)। অনুগ্রহ করে ডাটাবেসের অবস্থা বা ইনডেক্স যাচাই করুন।';
  }
  if (rawCode === 'invalid-argument' || rawCode.endsWith('/invalid-argument')) {
    return 'প্রদত্ত তথ্যের ফরম্যাট বা ধরন সঠিক নয় (invalid-argument)। অনুগ্রহ করে ঘরগুলো যাচাই করে আবার চেষ্টা করুন।';
  }
  if (rawCode === 'already-exists' || rawCode.endsWith('/already-exists')) {
    return 'এই আইডি বা ডকুমেন্ট ইতিমধ্যে ডাটাবেসে বিদ্যমান (already-exists)।';
  }
  if (rawCode === 'not-found' || rawCode.endsWith('/not-found')) {
    return err instanceof AdminAuthError && err.message
      ? err.message
      : 'সংশ্লিষ্ট ডকুমেন্টটি Firestore-এ পাওয়া যায়নি (not-found)। রিফ্রেশ করে আবার চেষ্টা করুন।';
  }
  if (rawCode === 'aborted' || rawCode.endsWith('/aborted')) {
    return 'ডাটাবেস আপডেট কনফ্লিক্টের কারণে বাতিল হয়েছে (aborted)। অনুগ্রহ করে আবার চেষ্টা করুন।';
  }
  if (rawCode === 'resource-exhausted' || rawCode.endsWith('/resource-exhausted')) {
    return 'Firestore কোটা বা অনুরোধ সীমা অতিক্রম করেছে (resource-exhausted)। কিছুক্ষণ পর আবার চেষ্টা করুন।';
  }
  if (rawCode === 'deadline-exceeded' || rawCode.endsWith('/deadline-exceeded')) {
    return 'সার্ভারে সংরক্ষণ করতে অতিরিক্ত সময় লেগেছে (deadline-exceeded)। অনুগ্রহ করে আবার চেষ্টা করুন।';
  }
  if (
    rawCode === 'unavailable' ||
    rawCode.endsWith('/unavailable') ||
    rawCode.includes('network') ||
    lowerMessage.includes('offline')
  ) {
    return 'ইন্টারনেট বা সার্ভার সংযোগের কারণে সংরক্ষণ করা যায়নি (unavailable)। অনুগ্রহ করে আবার চেষ্টা করুন।';
  }
  if (err instanceof Error && rawCode === '' && rawMessage) {
    return `${categoryPrefix}${rawMessage}`;
  }
  return `${categoryPrefix}সংরক্ষণে ত্রুটি হয়েছে (${rawCode || 'unknown'})। অনুগ্রহ করে তথ্যগুলো যাচাই করে আবার চেষ্টা করুন।`;
}

export interface R2CatalogReferenceSnapshot {
  allProducts?: Product[];
  allCategories?: Category[];
  allShowrooms?: Showroom[];
  allHeroBanners?: HeroSlide[];
  mediaItems?: MediaItem[];
  siteSettings?: SiteSettings;
  seoSettings?: SeoSettings;
}

export interface R2ExclusionTarget {
  collection:
    | 'products'
    | 'categories'
    | 'showrooms'
    | 'hero_banners'
    | 'media'
    | 'site_settings'
    | 'seo_settings';
  docId?: string;
  field?: 'logoUrl' | 'faviconUrl' | 'aboutImageUrl' | 'heroSlides' | 'ogImage';
}

function normalizeR2Identity(urlOrKey: string | null | undefined): string {
  if (!urlOrKey || typeof urlOrKey !== 'string') return '';
  const key = extractR2ImageKey(urlOrKey);
  if (key) return `key:${key}`;
  return urlOrKey.trim();
}

export function isR2UrlReferencedElsewhere(params: {
  url: string;
  exclude?: R2ExclusionTarget;
  snapshot: R2CatalogReferenceSnapshot;
}): boolean {
  const targetIdentity = normalizeR2Identity(params.url);
  if (!targetIdentity) return false;
  if (!isR2ImageUrl(params.url) && !targetIdentity.startsWith('key:')) {
    return false;
  }

  const matches = (candidate: unknown): boolean => {
    if (typeof candidate !== 'string' || !candidate.trim()) return false;
    if (isForbiddenInlineImageUrl(candidate)) return false;
    return normalizeR2Identity(candidate) === targetIdentity;
  };

  const { exclude, snapshot } = params;

  for (const prod of snapshot.allProducts || []) {
    if (exclude?.collection === 'products' && exclude.docId === prod.id) continue;
    if (matches(prod.image) || matches(prod.imageUrl) || matches(prod.seoImage)) return true;
    if (Array.isArray(prod.images) && prod.images.some((u) => matches(u))) return true;
  }

  for (const cat of snapshot.allCategories || []) {
    if (exclude?.collection === 'categories' && exclude.docId === cat.id) continue;
    if (matches(cat.image)) return true;
  }

  for (const sr of snapshot.allShowrooms || []) {
    if (exclude?.collection === 'showrooms' && exclude.docId === sr.id) continue;
    if (Array.isArray(sr.images) && sr.images.some((u) => matches(u))) return true;
  }

  for (const banner of snapshot.allHeroBanners || []) {
    if (exclude?.collection === 'hero_banners' && exclude.docId === banner.id) continue;
    if (matches(banner.image) || matches(banner.mobileImage)) return true;
  }

  for (const item of snapshot.mediaItems || []) {
    if (item.deleted) continue;
    if (exclude?.collection === 'media' && exclude.docId === item.id) continue;
    if (matches(item.url)) return true;
  }

  if (snapshot.siteSettings) {
    if (!(exclude?.collection === 'site_settings' && exclude.field === 'logoUrl')) {
      if (matches(snapshot.siteSettings.logoUrl)) return true;
    }
    if (!(exclude?.collection === 'site_settings' && exclude.field === 'faviconUrl')) {
      if (matches(snapshot.siteSettings.faviconUrl)) return true;
    }
    if (!(exclude?.collection === 'site_settings' && exclude.field === 'aboutImageUrl')) {
      if (matches(snapshot.siteSettings.aboutImageUrl)) return true;
    }
    if (!(exclude?.collection === 'site_settings' && exclude.field === 'heroSlides')) {
      if (
        Array.isArray(snapshot.siteSettings.heroSlides) &&
        snapshot.siteSettings.heroSlides.some(
          (slide) => matches(slide.image) || matches(slide.mobileImage)
        )
      ) {
        return true;
      }
    }
  }

  if (
    snapshot.seoSettings &&
    !(exclude?.collection === 'seo_settings' && exclude.field === 'ogImage')
  ) {
    if (matches(snapshot.seoSettings.ogImage)) return true;
  }

  return false;
}

export async function safeDeleteUnreferencedR2Urls(params: {
  urls: string[];
  exclude?: R2ExclusionTarget;
  snapshot: R2CatalogReferenceSnapshot;
}): Promise<{ deleted: string[]; skippedReferenced: string[] }> {
  const uniqueUrls = Array.from(
    new Set(
      params.urls
        .map((u) => (typeof u === 'string' ? u.trim() : ''))
        .filter((u) => Boolean(u) && isR2ImageUrl(u))
    )
  );

  const deleted: string[] = [];
  const skippedReferenced: string[] = [];

  for (const url of uniqueUrls) {
    const referenced = isR2UrlReferencedElsewhere({
      url,
      exclude: params.exclude,
      snapshot: params.snapshot,
    });
    if (referenced) {
      skippedReferenced.push(url);
      continue;
    }
    try {
      await deleteCatalogImageFromStorage({ imageUrl: url });
      deleted.push(url);
    } catch {
      // Best-effort cleanup after primary DB commit
    }
  }

  return { deleted, skippedReferenced };
}
