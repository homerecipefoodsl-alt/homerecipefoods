import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Camera,
  Check,
  CheckCircle2,
  Database,
  Edit3,
  Eye,
  EyeOff,
  ImageOff,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { PRIMARY_SUPER_ADMIN_EMAIL, useStore } from '../../context/StoreContext';
import {
  CHATTOGRAM_OUTLETS,
  CONFIRMED_DEMO_SHOWROOM_IDS,
  isDemoOrDummyShowroom,
} from '../../data/outletsData';
import { resolveAssetUrl } from '../../lib/assets';
import {
  getCategoryText,
  getOccasionText,
  getProductText,
  getShowroomText,
} from '../../lib/bilingual';
import { OperationType, auth, handleFirestoreError, requireDb } from '../../lib/firebase';
import {
  deleteCatalogImageFromStorage,
  isForbiddenInlineImageUrl,
  uploadCatalogImageToStorage,
  validateCatalogImageFile,
} from '../../lib/productStorage';
import { formatBdtPrice, toSlug } from '../../lib/utils';
import {
  DEFAULT_ROLE_PERMISSIONS,
  type AdminRecord,
  type Category,
  type Occasion,
  type PermissionKey,
  type Product,
  type ProductAvailability,
  type RbacRoleEntry,
  type Showroom,
  type StaffRole,
} from '../../types';

const REQUIRED_PRODUCT_SCHEMA_KEYS = [
  'id',
  'name',
  'nameEn',
  'slug',
  'category',
  'categoryName',
  'productType',
  'price',
  'priceUnit',
  'shortDescription',
  'description',
  'images',
  'ingredients',
  'sizes',
  'weight',
  'occasions',
  'showrooms',
  'availability',
  'importantNotes',
  'featured',
  'popular',
] as const;

const ALLOWED_PRODUCT_KEYS = new Set<string>([
  'id', 'name', 'nameBn', 'nameEn', 'name_bn', 'name_en', 'slug',
  'category', 'categorySlug', 'categoryName', 'categoryNameEn', 'productType',
  'price', 'old_price', 'discount', 'price_label', 'priceUnit', 'unit',
  'shortDescription', 'shortDescriptionEn', 'short_description_bn', 'short_description_en',
  'description', 'descriptionEn', 'description_bn', 'description_en',
  'image', 'imageUrl', 'images', 'masterKey', 'rating', 'stock', 'sku',
  'ingredients', 'ingredients_bn', 'ingredients_en', 'sizes', 'weight', 'occasions', 'showrooms',
  'availability', 'importantNotes', 'featured', 'popular',
  'visible', 'active', 'isActive', 'deleted', 'status', 'display_order', 'archivedAt',
  'seoTitle', 'seoDescription', 'seoImage',
  'createdAt', 'updatedAt',
]);

const PRODUCT_OPTIONAL_STRING_BOUNDS: ReadonlyArray<[string, number]> = [
  ['nameBn', 160],
  ['name_bn', 160],
  ['name_en', 160],
  ['categorySlug', 160],
  ['categoryNameEn', 120],
  ['discount', 60],
  ['price_label', 80],
  ['unit', 60],
  ['shortDescriptionEn', 300],
  ['short_description_bn', 300],
  ['short_description_en', 300],
  ['descriptionEn', 4000],
  ['description_bn', 4000],
  ['description_en', 4000],
  ['masterKey', 240],
  ['sku', 80],
  ['ingredients_bn', 600],
  ['ingredients_en', 600],
  ['seoTitle', 200],
  ['seoDescription', 400],
];

const PRODUCT_OPTIONAL_BOOL_KEYS = ['visible', 'active', 'isActive', 'deleted'] as const;

const ALLOWED_CATEGORY_KEYS = new Set<string>([
  'id', 'name', 'nameEn', 'name_bn', 'name_en', 'slug', 'icon',
  'description', 'descriptionEn', 'description_bn', 'description_en',
  'image', 'order', 'visible', 'deleted', 'archivedAt', 'seoTitle', 'seoDescription',
  'createdAt', 'updatedAt',
]);

const REQUIRED_CATEGORY_SCHEMA_KEYS = [
  'id',
  'name',
  'nameEn',
  'slug',
  'description',
  'image',
  'order',
] as const;

const VALID_AVAILABILITIES: ReadonlySet<ProductAvailability> = new Set([
  'In Showroom',
  'Pre-Order at Showroom',
  'Seasonal',
  'Out of Stock',
]);

const VALID_PRODUCT_STATUSES = new Set(['draft', 'published', 'archived']);

class CatalogAuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'CatalogAuthError';
  }
}

interface VerifiedWriteSession {
  uid: string;
  email: string;
  emailVerified: boolean;
  tokenEmailVerified: boolean;
  tokenEmail: string;
  claimsRole: string | null;
  hrfStaffClaim: boolean;
  rbacSource: 'primary_super_admin' | 'rbac_roles' | 'admins' | 'client_context';
  rbacRole: string | null;
  rbacStatus: string | null;
}

function hasRolePermissionFallback(role: string | undefined, perm: PermissionKey): boolean {
  if (role === 'super_admin') return true;
  if (role === 'admin' || role === 'manager' || role === 'support_agent') {
    return (DEFAULT_ROLE_PERMISSIONS[role as StaffRole] ?? []).includes(perm);
  }
  return false;
}

async function ensureVerifiedAdminWriteSession(params: {
  hasPermission: (perm: PermissionKey) => boolean;
  requiredPermission: PermissionKey;
}): Promise<VerifiedWriteSession> {
  const currentUser = auth?.currentUser;
  if (!currentUser || !currentUser.email) {
    throw new CatalogAuthError(
      'auth/unauthenticated',
      'আপনার লগইন সেশন পাওয়া যায়নি বা শেষ হয়ে গেছে। অনুগ্রহ করে পুনরায় লগইন করুন।'
    );
  }

  if (
    currentUser.providerData.length > 0 &&
    !currentUser.providerData.some((p) => p.providerId === 'password')
  ) {
    throw new CatalogAuthError(
      'auth/unauthenticated',
      'অ্যাডমিন পরিবর্তনের জন্য ইমেইল ও পাসওয়ার্ড দিয়ে লগইন থাকা প্রয়োজন।'
    );
  }

  if (!currentUser.emailVerified) {
    try {
      await currentUser.reload();
    } catch {
      // Proceed to re-check current flag
    }
  }

  const refreshedUser = auth?.currentUser || currentUser;
  if (!refreshedUser.emailVerified) {
    throw new CatalogAuthError(
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
    throw new CatalogAuthError(
      'auth/token-refresh-failed',
      'আপনার লগইন টোকেন যাচাই/রিফ্রেশ করা যায়নি। অনুগ্রহ করে সাইন আউট করে পুনরায় লগইন করুন।'
    );
  }

  if (!tokenEmailVerified) {
    throw new CatalogAuthError(
      'auth/email-unverified',
      'Firebase Auth টোকেনে ইমেইল ভেরিফিকেশন এখনো আপডেট হয়নি (email_verified=false)। অনুগ্রহ করে সাইন আউট করে পুনরায় লগইন করুন।'
    );
  }

  if (!tokenEmail || tokenEmail !== emailLower) {
    throw new CatalogAuthError(
      'auth/token-claim-mismatch',
      'অ্যাডমিন টোকেনের ইমেইল ও বর্তমান সেশনের ইমেইল মেলেনি। অনুগ্রহ করে পুনরায় লগইন করুন।'
    );
  }

  const isPrimarySuperAdmin =
    emailLower === PRIMARY_SUPER_ADMIN_EMAIL &&
    refreshedUser.emailVerified &&
    tokenEmailVerified;

  let rbacSource: VerifiedWriteSession['rbacSource'] = isPrimarySuperAdmin
    ? 'primary_super_admin'
    : 'client_context';
  let rbacRole: string | null = isPrimarySuperAdmin ? 'super_admin' : claimsRole;
  let rbacStatus: string | null = isPrimarySuperAdmin ? 'active' : null;
  let serverRecordVerified = isPrimarySuperAdmin;

  if (!isPrimarySuperAdmin) {
    const firestore = requireDb();
    try {
      const rbacSnap = await getDoc(doc(firestore, 'rbac_roles', emailLower));
      if (rbacSnap.exists()) {
        const rbacData = rbacSnap.data() as RbacRoleEntry;
        rbacSource = 'rbac_roles';
        rbacRole = rbacData.role || null;
        rbacStatus = rbacData.status || 'disabled';
        if (rbacData.status !== 'active') {
          throw new CatalogAuthError(
            'rbac/account-inactive',
            'আপনার অ্যাডমিন/স্টাফ অ্যাকাউন্টটি সক্রিয় নয় বা সাসপেন্ড করা হয়েছে।'
          );
        }
        const allowedByRbac =
          rbacData.role === 'super_admin' ||
          (Array.isArray(rbacData.permissions)
            ? rbacData.permissions.includes(params.requiredPermission)
            : hasRolePermissionFallback(rbacData.role, params.requiredPermission));
        if (!allowedByRbac) {
          throw new CatalogAuthError(
            'rbac/missing-permission',
            `আপনার "${rbacData.role}" রোলে "${params.requiredPermission}" অনুমতি নেই।`
          );
        }
        serverRecordVerified = true;
      } else {
        const adminSnap = await getDoc(doc(firestore, 'admins', refreshedUser.uid));
        if (adminSnap.exists()) {
          const adminData = adminSnap.data() as AdminRecord;
          rbacSource = 'admins';
          rbacRole = adminData.role || null;
          const adminStatus = adminData.status || (adminData.active ? 'active' : 'disabled');
          rbacStatus = adminStatus;
          if (!adminData.active || adminStatus !== 'active') {
            throw new CatalogAuthError(
              'rbac/account-inactive',
              'আপনার অ্যাডমিন অ্যাকাউন্টটি নিষ্ক্রিয় অবস্থায় রয়েছে।'
            );
          }
          const allowedByAdmin =
            adminData.role === 'super_admin' ||
            (Array.isArray(adminData.permissions)
              ? adminData.permissions.includes(params.requiredPermission)
              : hasRolePermissionFallback(adminData.role, params.requiredPermission));
          if (!allowedByAdmin) {
            throw new CatalogAuthError(
              'rbac/missing-permission',
              `আপনার "${adminData.role}" অ্যাকাউন্টে "${params.requiredPermission}" অনুমতি নেই।`
            );
          }
          serverRecordVerified = true;
        }
      }
    } catch (rbacErr) {
      if (rbacErr instanceof CatalogAuthError) {
        throw rbacErr;
      }
      // If reading rbac_roles/admins itself fails or is unavailable offline, fall through to client permission check
    }
  }

  if (!serverRecordVerified || !params.hasPermission(params.requiredPermission)) {
    throw new CatalogAuthError(
      'rbac/missing-permission',
      `এই কাজের জন্য "${params.requiredPermission}" অ্যাডমিন অনুমতি প্রয়োজন। অনুগ্রহ করে সুপার অ্যাডমিনের সাথে যোগাযোগ করুন।`
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
    rbacSource,
    rbacRole,
    rbacStatus,
  };
}

function sanitizeStoredImageUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const item of urls) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || isForbiddenInlineImageUrl(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    clean.push(trimmed);
    if (clean.length >= 6) break;
  }
  return clean;
}

function hasValidTimestamp(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'toMillis' in value &&
      typeof (value as { toMillis?: unknown }).toMillis === 'function'
  );
}

function hasCompleteSchema(
  data: Record<string, unknown> | undefined,
  requiredKeys: readonly string[]
): boolean {
  if (!data) return false;
  return requiredKeys.every((key) => key in data);
}

function isNonEmptyString(val: unknown, maxLen: number): boolean {
  return typeof val === 'string' && val.length >= 1 && val.length <= maxLen;
}

function isBoundedStringArray(val: unknown, maxLen: number, maxItemLen: number): boolean {
  if (!Array.isArray(val) || val.length > maxLen) return false;
  return val.every((item) => typeof item === 'string' && item.length <= maxItemLen);
}

function getUnknownKeys(data: Record<string, unknown>, allowlist: Set<string>): string[] {
  return Object.keys(data).filter((k) => !allowlist.has(k));
}

function inspectExistingProductIssues(
  data: Record<string, unknown> | undefined
): string[] {
  if (!data) return ['missing_doc'];
  const issues: string[] = [];

  const unknownKeys = getUnknownKeys(data, ALLOWED_PRODUCT_KEYS);
  if (unknownKeys.length > 0) {
    issues.push(`unknown_keys:${unknownKeys.join(',')}`);
  }
  if (!hasCompleteSchema(data, REQUIRED_PRODUCT_SCHEMA_KEYS)) {
    const missing = REQUIRED_PRODUCT_SCHEMA_KEYS.filter((k) => !(k in data));
    issues.push(`missing_required:${missing.join(',')}`);
  }
  if (!hasValidTimestamp(data.createdAt)) issues.push('invalid_createdAt');
  if (typeof data.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.id)) {
    issues.push('invalid_id');
  }
  if (!isNonEmptyString(data.name, 160)) issues.push('invalid_name');
  if (!isNonEmptyString(data.nameEn, 160)) issues.push('invalid_nameEn');
  if (typeof data.slug !== 'string' || !/^[a-z0-9-]{1,160}$/.test(data.slug)) {
    issues.push('invalid_slug');
  }
  if (typeof data.category !== 'string' || !/^[a-z0-9-]{1,160}$/.test(data.category)) {
    issues.push('invalid_category');
  }
  if (!isNonEmptyString(data.categoryName, 120)) issues.push('invalid_categoryName');
  if (!isNonEmptyString(data.productType, 120)) issues.push('invalid_productType');
  if (
    typeof data.price !== 'number' ||
    !Number.isFinite(data.price) ||
    data.price < 0 ||
    data.price > 1000000
  ) {
    issues.push('invalid_price');
  }
  if (!isNonEmptyString(data.priceUnit, 60)) issues.push('invalid_priceUnit');
  if (!isNonEmptyString(data.shortDescription, 300)) issues.push('invalid_shortDescription');
  if (!isNonEmptyString(data.description, 4000)) issues.push('invalid_description');
  if (typeof data.weight !== 'string' || data.weight.length > 80) issues.push('invalid_weight');
  if (typeof data.importantNotes !== 'string' || data.importantNotes.length > 800) {
    issues.push('invalid_importantNotes');
  }
  if (typeof data.availability !== 'string' || !VALID_AVAILABILITIES.has(data.availability as ProductAvailability)) {
    issues.push('invalid_availability');
  }
  if (typeof data.featured !== 'boolean') issues.push('invalid_featured');
  if (typeof data.popular !== 'boolean') issues.push('invalid_popular');

  if (!isBoundedStringArray(data.images, 6, 400000)) {
    issues.push('invalid_images');
  } else if ((data.images as string[]).some((u) => isForbiddenInlineImageUrl(u))) {
    issues.push('forbidden_inline_images');
  }
  if (!isBoundedStringArray(data.ingredients, 25, 120)) issues.push('invalid_ingredients');
  if (!isBoundedStringArray(data.sizes, 10, 80)) issues.push('invalid_sizes');
  if (!isBoundedStringArray(data.occasions, 15, 80)) issues.push('invalid_occasions');
  if (!isBoundedStringArray(data.showrooms, 20, 128)) issues.push('invalid_showrooms');

  for (const [key, maxLen] of PRODUCT_OPTIONAL_STRING_BOUNDS) {
    if (key in data && (typeof data[key] !== 'string' || (data[key] as string).length > maxLen)) {
      issues.push(`invalid_${key}`);
    }
  }
  for (const imgKey of ['image', 'imageUrl', 'seoImage'] as const) {
    if (imgKey in data) {
      const val = data[imgKey];
      if (typeof val !== 'string' || val.length > 400000 || isForbiddenInlineImageUrl(val)) {
        issues.push(`invalid_${imgKey}`);
      }
    }
  }
  for (const boolKey of PRODUCT_OPTIONAL_BOOL_KEYS) {
    if (boolKey in data && typeof data[boolKey] !== 'boolean') {
      issues.push(`invalid_${boolKey}`);
    }
  }
  if (
    'old_price' in data &&
    (typeof data.old_price !== 'number' ||
      !Number.isFinite(data.old_price) ||
      data.old_price < 0 ||
      data.old_price > 1000000)
  ) {
    issues.push('invalid_old_price');
  }
  if (
    'rating' in data &&
    (typeof data.rating !== 'number' ||
      !Number.isFinite(data.rating) ||
      data.rating < 0 ||
      data.rating > 5)
  ) {
    issues.push('invalid_rating');
  }
  if (
    'stock' in data &&
    (typeof data.stock !== 'number' ||
      !Number.isInteger(data.stock) ||
      data.stock < 0 ||
      data.stock > 1000000)
  ) {
    issues.push('invalid_stock');
  }
  if (
    'display_order' in data &&
    (typeof data.display_order !== 'number' ||
      !Number.isInteger(data.display_order) ||
      data.display_order < 0 ||
      data.display_order > 10000)
  ) {
    issues.push('invalid_display_order');
  }
  if (
    'status' in data &&
    (typeof data.status !== 'string' || !VALID_PRODUCT_STATUSES.has(data.status))
  ) {
    issues.push('invalid_status');
  }

  return issues;
}

function isExistingProductDocRuleReady(data: Record<string, unknown> | undefined): boolean {
  return inspectExistingProductIssues(data).length === 0;
}

function getInvalidOptionalProductFieldsToDelete(data: Record<string, unknown> | undefined): string[] {
  if (!data) return [];
  const toDelete: string[] = [];
  for (const [key, maxLen] of PRODUCT_OPTIONAL_STRING_BOUNDS) {
    if (key in data && (typeof data[key] !== 'string' || (data[key] as string).length > maxLen)) {
      toDelete.push(key);
    }
  }
  for (const imgKey of ['image', 'imageUrl', 'seoImage'] as const) {
    if (imgKey in data) {
      const val = data[imgKey];
      if (typeof val !== 'string' || val.length > 400000 || isForbiddenInlineImageUrl(val)) {
        toDelete.push(imgKey);
      }
    }
  }
  for (const boolKey of PRODUCT_OPTIONAL_BOOL_KEYS) {
    if (boolKey in data && typeof data[boolKey] !== 'boolean') {
      toDelete.push(boolKey);
    }
  }
  if (
    'old_price' in data &&
    (typeof data.old_price !== 'number' ||
      !Number.isFinite(data.old_price) ||
      data.old_price < 0 ||
      data.old_price > 1000000)
  ) {
    toDelete.push('old_price');
  }
  if (
    'rating' in data &&
    (typeof data.rating !== 'number' ||
      !Number.isFinite(data.rating) ||
      data.rating < 0 ||
      data.rating > 5)
  ) {
    toDelete.push('rating');
  }
  if (
    'stock' in data &&
    (typeof data.stock !== 'number' ||
      !Number.isInteger(data.stock) ||
      data.stock < 0 ||
      data.stock > 1000000)
  ) {
    toDelete.push('stock');
  }
  if (
    'display_order' in data &&
    (typeof data.display_order !== 'number' ||
      !Number.isInteger(data.display_order) ||
      data.display_order < 0 ||
      data.display_order > 10000)
  ) {
    toDelete.push('display_order');
  }
  if (
    'status' in data &&
    (typeof data.status !== 'string' || !VALID_PRODUCT_STATUSES.has(data.status))
  ) {
    toDelete.push('status');
  }
  return toDelete;
}

function isExistingCategoryDocRuleReady(data: Record<string, unknown> | undefined): boolean {
  if (!data || !hasCompleteSchema(data, REQUIRED_CATEGORY_SCHEMA_KEYS)) return false;
  if (getUnknownKeys(data, ALLOWED_CATEGORY_KEYS).length > 0) return false;
  if (!hasValidTimestamp(data.createdAt)) return false;
  if (typeof data.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.id)) return false;
  if (!isNonEmptyString(data.name, 120) || !isNonEmptyString(data.nameEn, 120)) return false;
  if (typeof data.slug !== 'string' || !/^[a-z0-9-]{1,160}$/.test(data.slug)) return false;
  if (!isNonEmptyString(data.description, 600)) return false;
  if (typeof data.image !== 'string' || !isNonEmptyString(data.image, 500000) || isForbiddenInlineImageUrl(data.image)) return false;
  if (
    typeof data.order !== 'number' ||
    !Number.isInteger(data.order) ||
    data.order < 0 ||
    data.order > 1000
  ) {
    return false;
  }
  if ('visible' in data && typeof data.visible !== 'boolean') return false;
  if ('deleted' in data && typeof data.deleted !== 'boolean') return false;
  return true;
}

function isFirestoreSentinel(val: unknown): boolean {
  return Boolean(
    val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      !('toMillis' in val) &&
      ('_methodName' in val || 'isEqual' in val)
  );
}

function validateProductWriteForRules(params: {
  docId: string;
  payload: Record<string, unknown>;
  existingData?: Record<string, unknown>;
  isCreate: boolean;
  isFullReplace?: boolean;
}): string[] {
  const { docId, payload, existingData, isCreate, isFullReplace } = params;
  const issues: string[] = [];

  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(docId)) {
    issues.push(`invalid_doc_id(${docId})`);
  }

  const merged: Record<string, unknown> =
    isCreate || isFullReplace
      ? { ...payload }
      : { ...(existingData || {}), ...payload };

  for (const key of Object.keys(payload)) {
    if (isFirestoreSentinel(payload[key])) {
      // Simulate serverTimestamp() or deleteField()
      if (key === 'updatedAt' || key === 'createdAt') {
        merged[key] = { toMillis: () => Date.now() };
      } else {
        delete merged[key];
      }
    }
  }

  if (isCreate && !('createdAt' in merged)) {
    issues.push('missing_createdAt');
  }
  if (!('updatedAt' in merged)) {
    issues.push('missing_updatedAt');
  }

  if (!isCreate && existingData) {
    const existingValidId =
      typeof existingData.id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(existingData.id)
        ? existingData.id
        : docId;
    if (merged.id !== existingValidId) {
      issues.push(`id_mismatch(expected=${existingValidId},got=${String(merged.id)})`);
    }
  } else if (merged.id !== docId) {
    issues.push(`create_id_mismatch(docId=${docId},id=${String(merged.id)})`);
  }

  const schemaIssues = inspectExistingProductIssues(merged);
  issues.push(...schemaIssues);
  return issues;
}

function assertValidProductWritePreflight(
  params: {
    docId: string;
    payload: Record<string, unknown>;
    existingData?: Record<string, unknown>;
    isCreate: boolean;
    isFullReplace?: boolean;
  },
  preflightIssuesOut?: string[]
): void {
  const issues = validateProductWriteForRules(params);
  if (issues.length > 0) {
    if (preflightIssuesOut) {
      preflightIssuesOut.splice(0, preflightIssuesOut.length, ...issues);
    }
    throw new CatalogAuthError(
      'validation/preflight-failed',
      `পণ্যের কিছু ফিল্ড Firestore Security Rules-এর সাথে মিলছে না (${issues.slice(0, 4).join(', ')})। অনুগ্রহ করে ঘরগুলো যাচাই করে আবার চেষ্টা করুন।`
    );
  }
}

function mapCatalogSaveError(
  err: unknown,
  context: string,
  diag?: {
    path?: string;
    operation?: string;
    staffRole?: string | null;
    existingIssues?: string[];
    preflightIssues?: string[];
    authSession?: VerifiedWriteSession | null;
  }
): string {
  const rawCode =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: unknown }).code || '').trim().toLowerCase()
      : '';
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lowerMessage = rawMessage.toLowerCase();
  const activeUser = auth?.currentUser;

  const safeDiag = {
    code: rawCode || 'unknown',
    message: rawMessage,
    uid: diag?.authSession?.uid ?? activeUser?.uid ?? null,
    email: diag?.authSession?.email ?? activeUser?.email ?? null,
    emailVerified: diag?.authSession?.emailVerified ?? activeUser?.emailVerified ?? null,
    tokenEmailVerified: diag?.authSession?.tokenEmailVerified ?? null,
    claimsRole: diag?.authSession?.claimsRole ?? null,
    hrfStaffClaim: diag?.authSession?.hrfStaffClaim ?? null,
    rbacSource: diag?.authSession?.rbacSource ?? null,
    rbacRole: diag?.authSession?.rbacRole ?? null,
    rbacStatus: diag?.authSession?.rbacStatus ?? null,
    staffRole: diag?.staffRole ?? null,
    path: diag?.path ?? null,
    operation: diag?.operation ?? null,
    existingIssues: diag?.existingIssues ?? [],
    preflightIssues: diag?.preflightIssues ?? [],
  };

  console.error(`[CatalogSave:${context}]`, safeDiag);

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
  if (rawCode === 'rbac/account-inactive') {
    return 'আপনার অ্যাডমিন অ্যাকাউন্টটি নিষ্ক্রিয় বা সাসপেন্ড অবস্থায় আছে (rbac/account-inactive)।';
  }
  if (rawCode === 'rbac/missing-permission') {
    return 'আপনার অ্যাকাউন্টে এই ক্যাটালগ পরিবর্তনের অনুমতি নেই (rbac/missing-permission)। অনুগ্রহ করে সুপার অ্যাডমিনের সাথে যোগাযোগ করুন।';
  }
  if (rawCode === 'validation/preflight-failed') {
    return err instanceof Error && err.message
      ? err.message
      : 'পণ্যের কিছু আবশ্যকীয় তথ্য Firestore নিয়মের সাথে মিলছে না। অনুগ্রহ করে ঘরগুলো যাচাই করুন।';
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
      safeDiag.rbacSource ? `rbac:${safeDiag.rbacSource}` : null,
      safeDiag.preflightIssues.length > 0
        ? `preflight:${safeDiag.preflightIssues.slice(0, 3).join(';')}`
        : null,
      safeDiag.existingIssues.length > 0
        ? `docIssues:${safeDiag.existingIssues.slice(0, 3).join(';')}`
        : null,
    ].filter(Boolean);
    const diagSuffix = diagParts.length > 0 ? ` [${diagParts.join(' · ')}]` : '';
    return `Firestore সংরক্ষণের অনুমতি দেয়নি (permission-denied)। অ্যাডমিন অ্যাকাউন্ট যাচাই, Firestore Security Rules অথবা পণ্যের আবশ্যকীয় ফিল্ড যাচাই করে আবার চেষ্টা করুন।${diagSuffix}`;
  }
  if (rawCode === 'failed-precondition' || rawCode.endsWith('/failed-precondition')) {
    return 'Firestore-এর পূর্বশর্ত পূরণ হয়নি (failed-precondition)। অনুগ্রহ করে ডাটাবেসের অবস্থা বা ইনডেক্স যাচাই করুন।';
  }
  if (rawCode === 'invalid-argument' || rawCode.endsWith('/invalid-argument')) {
    return 'প্রদত্ত তথ্যের ফরম্যাট বা ধরন সঠিক নয় (invalid-argument)। অনুগ্রহ করে ঘরগুলো যাচাই করে আবার চেষ্টা করুন।';
  }
  if (rawCode === 'not-found' || rawCode.endsWith('/not-found')) {
    return 'সংশ্লিষ্ট ডকুমেন্টটি Firestore-এ পাওয়া যায়নি (not-found)। পৃষ্ঠা রিলোড করে আবার চেষ্টা করুন।';
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
    return rawMessage;
  }
  return `সংরক্ষণে ত্রুটি হয়েছে (${rawCode || 'unknown'})। অনুগ্রহ করে তথ্যগুলো যাচাই করে আবার চেষ্টা করুন।`;
}

type EditorImageSlot =
  | { kind: 'existing'; id: string; url: string }
  | { kind: 'pending'; id: string; file: File; previewUrl: string };

// ========================
// 1. PRODUCT MANAGEMENT
// ========================
export function AdminProductsPanel() {
  const {
    allProducts,
    allCategories,
    allOccasions,
    allShowrooms,
    staffRole,
    hasPermission,
    logAdminActivity,
    importProductMasterList,
    masterImportStats,
    masterImportRunning,
    lastMasterImportSummary,
  } = useStore();
  const canAdd = hasPermission('products_add');
  const canEdit = hasPermission('products_edit');
  const canDelete = hasPermission('products_delete');
  const [editing, setEditing] = useState<Product | null>(null);
  const [editorImageSlots, setEditorImageSlots] = useState<EditorImageSlot[]>([]);
  const pendingPreviewUrlsRef = useRef<Set<string>>(new Set());
  const [originalSnapshot, setOriginalSnapshot] = useState<string>('');
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'active' | 'hidden' | 'archived' | 'all'>('active');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [missingImageOnly, setMissingImageOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [uploadingRowId, setUploadingRowId] = useState<string | null>(null);
  const [rowUploadProgress, setRowUploadProgress] = useState<number | null>(null);
  const [editorUploadProgress, setEditorUploadProgress] = useState<number | null>(null);
  const [editorUploadLabel, setEditorUploadLabel] = useState<string>('');
  const [editorUploadPreviewUrl, setEditorUploadPreviewUrl] = useState<string | null>(null);
  const [editorUploadError, setEditorUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(false);
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState<Product | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const revokeAllPendingPreviews = () => {
    for (const url of pendingPreviewUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    pendingPreviewUrlsRef.current.clear();
  };

  useEffect(() => {
    return () => {
      revokeAllPendingPreviews();
    };
  }, []);

  const serializeNonImageState = (
    p: Product,
    ingText: string,
    szText: string
  ): string =>
    JSON.stringify({
      name: p.name.trim(),
      nameBn: (p.nameBn ?? p.name).trim(),
      nameEn: p.nameEn.trim(),
      slug: p.slug.trim(),
      category: p.category,
      categoryName: p.categoryName,
      productType: p.productType.trim(),
      price: Number(p.price) || 0,
      old_price: p.old_price ?? null,
      discount: (p.discount ?? '').trim(),
      price_label: (p.price_label ?? '').trim(),
      priceUnit: p.priceUnit.trim(),
      unit: (p.unit ?? p.priceUnit).trim(),
      shortDescription: p.shortDescription.trim(),
      shortDescriptionEn: (p.shortDescriptionEn ?? '').trim(),
      description: p.description.trim(),
      descriptionEn: (p.descriptionEn ?? '').trim(),
      ingredients: ingText.trim(),
      sizes: szText.trim(),
      weight: p.weight.trim(),
      occasions: p.occasions,
      showrooms: p.showrooms,
      availability: p.availability,
      importantNotes: p.importantNotes.trim(),
      featured: Boolean(p.featured),
      popular: Boolean(p.popular),
      visible: p.visible !== false,
      deleted: Boolean(p.deleted),
      display_order: Number(p.display_order) || 1,
    });

  const emptyProduct = (): Product => ({
    id: `prod-${Date.now()}`,
    name: '',
    nameBn: '',
    nameEn: '',
    name_bn: '',
    name_en: '',
    slug: '',
    category: allCategories[0]?.slug ?? 'custom-cake',
    categoryName: allCategories[0]?.name ?? 'কাস্টমাইজ কেক',
    categoryNameEn: allCategories[0]?.nameEn ?? 'Customized Cakes',
    productType: 'Signature Item',
    price: 0,
    old_price: undefined,
    discount: '',
    price_label: '',
    priceUnit: 'Piece',
    unit: 'Piece',
    shortDescription: '',
    shortDescriptionEn: '',
    short_description_bn: '',
    short_description_en: '',
    description: '',
    descriptionEn: '',
    description_bn: '',
    description_en: '',
    image: '',
    images: [],
    ingredients: [],
    sizes: ['Regular'],
    weight: '',
    occasions: [],
    showrooms: allShowrooms
      .filter((s) => s.visible !== false && !s.deleted && !isDemoOrDummyShowroom(s))
      .slice(0, 20)
      .map((s) => s.id),
    availability: 'In Showroom',
    importantNotes: '',
    featured: false,
    popular: false,
    visible: true,
    deleted: false,
    display_order: allProducts.length + 1,
    status: 'published',
  });

  const [ingredientsText, setIngredientsText] = useState('');
  const [sizesText, setSizesText] = useState('');

  const closeEditor = () => {
    revokeAllPendingPreviews();
    setEditorImageSlots([]);
    setEditing(null);
    setEditorUploadProgress(null);
    setEditorUploadLabel('');
    setEditorUploadPreviewUrl(null);
    setEditorUploadError(null);
  };

  const openEditor = (prod: Product | null) => {
    revokeAllPendingPreviews();
    if (prod) {
      const t = getProductText(prod, allCategories);
      const ing = (Array.isArray(prod.ingredients) ? prod.ingredients : []).join(', ');
      const sz = (Array.isArray(prod.sizes) ? prod.sizes : []).join(', ');
      const normalizedImages =
        Array.isArray(prod.images) && prod.images.length > 0
          ? prod.images.filter(Boolean)
          : prod.image
          ? [prod.image]
          : [];
      const prepared: Product = {
        ...prod,
        name: t.nameBn,
        nameBn: t.nameBn,
        nameEn: t.nameEn,
        name_bn: t.nameBn,
        name_en: t.nameEn,
        unit: t.unit || prod.priceUnit,
        priceUnit: prod.priceUnit || t.unit || 'Piece',
        image: prod.image || normalizedImages[0] || '',
        images: normalizedImages,
        shortDescription: t.shortDescriptionBn,
        shortDescriptionEn: t.shortDescriptionEn,
        short_description_bn: t.shortDescriptionBn,
        short_description_en: t.shortDescriptionEn,
        description: t.descriptionBn,
        descriptionEn: t.descriptionEn,
        description_bn: t.descriptionBn,
        description_en: t.descriptionEn,
        categoryName: prod.categoryName || t.categoryNameBn,
        categoryNameEn: prod.categoryNameEn || t.categoryNameEn,
      };
      setIsNew(false);
      setEditing(prepared);
      setEditorImageSlots(
        normalizedImages.slice(0, 6).map((url, idx) => ({
          kind: 'existing',
          id: `existing-${idx}-${url.slice(0, 16)}`,
          url,
        }))
      );
      setIngredientsText(ing);
      setSizesText(sz);
      setOriginalSnapshot(serializeNonImageState(prepared, ing, sz));
    } else {
      const fresh = emptyProduct();
      setIsNew(true);
      setEditing(fresh);
      setEditorImageSlots([]);
      setIngredientsText('');
      setSizesText('Regular');
      setOriginalSnapshot('');
    }
    setEditorUploadProgress(null);
    setEditorUploadLabel('');
    setEditorUploadPreviewUrl(null);
    setEditorUploadError(null);
    setFeedback(null);
  };

  const queueProductImageFiles = (files: File[]) => {
    if (!editing || files.length === 0) return;

    const nonInlineSlotsCount = editorImageSlots.filter(
      (slot) => slot.kind === 'pending' || !isForbiddenInlineImageUrl(slot.url)
    ).length;
    const remainingSlots = Math.max(0, 6 - nonInlineSlotsCount);
    if (remainingSlots <= 0) {
      setEditorUploadError('একটি পণ্যে সর্বোচ্চ ৬টি ছবি রাখা যাবে। নতুন ছবি যোগ করতে একটি ছবি সরান।');
      return;
    }

    const queue = files.slice(0, remainingSlots);
    for (const candidate of queue) {
      const errMsg = validateCatalogImageFile(candidate);
      if (errMsg) {
        setEditorUploadError(errMsg);
        return;
      }
    }

    setEditorUploadError(null);

    const newPendingSlots: EditorImageSlot[] = queue.map((file, idx) => {
      const previewUrl = URL.createObjectURL(file);
      pendingPreviewUrlsRef.current.add(previewUrl);
      return {
        kind: 'pending',
        id: `pending-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl,
      };
    });

    // Drop legacy forbidden inline URLs once the admin provides valid replacement image(s)
    const cleanExistingAndPending = editorImageSlots.filter(
      (slot) => slot.kind === 'pending' || !isForbiddenInlineImageUrl(slot.url)
    );
    const nextSlots = [...newPendingSlots.reverse(), ...cleanExistingAndPending].slice(0, 6);
    setEditorImageSlots(nextSlots);

    const keptExisting = nextSlots
      .filter((s): s is Extract<EditorImageSlot, { kind: 'existing' }> => s.kind === 'existing')
      .map((s) => s.url);
    setEditing((prev) =>
      prev
        ? {
            ...prev,
            image: keptExisting[0] ?? '',
            images: keptExisting,
          }
        : null
    );
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    queueProductImageFiles(fileList);
  };

  const buildNormalizedProductPayload = (params: {
    source: Product;
    ingredientsList: string[];
    sizesList: string[];
    cleanImages: string[];
    existingData?: Record<string, unknown>;
    forFullSet?: boolean;
  }): Record<string, unknown> => {
    const { source, ingredientsList, sizesList, cleanImages, existingData, forFullSet } = params;
    const preservedValidId =
      existingData &&
      typeof existingData.id === 'string' &&
      /^[a-zA-Z0-9_-]{1,128}$/.test(existingData.id)
        ? existingData.id
        : source.id;
    const nameBn = String(source.name || source.nameBn || source.nameEn || 'পণ্য').trim().slice(0, 160) || 'পণ্য';
    const nameEn = String(source.nameEn || source.name_en || nameBn).trim().slice(0, 160) || nameBn;
    const resolvedCategorySlug = toSlug(
      String(source.category || allCategories[0]?.slug || 'custom-cake').trim()
    );
    const catObj = allCategories.find((c) => c.slug === resolvedCategorySlug);
    const catText = catObj ? getCategoryText(catObj) : null;
    const slug = toSlug(String(source.slug || '').trim() || nameEn || nameBn);
    const resolvedUnit = String((source.unit ?? source.priceUnit) || 'Piece').trim().slice(0, 60) || 'Piece';
    const shortDescEn = String(source.shortDescriptionEn ?? source.short_description_en ?? '')
      .trim()
      .slice(0, 300);
    const shortDescBn = (String(source.shortDescription || '').trim() || shortDescEn || nameBn).slice(0, 300);
    const fullDescEn = String(source.descriptionEn ?? source.description_en ?? shortDescEn)
      .trim()
      .slice(0, 4000);
    const fullDescBn = (
      String(source.description || '').trim() ||
      shortDescBn ||
      fullDescEn ||
      nameBn
    ).slice(0, 4000);
    const rawPrice = Number(source.price);
    const numericPrice = Number.isFinite(rawPrice)
      ? Math.min(1000000, Math.max(0, rawPrice))
      : 0;
    const rawDisplayOrder = Number(source.display_order);
    const safeDisplayOrder = Number.isFinite(rawDisplayOrder)
      ? Math.min(10000, Math.max(0, Math.round(rawDisplayOrder)))
      : 1;
    const safeAvailability: ProductAvailability = VALID_AVAILABILITIES.has(source.availability)
      ? source.availability
      : 'In Showroom';
    const primaryImg = cleanImages[0] ?? '';

    const payload: Record<string, unknown> = {
      id: preservedValidId,
      name: nameBn,
      nameBn,
      nameEn,
      name_bn: nameBn,
      name_en: nameEn,
      slug,
      category: resolvedCategorySlug,
      categoryName: (
        String(source.categoryName || '').trim() ||
        catText?.nameBn ||
        resolvedCategorySlug
      )
        .trim()
        .slice(0, 120),
      categoryNameEn: String(source.categoryNameEn || catText?.nameEn || '')
        .trim()
        .slice(0, 120),
      productType: (String(source.productType || '').trim() || 'Bakery & Sweets').slice(0, 120),
      price: numericPrice,
      priceUnit: resolvedUnit,
      unit: resolvedUnit,
      shortDescription: shortDescBn,
      shortDescriptionEn: shortDescEn,
      short_description_bn: shortDescBn,
      short_description_en: shortDescEn,
      description: fullDescBn,
      descriptionEn: fullDescEn,
      description_bn: fullDescBn,
      description_en: fullDescEn,
      image: primaryImg,
      imageUrl: primaryImg,
      images: cleanImages,
      ingredients: ingredientsList
        .map((s) => String(s).trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 25),
      sizes: sizesList
        .map((s) => String(s).trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 10),
      weight: String(source.weight || '').trim().slice(0, 80),
      occasions: (Array.isArray(source.occasions) ? source.occasions : [])
        .map((o) => String(o).trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 15),
      showrooms: (Array.isArray(source.showrooms) ? source.showrooms : [])
        .map((sid) => String(sid).trim().slice(0, 128))
        .filter((sid) => Boolean(sid) && !CONFIRMED_DEMO_SHOWROOM_IDS.has(sid))
        .slice(0, 20),
      availability: safeAvailability,
      importantNotes: String(source.importantNotes || '').trim().slice(0, 800),
      featured: Boolean(source.featured),
      popular: Boolean(source.popular),
      visible: source.visible !== false,
      active: source.active !== false,
      isActive: source.isActive !== false,
      deleted: Boolean(source.deleted),
      display_order: safeDisplayOrder,
      status: source.deleted ? 'archived' : source.visible === false ? 'draft' : 'published',
      updatedAt: serverTimestamp(),
    };

    if (source.masterKey) {
      payload.masterKey = String(source.masterKey).slice(0, 240);
    }

    const preserveCategorySlug =
      typeof source.categorySlug === 'string' && source.categorySlug.trim()
        ? source.categorySlug.trim().slice(0, 160)
        : typeof existingData?.categorySlug === 'string' && existingData.categorySlug.trim()
        ? existingData.categorySlug.trim().slice(0, 160)
        : '';
    if (preserveCategorySlug) {
      payload.categorySlug = preserveCategorySlug;
    }

    const preserveIngredientsBn =
      typeof source.ingredients_bn === 'string' && source.ingredients_bn.trim()
        ? source.ingredients_bn.trim().slice(0, 600)
        : typeof existingData?.ingredients_bn === 'string' && existingData.ingredients_bn.trim()
        ? existingData.ingredients_bn.trim().slice(0, 600)
        : '';
    if (preserveIngredientsBn) {
      payload.ingredients_bn = preserveIngredientsBn;
    }

    const preserveIngredientsEn =
      typeof source.ingredients_en === 'string' && source.ingredients_en.trim()
        ? source.ingredients_en.trim().slice(0, 600)
        : typeof existingData?.ingredients_en === 'string' && existingData.ingredients_en.trim()
        ? existingData.ingredients_en.trim().slice(0, 600)
        : '';
    if (preserveIngredientsEn) {
      payload.ingredients_en = preserveIngredientsEn;
    }

    const rawRating =
      typeof source.rating === 'number'
        ? source.rating
        : typeof existingData?.rating === 'number'
        ? existingData.rating
        : NaN;
    if (Number.isFinite(rawRating) && rawRating >= 0 && rawRating <= 5) {
      payload.rating = rawRating;
    }

    const rawStock =
      typeof source.stock === 'number'
        ? source.stock
        : typeof existingData?.stock === 'number'
        ? existingData.stock
        : NaN;
    if (Number.isInteger(rawStock) && rawStock >= 0 && rawStock <= 1000000) {
      payload.stock = rawStock;
    }

    const preserveSku =
      typeof source.sku === 'string' && source.sku.trim()
        ? source.sku.trim().slice(0, 80)
        : typeof existingData?.sku === 'string' && existingData.sku.trim()
        ? existingData.sku.trim().slice(0, 80)
        : '';
    if (preserveSku) {
      payload.sku = preserveSku;
    }

    const preserveSeoTitle =
      typeof source.seoTitle === 'string' && source.seoTitle.trim()
        ? source.seoTitle.trim().slice(0, 200)
        : typeof existingData?.seoTitle === 'string' && existingData.seoTitle.trim()
        ? existingData.seoTitle.trim().slice(0, 200)
        : '';
    if (preserveSeoTitle) {
      payload.seoTitle = preserveSeoTitle;
    }

    const preserveSeoDesc =
      typeof source.seoDescription === 'string' && source.seoDescription.trim()
        ? source.seoDescription.trim().slice(0, 400)
        : typeof existingData?.seoDescription === 'string' && existingData.seoDescription.trim()
        ? existingData.seoDescription.trim().slice(0, 400)
        : '';
    if (preserveSeoDesc) {
      payload.seoDescription = preserveSeoDesc;
    }

    const candidateSeoImg =
      typeof source.seoImage === 'string' &&
      source.seoImage.trim() &&
      !isForbiddenInlineImageUrl(source.seoImage)
        ? source.seoImage.trim()
        : typeof existingData?.seoImage === 'string' &&
          existingData.seoImage.trim() &&
          !isForbiddenInlineImageUrl(existingData.seoImage)
        ? existingData.seoImage.trim()
        : '';
    if (candidateSeoImg && candidateSeoImg.length <= 400000) {
      payload.seoImage = candidateSeoImg;
    }

    if (source.deleted && existingData && 'archivedAt' in existingData && existingData.archivedAt !== undefined) {
      payload.archivedAt = existingData.archivedAt;
    }

    const hasValidOldPrice =
      typeof source.old_price === 'number' &&
      Number.isFinite(source.old_price) &&
      source.old_price > 0;
    if (hasValidOldPrice) {
      payload.old_price = Math.min(1000000, Math.max(0, Number(source.old_price)));
    } else if (!forFullSet && existingData && 'old_price' in existingData) {
      payload.old_price = deleteField();
    }

    const trimmedDiscount = source.discount?.trim() ?? '';
    if (trimmedDiscount) {
      payload.discount = trimmedDiscount.slice(0, 60);
    } else if (!forFullSet && existingData && 'discount' in existingData) {
      payload.discount = '';
    }

    const trimmedPriceLabel = source.price_label?.trim() ?? '';
    if (trimmedPriceLabel) {
      payload.price_label = trimmedPriceLabel.slice(0, 80);
    } else if (!forFullSet && existingData && 'price_label' in existingData) {
      payload.price_label = '';
    }

    if (!forFullSet && existingData) {
      for (const badKey of getInvalidOptionalProductFieldsToDelete(existingData)) {
        if (!(badKey in payload)) {
          payload[badKey] = deleteField();
        }
      }
    }

    return payload;
  };

  const writeExistingProductWithCleanup = async (params: {
    productRef: ReturnType<typeof doc>;
    existingData: Record<string, unknown> | undefined;
    source: Product;
    ingredientsList: string[];
    sizesList: string[];
    cleanImages: string[];
    preflightIssuesOut?: string[];
  }) => {
    const {
      productRef,
      existingData,
      source,
      ingredientsList,
      sizesList,
      cleanImages,
      preflightIssuesOut,
    } = params;
    const unknownKeys = existingData ? getUnknownKeys(existingData, ALLOWED_PRODUCT_KEYS) : [];
    const hasValidCreated = hasValidTimestamp(existingData?.createdAt);

    if (unknownKeys.length > 0) {
      const fullPayload = buildNormalizedProductPayload({
        source,
        ingredientsList,
        sizesList,
        cleanImages,
        existingData,
        forFullSet: true,
      });
      const replacePayload = {
        ...fullPayload,
        createdAt: hasValidCreated ? existingData!.createdAt : serverTimestamp(),
      };
      assertValidProductWritePreflight(
        {
          docId: productRef.id,
          payload: replacePayload,
          existingData,
          isCreate: false,
          isFullReplace: true,
        },
        preflightIssuesOut
      );
      await setDoc(productRef, replacePayload);
      return;
    }

    const updatePayload = buildNormalizedProductPayload({
      source,
      ingredientsList,
      sizesList,
      cleanImages,
      existingData,
      forFullSet: false,
    });
    const finalUpdatePayload = hasValidCreated
      ? updatePayload
      : { ...updatePayload, createdAt: serverTimestamp() };
    assertValidProductWritePreflight(
      {
        docId: productRef.id,
        payload: finalUpdatePayload,
        existingData,
        isCreate: false,
        isFullReplace: false,
      },
      preflightIssuesOut
    );
    await updateDoc(productRef, finalUpdatePayload);
  };

  const handleQuickRowImageUpload = async (
    prod: Product,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canEdit) return;

    const validationError = validateCatalogImageFile(file);
    if (validationError) {
      setFeedback({ type: 'error', message: validationError });
      return;
    }

    setUploadingRowId(prod.id);
    setRowUploadProgress(0);
    setFeedback(null);

    let authSession: VerifiedWriteSession | null = null;
    let uploadedResult: { downloadUrl: string; storagePath: string } | null = null;
    let existingIssues: string[] = [];
    const preflightIssues: string[] = [];
    let operationLabel = 'UPDATE';

    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'products_edit',
      });

      const firestore = requireDb();
      const productRef = doc(firestore, 'products', prod.id);
      const existingSnap = await getDoc(productRef);
      const existingData = existingSnap.exists()
        ? (existingSnap.data() as Record<string, unknown>)
        : undefined;
      existingIssues = existingData ? inspectExistingProductIssues(existingData) : [];
      operationLabel = existingSnap.exists() ? 'UPDATE' : 'CREATE';

      if (!existingSnap.exists()) {
        authSession = await ensureVerifiedAdminWriteSession({
          hasPermission,
          requiredPermission: 'products_add',
        });
      }

      const uploaded = await uploadCatalogImageToStorage({
        folder: 'products',
        entityId: prod.id,
        file,
        onProgress: (pct) => setRowUploadProgress(pct),
      });
      if (!uploaded.downloadUrl || isForbiddenInlineImageUrl(uploaded.downloadUrl)) {
        throw new Error('ছবি সংরক্ষণ করা যাচ্ছে না। অনুগ্রহ করে পরে আবার চেষ্টা করুন।');
      }
      uploadedResult = {
        downloadUrl: uploaded.downloadUrl,
        storagePath: uploaded.storagePath,
      };

      const existingImages = sanitizeStoredImageUrls(
        Array.isArray(existingData?.images) ? existingData.images : prod.images
      );
      const nextImages = [
        uploadedResult.downloadUrl,
        ...existingImages.filter((u) => u !== uploadedResult!.downloadUrl),
      ].slice(0, 6);

      if (existingSnap.exists() && isExistingProductDocRuleReady(existingData)) {
        const fastUpdatePayload = {
          image: uploadedResult.downloadUrl,
          imageUrl: uploadedResult.downloadUrl,
          images: nextImages,
          updatedAt: serverTimestamp(),
        };
        assertValidProductWritePreflight(
          {
            docId: productRef.id,
            payload: fastUpdatePayload,
            existingData,
            isCreate: false,
          },
          preflightIssues
        );
        await updateDoc(productRef, fastUpdatePayload);
      } else {
        const mergedSource: Product = {
          ...prod,
          ...(existingData ? (existingData as Partial<Product>) : {}),
          id: prod.id,
          image: uploadedResult.downloadUrl,
          imageUrl: uploadedResult.downloadUrl,
          images: nextImages,
        };
        const ingList = Array.isArray(mergedSource.ingredients) ? mergedSource.ingredients : [];
        const szList = Array.isArray(mergedSource.sizes) ? mergedSource.sizes : [];

        if (!existingSnap.exists()) {
          const fullPayload = buildNormalizedProductPayload({
            source: mergedSource,
            ingredientsList: ingList,
            sizesList: szList,
            cleanImages: nextImages,
            forFullSet: true,
          });
          const createPayload = {
            ...fullPayload,
            createdAt: serverTimestamp(),
          };
          assertValidProductWritePreflight(
            {
              docId: productRef.id,
              payload: createPayload,
              isCreate: true,
            },
            preflightIssues
          );
          await setDoc(productRef, createPayload);
        } else {
          await writeExistingProductWithCleanup({
            productRef,
            existingData,
            source: mergedSource,
            ingredientsList: ingList,
            sizesList: szList,
            cleanImages: nextImages,
            preflightIssuesOut: preflightIssues,
          });
        }
      }

      uploadedResult = null; // Persisted in Firestore; do not roll back

      try {
        await logAdminActivity(
          'image_upload',
          'products',
          prod.id,
          prod.nameEn || prod.name,
          `Uploaded product photo for ${prod.nameBn || prod.name}`
        );
      } catch {
        // Non-blocking audit log
      }
      setFeedback({
        type: 'success',
        message: `"${prod.nameBn || prod.name}"-এর ছবি সফলভাবে সংরক্ষণ হয়েছে।`,
      });
    } catch (err) {
      if (uploadedResult) {
        try {
          await deleteCatalogImageFromStorage({
            storagePath: uploadedResult.storagePath,
            downloadUrl: uploadedResult.downloadUrl,
          });
        } catch {
          // Best-effort cleanup of uncommitted R2 image
        }
      }
      setFeedback({
        type: 'error',
        message: mapCatalogSaveError(err, 'quick_image_save', {
          path: `products/${prod.id}`,
          operation: operationLabel,
          staffRole,
          existingIssues,
          preflightIssues,
          authSession,
        }),
      });
      if (import.meta.env.DEV) {
        try {
          handleFirestoreError(err, OperationType.WRITE, `products/${prod.id}`);
        } catch {
          // Logged for console diagnostics
        }
      }
    } finally {
      setUploadingRowId(null);
      setRowUploadProgress(null);
    }
  };

  const handleMasterImportClick = async () => {
    setFeedback(null);
    let authSession: VerifiedWriteSession | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'products_add',
      });
      const summary = await importProductMasterList();
      setFeedback({
        type: 'success',
        message: `মাস্টার তালিকা সিঙ্ক সম্পন্ন: মোট ${summary.totalMasterCount}টি, নতুন যোগ ${summary.newlyAddedCount}টি, স্কিপ (বিদ্যমান) ${summary.skippedExistingCount}টি।`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: mapCatalogSaveError(err, 'master_import', {
          path: 'products/master_import',
          operation: 'WRITE',
          staffRole,
          authSession,
        }),
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || saving) return;

    // 1. Product data validation BEFORE any R2 upload or Firestore write
    const nameBn = editing.name.trim();
    const nameEn = editing.nameEn.trim();
    if (!nameBn) {
      setFeedback({ type: 'error', message: 'অনুগ্রহ করে পণ্যটির বাংলা নাম লিখুন।' });
      return;
    }
    if (!nameEn) {
      setFeedback({ type: 'error', message: 'অনুগ্রহ করে পণ্যটির English Name লিখুন।' });
      return;
    }
    const rawPrice = Number(editing.price);
    if (!Number.isFinite(rawPrice) || rawPrice < 0 || rawPrice > 1000000) {
      setFeedback({
        type: 'error',
        message: 'অনুগ্রহ করে ০ থেকে ১০,০০,০০০-এর মধ্যে বৈধ মূল্য (BDT) লিখুন।',
      });
      return;
    }
    if (
      editing.old_price !== undefined &&
      (!Number.isFinite(Number(editing.old_price)) ||
        Number(editing.old_price) < 0 ||
        Number(editing.old_price) > 1000000)
    ) {
      setFeedback({
        type: 'error',
        message: 'Old Price অবশ্যই ০ থেকে ১০,০০,০০০-এর মধ্যে হতে হবে।',
      });
      return;
    }

    const pendingSlots = editorImageSlots.filter(
      (s): s is Extract<EditorImageSlot, { kind: 'pending' }> => s.kind === 'pending'
    );
    const hasLegacyInlineExistingOnly =
      pendingSlots.length === 0 &&
      editorImageSlots.some(
        (s) => s.kind === 'existing' && isForbiddenInlineImageUrl(s.url)
      );
    if (hasLegacyInlineExistingOnly) {
      setFeedback({
        type: 'error',
        message:
          'এই পণ্যটিতে পুরোনো ইনলাইন (base64) ছবি রয়েছে। অনুগ্রহ করে ছবিটি সরিয়ে নতুন JPG/PNG/WEBP ছবি নির্বাচন করুন অথবা ছবিটি তালিকা থেকে রিমুভ করে সংরক্ষণ করুন।',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    setEditorUploadError(null);

    let authSession: VerifiedWriteSession | null = null;
    let existingIssues: string[] = [];
    const preflightIssues: string[] = [];
    let operationLabel = isNew ? 'CREATE' : 'UPDATE';
    const uploadedR2Results: Array<{ slotId: string; downloadUrl: string; storagePath: string }> = [];

    try {
      // 2. Firebase Auth + Admin authorization verification
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: isNew ? 'products_add' : 'products_edit',
      });

      const firestore = requireDb();
      const productRef = doc(firestore, 'products', editing.id);
      const existingSnap = await getDoc(productRef);
      const existingData = existingSnap.exists()
        ? (existingSnap.data() as Record<string, unknown>)
        : undefined;
      existingIssues = existingData ? inspectExistingProductIssues(existingData) : [];
      operationLabel = existingSnap.exists() ? 'UPDATE' : 'CREATE';

      if (!existingSnap.exists()) {
        authSession = await ensureVerifiedAdminWriteSession({
          hasPermission,
          requiredPermission: 'products_add',
        });
      }

      // 3. R2 image upload (ONLY if new pending image(s) were selected)
      if (pendingSlots.length > 0) {
        for (let i = 0; i < pendingSlots.length; i += 1) {
          const slot = pendingSlots[i];
          setEditorUploadPreviewUrl(slot.previewUrl);
          setEditorUploadLabel(
            pendingSlots.length > 1
              ? `${slot.file.name} (${i + 1}/${pendingSlots.length})`
              : slot.file.name
          );
          setEditorUploadProgress(0);

          const res = await uploadCatalogImageToStorage({
            folder: 'products',
            entityId: editing.id,
            file: slot.file,
            onProgress: (pct) => setEditorUploadProgress(pct),
          });
          if (!res.downloadUrl || isForbiddenInlineImageUrl(res.downloadUrl)) {
            throw new Error('ছবি সংরক্ষণ করা যাচ্ছে না। অনুগ্রহ করে পরে আবার চেষ্টা করুন।');
          }
          uploadedR2Results.push({
            slotId: slot.id,
            downloadUrl: res.downloadUrl,
            storagePath: res.storagePath,
          });
        }
      }

      // 4. Build final image list (preserve existing URLs unchanged when no new image is given)
      const uploadedUrlBySlot = new Map(
        uploadedR2Results.map((item) => [item.slotId, item.downloadUrl])
      );
      const rawOrderedUrls: string[] = [];
      for (const slot of editorImageSlots) {
        if (slot.kind === 'pending') {
          const uploadedUrl = uploadedUrlBySlot.get(slot.id);
          if (uploadedUrl) rawOrderedUrls.push(uploadedUrl);
        } else if (!isForbiddenInlineImageUrl(slot.url)) {
          rawOrderedUrls.push(slot.url);
        }
      }
      const nextImages = sanitizeStoredImageUrls(rawOrderedUrls);
      const primaryImage = nextImages[0] ?? '';

      // 5. Firestore Product create/update
      // Safe image-only fast update ONLY when existing Firestore doc already satisfies complete schema
      if (
        !isNew &&
        existingSnap.exists() &&
        originalSnapshot &&
        serializeNonImageState(editing, ingredientsText, sizesText) === originalSnapshot &&
        isExistingProductDocRuleReady(existingData)
      ) {
        const fastUpdatePayload = {
          image: primaryImage,
          imageUrl: primaryImage,
          images: nextImages,
          updatedAt: serverTimestamp(),
        };
        assertValidProductWritePreflight(
          {
            docId: productRef.id,
            payload: fastUpdatePayload,
            existingData,
            isCreate: false,
          },
          preflightIssues
        );
        await updateDoc(productRef, fastUpdatePayload);
      } else {
        const ingredients = ingredientsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const sizes = sizesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

        if (!existingSnap.exists()) {
          const payload = buildNormalizedProductPayload({
            source: {
              ...editing,
              image: primaryImage,
              imageUrl: primaryImage,
              images: nextImages,
            },
            ingredientsList: ingredients,
            sizesList: sizes,
            cleanImages: nextImages,
            forFullSet: true,
          });
          const createPayload = {
            ...payload,
            createdAt: serverTimestamp(),
          };
          assertValidProductWritePreflight(
            {
              docId: productRef.id,
              payload: createPayload,
              isCreate: true,
            },
            preflightIssues
          );
          await setDoc(productRef, createPayload);
        } else {
          await writeExistingProductWithCleanup({
            productRef,
            existingData,
            source: {
              ...editing,
              image: primaryImage,
              imageUrl: primaryImage,
              images: nextImages,
            },
            ingredientsList: ingredients,
            sizesList: sizes,
            cleanImages: nextImages,
            preflightIssuesOut: preflightIssues,
          });
        }
      }

      // Commit succeeded in Firestore; do NOT roll back uploaded R2 images
      const committedOperation = !existingSnap.exists() ? 'create' : 'update';
      uploadedR2Results.length = 0;

      try {
        await logAdminActivity(
          committedOperation,
          'products',
          editing.id,
          nameEn,
          `${committedOperation === 'create' ? 'Created' : 'Updated'} product ${nameBn}`
        );
      } catch {
        // Non-blocking audit log
      }

      // 6. Save Success only after real Firestore write completes
      closeEditor();
      setFeedback({ type: 'success', message: 'পণ্য সফলভাবে সংরক্ষণ হয়েছে।' });
    } catch (err) {
      // Clean up any newly uploaded R2 objects from this failed save attempt
      if (uploadedR2Results.length > 0) {
        await Promise.allSettled(
          uploadedR2Results.map((item) =>
            deleteCatalogImageFromStorage({
              storagePath: item.storagePath,
              downloadUrl: item.downloadUrl,
            })
          )
        );
      }

      setFeedback({
        type: 'error',
        message: mapCatalogSaveError(err, 'product_save', {
          path: `products/${editing.id}`,
          operation: operationLabel,
          staffRole,
          existingIssues,
          preflightIssues,
          authSession,
        }),
      });
      if (import.meta.env.DEV) {
        try {
          handleFirestoreError(err, OperationType.WRITE, `products/${editing.id}`);
        } catch {
          // Logged for console diagnostics
        }
      }
    } finally {
      setEditorUploadProgress(null);
      setEditorUploadLabel('');
      setEditorUploadPreviewUrl(null);
      setSaving(false);
    }
  };

  const toggleVisibility = async (prod: Product) => {
    let authSession: VerifiedWriteSession | null = null;
    let existingIssues: string[] = [];
    const preflightIssues: string[] = [];
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'products_edit',
      });
      const firestore = requireDb();
      const productRef = doc(firestore, 'products', prod.id);
      const existingSnap = await getDoc(productRef);
      const existingData = existingSnap.exists()
        ? (existingSnap.data() as Record<string, unknown>)
        : undefined;
      existingIssues = existingData ? inspectExistingProductIssues(existingData) : [];
      const nextVis = prod.visible === false;
      if (existingSnap.exists() && isExistingProductDocRuleReady(existingData)) {
        await updateDoc(productRef, {
          visible: nextVis,
          status: nextVis ? 'published' : 'draft',
          updatedAt: serverTimestamp(),
        });
      } else {
        const cleanImages = sanitizeStoredImageUrls(
          Array.isArray(prod.images) && prod.images.length > 0
            ? prod.images
            : prod.image
            ? [prod.image]
            : []
        );
        const ingList = Array.isArray(prod.ingredients) ? prod.ingredients : [];
        const szList = Array.isArray(prod.sizes) ? prod.sizes : [];
        if (!existingSnap.exists()) {
          const payload = buildNormalizedProductPayload({
            source: { ...prod, visible: nextVis },
            ingredientsList: ingList,
            sizesList: szList,
            cleanImages,
            forFullSet: true,
          });
          const createPayload = { ...payload, createdAt: serverTimestamp() };
          assertValidProductWritePreflight(
            { docId: productRef.id, payload: createPayload, isCreate: true },
            preflightIssues
          );
          await setDoc(productRef, createPayload);
        } else {
          await writeExistingProductWithCleanup({
            productRef,
            existingData,
            source: { ...prod, visible: nextVis },
            ingredientsList: ingList,
            sizesList: szList,
            cleanImages,
            preflightIssuesOut: preflightIssues,
          });
        }
      }
      await logAdminActivity(
        nextVis ? 'show' : 'hide',
        'products',
        prod.id,
        prod.nameEn || prod.name
      );
    } catch (err) {
      setFeedback({
        type: 'error',
        message: mapCatalogSaveError(err, 'product_visibility', {
          path: `products/${prod.id}`,
          operation: 'UPDATE',
          staffRole,
          existingIssues,
          preflightIssues,
          authSession,
        }),
      });
    }
  };

  const toggleArchive = async (prod: Product) => {
    let authSession: VerifiedWriteSession | null = null;
    let existingIssues: string[] = [];
    const preflightIssues: string[] = [];
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'products_edit',
      });
      const firestore = requireDb();
      const productRef = doc(firestore, 'products', prod.id);
      const existingSnap = await getDoc(productRef);
      const existingData = existingSnap.exists()
        ? (existingSnap.data() as Record<string, unknown>)
        : undefined;
      existingIssues = existingData ? inspectExistingProductIssues(existingData) : [];
      const nextDeleted = !prod.deleted;
      if (existingSnap.exists() && isExistingProductDocRuleReady(existingData)) {
        await updateDoc(productRef, {
          deleted: nextDeleted,
          status: nextDeleted ? 'archived' : 'published',
          updatedAt: serverTimestamp(),
        });
      } else {
        const cleanImages = sanitizeStoredImageUrls(
          Array.isArray(prod.images) && prod.images.length > 0
            ? prod.images
            : prod.image
            ? [prod.image]
            : []
        );
        const ingList = Array.isArray(prod.ingredients) ? prod.ingredients : [];
        const szList = Array.isArray(prod.sizes) ? prod.sizes : [];
        if (!existingSnap.exists()) {
          const payload = buildNormalizedProductPayload({
            source: { ...prod, deleted: nextDeleted },
            ingredientsList: ingList,
            sizesList: szList,
            cleanImages,
            forFullSet: true,
          });
          const createPayload = { ...payload, createdAt: serverTimestamp() };
          assertValidProductWritePreflight(
            { docId: productRef.id, payload: createPayload, isCreate: true },
            preflightIssues
          );
          await setDoc(productRef, createPayload);
        } else {
          await writeExistingProductWithCleanup({
            productRef,
            existingData,
            source: { ...prod, deleted: nextDeleted },
            ingredientsList: ingList,
            sizesList: szList,
            cleanImages,
            preflightIssuesOut: preflightIssues,
          });
        }
      }
      await logAdminActivity(
        nextDeleted ? 'archive' : 'restore',
        'products',
        prod.id,
        prod.nameEn || prod.name
      );
      setFeedback({
        type: 'success',
        message: nextDeleted ? 'পণ্যটি আর্কাইভ করা হয়েছে।' : 'পণ্যটি পুনরুদ্ধার করা হয়েছে।',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: mapCatalogSaveError(err, 'product_archive', {
          path: `products/${prod.id}`,
          operation: 'UPDATE',
          staffRole,
          existingIssues,
          preflightIssues,
          authSession,
        }),
      });
    }
  };

  const confirmPermanentDelete = async () => {
    if (!pendingDeleteProduct) return;
    const target = pendingDeleteProduct;
    setDeletingProduct(true);
    let authSession: VerifiedWriteSession | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'products_delete',
      });
      const firestore = requireDb();
      await deleteDoc(doc(firestore, 'products', target.id));
      await logAdminActivity('delete', 'products', target.id, target.nameEn || target.name);
      if (editing?.id === target.id) {
        closeEditor();
      }
      setPendingDeleteProduct(null);
      setFeedback({ type: 'success', message: 'পণ্যটি স্থায়ীভাবে ডিলিট করা হয়েছে।' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: mapCatalogSaveError(err, 'product_delete', {
          path: `products/${target.id}`,
          operation: 'DELETE',
          staffRole,
          authSession,
        }),
      });
      try {
        handleFirestoreError(err, OperationType.DELETE, `products/${target.id}`);
      } catch {
        // Logged
      }
    } finally {
      setDeletingProduct(false);
    }
  };

  const toggleFeatured = async (prod: Product) => {
    let authSession: VerifiedWriteSession | null = null;
    let existingIssues: string[] = [];
    const preflightIssues: string[] = [];
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'products_edit',
      });
      const firestore = requireDb();
      const productRef = doc(firestore, 'products', prod.id);
      const existingSnap = await getDoc(productRef);
      const existingData = existingSnap.exists()
        ? (existingSnap.data() as Record<string, unknown>)
        : undefined;
      existingIssues = existingData ? inspectExistingProductIssues(existingData) : [];
      const nextFeatured = !prod.featured;
      if (existingSnap.exists() && isExistingProductDocRuleReady(existingData)) {
        await updateDoc(productRef, {
          featured: nextFeatured,
          updatedAt: serverTimestamp(),
        });
      } else {
        const cleanImages = sanitizeStoredImageUrls(
          Array.isArray(prod.images) && prod.images.length > 0
            ? prod.images
            : prod.image
            ? [prod.image]
            : []
        );
        const ingList = Array.isArray(prod.ingredients) ? prod.ingredients : [];
        const szList = Array.isArray(prod.sizes) ? prod.sizes : [];
        if (!existingSnap.exists()) {
          const payload = buildNormalizedProductPayload({
            source: { ...prod, featured: nextFeatured },
            ingredientsList: ingList,
            sizesList: szList,
            cleanImages,
            forFullSet: true,
          });
          const createPayload = { ...payload, createdAt: serverTimestamp() };
          assertValidProductWritePreflight(
            { docId: productRef.id, payload: createPayload, isCreate: true },
            preflightIssues
          );
          await setDoc(productRef, createPayload);
        } else {
          await writeExistingProductWithCleanup({
            productRef,
            existingData,
            source: { ...prod, featured: nextFeatured },
            ingredientsList: ingList,
            sizesList: szList,
            cleanImages,
            preflightIssuesOut: preflightIssues,
          });
        }
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: mapCatalogSaveError(err, 'product_featured', {
          path: `products/${prod.id}`,
          operation: 'UPDATE',
          staffRole,
          existingIssues,
          preflightIssues,
          authSession,
        }),
      });
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allProducts.filter((p) => {
      if (filterMode === 'active' && (p.deleted || p.visible === false)) return false;
      if (filterMode === 'hidden' && (p.deleted || p.visible !== false)) return false;
      if (filterMode === 'archived' && !p.deleted) return false;
      if (selectedCategoryFilter !== 'all' && p.category !== selectedCategoryFilter) return false;
      const hasImage = Boolean(p.image || (Array.isArray(p.images) && p.images.length > 0));
      if (missingImageOnly && hasImage) return false;

      if (!q) return true;
      const t = getProductText(p, allCategories);
      return (
        t.nameBn.toLowerCase().includes(q) ||
        t.nameEn.toLowerCase().includes(q) ||
        t.categoryNameBn.toLowerCase().includes(q) ||
        t.categoryNameEn.toLowerCase().includes(q) ||
        t.unit.toLowerCase().includes(q)
      );
    });
  }, [allProducts, allCategories, filterMode, selectedCategoryFilter, missingImageOnly, search]);

  const PAGE_SIZE = 40;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Product Management
          </h2>
          <p className="text-xs text-[#57534E]">
            মোট {allProducts.length}টি পণ্য · সরাসরি ছবি আপলোড, বাংলা ও English নাম, একক এবং মূল্য ব্যবস্থাপনা করুন।
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={() => openEditor(null)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#DC1F26]"
          >
            <Plus className="h-4 w-4" />
            <span>নতুন পণ্য যোগ করুন</span>
          </button>
        )}
      </div>

      {/* Authoritative Product Master List Sync Banner */}
      {canAdd && (
        <div className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[#1C1917]">
                <Database className="h-4 w-4 text-[#DC1F26]" />
                <span>Product Master List Status (১৩৬টি পণ্য)</span>
              </div>
              <p className="text-xs text-[#57534E]">
                সিঙ্কড:{' '}
                <strong className="font-mono text-[#1C1917]">
                  {masterImportStats.syncedCount}/{masterImportStats.totalMaster}
                </strong>{' '}
                · অনুপস্থিত:{' '}
                <strong className="font-mono text-[#DC1F26]">
                  {masterImportStats.missingCount}
                </strong>{' '}
                · ছবি ছাড়া পণ্য:{' '}
                <strong className="font-mono text-amber-700">
                  {masterImportStats.missingImageCount}
                </strong>
              </p>
              {lastMasterImportSummary && (
                <p className="text-[11px] font-medium text-emerald-700">
                  সর্বশেষ সিঙ্ক: মোট {lastMasterImportSummary.totalMasterCount} · পূর্বে ছিল{' '}
                  {lastMasterImportSummary.existingProductCount} · নতুন যোগ{' '}
                  {lastMasterImportSummary.newlyAddedCount} · স্কিপ{' '}
                  {lastMasterImportSummary.skippedExistingCount}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleMasterImportClick}
              disabled={masterImportRunning}
              className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-[#1C1917] bg-white px-3.5 py-2 text-xs font-semibold text-[#1C1917] transition-colors hover:bg-[#1C1917] hover:text-white disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${masterImportRunning ? 'animate-spin' : ''}`}
              />
              <span>
                {masterImportRunning
                  ? 'ইমপোর্ট হচ্ছে...'
                  : masterImportStats.missingCount > 0
                  ? `মাস্টার তালিকা ইমপোর্ট করুন (${masterImportStats.missingCount}টি বাকি)`
                  : 'মাস্টার তালিকা পুনরায় যাচাই করুন'}
              </span>
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-4 py-2.5 text-xs font-medium ${
            feedback.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {editing && (
        <form
          noValidate
          onSubmit={handleSave}
          className="rounded-2xl border border-[#D6D3D1] bg-white p-5 sm:p-6"
        >
          <div className="mb-4 flex items-center justify-between border-b border-[#F5F4F0] pb-3">
            <h3 className="font-display text-xl font-bold text-[#1C1917]">
              {isNew ? 'নতুন পণ্য যোগ করুন' : `সম্পাদনা: ${editing.name}`}
            </h3>
            <button
              type="button"
              onClick={closeEditor}
              className="cursor-pointer rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F4F0]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!isNew && (
            <div className="mb-5 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#78716C]">
                Product Information
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <span className="block text-[10px] text-[#78716C]">বাংলা নাম</span>
                  <span className="font-semibold text-[#1C1917]">{editing.name}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#78716C]">English Name</span>
                  <span className="font-semibold text-[#1C1917]">{editing.nameEn}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#78716C]">Category</span>
                  <span className="font-semibold text-[#1C1917]">{editing.categoryName}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#78716C]">Unit</span>
                  <span className="font-semibold text-[#1C1917]">
                    {editing.unit || editing.priceUnit}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#78716C]">Price</span>
                  <span className="font-mono font-bold text-[#1C1917]">
                    ৳{Number(editing.price) || 0}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#78716C]">Image Status</span>
                  <span
                    className={`font-semibold ${
                      editorImageSlots.length > 0 ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {editorImageSlots.length > 0
                      ? `${editorImageSlots.length}টি ছবি যুক্ত`
                      : 'ছবি আপলোড বাকি'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Product Name (বাংলা) *
              </label>
              <input
                type="text"
                value={editing.name}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    name: e.target.value,
                    nameBn: e.target.value,
                    name_bn: e.target.value,
                  })
                }
                placeholder="যেমন: চকলেট কেক"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Product Name (English) *
              </label>
              <input
                type="text"
                value={editing.nameEn}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    nameEn: e.target.value,
                    name_en: e.target.value,
                  })
                }
                placeholder="e.g. Chocolate Cake"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Category *
              </label>
              <select
                value={editing.category}
                onChange={(e) => {
                  const nextCat = allCategories.find((c) => c.slug === e.target.value);
                  const ct = nextCat ? getCategoryText(nextCat) : null;
                  setEditing({
                    ...editing,
                    category: e.target.value,
                    categoryName: ct?.nameBn || editing.categoryName,
                    categoryNameEn: ct?.nameEn || editing.categoryNameEn,
                  });
                }}
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              >
                {allCategories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name} ({c.nameEn})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                মূল্য (৳ BDT) *
              </label>
              <input
                type="number"
                required
                min={0}
                value={editing.price}
                onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Old Price (Optional ৳)
              </label>
              <input
                type="number"
                min={0}
                value={editing.old_price ?? ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    old_price: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="পূর্বের দাম"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Discount / Price Label
              </label>
              <input
                type="text"
                value={editing.discount ?? ''}
                onChange={(e) => setEditing({ ...editing, discount: e.target.value })}
                placeholder="যেমন: 10% OFF বা Festive Offer"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                একক / Unit (যেমন: Piece, Kg, Box)
              </label>
              <input
                type="text"
                value={editing.unit ?? editing.priceUnit}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    unit: e.target.value,
                    priceUnit: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Custom Price Label (Optional)
              </label>
              <input
                type="text"
                value={editing.price_label ?? ''}
                onChange={(e) => setEditing({ ...editing, price_label: e.target.value })}
                placeholder="যেমন: ৳১,২০০ থেকে শুরু"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Availability
              </label>
              <select
                value={editing.availability}
                onChange={(e) =>
                  setEditing({ ...editing, availability: e.target.value as ProductAvailability })
                }
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              >
                <option value="In Showroom">In Showroom</option>
                <option value="Pre-Order at Showroom">Pre-Order at Showroom</option>
                <option value="Seasonal">Seasonal</option>
                <option value="Out of Stock">Out of Stock</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Product Type
              </label>
              <input
                type="text"
                value={editing.productType}
                onChange={(e) => setEditing({ ...editing, productType: e.target.value })}
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                ওজন / Weight
              </label>
              <input
                type="text"
                value={editing.weight}
                onChange={(e) => setEditing({ ...editing, weight: e.target.value })}
                placeholder="যেমন: ১ কেজি"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Display Order &amp; URL Slug
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  value={editing.display_order ?? 1}
                  onChange={(e) =>
                    setEditing({ ...editing, display_order: Number(e.target.value) })
                  }
                  className="w-20 rounded-lg border border-[#D6D3D1] px-2 py-2 font-mono text-xs"
                />
                <input
                  type="text"
                  value={editing.slug}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                  placeholder="auto-slug"
                  className="flex-1 rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Short Description (বাংলা)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={editing.shortDescription}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      shortDescription: e.target.value,
                      short_description_bn: e.target.value,
                    })
                  }
                  placeholder="বাংলা সংক্ষিপ্ত বিবরণ"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Short Description (English)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={editing.shortDescriptionEn ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      shortDescriptionEn: e.target.value,
                      short_description_en: e.target.value,
                    })
                  }
                  placeholder="English short summary"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Full Description (বাংলা)
                </label>
                <textarea
                  rows={3}
                  value={editing.description}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      description: e.target.value,
                      description_bn: e.target.value,
                    })
                  }
                  placeholder="বাংলা বিস্তারিত বিবরণ"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Full Description (English)
                </label>
                <textarea
                  rows={3}
                  value={editing.descriptionEn ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      descriptionEn: e.target.value,
                      description_en: e.target.value,
                    })
                  }
                  placeholder="Full description in English"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                উপাদান (কমা দিয়ে আলাদা করুন)
              </label>
              <input
                type="text"
                value={ingredientsText}
                onChange={(e) => setIngredientsText(e.target.value)}
                placeholder="দুধ, ছানা, জাফরান, পেস্তা"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                সাইজ / ভ্যারিয়েন্ট (কমা দিয়ে আলাদা করুন)
              </label>
              <input
                type="text"
                value={sizesText}
                onChange={(e) => setSizesText(e.target.value)}
                placeholder="500g Box, 1kg Box"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                গুরুত্বপূর্ণ নোট (Important Notes)
              </label>
              <input
                type="text"
                value={editing.importantNotes}
                onChange={(e) =>
                  setEditing({ ...editing, importantNotes: e.target.value })
                }
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            {/* Occasions Checkboxes */}
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="mb-1.5 text-xs font-semibold text-[#1C1917]">উপলক্ষ নির্বাচন করুন</p>
              <div className="flex flex-wrap gap-2">
                {allOccasions.map((occ) => {
                  const checked = editing.occasions.includes(occ.slug);
                  return (
                    <button
                      key={occ.id}
                      type="button"
                      onClick={() =>
                        setEditing({
                          ...editing,
                          occasions: checked
                            ? editing.occasions.filter((o) => o !== occ.slug)
                            : [...editing.occasions, occ.slug],
                        })
                      }
                      className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1 text-xs ${
                        checked
                          ? 'border-[#1C1917] bg-[#1C1917] text-white'
                          : 'border-[#E7E5E4] bg-[#FAFAF8] text-[#44403C]'
                      }`}
                    >
                      <span>{occ.icon}</span>
                      <span>{occ.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Product Images */}
            <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[#1C1917]">পণ্যের ছবি (Cloudflare R2)</p>
                  <p className="text-[11px] text-[#57534E]">
                    JPG, JPEG, PNG বা WEBP ফরম্যাট · সর্বোচ্চ ৫ এমবি (সর্বোচ্চ ৬টি ছবি)। সংরক্ষণ বাটনে চাপ দিলে ছবি Cloudflare R2-তে আপলোড হয়ে ডাটাবেসে সেভ হবে।
                  </p>
                </div>
                <span className="font-mono text-[11px] font-semibold text-[#57534E]">
                  {editorImageSlots.length}/6 ছবি
                </span>
              </div>

              {editorUploadError && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{editorUploadError}</span>
                </div>
              )}

              {editorUploadProgress !== null && (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-[#E7E5E4] bg-white p-3">
                  {editorUploadPreviewUrl && (
                    <img
                      src={editorUploadPreviewUrl}
                      alt="Uploading preview"
                      className="h-12 w-16 shrink-0 rounded-md border border-[#E7E5E4] object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#1C1917]">
                      <span className="inline-flex items-center gap-1.5 truncate">
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#DC1F26]" />
                        <span className="truncate">
                          {editorUploadProgress === 0
                            ? `প্রস্তুত হচ্ছে: ${editorUploadLabel}`
                            : `R2-তে আপলোড হচ্ছে: ${editorUploadLabel}`}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums text-[#DC1F26]">
                        {editorUploadProgress}%
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F5F4F0]">
                      <div
                        className="h-full bg-[#DC1F26] transition-all duration-150"
                        style={{ width: `${editorUploadProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {editorImageSlots.map((slot, i) => {
                  const previewSrc =
                    slot.kind === 'pending' ? slot.previewUrl : resolveAssetUrl(slot.url);
                  const isLegacyInline =
                    slot.kind === 'existing' && isForbiddenInlineImageUrl(slot.url);
                  return (
                    <div
                      key={slot.id}
                      className={`group relative flex flex-col overflow-hidden rounded-lg border bg-white ${
                        isLegacyInline
                          ? 'border-amber-500'
                          : i === 0
                          ? 'border-[#DC1F26]'
                          : 'border-[#D6D3D1]'
                      }`}
                    >
                      <div className="relative aspect-[4/3] w-full bg-[#F5F4F0]">
                        <img
                          src={previewSrc}
                          alt={`Product preview ${i + 1}`}
                          className="h-full w-full object-cover"
                        />
                        {i === 0 && (
                          <span className="absolute left-1.5 top-1.5 rounded bg-[#1C1917]/85 px-1.5 py-0.5 text-[9px] font-bold text-[#FACC15]">
                            প্রধান ছবি
                          </span>
                        )}
                        {slot.kind === 'pending' && (
                          <span className="absolute inset-x-1.5 bottom-1.5 rounded bg-[#DC1F26]/90 px-1.5 py-0.5 text-center text-[9px] font-bold text-white">
                            সেভ করলে আপলোড হবে
                          </span>
                        )}
                        {isLegacyInline && (
                          <span className="absolute inset-x-1.5 bottom-1.5 rounded bg-amber-600/95 px-1.5 py-0.5 text-center text-[9px] font-bold text-white">
                            পুরোনো ইনলাইন ছবি — বদলান
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={saving}
                          title="তালিকা থেকে সরান"
                          onClick={() => {
                            if (slot.kind === 'pending') {
                              URL.revokeObjectURL(slot.previewUrl);
                              pendingPreviewUrlsRef.current.delete(slot.previewUrl);
                            }
                            const nextSlots = editorImageSlots.filter((_, idx) => idx !== i);
                            setEditorImageSlots(nextSlots);
                            const keptUrls = nextSlots
                              .filter(
                                (s): s is Extract<EditorImageSlot, { kind: 'existing' }> =>
                                  s.kind === 'existing'
                              )
                              .map((s) => s.url);
                            setEditing({
                              ...editing,
                              image: keptUrls[0] ?? '',
                              images: keptUrls,
                            });
                          }}
                          className="absolute right-1.5 top-1.5 cursor-pointer rounded-full bg-black/75 p-1 text-white transition-colors hover:bg-[#DC1F26] disabled:opacity-40"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      {i > 0 && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            const reordered = [
                              slot,
                              ...editorImageSlots.filter((_, idx) => idx !== i),
                            ];
                            setEditorImageSlots(reordered);
                            const keptUrls = reordered
                              .filter(
                                (s): s is Extract<EditorImageSlot, { kind: 'existing' }> =>
                                  s.kind === 'existing'
                              )
                              .map((s) => s.url);
                            setEditing({
                              ...editing,
                              image: keptUrls[0] ?? '',
                              images: keptUrls,
                            });
                          }}
                          className="cursor-pointer border-t border-[#F5F4F0] bg-white px-2 py-1 text-[10px] font-semibold text-[#57534E] hover:bg-[#FAFAF8] hover:text-[#DC1F26] disabled:opacity-40"
                        >
                          প্রধান করুন
                        </button>
                      )}
                    </div>
                  );
                })}

                {editorImageSlots.length < 6 && (
                  <label
                    onDragOver={(ev) => {
                      ev.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(ev) => {
                      ev.preventDefault();
                      setDragActive(false);
                      if (saving) return;
                      const dropped = ev.dataTransfer.files
                        ? Array.from(ev.dataTransfer.files)
                        : [];
                      queueProductImageFiles(dropped);
                    }}
                    className={`flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 text-center text-[11px] font-semibold transition-colors ${
                      dragActive
                        ? 'border-[#DC1F26] bg-red-50/50 text-[#DC1F26]'
                        : 'border-[#D6D3D1] bg-white text-[#57534E] hover:border-[#DC1F26] hover:text-[#1C1917]'
                    }`}
                  >
                    {editorUploadProgress !== null ? (
                      <Loader2 className="h-5 w-5 animate-spin text-[#DC1F26]" />
                    ) : (
                      <ImagePlus className="h-5 w-5 text-[#DC1F26]" />
                    )}
                    <span>
                      {editorUploadProgress !== null ? 'আপলোড হচ্ছে...' : 'ছবি যোগ / টেনে আনুন'}
                    </span>
                    <input
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      disabled={saving || editorUploadProgress !== null}
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Flags */}
            <div className="flex flex-wrap items-center gap-6 sm:col-span-2 lg:col-span-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#1C1917]">
                <input
                  type="checkbox"
                  checked={editing.featured}
                  onChange={(e) => setEditing({ ...editing, featured: e.target.checked })}
                />
                <span>Featured Product</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#1C1917]">
                <input
                  type="checkbox"
                  checked={editing.popular}
                  onChange={(e) => setEditing({ ...editing, popular: e.target.checked })}
                />
                <span>Popular Product</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#1C1917]">
                <input
                  type="checkbox"
                  checked={editing.visible !== false}
                  onChange={(e) => setEditing({ ...editing, visible: e.target.checked })}
                />
                <span>Visible on Storefront</span>
              </label>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3 border-t border-[#F5F4F0] pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={closeEditor}
              className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#44403C] disabled:opacity-50"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={saving}
              className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
            >
              {saving ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
            </button>
          </div>
        </form>
      )}

      {/* Search & Filter */}
      <div className="rounded-xl border border-[#E7E5E4] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7E5E4] p-4">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="পণ্য খুঁজুন (বাংলা বা English)..."
              className="w-full max-w-xs rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs focus:border-[#DC1F26] focus:outline-none"
            />
            <select
              value={selectedCategoryFilter}
              onChange={(e) => {
                setSelectedCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs text-[#1C1917] focus:border-[#DC1F26] focus:outline-none"
            >
              <option value="all">সকল ক্যাটাগরি</option>
              {allCategories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setMissingImageOnly((v) => !v);
                setPage(1);
              }}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                missingImageOnly
                  ? 'border-amber-600 bg-amber-50 text-amber-800'
                  : 'border-[#D6D3D1] bg-[#FAFAF8] text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              <ImageOff className="h-3.5 w-3.5" />
              <span>ছবি নেই ({masterImportStats.missingImageCount})</span>
            </button>
          </div>
          <div className="flex gap-1.5 text-xs">
            {(['active', 'hidden', 'archived', 'all'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setFilterMode(mode);
                  setPage(1);
                }}
                className={`cursor-pointer rounded-md px-3 py-1.5 font-semibold capitalize ${
                  filterMode === mode
                    ? 'bg-[#1C1917] text-white'
                    : 'bg-[#F5F4F0] text-[#57534E] hover:text-[#1C1917]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E7E5E4] bg-[#FAFAF8] text-[#57534E]">
              <tr>
                <th className="px-4 py-3 font-semibold">পণ্য ও ছবি</th>
                <th className="px-4 py-3 font-semibold">ক্যাটাগরি</th>
                <th className="px-4 py-3 font-semibold">একক</th>
                <th className="px-4 py-3 font-semibold">মূল্য</th>
                <th className="px-4 py-3 font-semibold">দৃশ্যমানতা</th>
                <th className="px-4 py-3 font-semibold">Featured</th>
                <th className="px-4 py-3 text-right font-semibold">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F4F0]">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#78716C]">
                    কোনো পণ্য পাওয়া যায়নি।
                  </td>
                </tr>
              ) : (
                paginated.map((p) => {
                  const thumbSrc = p.images?.[0] || p.image || '';
                  const pt = getProductText(p, allCategories);
                  return (
                    <tr key={p.id} className="hover:bg-[#FAFAF8]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {thumbSrc ? (
                            <img
                              src={resolveAssetUrl(thumbSrc)}
                              alt={pt.nameBn}
                              className="h-10 w-12 shrink-0 rounded-md border border-[#E7E5E4] object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-amber-400 bg-amber-50 text-amber-700">
                              <ImageOff className="h-4 w-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-[#1C1917]">{pt.nameBn}</p>
                            <p className="text-[11px] text-[#78716C]">{pt.nameEn}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#44403C]">
                        {p.categoryName || pt.categoryNameBn}
                      </td>
                      <td className="px-4 py-3 font-medium text-[#57534E]">
                        {pt.unit || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums font-semibold text-[#1C1917]">
                        {formatBdtPrice(p.price)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => canEdit && toggleVisibility(p)}
                          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold ${
                            canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
                          } ${
                            p.visible !== false
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-[#F5F4F0] text-[#78716C]'
                          }`}
                        >
                          {p.visible !== false ? (
                            <Eye className="h-3 w-3" />
                          ) : (
                            <EyeOff className="h-3 w-3" />
                          )}
                          <span>{p.visible !== false ? 'Visible' : 'Hidden'}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => canEdit && toggleFeatured(p)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
                            canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
                          } ${
                            p.featured
                              ? 'bg-[#FEF9C3] text-[#854D0E]'
                              : 'bg-[#F5F4F0] text-[#78716C]'
                          }`}
                        >
                          <Star className="h-3 w-3" />
                          <span>{p.featured ? 'Featured' : 'Standard'}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {canEdit && (
                            <>
                              <label
                                title="পণ্যের ছবি আপলোড করুন"
                                className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                                  thumbSrc
                                    ? 'border-[#E7E5E4] text-[#57534E] hover:border-[#1C1917] hover:text-[#1C1917]'
                                    : 'border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-500'
                                }`}
                              >
                                {uploadingRowId === p.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#DC1F26]" />
                                ) : (
                                  <Camera className="h-3.5 w-3.5" />
                                )}
                                <span className="hidden sm:inline">
                                  {uploadingRowId === p.id
                                    ? rowUploadProgress !== null
                                      ? `${rowUploadProgress}%`
                                      : 'আপলোড...'
                                    : thumbSrc
                                    ? 'ছবি বদলান'
                                    : 'ছবি যোগ'}
                                </span>
                                <input
                                  type="file"
                                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                  disabled={uploadingRowId === p.id}
                                  onChange={(ev) => handleQuickRowImageUpload(p, ev)}
                                  className="hidden"
                                />
                              </label>
                              <button
                                type="button"
                                title="Edit"
                                onClick={() => openEditor(p)}
                                className="cursor-pointer rounded-md border border-[#E7E5E4] p-1.5 text-[#1C1917] hover:border-[#DC1F26]"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title={p.deleted ? 'Restore' : 'Safe Archive'}
                                onClick={() => toggleArchive(p)}
                                className="cursor-pointer rounded-md border border-[#E7E5E4] p-1.5 text-[#57534E] hover:border-[#1C1917]"
                              >
                                {p.deleted ? (
                                  <RotateCcw className="h-3.5 w-3.5 text-emerald-700" />
                                ) : (
                                  <Archive className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </>
                          )}
                          {p.deleted && canDelete && (
                            <button
                              type="button"
                              title="Delete Permanently"
                              onClick={() => setPendingDeleteProduct(p)}
                              className="cursor-pointer rounded-md border border-[#E7E5E4] p-1.5 text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#E7E5E4] px-4 py-3 text-xs text-[#57534E]">
            <span>
              দেখানো হচ্ছে {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filtered.length)} / {filtered.length}টি পণ্য
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="cursor-pointer rounded border border-[#D6D3D1] px-2.5 py-1 font-semibold disabled:opacity-40"
              >
                পূর্ববর্তী
              </button>
              <span className="px-2 font-mono font-semibold">
                {safePage}/{totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="cursor-pointer rounded border border-[#D6D3D1] px-2.5 py-1 font-semibold disabled:opacity-40"
              >
                পরবর্তী
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Safe Permanent Delete Confirmation Modal */}
      {pendingDeleteProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E7E5E4] bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#DC1F26]">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-[#1C1917]">
                  পণ্য স্থায়ীভাবে ডিলিট করবেন?
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[#57534E]">
                  আপনি{' '}
                  <strong className="text-[#1C1917]">
                    {pendingDeleteProduct.nameBn || pendingDeleteProduct.name} (
                    {pendingDeleteProduct.nameEn})
                  </strong>{' '}
                  স্থায়ীভাবে ডিলিট করতে যাচ্ছেন। ডিলিট করলে এটি আর পুনরুদ্ধার করা যাবে না।
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2.5 border-t border-[#F5F4F0] pt-4">
              <button
                type="button"
                disabled={deletingProduct}
                onClick={() => setPendingDeleteProduct(null)}
                className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#1C1917] hover:bg-[#FAFAF8]"
              >
                বাতিল
              </button>
              <button
                type="button"
                disabled={deletingProduct}
                onClick={() => void confirmPermanentDelete()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
              >
                {deletingProduct && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>স্থায়ীভাবে ডিলিট করুন</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================
// 2. CATEGORY MANAGEMENT
// ========================
export function AdminCategoriesPanel() {
  const { allCategories, staffRole, hasPermission, logAdminActivity } = useStore();
  const [editing, setEditing] = useState<Category | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [catUploading, setCatUploading] = useState(false);
  const [catUploadPct, setCatUploadPct] = useState<number | null>(null);
  const [catPreviewUrl, setCatPreviewUrl] = useState<string | null>(null);
  const [pendingDeleteCat, setPendingDeleteCat] = useState<Category | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const startNew = () => {
    setIsNew(true);
    setMsg(null);
    setEditing({
      id: `cat-${Date.now()}`,
      name: '',
      nameEn: '',
      name_bn: '',
      name_en: '',
      slug: '',
      description: '',
      descriptionEn: '',
      description_bn: '',
      description_en: '',
      image: '/src/assets/images/hero_bakery_clean_1794746110066.jpg',
      order: allCategories.length + 1,
      visible: true,
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editing) return;
    const validationError = validateCatalogImageFile(file);
    if (validationError) {
      setMsg({ type: 'error', text: validationError });
      return;
    }
    const localUrl = URL.createObjectURL(file);
    setCatPreviewUrl(localUrl);
    setCatUploading(true);
    setCatUploadPct(0);
    setMsg(null);
    try {
      await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'categories_manage',
      });
      const result = await uploadCatalogImageToStorage({
        folder: 'categories',
        entityId: editing.id,
        file,
        onProgress: (pct) => setCatUploadPct(pct),
      });
      if (!result.downloadUrl || isForbiddenInlineImageUrl(result.downloadUrl)) {
        throw new Error('ছবি সংরক্ষণ করা যাচ্ছে না। অনুগ্রহ করে পরে আবার চেষ্টা করুন।');
      }
      setEditing((prev) => (prev ? { ...prev, image: result.downloadUrl } : null));
      setMsg({
        type: 'success',
        text: 'ছবি সফলভাবে যুক্ত হয়েছে। স্থায়ী করতে "সংরক্ষণ" বাটনে ক্লিক করুন।',
      });
    } catch (err) {
      setMsg({
        type: 'error',
        text:
          err instanceof CatalogAuthError
            ? mapCatalogSaveError(err, 'category_upload_auth', { staffRole })
            : err instanceof Error && err.message
            ? err.message
            : 'ছবি সংরক্ষণ করা যাচ্ছে না। অনুগ্রহ করে আবার চেষ্টা করুন।',
      });
    } finally {
      URL.revokeObjectURL(localUrl);
      setCatPreviewUrl(null);
      setCatUploading(false);
      setCatUploadPct(null);
    }
  };

  const saveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const nameBn = editing.name.trim().slice(0, 120);
    const nameEn = editing.nameEn.trim().slice(0, 120);
    if (!nameBn) {
      setMsg({ type: 'error', text: 'অনুগ্রহ করে বাংলা নাম লিখুন।' });
      return;
    }
    if (!nameEn) {
      setMsg({ type: 'error', text: 'অনুগ্রহ করে English Name লিখুন।' });
      return;
    }
    if (catUploading) {
      setMsg({ type: 'error', text: 'ছবি আপলোড সম্পন্ন হওয়া পর্যন্ত অনুগ্রহ করে অপেক্ষা করুন।' });
      return;
    }
    if (isForbiddenInlineImageUrl(editing.image)) {
      setMsg({ type: 'error', text: 'অবৈধ ছবির ফরম্যাট পাওয়া গেছে। অনুগ্রহ করে ছবিটি পুনরায় আপলোড করুন।' });
      return;
    }

    const slug = toSlug(editing.slug.trim() || nameEn || nameBn);
    const descEn = (editing.descriptionEn ?? '').trim().slice(0, 600);
    const descBn = (editing.description.trim() || descEn || nameBn).slice(0, 600);
    const rawOrder = Number(editing.order);
    const safeOrder = Number.isFinite(rawOrder)
      ? Math.min(1000, Math.max(0, Math.round(rawOrder)))
      : 1;

    try {
      await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'categories_manage',
      });
      const firestore = requireDb();
      const catRef = doc(firestore, 'categories', editing.id);
      const existingSnap = await getDoc(catRef);
      const existingData = existingSnap.exists()
        ? (existingSnap.data() as Record<string, unknown>)
        : undefined;
      const preservedValidId =
        existingData &&
        typeof existingData.id === 'string' &&
        /^[a-zA-Z0-9_-]{1,128}$/.test(existingData.id)
          ? existingData.id
          : editing.id;

      const payload: Record<string, unknown> = {
        id: preservedValidId,
        name: nameBn,
        nameEn,
        name_bn: nameBn,
        name_en: nameEn,
        slug,
        description: descBn,
        descriptionEn: descEn,
        description_bn: descBn,
        description_en: descEn,
        image: (editing.image || '/src/assets/images/hero_bakery_clean_1794746110066.jpg').trim(),
        order: safeOrder,
        visible: editing.visible !== false,
        deleted: Boolean(editing.deleted),
        updatedAt: serverTimestamp(),
      };

      if (!existingSnap.exists()) {
        await setDoc(catRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await logAdminActivity('create', 'categories', editing.id, nameEn);
      } else if (getUnknownKeys(existingData!, ALLOWED_CATEGORY_KEYS).length > 0) {
        await setDoc(catRef, {
          ...payload,
          createdAt: hasValidTimestamp(existingData?.createdAt)
            ? existingData!.createdAt
            : serverTimestamp(),
        });
        await logAdminActivity('update', 'categories', editing.id, nameEn);
      } else {
        await updateDoc(
          catRef,
          hasValidTimestamp(existingData?.createdAt)
            ? payload
            : { ...payload, createdAt: serverTimestamp() }
        );
        await logAdminActivity('update', 'categories', editing.id, nameEn);
      }
      setEditing(null);
      setMsg({ type: 'success', text: 'ক্যাটাগরি সফলভাবে সংরক্ষণ হয়েছে।' });
    } catch (err) {
      setMsg({
        type: 'error',
        text: mapCatalogSaveError(err, 'category_save', {
          path: `categories/${editing.id}`,
          operation: isNew ? 'CREATE' : 'UPDATE',
          staffRole,
        }),
      });
      try {
        handleFirestoreError(err, OperationType.WRITE, `categories/${editing.id}`);
      } catch {
        // Logged for console diagnostics
      }
    }
  };

  const toggleCategoryVisibility = async (cat: Category) => {
    try {
      await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'categories_manage',
      });
      const firestore = requireDb();
      const catRef = doc(firestore, 'categories', cat.id);
      const existingSnap = await getDoc(catRef);
      const existingData = existingSnap.exists()
        ? (existingSnap.data() as Record<string, unknown>)
        : undefined;
      if (
        existingSnap.exists() &&
        isExistingCategoryDocRuleReady(existingData)
      ) {
        await updateDoc(catRef, {
          visible: cat.visible === false,
          updatedAt: serverTimestamp(),
        });
      } else {
        const ct = getCategoryText(cat);
        const preservedValidId =
          existingData &&
          typeof existingData.id === 'string' &&
          /^[a-zA-Z0-9_-]{1,128}$/.test(existingData.id)
            ? existingData.id
            : cat.id;
        const fullCatPayload = {
          id: preservedValidId,
          name: ct.nameBn.slice(0, 120),
          nameEn: (ct.nameEn || ct.nameBn).slice(0, 120),
          name_bn: ct.nameBn.slice(0, 120),
          name_en: (ct.nameEn || ct.nameBn).slice(0, 120),
          slug: toSlug(cat.slug || ct.nameEn || ct.nameBn),
          description: (ct.descriptionBn || ct.nameBn).slice(0, 600),
          descriptionEn: ct.descriptionEn.slice(0, 600),
          description_bn: (ct.descriptionBn || ct.nameBn).slice(0, 600),
          description_en: ct.descriptionEn.slice(0, 600),
          image: cat.image || '/src/assets/images/hero_bakery_clean_1794746110066.jpg',
          order: Math.min(1000, Math.max(0, Math.round(Number(cat.order) || 1))),
          visible: cat.visible === false,
          deleted: Boolean(cat.deleted),
          updatedAt: serverTimestamp(),
        };
        if (!existingSnap.exists()) {
          await setDoc(catRef, { ...fullCatPayload, createdAt: serverTimestamp() });
        } else if (getUnknownKeys(existingData!, ALLOWED_CATEGORY_KEYS).length > 0) {
          await setDoc(catRef, {
            ...fullCatPayload,
            createdAt: hasValidTimestamp(existingData?.createdAt)
              ? existingData!.createdAt
              : serverTimestamp(),
          });
        } else {
          await updateDoc(
            catRef,
            hasValidTimestamp(existingData?.createdAt)
              ? fullCatPayload
              : { ...fullCatPayload, createdAt: serverTimestamp() }
          );
        }
      }
    } catch (err) {
      setMsg({
        type: 'error',
        text: mapCatalogSaveError(err, 'category_visibility', {
          path: `categories/${cat.id}`,
          operation: 'UPDATE',
          staffRole,
        }),
      });
    }
  };

  const removeCategory = async (id: string) => {
    try {
      await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'categories_manage',
      });
      const firestore = requireDb();
      await deleteDoc(doc(firestore, 'categories', id));
      await logAdminActivity('delete', 'categories', id, id);
      setMsg({ type: 'success', text: 'ক্যাটাগরি ডিলিট করা হয়েছে।' });
    } catch (err) {
      setMsg({
        type: 'error',
        text: mapCatalogSaveError(err, 'category_delete', {
          path: `categories/${id}`,
          operation: 'DELETE',
          staffRole,
        }),
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Category Management
          </h2>
          <p className="text-xs text-[#57534E]">
            বাংলা ও English নামে ক্যাটাগরি যোগ, বিবরণ পরিবর্তন, Hide/Show ও অর্ডার সাজান।
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
        >
          <Plus className="h-4 w-4" />
          <span>নতুন ক্যাটাগরি</span>
        </button>
      </div>

      {msg && (
        <p
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            msg.type === 'error'
              ? 'border-red-200 bg-red-50 text-[#B91C1C]'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {msg.text}
        </p>
      )}

      {editing && (
        <form
          noValidate
          onSubmit={saveCategory}
          className="grid grid-cols-1 gap-4 rounded-xl border border-[#D6D3D1] bg-white p-5 sm:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold">নাম (বাংলা) *</label>
            <input
              type="text"
              value={editing.name}
              onChange={(e) =>
                setEditing({ ...editing, name: e.target.value, name_bn: e.target.value })
              }
              placeholder="যেমন: কাস্টমাইজ কেক"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Name (English) *</label>
            <input
              type="text"
              value={editing.nameEn}
              onChange={(e) =>
                setEditing({ ...editing, nameEn: e.target.value, name_en: e.target.value })
              }
              placeholder="e.g. Customized Cakes"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Order</label>
            <input
              type="number"
              value={editing.order}
              onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              ক্যাটাগরির ছবি (JPG, PNG বা WEBP · সর্বোচ্চ ৫ এমবি)
            </label>
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#DC1F26]">
                {catUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#DC1F26]" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                <span>
                  {catUploading
                    ? `আপলোড হচ্ছে ${catUploadPct ?? 0}%`
                    : 'ছবি নির্বাচন করুন'}
                </span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  disabled={catUploading}
                  onChange={handleUpload}
                  className="hidden"
                />
              </label>
              {(catPreviewUrl || editing.image) && (
                <img
                  src={catPreviewUrl || resolveAssetUrl(editing.image)}
                  alt="Category preview"
                  className="h-10 w-14 rounded-md border border-[#E7E5E4] object-cover"
                />
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Description (বাংলা)</label>
            <textarea
              rows={2}
              value={editing.description}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  description: e.target.value,
                  description_bn: e.target.value,
                })
              }
              placeholder="বাংলা বিবরণ"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Description (English)</label>
            <textarea
              rows={2}
              value={editing.descriptionEn ?? ''}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  descriptionEn: e.target.value,
                  description_en: e.target.value,
                })
              }
              placeholder="English description"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold sm:col-span-2">
            <input
              type="checkbox"
              checked={editing.visible !== false}
              onChange={(e) => setEditing({ ...editing, visible: e.target.checked })}
            />
            <span>Visible on Storefront</span>
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold"
            >
              বাতিল
            </button>
            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]"
            >
              সংরক্ষণ
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {allCategories.map((cat) => {
          const ct = getCategoryText(cat);
          return (
            <div
              key={cat.id}
              className={`flex flex-col overflow-hidden rounded-xl border bg-white ${
                cat.visible === false ? 'border-amber-300 opacity-75' : 'border-[#E7E5E4]'
              }`}
            >
              <img
                src={resolveAssetUrl(cat.image)}
                alt={ct.nameBn}
                className="aspect-[16/9] w-full object-cover"
              />
              <div className="flex flex-1 flex-col justify-between p-4">
                <div>
                  <div className="flex items-center justify-between text-xs text-[#78716C]">
                    <span>Order #{cat.order}</span>
                    <span>{cat.visible === false ? 'Hidden' : cat.slug}</span>
                  </div>
                  <h3 className="font-display mt-1 text-xl font-bold text-[#1C1917]">
                    {ct.nameBn}
                  </h3>
                  {ct.nameEn && (
                    <p className="text-xs font-semibold text-[#DC1F26]">{ct.nameEn}</p>
                  )}
                  <p className="mt-1.5 text-xs text-[#57534E]">{ct.descriptionBn}</p>
                  {ct.descriptionEn && (
                    <p className="mt-1 text-[11px] text-[#78716C]">{ct.descriptionEn}</p>
                  )}
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t border-[#F5F4F0] pt-3">
                  <button
                    type="button"
                    onClick={() => toggleCategoryVisibility(cat)}
                    className="cursor-pointer rounded-md border border-[#E7E5E4] px-2.5 py-1 text-xs font-medium text-[#57534E]"
                  >
                    {cat.visible === false ? 'Show' : 'Hide'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNew(false);
                      setMsg(null);
                      setEditing({
                        ...cat,
                        name: ct.nameBn,
                        nameEn: ct.nameEn,
                        name_bn: ct.nameBn,
                        name_en: ct.nameEn,
                        description: ct.descriptionBn,
                        descriptionEn: ct.descriptionEn,
                        description_bn: ct.descriptionBn,
                        description_en: ct.descriptionEn,
                      });
                    }}
                    className="cursor-pointer rounded-md border border-[#E7E5E4] px-3 py-1 text-xs font-medium hover:border-[#DC1F26]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteCat(cat)}
                    className="cursor-pointer rounded-md border border-[#E7E5E4] px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {pendingDeleteCat && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E7E5E4] bg-white p-6 shadow-xl">
            <h3 className="font-display text-xl font-bold text-[#1C1917]">
              ক্যাটাগরি ডিলিট করবেন?
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[#57534E]">
              আপনি <strong>{pendingDeleteCat.name}</strong> ক্যাটাগরিটি ডিলিট করতে যাচ্ছেন। এটি নিশ্চিত করতে নিচে চাপুন।
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteCat(null)}
                className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#1C1917]"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = pendingDeleteCat.id;
                  setPendingDeleteCat(null);
                  void removeCategory(id);
                }}
                className="cursor-pointer rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]"
              >
                ডিলিট করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================
// 3. OCCASION MANAGEMENT
// ========================
export function AdminOccasionsPanel() {
  const { allOccasions, allProducts, staffRole, hasPermission, logAdminActivity } = useStore();
  const [editing, setEditing] = useState<Occasion | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [assigningSlug, setAssigningSlug] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const saveOccasion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const nameBn = editing.name.trim().slice(0, 120);
    const nameEn = editing.nameEn.trim().slice(0, 120);
    if (!nameBn) {
      setMsg('অনুগ্রহ করে বাংলা নাম দিন।');
      return;
    }
    if (!nameEn) {
      setMsg('অনুগ্রহ করে English Name দিন।');
      return;
    }

    const slug = toSlug(editing.slug.trim() || nameEn || nameBn);
    const descEn = (editing.descriptionEn ?? '').trim().slice(0, 600);
    const descBn = (editing.description.trim() || descEn || nameBn).slice(0, 600);
    const rawOrder = Number(editing.order);
    const safeOrder = Number.isFinite(rawOrder)
      ? Math.min(1000, Math.max(0, Math.round(rawOrder)))
      : 1;

    try {
      await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'categories_manage',
      });
      const firestore = requireDb();
      const occRef = doc(firestore, 'occasions', editing.id);
      const existingSnap = await getDoc(occRef);
      const existingData = existingSnap.exists()
        ? (existingSnap.data() as Record<string, unknown>)
        : undefined;
      const preservedValidId =
        existingData &&
        typeof existingData.id === 'string' &&
        /^[a-zA-Z0-9_-]{1,128}$/.test(existingData.id)
          ? existingData.id
          : editing.id;

      const payload = {
        id: preservedValidId,
        name: nameBn,
        nameEn,
        name_bn: nameBn,
        name_en: nameEn,
        slug,
        icon: (editing.icon.trim() || '✨').slice(0, 32),
        description: descBn,
        descriptionEn: descEn,
        description_bn: descBn,
        description_en: descEn,
        order: safeOrder,
        visible: editing.visible !== false,
        deleted: Boolean(editing.deleted),
        updatedAt: serverTimestamp(),
      };

      if (!existingSnap.exists()) {
        await setDoc(occRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await logAdminActivity('create', 'occasions', editing.id, nameEn);
      } else {
        await updateDoc(
          occRef,
          hasValidTimestamp(existingData?.createdAt)
            ? payload
            : { ...payload, createdAt: serverTimestamp() }
        );
        await logAdminActivity('update', 'occasions', editing.id, nameEn);
      }
      setEditing(null);
      setMsg('উপলক্ষ সেভ হয়েছে।');
    } catch (err) {
      setMsg(
        mapCatalogSaveError(err, 'occasion_save', {
          path: `occasions/${editing.id}`,
          operation: isNew ? 'CREATE' : 'UPDATE',
          staffRole,
        })
      );
    }
  };

  const toggleProductOccasion = async (product: Product, occSlug: string) => {
    const has = product.occasions.includes(occSlug);
    const next = has
      ? product.occasions.filter((o) => o !== occSlug)
      : [...product.occasions, occSlug];
    try {
      await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'products_edit',
      });
      const firestore = requireDb();
      const prodRef = doc(firestore, 'products', product.id);
      const existingSnap = await getDoc(prodRef);
      const existingData = existingSnap.exists()
        ? (existingSnap.data() as Record<string, unknown>)
        : undefined;
      if (existingSnap.exists() && isExistingProductDocRuleReady(existingData)) {
        await updateDoc(prodRef, {
          occasions: next.slice(0, 15),
          updatedAt: serverTimestamp(),
        });
      } else {
        setMsg(
          'এই পণ্যের কিছু পুরোনো ফিল্ড অসম্পূর্ণ থাকায় প্রথমে Product Management থেকে পণ্যটি একবার সংরক্ষণ (Save) করুন।'
        );
      }
    } catch (err) {
      setMsg(
        mapCatalogSaveError(err, 'occasion_product_toggle', {
          path: `products/${product.id}`,
          operation: 'UPDATE',
          staffRole,
        })
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Occasion Management
          </h2>
          <p className="text-xs text-[#57534E]">
            বাংলা ও English নামে উপলক্ষ যোগ/সম্পাদনা করুন এবং পণ্য নির্ধারণ করুন।
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsNew(true);
            setMsg(null);
            setEditing({
              id: `occ-${Date.now()}`,
              name: '',
              nameEn: '',
              name_bn: '',
              name_en: '',
              slug: '',
              icon: '🎉',
              description: '',
              descriptionEn: '',
              description_bn: '',
              description_en: '',
              order: allOccasions.length + 1,
              visible: true,
            });
          }}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
        >
          <Plus className="h-4 w-4" />
          <span>নতুন উপলক্ষ</span>
        </button>
      </div>

      {msg && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-[#B91C1C]">
          {msg}
        </p>
      )}

      {editing && (
        <form
          noValidate
          onSubmit={saveOccasion}
          className="grid grid-cols-1 gap-4 rounded-xl border border-[#D6D3D1] bg-white p-5 sm:grid-cols-3"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold">Icon (Emoji)</label>
            <input
              type="text"
              value={editing.icon}
              onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">নাম (বাংলা) *</label>
            <input
              type="text"
              value={editing.name}
              onChange={(e) =>
                setEditing({ ...editing, name: e.target.value, name_bn: e.target.value })
              }
              placeholder="যেমন: জন্মদিন"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Name (English) *</label>
            <input
              type="text"
              value={editing.nameEn}
              onChange={(e) =>
                setEditing({ ...editing, nameEn: e.target.value, name_en: e.target.value })
              }
              placeholder="e.g. Birthday"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold">Description (বাংলা)</label>
              <input
                type="text"
                value={editing.description}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    description: e.target.value,
                    description_bn: e.target.value,
                  })
                }
                placeholder="বাংলা বিবরণ"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Description (English)</label>
              <input
                type="text"
                value={editing.descriptionEn ?? ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    descriptionEn: e.target.value,
                    description_en: e.target.value,
                  })
                }
                placeholder="English description"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-3">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold"
            >
              বাতিল
            </button>
            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]"
            >
              সংরক্ষণ
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {allOccasions.map((occ) => {
          const ot = getOccasionText(occ);
          const matchedCount = allProducts.filter((p) => p.occasions.includes(occ.slug)).length;
          return (
            <div
              key={occ.id}
              className="rounded-xl border border-[#E7E5E4] bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-[#1C1917]">
                    {occ.icon} {ot.nameBn}{' '}
                    <span className="text-xs font-normal text-[#78716C]">({ot.nameEn})</span>
                  </h3>
                  <p className="mt-1 text-xs text-[#57534E]">{ot.descriptionBn}</p>
                  {ot.descriptionEn && (
                    <p className="mt-0.5 text-[11px] text-[#78716C]">{ot.descriptionEn}</p>
                  )}
                  <p className="mt-2 font-mono text-[11px] text-[#DC1F26]">
                    {matchedCount} products assigned
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setAssigningSlug(assigningSlug === occ.slug ? null : occ.slug)
                    }
                    className="cursor-pointer rounded-md border border-[#E7E5E4] px-2.5 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26]"
                  >
                    Assign Products
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNew(false);
                      setMsg(null);
                      setEditing({
                        ...occ,
                        name: ot.nameBn,
                        nameEn: ot.nameEn,
                        name_bn: ot.nameBn,
                        name_en: ot.nameEn,
                        description: ot.descriptionBn,
                        descriptionEn: ot.descriptionEn,
                        description_bn: ot.descriptionBn,
                        description_en: ot.descriptionEn,
                      });
                    }}
                    className="cursor-pointer rounded-md border border-[#E7E5E4] p-1 text-[#57534E]"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await deleteDoc(doc(requireDb(), 'occasions', occ.id));
                      } catch {
                        setMsg('ডিলিট করা যায়নি।');
                      }
                    }}
                    className="cursor-pointer rounded-md border border-[#E7E5E4] p-1 text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {assigningSlug === occ.slug && (
                <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto border-t border-[#F5F4F0] pt-3">
                  {allProducts.map((prod) => {
                    const checked = prod.occasions.includes(occ.slug);
                    return (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => toggleProductOccasion(prod, occ.slug)}
                        className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-[#FAFAF8]"
                      >
                        <span className="text-[#1C1917]">
                          {prod.name} {prod.nameEn ? `(${prod.nameEn})` : ''}
                        </span>
                        <span
                          className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                            checked
                              ? 'border-[#DC1F26] bg-[#DC1F26] text-white'
                              : 'border-[#D6D3D1]'
                          }`}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ========================
// 4. SHOWROOM MANAGEMENT
// ========================
export function AdminShowroomsPanel() {
  const {
    firestoreShowrooms,
    legacyDemoShowrooms,
    staffRole,
    hasPermission,
    logAdminActivity,
  } = useStore();
  const [editing, setEditing] = useState<Showroom | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [purgingDemoDocs, setPurgingDemoDocs] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const purgeConfirmedDemoShowrooms = async () => {
    if (legacyDemoShowrooms.length === 0) return;
    setPurgingDemoDocs(true);
    setMsg(null);
    try {
      await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'showrooms_manage',
      });
      const firestore = requireDb();
      let deletedCount = 0;
      for (const demoDoc of legacyDemoShowrooms) {
        if (!CONFIRMED_DEMO_SHOWROOM_IDS.has(demoDoc.id) && !isDemoOrDummyShowroom(demoDoc)) {
          continue;
        }
        await deleteDoc(doc(firestore, 'showrooms', demoDoc.id));
        await logAdminActivity(
          'delete',
          'showrooms',
          demoDoc.id,
          demoDoc.nameEn || demoDoc.name,
          'Removed confirmed legacy demo showroom record'
        );
        deletedCount += 1;
      }
      setMsg(
        deletedCount > 0
          ? `নিশ্চিতভাবে চিহ্নিত ${deletedCount}টি পুরোনো Demo Showroom ডকুমেন্ট Firestore থেকে স্থায়ীভাবে মুছে ফেলা হয়েছে।`
          : 'মুছে ফেলার মতো কোনো Demo ডকুমেন্ট পাওয়া যায়নি।'
      );
    } catch (err) {
      setMsg(
        mapCatalogSaveError(err, 'showroom_purge', {
          operation: 'DELETE',
          staffRole,
        })
      );
    } finally {
      setPurgingDemoDocs(false);
    }
  };

  const saveShowroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;

    const nameBn = editing.name.trim();
    const nameEn = (editing.nameEn ?? '').trim();
    if (!nameBn) {
      setMsg('অনুগ্রহ করে বাংলা নাম দিন।');
      return;
    }
    if (!nameEn) {
      setMsg('অনুগ্রহ করে English Name দিন।');
      return;
    }

    const areaEn = (editing.areaEn ?? '').trim();
    const areaBn = editing.area.trim() || areaEn;
    if (!areaBn) {
      setMsg('অনুগ্রহ করে শোরুমের এলাকা (Area) লিখুন।');
      return;
    }

    const addressEn = (editing.addressEn ?? '').trim();
    const addressBn = editing.address.trim() || addressEn;
    if (!addressBn) {
      setMsg('অনুগ্রহ করে সম্পূর্ণ ঠিকানা লিখুন।');
      return;
    }

    const phone = editing.phone.trim();
    if (phone.length < 6) {
      setMsg('অনুগ্রহ করে সঠিক ফোন নম্বর লিখুন।');
      return;
    }

    const descEn = (editing.descriptionEn ?? '').trim();
    const descBn = (editing.description ?? '').trim() || descEn;
    const hoursEn = (editing.openingHoursEn ?? '').trim();
    const hoursBn = editing.openingHours.trim() || hoursEn || 'শুক্র–শনিবার · সকাল ৮:০০টা – রাত ১০:০০টা';
    const rawLat = Number(editing.lat);
    const rawLng = Number(editing.lng);
    const hasCoords = Number.isFinite(rawLat) && Number.isFinite(rawLng) && (rawLat !== 0 || rawLng !== 0);
    const safeMapUrl =
      editing.mapUrl.trim() ||
      (hasCoords
        ? `https://maps.google.com/?q=${rawLat},${rawLng}`
        : `https://maps.google.com/?q=${encodeURIComponent(addressEn || addressBn)}`);

    try {
      await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'showrooms_manage',
      });
      const firestore = requireDb();
      const showroomRef = doc(firestore, 'showrooms', editing.id);
      const existingSnap = await getDoc(showroomRef);
      const existingData = existingSnap.exists()
        ? (existingSnap.data() as Record<string, unknown>)
        : undefined;
      const preservedValidId =
        existingData &&
        typeof existingData.id === 'string' &&
        /^[a-zA-Z0-9_-]{1,128}$/.test(existingData.id)
          ? existingData.id
          : editing.id;

      const payload: Record<string, unknown> = {
        id: preservedValidId,
        name: nameBn.slice(0, 140),
        nameEn: nameEn.slice(0, 140),
        name_bn: nameBn.slice(0, 140),
        name_en: nameEn.slice(0, 140),
        area: areaBn.slice(0, 100),
        areaEn: areaEn.slice(0, 100),
        address: addressBn.slice(0, 400),
        addressEn: addressEn.slice(0, 400),
        address_bn: addressBn.slice(0, 400),
        address_en: addressEn.slice(0, 400),
        description: descBn.slice(0, 600),
        descriptionEn: descEn.slice(0, 600),
        description_bn: descBn.slice(0, 600),
        description_en: descEn.slice(0, 600),
        phone: phone.slice(0, 40),
        alternate_phone: (editing.alternate_phone ?? '').trim().slice(0, 40),
        email: (editing.email ?? '').trim().slice(0, 254),
        openingHours: hoursBn.slice(0, 160),
        openingHoursEn: hoursEn.slice(0, 160),
        opening_time: (editing.opening_time ?? '').trim().slice(0, 40),
        closing_time: (editing.closing_time ?? '').trim().slice(0, 40),
        weekly_holiday: (editing.weekly_holiday ?? '').trim().slice(0, 80),
        mapUrl: safeMapUrl.slice(0, 600),
        lat: Number.isFinite(rawLat) ? rawLat : 0,
        lng: Number.isFinite(rawLng) ? rawLng : 0,
        isMain: Boolean(editing.isMain),
        visible: editing.visible !== false,
        deleted: Boolean(editing.deleted),
        display_order: Math.min(1000, Math.max(0, Math.round(Number(editing.display_order) || 1))),
        updatedAt: serverTimestamp(),
      };

      if (!existingSnap.exists()) {
        await setDoc(showroomRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await logAdminActivity('create', 'showrooms', editing.id, nameEn);
      } else {
        await updateDoc(
          showroomRef,
          hasValidTimestamp(existingData?.createdAt)
            ? payload
            : { ...payload, createdAt: serverTimestamp() }
        );
        await logAdminActivity('update', 'showrooms', editing.id, nameEn);
      }
      setEditing(null);
      setMsg('শোরুম তথ্য সংরক্ষণ করা হয়েছে।');
    } catch (err) {
      setMsg(
        mapCatalogSaveError(err, 'showroom_save', {
          path: `showrooms/${editing.id}`,
          operation: isNew ? 'CREATE' : 'UPDATE',
          staffRole,
        })
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Showroom Management
          </h2>
          <p className="text-xs text-[#57534E]">
            বাংলা ও English ভাষায় অনুমোদিত শোরুম ও অতিরিক্ত Firestore শাখার তথ্য পরিচালনা করুন।
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsNew(true);
            setMsg(null);
            setEditing({
              id: `showroom-${Date.now()}`,
              name: '',
              nameEn: '',
              name_bn: '',
              name_en: '',
              area: '',
              areaEn: '',
              address: '',
              addressEn: '',
              address_bn: '',
              address_en: '',
              description: '',
              descriptionEn: '',
              description_bn: '',
              description_en: '',
              phone: '',
              alternate_phone: '',
              email: '',
              openingHours: 'শুক্র–শনিবার · সকাল ৮:০০টা – রাত ১০:০০টা',
              openingHoursEn: 'Friday – Saturday · 8:00 AM – 10:00 PM',
              opening_time: '08:00 AM',
              closing_time: '10:00 PM',
              weekly_holiday: 'Open Daily',
              mapUrl: '',
              lat: 0,
              lng: 0,
              isMain: false,
              visible: true,
              display_order: CHATTOGRAM_OUTLETS.length + firestoreShowrooms.length + 1,
            });
          }}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
        >
          <Plus className="h-4 w-4" />
          <span>নতুন শোরুম</span>
        </button>
      </div>

      {msg && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-[#B91C1C]">
          {msg}
        </p>
      )}

      {legacyDemoShowrooms.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold text-amber-950">
                Firestore-এ পুরোনো Demo Showroom ডকুমেন্ট শনাক্ত হয়েছে ({legacyDemoShowrooms.length}টি)
              </p>
              <p className="mt-1 text-[11px] text-amber-900">
                ওয়েবসাইট UI ও অভিযোগ বক্স থেকে এগুলো ইতিমধ্যেই সম্পূর্ণ লুকানো হয়েছে। ডাটাবেস পরিষ্কার করতে চাইলে নিচের বাটনে ক্লিক করে শুধুমাত্র এই চিহ্নিত Demo রেকর্ডগুলো মুছে দিন (আসল কোনো শোরুম পরিবর্তন হবে না):
              </p>
              <ul className="mt-1.5 list-inside list-disc text-[11px] font-mono text-amber-900">
                {legacyDemoShowrooms.map((d) => (
                  <li key={d.id}>
                    {d.id} — {d.nameEn || d.name}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              disabled={purgingDemoDocs}
              onClick={() => void purgeConfirmedDemoShowrooms()}
              className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            >
              {purgingDemoDocs ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              <span>চিহ্নিত Demo ডকুমেন্ট মুছুন</span>
            </button>
          </div>
        </div>
      )}

      {editing && (
        <form
          noValidate
          onSubmit={saveShowroom}
          className="grid grid-cols-1 gap-4 rounded-xl border border-[#D6D3D1] bg-white p-5 sm:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold">Showroom Name (বাংলা) *</label>
            <input
              type="text"
              value={editing.name}
              onChange={(e) =>
                setEditing({ ...editing, name: e.target.value, name_bn: e.target.value })
              }
              placeholder="যেমন: খুলশী মোড় শোরুম"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Showroom Name (English) *</label>
            <input
              type="text"
              value={editing.nameEn ?? ''}
              onChange={(e) =>
                setEditing({ ...editing, nameEn: e.target.value, name_en: e.target.value })
              }
              placeholder="e.g. Khulshi More Outlet"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Area (বাংলা) *</label>
            <input
              type="text"
              value={editing.area}
              onChange={(e) => setEditing({ ...editing, area: e.target.value })}
              placeholder="যেমন: খুলশী, চট্টগ্রাম"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Area (English)</label>
            <input
              type="text"
              value={editing.areaEn ?? ''}
              onChange={(e) => setEditing({ ...editing, areaEn: e.target.value })}
              placeholder="e.g. Khulshi, Chattogram"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Primary Phone *</label>
            <input
              type="text"
              value={editing.phone}
              onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              placeholder="+8801XXXXXXXXX"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Alternate Phone / Email</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={editing.alternate_phone ?? ''}
                onChange={(e) => setEditing({ ...editing, alternate_phone: e.target.value })}
                placeholder="Alt Phone"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
              <input
                type="email"
                value={editing.email ?? ''}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                placeholder="Branch Email"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Google Maps URL</label>
            <input
              type="url"
              value={editing.mapUrl}
              onChange={(e) => setEditing({ ...editing, mapUrl: e.target.value })}
              placeholder="https://maps.app.goo.gl/..."
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Weekly Holiday</label>
            <input
              type="text"
              value={editing.weekly_holiday ?? ''}
              onChange={(e) => setEditing({ ...editing, weekly_holiday: e.target.value })}
              placeholder="e.g. Open Daily"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Opening Hours (বাংলা) *</label>
            <input
              type="text"
              value={editing.openingHours}
              onChange={(e) => setEditing({ ...editing, openingHours: e.target.value })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Opening Hours (English)</label>
            <input
              type="text"
              value={editing.openingHoursEn ?? ''}
              onChange={(e) => setEditing({ ...editing, openingHoursEn: e.target.value })}
              placeholder="e.g. Daily 8:00 AM – 10:00 PM"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Full Address (বাংলা) *</label>
            <input
              type="text"
              value={editing.address}
              onChange={(e) =>
                setEditing({ ...editing, address: e.target.value, address_bn: e.target.value })
              }
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Full Address (English)</label>
            <input
              type="text"
              value={editing.addressEn ?? ''}
              onChange={(e) =>
                setEditing({ ...editing, addressEn: e.target.value, address_en: e.target.value })
              }
              placeholder="Full address in English"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Description (বাংলা)</label>
            <input
              type="text"
              value={editing.description ?? ''}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  description: e.target.value,
                  description_bn: e.target.value,
                })
              }
              placeholder="বাংলা বিবরণ (ঐচ্ছিক)"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Description (English)</label>
            <input
              type="text"
              value={editing.descriptionEn ?? ''}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  descriptionEn: e.target.value,
                  description_en: e.target.value,
                })
              }
              placeholder="English description (optional)"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Latitude</label>
            <input
              type="number"
              step="any"
              value={editing.lat}
              onChange={(e) => setEditing({ ...editing, lat: Number(e.target.value) })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Longitude</label>
            <input
              type="number"
              step="any"
              value={editing.lng}
              onChange={(e) => setEditing({ ...editing, lng: Number(e.target.value) })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-5 sm:col-span-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={editing.isMain}
                onChange={(e) => setEditing({ ...editing, isMain: e.target.checked })}
              />
              <span>Primary Office &amp; Outlet</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={editing.visible !== false}
                onChange={(e) => setEditing({ ...editing, visible: e.target.checked })}
              />
              <span>Visible on Website</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold"
            >
              বাতিল
            </button>
            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]"
            >
              সংরক্ষণ
            </button>
          </div>
        </form>
      )}

      {/* Firestore Custom Showrooms */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-[#1C1917]">
          অতিরিক্ত ডাইনামিক শোরুম (Firestore)
        </h3>
        {firestoreShowrooms.length === 0 ? (
          <div className="rounded-xl border border-[#E7E5E4] bg-white p-6 text-center text-xs text-[#57534E]">
            Firestore-এ এই মুহূর্তে কোনো অতিরিক্ত শোরুম ডকুমেন্ট নেই। নতুন শোরুম যোগ করতে উপরের “নতুন শোরুম” বাটন ব্যবহার করুন।
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {firestoreShowrooms.map((sr) => {
              const st = getShowroomText(sr);
              return (
                <div key={sr.id} className="rounded-xl border border-[#E7E5E4] bg-white p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold text-[#DC1F26]">
                        {st.areaBn}
                        {st.areaEn && st.areaEn !== st.areaBn ? ` · ${st.areaEn}` : ''}{' '}
                        {sr.visible === false ? '· (Hidden)' : ''}
                      </p>
                      <h3 className="font-display text-xl font-bold text-[#1C1917]">{st.nameBn}</h3>
                      {st.nameEn && (
                        <p className="text-xs font-medium text-[#78716C]">{st.nameEn}</p>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsNew(false);
                          setMsg(null);
                          setEditing({
                            ...sr,
                            name: st.nameBn,
                            nameEn: st.nameEn,
                            name_bn: st.nameBn,
                            name_en: st.nameEn,
                            area: st.areaBn,
                            areaEn: st.areaEn,
                            address: st.addressBn,
                            addressEn: st.addressEn,
                            address_bn: st.addressBn,
                            address_en: st.addressEn,
                            description: st.descriptionBn,
                            descriptionEn: st.descriptionEn,
                            description_bn: st.descriptionBn,
                            description_en: st.descriptionEn,
                            openingHours: st.openingHoursBn,
                            openingHoursEn: st.openingHoursEn,
                          });
                        }}
                        className="cursor-pointer rounded-md border border-[#E7E5E4] p-1.5 text-[#1C1917]"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await ensureVerifiedAdminWriteSession({
                              hasPermission,
                              requiredPermission: 'showrooms_manage',
                            });
                            await deleteDoc(doc(requireDb(), 'showrooms', sr.id));
                            await logAdminActivity('delete', 'showrooms', sr.id, st.nameEn || st.nameBn);
                          } catch (err) {
                            setMsg(
                              mapCatalogSaveError(err, 'showroom_delete', {
                                path: `showrooms/${sr.id}`,
                                operation: 'DELETE',
                                staffRole,
                              })
                            );
                          }
                        }}
                        className="cursor-pointer rounded-md border border-[#E7E5E4] p-1.5 text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-[#57534E]">{st.addressBn}</p>
                  {st.addressEn && (
                    <p className="mt-0.5 text-[11px] text-[#78716C]">{st.addressEn}</p>
                  )}
                  <p className="mt-2 font-mono text-xs font-semibold text-[#1C1917]">
                    {sr.phone} {sr.alternate_phone ? `· ${sr.alternate_phone}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-[#78716C]">
                    {st.openingHoursBn}
                    {st.openingHoursEn ? ` · ${st.openingHoursEn}` : ''}
                    {sr.weekly_holiday ? ` · ${sr.weekly_holiday}` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Approved Official Outlets Reference */}
      <div className="space-y-3 border-t border-[#E7E5E4] pt-5">
        <div>
          <h3 className="text-sm font-bold text-[#1C1917]">
            অনুমোদিত অফিশিয়াল শো-রুম · Official Chattogram Outlets
          </h3>
          <p className="text-[11px] text-[#57534E]">
            ওয়েবসাইটের Our Outlets / আমাদের শো-রুম, Contact ও Complaint Box-এ ব্যবহৃত অনুমোদিত তালিকা।
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {CHATTOGRAM_OUTLETS.map((outlet) => (
            <div key={outlet.id} className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-display text-lg font-bold text-[#1C1917]">
                    {outlet.nameBn}
                  </h4>
                  <p className="text-xs font-medium text-[#78716C]">{outlet.nameEn}</p>
                </div>
                {outlet.type && (
                  <span className="text-[11px] font-bold text-[#B91C1C]">
                    {outlet.type}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-[#57534E]">{outlet.addressBn}</p>
              <p className="mt-0.5 text-[11px] text-[#78716C]">{outlet.addressEn}</p>
              <p className="mt-2 font-mono text-xs font-semibold text-[#1C1917]">
                {outlet.phone}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
