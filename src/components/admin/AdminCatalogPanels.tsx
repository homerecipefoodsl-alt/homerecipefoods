import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Edit3,
  Eye,
  EyeOff,
  ImageOff,
  ImagePlus,
  Link2,
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
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { useStore } from '../../context/StoreContext';
import {
  CANONICAL_OUTLET_SHOWROOMS,
  CHATTOGRAM_OUTLETS,
  CONFIRMED_DEMO_SHOWROOM_IDS,
  OUTLET_REGION_FILTERS,
  isDemoOrDummyShowroom,
  type OutletRegion,
} from '../../data/outletsData';
import { getCatalogStudioPhotos } from '../../data/productPhotoMap';
import { SEED_PRODUCTS } from '../../data/seedData';
import { resolveAssetUrl } from '../../lib/assets';
import {
  getCategoryText,
  getOccasionText,
  getProductText,
  getShowroomText,
  resolveBilingualPair,
} from '../../lib/bilingual';
import {
  OperationType,
  auth,
  handleFirestoreError,
  requireDb,
} from '../../lib/firebase';
import {
  deleteCatalogImageFromStorage,
  extractR2ImageKey,
  isForbiddenInlineImageUrl,
  isR2ImageUrl,
  uploadCatalogImageToStorage,
  validateCatalogImageFile,
  validateProductImageUrl,
} from '../../lib/productStorage';
import {
  AdminAuthError,
  ensureVerifiedAdminWriteSession,
  fetchDocFromServer,
  formatAdminFirestoreError,
  safeDeleteUnreferencedR2Urls,
  type VerifiedWriteSession,
} from '../../lib/adminDb';
import { formatBdtPrice, toSlug } from '../../lib/utils';
import type {
  Category,
  Occasion,
  Product,
  ProductAvailability,
  Showroom,
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
  'image', 'imageUrl', 'imageKey', 'images', 'masterKey', 'rating', 'stock', 'sku',
  'ingredients', 'ingredients_bn', 'ingredients_en', 'sizes', 'weight', 'occasions', 'showrooms',
  'availability', 'importantNotes', 'featured', 'popular',
  'visible', 'active', 'isActive', 'deleted', 'status', 'display_order', 'archivedAt',
  'seoTitle', 'seoDescription', 'seoImage',
  'createdBy', 'updatedBy', 'createdAt', 'updatedAt',
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
  ['imageKey', 320],
  ['masterKey', 240],
  ['sku', 80],
  ['ingredients_bn', 600],
  ['ingredients_en', 600],
  ['seoTitle', 200],
  ['seoDescription', 400],
  ['createdBy', 254],
  ['updatedBy', 254],
];

const PRODUCT_OPTIONAL_BOOL_KEYS = ['visible', 'active', 'isActive', 'deleted'] as const;

const ALLOWED_CATEGORY_KEYS = new Set<string>([
  'id', 'name', 'nameEn', 'name_bn', 'name_en', 'slug', 'icon',
  'description', 'descriptionEn', 'description_bn', 'description_en',
  'image', 'order', 'visible', 'active', 'deleted', 'archivedAt', 'seoTitle', 'seoDescription',
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

const REQUIRED_SHOWROOM_SCHEMA_KEYS = [
  'id',
  'name',
  'area',
  'address',
  'phone',
  'openingHours',
  'mapUrl',
  'lat',
  'lng',
  'isMain',
] as const;

const ALLOWED_SHOWROOM_KEYS = new Set<string>([
  'id', 'name', 'nameEn', 'name_bn', 'name_en',
  'area', 'areaEn', 'address', 'addressEn', 'address_bn', 'address_en',
  'description', 'descriptionEn', 'description_bn', 'description_en',
  'phone', 'alternate_phone', 'email',
  'openingHours', 'openingHoursEn', 'opening_time', 'closing_time', 'weekly_holiday',
  'region', 'orderLineEn', 'orderLineBn',
  'mapUrl', 'lat', 'lng', 'images', 'available_categories', 'available_products',
  'isMain', 'visible', 'deleted', 'display_order', 'archivedAt', 'seoTitle', 'seoDescription',
  'createdAt', 'updatedAt',
]);

const SHOWROOM_OPTIONAL_STRING_BOUNDS: ReadonlyArray<[string, number]> = [
  ['nameEn', 140],
  ['name_bn', 140],
  ['name_en', 140],
  ['areaEn', 100],
  ['addressEn', 400],
  ['address_bn', 400],
  ['address_en', 400],
  ['description', 600],
  ['descriptionEn', 600],
  ['description_bn', 600],
  ['description_en', 600],
  ['alternate_phone', 40],
  ['email', 254],
  ['openingHoursEn', 160],
  ['opening_time', 40],
  ['closing_time', 40],
  ['weekly_holiday', 80],
  ['region', 100],
  ['orderLineEn', 160],
  ['orderLineBn', 160],
  ['seoTitle', 200],
  ['seoDescription', 400],
];

const VALID_AVAILABILITIES: ReadonlySet<ProductAvailability> = new Set([
  'In Showroom',
  'Pre-Order at Showroom',
  'Seasonal',
  'Out of Stock',
]);

const VALID_PRODUCT_STATUSES = new Set(['draft', 'published', 'archived']);

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

function collectProductR2ImageUrls(
  data: Record<string, unknown> | Product | undefined
): string[] {
  if (!data) return [];
  const urls = new Set<string>();
  const addIfR2 = (val: unknown) => {
    if (typeof val === 'string' && isR2ImageUrl(val)) {
      urls.add(val.trim());
    }
  };
  addIfR2((data as { image?: unknown }).image);
  addIfR2((data as { imageUrl?: unknown }).imageUrl);
  addIfR2((data as { seoImage?: unknown }).seoImage);
  const imgs = (data as { images?: unknown }).images;
  if (Array.isArray(imgs)) {
    for (const item of imgs) {
      addIfR2(item);
    }
  }
  return Array.from(urls);
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
  if ('icon' in data && (typeof data.icon !== 'string' || data.icon.length > 40)) return false;
  if ('visible' in data && typeof data.visible !== 'boolean') return false;
  if ('active' in data && typeof data.active !== 'boolean') return false;
  if ('deleted' in data && typeof data.deleted !== 'boolean') return false;
  return true;
}

function inspectExistingShowroomIssues(
  data: Record<string, unknown> | undefined
): string[] {
  if (!data) return ['missing_doc'];
  const issues: string[] = [];

  const unknownKeys = getUnknownKeys(data, ALLOWED_SHOWROOM_KEYS);
  if (unknownKeys.length > 0) {
    issues.push(`unknown_keys:${unknownKeys.join(',')}`);
  }
  if (!hasCompleteSchema(data, REQUIRED_SHOWROOM_SCHEMA_KEYS)) {
    const missing = REQUIRED_SHOWROOM_SCHEMA_KEYS.filter((k) => !(k in data));
    issues.push(`missing_required:${missing.join(',')}`);
  }
  if (!hasValidTimestamp(data.createdAt)) issues.push('invalid_createdAt');
  if (typeof data.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.id)) {
    issues.push('invalid_id');
  }
  if (!isNonEmptyString(data.name, 140)) issues.push('invalid_name');
  if (!isNonEmptyString(data.area, 100)) issues.push('invalid_area');
  if (!isNonEmptyString(data.address, 400)) issues.push('invalid_address');
  if (typeof data.phone !== 'string' || data.phone.length < 5 || data.phone.length > 40) {
    issues.push('invalid_phone');
  }
  if (!isNonEmptyString(data.openingHours, 160)) issues.push('invalid_openingHours');
  if (!isNonEmptyString(data.mapUrl, 1000)) issues.push('invalid_mapUrl');
  if (typeof data.lat !== 'number' || !Number.isFinite(data.lat) || data.lat < -90 || data.lat > 90) {
    issues.push('invalid_lat');
  }
  if (typeof data.lng !== 'number' || !Number.isFinite(data.lng) || data.lng < -180 || data.lng > 180) {
    issues.push('invalid_lng');
  }
  if (typeof data.isMain !== 'boolean') issues.push('invalid_isMain');

  for (const [key, maxLen] of SHOWROOM_OPTIONAL_STRING_BOUNDS) {
    if (key in data && (typeof data[key] !== 'string' || (data[key] as string).length > maxLen)) {
      issues.push(`invalid_${key}`);
    }
  }
  if ('images' in data) {
    if (!isBoundedStringArray(data.images, 6, 400000)) {
      issues.push('invalid_images');
    } else if ((data.images as string[]).some((u) => isForbiddenInlineImageUrl(u))) {
      issues.push('forbidden_inline_images');
    }
  }
  if (
    'available_categories' in data &&
    !isBoundedStringArray(data.available_categories, 30, 80)
  ) {
    issues.push('invalid_available_categories');
  }
  if (
    'available_products' in data &&
    !isBoundedStringArray(data.available_products, 200, 128)
  ) {
    issues.push('invalid_available_products');
  }
  if ('visible' in data && typeof data.visible !== 'boolean') issues.push('invalid_visible');
  if ('deleted' in data && typeof data.deleted !== 'boolean') issues.push('invalid_deleted');
  if (
    'display_order' in data &&
    (typeof data.display_order !== 'number' ||
      !Number.isInteger(data.display_order) ||
      data.display_order < 0 ||
      data.display_order > 1000)
  ) {
    issues.push('invalid_display_order');
  }
  if ('archivedAt' in data) {
    const val = data.archivedAt;
    if (!hasValidTimestamp(val) && (typeof val !== 'string' || val.length > 80)) {
      issues.push('invalid_archivedAt');
    }
  }

  return issues;
}

function isExistingShowroomDocRuleReady(data: Record<string, unknown> | undefined): boolean {
  return inspectExistingShowroomIssues(data).length === 0;
}

function validateShowroomWriteForRules(params: {
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

  issues.push(...inspectExistingShowroomIssues(merged));
  return issues;
}

function assertValidShowroomWritePreflight(
  params: {
    docId: string;
    payload: Record<string, unknown>;
    existingData?: Record<string, unknown>;
    isCreate: boolean;
    isFullReplace?: boolean;
  },
  preflightIssuesOut?: string[]
): void {
  const issues = validateShowroomWriteForRules(params);
  if (issues.length > 0) {
    if (preflightIssuesOut) {
      preflightIssuesOut.splice(0, preflightIssuesOut.length, ...issues);
    }
    throw new AdminAuthError(
      'validation/preflight-failed',
      `আউটলেটের কিছু ফিল্ড Firestore Security Rules-এর সাথে মিলছে না (${issues.slice(0, 4).join(', ')})। অনুগ্রহ করে ঘরগুলো যাচাই করে আবার চেষ্টা করুন।`
    );
  }
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
    throw new AdminAuthError(
      'validation/preflight-failed',
      `পণ্যের কিছু ফিল্ড Firestore Security Rules-এর সাথে মিলছে না (${issues.slice(0, 4).join(', ')})। অনুগ্রহ করে ঘরগুলো যাচাই করে আবার চেষ্টা করুন।`
    );
  }
}

function buildNormalizedProductPayload(params: {
  source: Product;
  allCategories: Category[];
  ingredientsList: string[];
  sizesList: string[];
  cleanImages: string[];
  existingData?: Record<string, unknown>;
  forFullSet?: boolean;
  actorUid?: string;
}): Record<string, unknown> {
  const {
    source,
    allCategories,
    ingredientsList,
    sizesList,
    cleanImages,
    existingData,
    forFullSet,
    actorUid,
  } = params;
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
  const resolvedImageKey = primaryImg
    ? extractR2ImageKey(primaryImg) ||
      (typeof source.imageKey === 'string' &&
      source.imageKey.trim() &&
      source.imageKey.trim() !== 'no-photo'
        ? source.imageKey.trim().slice(0, 320)
        : '')
    : source.imageKey === 'no-photo'
    ? 'no-photo'
    : '';

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
    imageKey: resolvedImageKey,
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

  const categorySlugValue =
    resolvedCategorySlug ||
    (typeof source.categorySlug === 'string' && source.categorySlug.trim()
      ? source.categorySlug.trim().slice(0, 160)
      : typeof existingData?.categorySlug === 'string' && existingData.categorySlug.trim()
      ? existingData.categorySlug.trim().slice(0, 160)
      : '');
  if (categorySlugValue) {
    payload.categorySlug = categorySlugValue;
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

  if (typeof source.stock === 'number' && Number.isInteger(source.stock) && source.stock >= 0 && source.stock <= 1000000) {
    payload.stock = source.stock;
  } else if (source.stock === undefined && !forFullSet && existingData && 'stock' in existingData) {
    payload.stock = deleteField();
  } else if (forFullSet && typeof existingData?.stock === 'number' && Number.isInteger(existingData.stock) && existingData.stock >= 0 && existingData.stock <= 1000000) {
    payload.stock = existingData.stock;
  }

  if (typeof source.sku === 'string') {
    const trimmedSku = source.sku.trim().slice(0, 80);
    if (trimmedSku) {
      payload.sku = trimmedSku;
    } else if (!forFullSet && existingData && 'sku' in existingData) {
      payload.sku = deleteField();
    }
  } else if (typeof existingData?.sku === 'string' && existingData.sku.trim()) {
    payload.sku = existingData.sku.trim().slice(0, 80);
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

  const rawExistingCreatedBy = existingData?.createdBy;
  const existingCreatedBy =
    typeof rawExistingCreatedBy === 'string' &&
    rawExistingCreatedBy.trim().length > 0 &&
    rawExistingCreatedBy.length <= 254
      ? rawExistingCreatedBy
      : typeof source.createdBy === 'string' && source.createdBy.trim()
      ? source.createdBy.trim().slice(0, 254)
      : '';
  if (existingCreatedBy) {
    payload.createdBy = existingCreatedBy;
  } else if (actorUid) {
    payload.createdBy = actorUid.slice(0, 254);
  }

  if (actorUid) {
    payload.updatedBy = actorUid.slice(0, 254);
  } else if (typeof existingData?.updatedBy === 'string' && existingData.updatedBy.trim()) {
    payload.updatedBy = existingData.updatedBy.trim().slice(0, 254);
  }

  if (!forFullSet && existingData) {
    for (const badKey of getInvalidOptionalProductFieldsToDelete(existingData)) {
      if (!(badKey in payload)) {
        payload[badKey] = deleteField();
      }
    }
  }

  return payload;
}

function buildPartialProductUpdatePayload(params: {
  draft: Product;
  original: Product | null;
  allCategories: Category[];
  existingData: Record<string, unknown>;
  ingredientsList: string[];
  sizesList: string[];
  cleanImages: string[];
  actorUid: string;
}): Record<string, unknown> {
  const {
    draft,
    original,
    allCategories,
    existingData,
    ingredientsList,
    sizesList,
    cleanImages,
    actorUid,
  } = params;
  const fullNormalized = buildNormalizedProductPayload({
    source: draft,
    allCategories,
    ingredientsList,
    sizesList,
    cleanImages,
    existingData,
    forFullSet: false,
    actorUid,
  });

  const updatePayload: Record<string, unknown> = {
    updatedBy: actorUid.slice(0, 254),
    updatedAt: serverTimestamp(),
  };

  const trimStr = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const sameList = (a: unknown, b: unknown) => {
    const listA = Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean) : [];
    const listB = Array.isArray(b) ? b.map((x) => String(x).trim()).filter(Boolean) : [];
    return listA.length === listB.length && listA.every((item, idx) => item === listB[idx]);
  };

  if (!original) {
    Object.assign(updatePayload, fullNormalized);
    delete updatePayload.id;
    delete updatePayload.createdBy;
    delete updatePayload.createdAt;
  } else {
    if (trimStr(draft.name) !== trimStr(original.name)) {
      updatePayload.name = fullNormalized.name;
      updatePayload.nameBn = fullNormalized.nameBn;
      updatePayload.name_bn = fullNormalized.name_bn;
    }
    if (trimStr(draft.nameEn) !== trimStr(original.nameEn)) {
      updatePayload.nameEn = fullNormalized.nameEn;
      updatePayload.name_en = fullNormalized.name_en;
    }
    if (trimStr(draft.slug) !== trimStr(original.slug)) {
      updatePayload.slug = fullNormalized.slug;
    }
    if (trimStr(draft.category) !== trimStr(original.category)) {
      updatePayload.category = fullNormalized.category;
      updatePayload.categorySlug = fullNormalized.categorySlug ?? fullNormalized.category;
      updatePayload.categoryName = fullNormalized.categoryName;
      updatePayload.categoryNameEn = fullNormalized.categoryNameEn;
    } else {
      if (trimStr(draft.categoryName) !== trimStr(original.categoryName)) {
        updatePayload.categoryName = fullNormalized.categoryName;
      }
      if (trimStr(draft.categoryNameEn) !== trimStr(original.categoryNameEn)) {
        updatePayload.categoryNameEn = fullNormalized.categoryNameEn;
      }
    }
    if (trimStr(draft.productType) !== trimStr(original.productType)) {
      updatePayload.productType = fullNormalized.productType;
    }
    const origPrice = Number(original.price) || 0;
    const draftPrice = Number(draft.price) || 0;
    if (draftPrice !== origPrice) {
      updatePayload.price = fullNormalized.price;
    }
    const origOldPrice =
      typeof original.old_price === 'number' && Number.isFinite(original.old_price) && original.old_price > 0
        ? original.old_price
        : undefined;
    const draftOldPrice =
      typeof draft.old_price === 'number' && Number.isFinite(draft.old_price) && draft.old_price > 0
        ? draft.old_price
        : undefined;
    if (draftOldPrice !== origOldPrice) {
      updatePayload.old_price = draftOldPrice !== undefined ? fullNormalized.old_price : deleteField();
    }
    if (trimStr(draft.discount) !== trimStr(original.discount)) {
      updatePayload.discount = trimStr(draft.discount).slice(0, 60);
    }
    if (trimStr(draft.price_label) !== trimStr(original.price_label)) {
      updatePayload.price_label = trimStr(draft.price_label).slice(0, 80);
    }
    const origUnit = trimStr(original.unit ?? original.priceUnit);
    const draftUnit = trimStr(draft.unit ?? draft.priceUnit);
    if (draftUnit !== origUnit) {
      updatePayload.priceUnit = fullNormalized.priceUnit;
      updatePayload.unit = fullNormalized.unit;
    }
    if (trimStr(draft.shortDescription) !== trimStr(original.shortDescription)) {
      updatePayload.shortDescription = fullNormalized.shortDescription;
      updatePayload.short_description_bn = fullNormalized.short_description_bn;
    }
    if (trimStr(draft.shortDescriptionEn) !== trimStr(original.shortDescriptionEn)) {
      updatePayload.shortDescriptionEn = fullNormalized.shortDescriptionEn;
      updatePayload.short_description_en = fullNormalized.short_description_en;
    }
    if (trimStr(draft.description) !== trimStr(original.description)) {
      updatePayload.description = fullNormalized.description;
      updatePayload.description_bn = fullNormalized.description_bn;
    }
    if (trimStr(draft.descriptionEn) !== trimStr(original.descriptionEn)) {
      updatePayload.descriptionEn = fullNormalized.descriptionEn;
      updatePayload.description_en = fullNormalized.description_en;
    }
    const origCleanImages = sanitizeStoredImageUrls(
      Array.isArray(original.images) && original.images.length > 0
        ? original.images
        : original.imageUrl || original.image
        ? [original.imageUrl || original.image]
        : []
    );
    if (
      !sameList(cleanImages, origCleanImages) ||
      trimStr(draft.image) !== trimStr(original.image) ||
      trimStr(draft.imageUrl) !== trimStr(original.imageUrl) ||
      trimStr(draft.imageKey) !== trimStr(original.imageKey)
    ) {
      updatePayload.image = fullNormalized.image;
      updatePayload.imageUrl = fullNormalized.imageUrl;
      updatePayload.imageKey = fullNormalized.imageKey;
      updatePayload.images = fullNormalized.images;
    }
    const origIngredients = Array.isArray(original.ingredients) ? original.ingredients : [];
    if (!sameList(ingredientsList, origIngredients)) {
      updatePayload.ingredients = fullNormalized.ingredients;
    }
    const origSizes = Array.isArray(original.sizes) ? original.sizes : [];
    if (!sameList(sizesList, origSizes)) {
      updatePayload.sizes = fullNormalized.sizes;
    }
    if (trimStr(draft.weight) !== trimStr(original.weight)) {
      updatePayload.weight = fullNormalized.weight;
    }
    if (!sameList(draft.occasions, original.occasions)) {
      updatePayload.occasions = fullNormalized.occasions;
    }
    if (!sameList(draft.showrooms, original.showrooms)) {
      updatePayload.showrooms = fullNormalized.showrooms;
    }
    if (draft.availability !== original.availability) {
      updatePayload.availability = fullNormalized.availability;
    }
    if (trimStr(draft.sku) !== trimStr(original.sku)) {
      updatePayload.sku = trimStr(draft.sku) ? fullNormalized.sku : deleteField();
    }
    const origStock = typeof original.stock === 'number' && Number.isInteger(original.stock) ? original.stock : undefined;
    const draftStock = typeof draft.stock === 'number' && Number.isInteger(draft.stock) ? draft.stock : undefined;
    if (draftStock !== origStock) {
      updatePayload.stock = draftStock !== undefined ? fullNormalized.stock : deleteField();
    }
    if (trimStr(draft.importantNotes) !== trimStr(original.importantNotes)) {
      updatePayload.importantNotes = fullNormalized.importantNotes;
    }
    if (Boolean(draft.featured) !== Boolean(original.featured)) {
      updatePayload.featured = fullNormalized.featured;
    }
    if (Boolean(draft.popular) !== Boolean(original.popular)) {
      updatePayload.popular = fullNormalized.popular;
    }
    if ((draft.visible !== false) !== (original.visible !== false)) {
      updatePayload.visible = fullNormalized.visible;
      updatePayload.status = fullNormalized.status;
    }
    if (Boolean(draft.deleted) !== Boolean(original.deleted)) {
      updatePayload.deleted = fullNormalized.deleted;
      updatePayload.status = fullNormalized.status;
    }
    const origOrder = Math.min(10000, Math.max(0, Math.round(Number(original.display_order) || 1)));
    const draftOrder = Math.min(10000, Math.max(0, Math.round(Number(draft.display_order) || 1)));
    if (draftOrder !== origOrder) {
      updatePayload.display_order = fullNormalized.display_order;
    }
  }

  // Backfill only missing or invalid fields on legacy documents without clobbering valid existing fields
  const existingIssues = inspectExistingProductIssues(existingData);
  if (existingIssues.length > 0) {
    for (const reqKey of REQUIRED_PRODUCT_SCHEMA_KEYS) {
      if (!(reqKey in existingData) || existingIssues.includes(`invalid_${reqKey}`)) {
        if (reqKey in fullNormalized) {
          updatePayload[reqKey] = fullNormalized[reqKey];
        }
      }
    }
    if (
      !('id' in existingData) ||
      typeof existingData.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(existingData.id)
    ) {
      updatePayload.id = fullNormalized.id;
    }
    for (const badKey of getInvalidOptionalProductFieldsToDelete(existingData)) {
      if (!(badKey in updatePayload)) {
        updatePayload[badKey] = badKey in fullNormalized ? fullNormalized[badKey] : deleteField();
      }
    }
    if (
      existingIssues.includes('invalid_images') ||
      existingIssues.includes('forbidden_inline_images')
    ) {
      updatePayload.images = fullNormalized.images;
    }
    for (const arrKey of ['ingredients', 'sizes', 'occasions', 'showrooms'] as const) {
      if (existingIssues.includes(`invalid_${arrKey}`)) {
        updatePayload[arrKey] = fullNormalized[arrKey];
      }
    }
    for (const unknownKey of getUnknownKeys(existingData, ALLOWED_PRODUCT_KEYS)) {
      updatePayload[unknownKey] = deleteField();
    }
  }

  if (!hasValidTimestamp(existingData.createdAt)) {
    updatePayload.createdAt = serverTimestamp();
  }

  return updatePayload;
}

const CatalogAuthError = AdminAuthError;
const mapCatalogSaveError = formatAdminFirestoreError;

interface EditorImageSlot {
  id: string;
  url: string;
  imageKey: string;
  isSessionUpload?: boolean;
}

// ========================
// 1. PRODUCT MANAGEMENT
// ========================
export function AdminProductsPanel() {
  const {
    allProducts,
    allCategories,
    allOccasions,
    allShowrooms,
    allHeroBanners,
    mediaItems,
    siteSettings,
    seoSettings,
    staffRole,
    hasPermission,
    logAdminActivity,
    importProductMasterList,
    assignMissingStudioPhotos,
    masterImportStats,
    masterImportRunning,
    lastMasterImportSummary,
    refreshStoreData,
    refreshingStoreData,
  } = useStore();
  const canAdd = hasPermission('products_add');
  const canEdit = hasPermission('products_edit');
  const canDelete = hasPermission('products_delete');
  const [editing, setEditing] = useState<Product | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<{
    product: Product;
    ingredientsText: string;
    sizesText: string;
  } | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editorImageSlots, setEditorImageSlots] = useState<EditorImageSlot[]>([]);
  const [primaryImageUrlInput, setPrimaryImageUrlInput] = useState('');
  const [imageUrlCopied, setImageUrlCopied] = useState(false);
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false);
  const sessionUploadedR2KeysRef = useRef<Set<string>>(new Set());
  const copyTimerRef = useRef<number | null>(null);
  const isNew = formMode === 'create';
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
  const [editorUploadSuccess, setEditorUploadSuccess] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [deletingProduct, setDeletingProduct] = useState(false);
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState<Product | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const cleanupUncommittedSessionUploads = async () => {
    const keys = Array.from(sessionUploadedR2KeysRef.current);
    sessionUploadedR2KeysRef.current.clear();
    if (keys.length === 0) return;
    await Promise.allSettled(keys.map((key) => deleteCatalogImageFromStorage({ imageKey: key })));
  };

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
      }
      void cleanupUncommittedSessionUploads();
    };
  }, []);

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

  const closeEditor = (options?: { skipUncommittedCleanup?: boolean }) => {
    if (!options?.skipUncommittedCleanup) {
      void cleanupUncommittedSessionUploads();
    } else {
      sessionUploadedR2KeysRef.current.clear();
    }
    setEditorImageSlots([]);
    setPrimaryImageUrlInput('');
    setImageUrlCopied(false);
    setImagePreviewFailed(false);
    setEditing(null);
    setEditingOriginal(null);
    setFormMode('create');
    setEditorUploadProgress(null);
    setEditorUploadLabel('');
    setEditorUploadPreviewUrl(null);
    setEditorUploadError(null);
    setEditorUploadSuccess(null);
  };

  const openEditor = (prod: Product | null) => {
    void cleanupUncommittedSessionUploads();
    if (prod) {
      const t = getProductText(prod, allCategories);
      const ing = (Array.isArray(prod.ingredients) ? prod.ingredients : []).join(', ');
      const sz = (Array.isArray(prod.sizes) ? prod.sizes : []).join(', ');
      const rawCandidates = [
        prod.imageUrl,
        prod.image,
        ...(Array.isArray(prod.images) ? prod.images : []),
      ].filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
      const normalizedImages = Array.from(new Set(rawCandidates));
      const primaryImg = normalizedImages[0] || '';
      const primaryKey =
        (typeof prod.imageKey === 'string' && prod.imageKey.trim()) ||
        extractR2ImageKey(primaryImg);

      const prepared: Product = {
        ...prod,
        name: t.nameBn,
        nameBn: t.nameBn,
        nameEn: t.nameEn,
        name_bn: t.nameBn,
        name_en: t.nameEn,
        unit: t.unit || prod.priceUnit,
        priceUnit: prod.priceUnit || t.unit || 'Piece',
        image: primaryImg,
        imageUrl: primaryImg,
        imageKey: primaryKey,
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
      setFormMode('edit');
      setEditingOriginal({
        product: prepared,
        ingredientsText: ing,
        sizesText: sz,
      });
      setEditing(prepared);
      setEditorImageSlots(
        normalizedImages.slice(0, 6).map((url, idx) => ({
          id: `slot-${idx}-${url.slice(-16)}`,
          url,
          imageKey:
            (idx === 0 && typeof prod.imageKey === 'string' && prod.imageKey.trim()) ||
            extractR2ImageKey(url),
        }))
      );
      setPrimaryImageUrlInput(primaryImg);
      setIngredientsText(ing);
      setSizesText(sz);
    } else {
      const fresh = emptyProduct();
      setFormMode('create');
      setEditingOriginal(null);
      setEditing(fresh);
      setEditorImageSlots([]);
      setPrimaryImageUrlInput('');
      setIngredientsText('');
      setSizesText('Regular');
    }
    setImageUrlCopied(false);
    setImagePreviewFailed(false);
    setEditorUploadProgress(null);
    setEditorUploadLabel('');
    setEditorUploadPreviewUrl(null);
    setEditorUploadError(null);
    setEditorUploadSuccess(null);
    setFeedback(null);
  };

  const duplicateProduct = (prod: Product) => {
    void cleanupUncommittedSessionUploads();
    const t = getProductText(prod, allCategories);
    const ing = (Array.isArray(prod.ingredients) ? prod.ingredients : []).join(', ');
    const sz = (Array.isArray(prod.sizes) ? prod.sizes : []).join(', ');
    const rawCandidates = [
      prod.imageUrl,
      prod.image,
      ...(Array.isArray(prod.images) ? prod.images : []),
    ].filter(
      (u): u is string =>
        typeof u === 'string' && u.trim().length > 0 && !isForbiddenInlineImageUrl(u)
    );
    const normalizedImages = Array.from(new Set(rawCandidates)).slice(0, 6);
    const primaryImg = normalizedImages[0] || '';
    const suffix = Date.now().toString().slice(-4);
    const baseSlug = toSlug(prod.slug || t.nameEn || t.nameBn || 'product');
    const cloned: Product = {
      ...prod,
      id: `prod-${Date.now()}`,
      name: `${t.nameBn} (কপি)`.slice(0, 160),
      nameBn: `${t.nameBn} (কপি)`.slice(0, 160),
      nameEn: `${t.nameEn} (Copy)`.slice(0, 160),
      name_bn: `${t.nameBn} (কপি)`.slice(0, 160),
      name_en: `${t.nameEn} (Copy)`.slice(0, 160),
      slug: `${baseSlug}-copy-${suffix}`.slice(0, 140),
      masterKey: undefined,
      sku: prod.sku ? `${prod.sku}-COPY`.slice(0, 80) : '',
      unit: t.unit || prod.priceUnit,
      priceUnit: prod.priceUnit || t.unit || 'Piece',
      image: primaryImg,
      imageUrl: primaryImg,
      imageKey: primaryImg ? extractR2ImageKey(primaryImg) : '',
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
      featured: false,
      popular: false,
      visible: true,
      deleted: false,
      status: 'published',
      display_order: allProducts.length + 1,
    };

    setFormMode('create');
    setEditingOriginal(null);
    setEditing(cloned);
    setEditorImageSlots(
      normalizedImages.map((url, idx) => ({
        id: `dup-${idx}-${url.slice(-16)}`,
        url,
        imageKey: extractR2ImageKey(url),
      }))
    );
    setPrimaryImageUrlInput(primaryImg);
    setIngredientsText(ing);
    setSizesText(sz);
    setImageUrlCopied(false);
    setImagePreviewFailed(false);
    setEditorUploadProgress(null);
    setEditorUploadLabel('');
    setEditorUploadPreviewUrl(null);
    setEditorUploadError(null);
    setEditorUploadSuccess(null);
    setFeedback({
      type: 'success',
      message: `"${t.nameEn}" ডুপ্লিকেট ফর্ম খোলা হয়েছে। প্রয়োজনীয় তথ্য পরিবর্তন করে Save Product-এ ক্লিক করুন।`,
    });
  };

  const syncPrimarySlotFromUrl = (rawUrl: string) => {
    setPrimaryImageUrlInput(rawUrl);
    setImagePreviewFailed(false);
    setImageUrlCopied(false);
    setEditorUploadSuccess(null);
    const trimmed = rawUrl.trim();
    if (!editing) return;

    if (!trimmed) {
      setEditorUploadError(null);
      return;
    }

    const check = validateProductImageUrl(trimmed);
    if (check.valid === false) {
      setEditorUploadError(check.message);
      return;
    }

    setEditorUploadError(null);
    const cleanNonInline = editorImageSlots.filter(
      (s) => !isForbiddenInlineImageUrl(s.url) && s.url !== check.normalizedUrl
    );
    const nextSlot: EditorImageSlot = {
      id: `url-${Date.now()}`,
      url: check.normalizedUrl,
      imageKey: check.extractedKey,
    };
    const nextSlots = [nextSlot, ...cleanNonInline].slice(0, 6);
    setEditorImageSlots(nextSlots);
    const nextUrls = nextSlots.map((s) => s.url);
    setEditing((prev) =>
      prev
        ? {
            ...prev,
            image: nextUrls[0] ?? '',
            imageUrl: nextUrls[0] ?? '',
            imageKey: nextSlots[0]?.imageKey || '',
            images: nextUrls,
          }
        : null
    );
  };

  const handleCopyPrimaryImageUrl = async () => {
    const val = primaryImageUrlInput.trim();
    if (!val) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(val);
      } else {
        const ta = document.createElement('textarea');
        ta.value = val;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setImageUrlCopied(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setImageUrlCopied(false), 2200);
    } catch {
      setEditorUploadError('ব্রাউজার ক্লিপবোর্ডে URL কপি করা যায়নি। অনুগ্রহ করে ম্যানুয়ালি কপি করুন।');
    }
  };

  const uploadProductImageFilesNow = async (files: File[]) => {
    if (!editing || files.length === 0 || editorUploadProgress !== null) return;

    const cleanExistingSlots = editorImageSlots.filter(
      (slot) => !isForbiddenInlineImageUrl(slot.url)
    );
    const remainingSlots = Math.max(0, 6 - cleanExistingSlots.length);
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
    setEditorUploadSuccess(null);
    setImagePreviewFailed(false);

    try {
      await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: isNew ? 'products_add' : 'products_edit',
      });

      const uploadedSlots: EditorImageSlot[] = [];
      for (let i = 0; i < queue.length; i += 1) {
        const file = queue[i];
        const previewObjectUrl = URL.createObjectURL(file);
        setEditorUploadPreviewUrl(previewObjectUrl);
        setEditorUploadLabel(
          queue.length > 1 ? `${file.name} (${i + 1}/${queue.length})` : file.name
        );
        setEditorUploadProgress(0);

        try {
          const res = await uploadCatalogImageToStorage({
            folder: 'products',
            entityId: editing.id,
            file,
            isPrimary: i === 0,
            onProgress: (pct) => setEditorUploadProgress(pct),
          });
          if (!res.imageUrl || !res.imageKey || isForbiddenInlineImageUrl(res.imageUrl)) {
            throw new Error('ছবি আপলোড হয়েছে কিন্তু বৈধ Cloudflare R2 URL পাওয়া যায়নি।');
          }
          sessionUploadedR2KeysRef.current.add(res.imageKey);
          uploadedSlots.push({
            id: `r2-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
            url: res.imageUrl,
            imageKey: res.imageKey,
            isSessionUpload: true,
          });
        } finally {
          URL.revokeObjectURL(previewObjectUrl);
        }
      }

      const nextSlots = [...uploadedSlots.reverse(), ...cleanExistingSlots].slice(0, 6);
      const nextUrls = nextSlots.map((s) => s.url);
      const primarySlot = nextSlots[0];

      setEditorImageSlots(nextSlots);
      if (primarySlot) {
        setPrimaryImageUrlInput(primarySlot.url);
      }
      setEditing((prev) =>
        prev
          ? {
              ...prev,
              image: primarySlot?.url ?? '',
              imageUrl: primarySlot?.url ?? '',
              imageKey: primarySlot?.imageKey ?? '',
              images: nextUrls,
            }
          : null
      );
      setEditorUploadSuccess(
        `ছবি সফলভাবে Cloudflare R2-তে আপলোড হয়েছে (${uploadedSlots.length}টি)। স্থায়ীভাবে ডাটাবেসে সেভ করতে "সংরক্ষণ করুন" বাটনে ক্লিক করুন।`
      );
    } catch (err) {
      setEditorUploadError(
        err instanceof AdminAuthError
          ? mapCatalogSaveError(err, 'editor_image_upload_auth', { staffRole })
          : err instanceof Error && err.message
          ? err.message
          : 'Cloudflare R2-তে ছবি আপলোড করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।'
      );
    } finally {
      setEditorUploadProgress(null);
      setEditorUploadLabel('');
      setEditorUploadPreviewUrl(null);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    void uploadProductImageFilesNow(fileList);
  };

  const logProductSaveDebug = (params: {
    mode: 'CREATE' | 'UPDATE';
    documentId: string;
    method: 'setDoc' | 'updateDoc';
    authSession?: VerifiedWriteSession | null;
    editingExistingDocument: boolean;
    existingDocument: boolean;
    payload: Record<string, unknown>;
  }) => {
    const uid = params.authSession?.uid ?? auth?.currentUser?.uid ?? null;
    const role = params.authSession?.rbacRole ?? staffRole ?? null;
    const fields = Object.keys(params.payload);
    console.info('[PRODUCT_SAVE_DEBUG]', {
      mode: params.mode,
      collection: 'products',
      documentId: params.documentId,
      method: params.method,
      uid,
      adminRole: role,
      editingExistingDocument: params.editingExistingDocument,
      documentIdExists: Boolean(params.documentId),
      existingDocument: params.existingDocument,
      fields,
    });
  };

  const createNewProductDoc = async (params: {
    draft: Product;
    ingredientsList: string[];
    sizesList: string[];
    cleanImages: string[];
    authSession: VerifiedWriteSession;
    preflightIssuesOut?: string[];
    onOperation?: (op: 'CREATE' | 'UPDATE') => void;
    onDocumentId?: (id: string) => void;
  }) => {
    const {
      draft,
      ingredientsList,
      sizesList,
      cleanImages,
      authSession,
      preflightIssuesOut,
      onOperation,
      onDocumentId,
    } = params;
    const firestore = requireDb();
    let targetId = draft.id;
    let productRef = doc(firestore, 'products', targetId);
    let existingSnap = await fetchDocFromServer(productRef);

    if (existingSnap.exists()) {
      const altId = `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const altRef = doc(firestore, 'products', altId);
      const altSnap = await fetchDocFromServer(altRef);
      if (altSnap.exists()) {
        throw new AdminAuthError(
          'validation/duplicate-product-id',
          `পণ্যের আইডি ("${targetId}") ইতিমধ্যে Firestore-এ রয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।`
        );
      }
      targetId = altId;
      productRef = altRef;
      existingSnap = altSnap;
    }

    onDocumentId?.(targetId);
    onOperation?.('CREATE');

    const payload = buildNormalizedProductPayload({
      source: { ...draft, id: targetId },
      allCategories,
      ingredientsList,
      sizesList,
      cleanImages,
      forFullSet: true,
      actorUid: authSession.uid,
    });
    const createPayload: Record<string, unknown> = {
      ...payload,
      createdAt: serverTimestamp(),
    };
    assertValidProductWritePreflight(
      {
        docId: targetId,
        payload: createPayload,
        isCreate: true,
      },
      preflightIssuesOut
    );
    logProductSaveDebug({
      mode: 'CREATE',
      documentId: targetId,
      method: 'setDoc',
      authSession,
      editingExistingDocument: false,
      existingDocument: existingSnap.exists(),
      payload: createPayload,
    });
    await setDoc(productRef, createPayload);
    return { id: targetId, productRef, existingSnap };
  };

  const updateExistingProductDoc = async (params: {
    draft: Product;
    original: Product | null;
    ingredientsList: string[];
    sizesList: string[];
    cleanImages: string[];
    authSession: VerifiedWriteSession;
    preflightIssuesOut?: string[];
    existingIssuesOut?: string[];
    onOperation?: (op: 'CREATE' | 'UPDATE') => void;
  }) => {
    const {
      draft,
      original,
      ingredientsList,
      sizesList,
      cleanImages,
      authSession,
      preflightIssuesOut,
      existingIssuesOut,
      onOperation,
    } = params;
    const firestore = requireDb();
    const targetId = draft.id;
    const productRef = doc(firestore, 'products', targetId);
    const existingSnap = await fetchDocFromServer(productRef);

    onOperation?.('UPDATE');

    if (!existingSnap.exists()) {
      throw new AdminAuthError(
        'not-found',
        'The product no longer exists. Refresh the page and try again.'
      );
    }

    const existingData = existingSnap.data() as Record<string, unknown>;
    if (existingIssuesOut) {
      const issues = inspectExistingProductIssues(existingData);
      existingIssuesOut.splice(0, existingIssuesOut.length, ...issues);
    }

    const updatePayload = buildPartialProductUpdatePayload({
      draft,
      original,
      allCategories,
      existingData,
      ingredientsList,
      sizesList,
      cleanImages,
      actorUid: authSession.uid,
    });

    assertValidProductWritePreflight(
      {
        docId: targetId,
        payload: updatePayload,
        existingData,
        isCreate: false,
      },
      preflightIssuesOut
    );
    logProductSaveDebug({
      mode: 'UPDATE',
      documentId: targetId,
      method: 'updateDoc',
      authSession,
      editingExistingDocument: true,
      existingDocument: true,
      payload: updatePayload,
    });
    await updateDoc(productRef, updatePayload);
    return { id: targetId, productRef, existingData };
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

    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'products_edit',
      });

      const firestore = requireDb();
      const productRef = doc(firestore, 'products', prod.id);
      const existingSnap = await fetchDocFromServer(productRef);
      if (!existingSnap.exists()) {
        throw new AdminAuthError(
          'not-found',
          'The product no longer exists. Refresh the page and try again.'
        );
      }

      const existingData = existingSnap.data() as Record<string, unknown>;
      existingIssues = inspectExistingProductIssues(existingData);

      const uploaded = await uploadCatalogImageToStorage({
        folder: 'products',
        entityId: prod.id,
        file,
        isPrimary: true,
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
        Array.isArray(existingData.images) ? existingData.images : prod.images
      );
      const previousR2Urls = collectProductR2ImageUrls(existingData);
      const nextImages = [
        uploadedResult.downloadUrl,
        ...existingImages.filter((u) => u !== uploadedResult!.downloadUrl),
      ].slice(0, 6);

      const ingList = Array.isArray(existingData.ingredients)
        ? (existingData.ingredients as string[])
        : Array.isArray(prod.ingredients)
        ? prod.ingredients
        : [];
      const szList = Array.isArray(existingData.sizes)
        ? (existingData.sizes as string[])
        : Array.isArray(prod.sizes)
        ? prod.sizes
        : [];

      const updatePayload = isExistingProductDocRuleReady(existingData)
        ? {
            image: uploadedResult.downloadUrl,
            imageUrl: uploadedResult.downloadUrl,
            imageKey: uploadedResult.storagePath.slice(0, 320),
            images: nextImages,
            updatedBy: authSession.uid.slice(0, 254),
            updatedAt: serverTimestamp(),
          }
        : buildPartialProductUpdatePayload({
            draft: {
              ...prod,
              image: uploadedResult.downloadUrl,
              imageUrl: uploadedResult.downloadUrl,
              imageKey: uploadedResult.storagePath.slice(0, 320),
              images: nextImages,
            },
            original: prod,
            allCategories,
            existingData,
            ingredientsList: ingList,
            sizesList: szList,
            cleanImages: nextImages,
            actorUid: authSession.uid,
          });

      assertValidProductWritePreflight(
        {
          docId: productRef.id,
          payload: updatePayload,
          existingData,
          isCreate: false,
        },
        preflightIssues
      );
      logProductSaveDebug({
        mode: 'UPDATE',
        documentId: productRef.id,
        method: 'updateDoc',
        authSession,
        editingExistingDocument: true,
        existingDocument: true,
        payload: updatePayload,
      });
      await updateDoc(productRef, updatePayload);

      // Verify Firestore server state before marking upload committed & cleaning replaced R2 files
      const verifiedSnap = await fetchDocFromServer(productRef);
      if (!verifiedSnap.exists()) {
        throw new Error('Firestore-এ ছবির তথ্য সংরক্ষণ যাচাই করা যায়নি।');
      }

      uploadedResult = null; // Persisted & verified in Firestore; do not roll back

      // Best-effort delete any R2 images that fell off the 6-image list AFTER Firestore verification
      // while ensuring images shared by other products, categories, showrooms, banners, or media library stay intact
      const evictedR2Urls = previousR2Urls.filter((oldUrl) => !nextImages.includes(oldUrl));
      if (evictedR2Urls.length > 0) {
        await safeDeleteUnreferencedR2Urls({
          urls: evictedR2Urls,
          exclude: { collection: 'products', docId: prod.id },
          snapshot: {
            allProducts,
            allCategories,
            allShowrooms,
            allHeroBanners,
            mediaItems,
            siteSettings,
            seoSettings,
          },
        });
      }

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
          collection: 'products',
          documentId: prod.id,
          path: `products/${prod.id}`,
          operation: 'UPDATE',
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

  const handleAssignStudioPhotosClick = async () => {
    setFeedback(null);
    let authSession: VerifiedWriteSession | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'products_edit',
      });
      const res = await assignMissingStudioPhotos();
      setFeedback({
        type: 'success',
        message: `স্টুডিও ফটো সিঙ্ক সম্পন্ন: ${res.updatedCount}টি প্রডাক্টে নতুন ছবি যুক্ত হয়েছে, ${res.skippedCount}টি বিদ্যমান/অপরিবর্তিত রাখা হয়েছে।`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: mapCatalogSaveError(err, 'studio_photo_sync', {
          path: 'products/studio_photo_sync',
          operation: 'WRITE',
          staffRole,
          authSession,
        }),
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || saving || editorUploadProgress !== null) return;

    // 1. Product data validation BEFORE any Firestore write
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

    const trimmedPrimaryUrl = primaryImageUrlInput.trim();
    let validatedManualUrl = '';
    let validatedManualKey = '';
    if (trimmedPrimaryUrl) {
      const urlCheck = validateProductImageUrl(trimmedPrimaryUrl);
      if (urlCheck.valid === false) {
        setEditorUploadError(urlCheck.message);
        setFeedback({ type: 'error', message: urlCheck.message });
        return;
      }
      validatedManualUrl = urlCheck.normalizedUrl;
      validatedManualKey = urlCheck.extractedKey;
    }

    const hasLegacyInlineExistingOnly =
      !validatedManualUrl &&
      editorImageSlots.some((s) => isForbiddenInlineImageUrl(s.url));
    if (hasLegacyInlineExistingOnly) {
      setFeedback({
        type: 'error',
        message:
          'এই পণ্যটিতে পুরোনো ইনলাইন (base64) ছবি রয়েছে। অনুগ্রহ করে ছবিটি সরিয়ে নতুন JPG/PNG/WEBP/GIF ছবি আপলোড করুন অথবা ছবিটি তালিকা থেকে রিমুভ করে সংরক্ষণ করুন।',
      });
      return;
    }

    const isCreateMode = formMode === 'create';
    const editTargetId = (editingOriginal?.product.id || editing.id || '').trim();
    if (!isCreateMode && !/^[a-zA-Z0-9_-]{1,128}$/.test(editTargetId)) {
      setFeedback({
        type: 'error',
        message: 'Invalid product document ID. Refresh the page and try again.',
      });
      return;
    }
    let resolvedTargetId = isCreateMode ? editing.id : editTargetId;

    setSaving(true);
    setFeedback(null);
    setEditorUploadError(null);

    let authSession: VerifiedWriteSession | null = null;
    const existingIssues: string[] = [];
    const preflightIssues: string[] = [];
    let operationLabel: 'CREATE' | 'UPDATE' = isCreateMode ? 'CREATE' : 'UPDATE';

    try {
      // 2. Firebase Auth + Admin authorization verification
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: isCreateMode ? 'products_add' : 'products_edit',
      });

      // 3. Build final image list (prioritizing validated primary Image URL input + gallery slots)
      const slotUrls = editorImageSlots
        .filter((slot) => !isForbiddenInlineImageUrl(slot.url))
        .map((slot) => slot.url);
      const rawOrderedUrls = validatedManualUrl
        ? [validatedManualUrl, ...slotUrls.filter((u) => u !== validatedManualUrl)]
        : editorImageSlots.length === 0
        ? []
        : trimmedPrimaryUrl === '' && editorImageSlots.length === 1 && slotUrls.length === 1
        ? []
        : slotUrls;
      const nextImages = sanitizeStoredImageUrls(rawOrderedUrls);
      const primaryImage = nextImages[0] ?? '';
      const hasDefaultCatalogPhoto =
        getCatalogStudioPhotos({
          id: resolvedTargetId,
          slug: editing.slug,
          nameEn: editing.nameEn,
        }).length > 0 ||
        SEED_PRODUCTS.some(
          (s) => s.id === resolvedTargetId || (editing.slug && s.slug === editing.slug)
        );
      const primaryImageKey = primaryImage
        ? validatedManualKey || extractR2ImageKey(primaryImage) || ''
        : hasDefaultCatalogPhoto
        ? 'no-photo'
        : '';

      const ingredients = ingredientsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const sizes = sizesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const draftProduct: Product = {
        ...editing,
        id: resolvedTargetId,
        image: primaryImage,
        imageUrl: primaryImage,
        imageKey: primaryImageKey,
        images: nextImages,
      };

      // 4. Explicit Product Create vs Update (never silently fall back from Edit to Create)
      let previousR2Urls: string[] = [];
      let committedRef: ReturnType<typeof doc>;
      if (isCreateMode) {
        const created = await createNewProductDoc({
          draft: draftProduct,
          ingredientsList: ingredients,
          sizesList: sizes,
          cleanImages: nextImages,
          authSession,
          preflightIssuesOut: preflightIssues,
          onOperation: (op) => {
            operationLabel = op;
          },
          onDocumentId: (id) => {
            resolvedTargetId = id;
          },
        });
        committedRef = created.productRef;
      } else {
        const updated = await updateExistingProductDoc({
          draft: draftProduct,
          original: editingOriginal?.product ?? null,
          ingredientsList: ingredients,
          sizesList: sizes,
          cleanImages: nextImages,
          authSession,
          preflightIssuesOut: preflightIssues,
          existingIssuesOut: existingIssues,
          onOperation: (op) => {
            operationLabel = op;
          },
        });
        committedRef = updated.productRef;
        previousR2Urls = collectProductR2ImageUrls(updated.existingData);
      }

      // 5. Verify Firestore write persisted before cleaning replaced R2 files
      const verifiedSnap = await fetchDocFromServer(committedRef);
      if (!verifiedSnap.exists()) {
        throw new Error('Firestore-এ পণ্য সংরক্ষণ যাচাই করা যায়নি।');
      }

      // Identify any session-uploaded R2 keys that were NOT saved into nextImages (e.g., user uploaded A then replaced with B before Save)
      const retainedR2Keys = new Set(nextImages.map((u) => extractR2ImageKey(u)).filter(Boolean));
      const discardedSessionKeys = Array.from(sessionUploadedR2KeysRef.current).filter(
        (key) => !retainedR2Keys.has(key)
      );
      sessionUploadedR2KeysRef.current.clear();

      // Safe cleanup: delete unreferenced replaced/removed old R2 images + discarded session uploads ONLY AFTER Firestore verify succeeds
      const replacedOrRemovedR2Urls = previousR2Urls.filter(
        (oldUrl) => !nextImages.includes(oldUrl)
      );
      if (replacedOrRemovedR2Urls.length > 0) {
        await safeDeleteUnreferencedR2Urls({
          urls: replacedOrRemovedR2Urls,
          exclude: { collection: 'products', docId: resolvedTargetId },
          snapshot: {
            allProducts,
            allCategories,
            allShowrooms,
            allHeroBanners,
            mediaItems,
            siteSettings,
            seoSettings,
          },
        });
      }
      if (discardedSessionKeys.length > 0) {
        await Promise.allSettled(
          discardedSessionKeys.map((key) =>
            deleteCatalogImageFromStorage({ imageKey: key })
          )
        );
      }

      const committedOperation = isCreateMode ? 'create' : 'update';
      try {
        await logAdminActivity(
          committedOperation,
          'products',
          resolvedTargetId,
          nameEn,
          `${committedOperation === 'create' ? 'Created' : 'Updated'} product ${nameBn}`
        );
      } catch {
        // Non-blocking audit log
      }

      // 6. Save Success only after real Firestore write & verification complete
      closeEditor({ skipUncommittedCleanup: true });
      setFeedback({ type: 'success', message: 'পণ্য সফলভাবে সংরক্ষণ হয়েছে।' });
    } catch (err) {
      const mappedMessage = mapCatalogSaveError(err, 'product_save', {
        collection: 'products',
        documentId: resolvedTargetId,
        path: `products/${resolvedTargetId}`,
        operation: operationLabel,
        staffRole,
        existingIssues,
        preflightIssues,
        authSession,
      });

      setFeedback({
        type: 'error',
        message: mappedMessage,
      });
      if (import.meta.env.DEV) {
        try {
          handleFirestoreError(err, OperationType.WRITE, `products/${resolvedTargetId}`);
        } catch {
          // Logged for console diagnostics
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = async (prod: Product) => {
    if (busyProductId) return;
    setBusyProductId(prod.id);
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
      const existingSnap = await fetchDocFromServer(productRef);
      if (!existingSnap.exists()) {
        throw new AdminAuthError(
          'not-found',
          'The product no longer exists. Refresh the page and try again.'
        );
      }
      const existingData = existingSnap.data() as Record<string, unknown>;
      existingIssues = inspectExistingProductIssues(existingData);
      const nextVis = prod.visible === false;
      const cleanImages = sanitizeStoredImageUrls(
        Array.isArray(existingData.images) && existingData.images.length > 0
          ? existingData.images
          : Array.isArray(prod.images) && prod.images.length > 0
          ? prod.images
          : prod.image
          ? [prod.image]
          : []
      );
      const ingList = Array.isArray(existingData.ingredients)
        ? (existingData.ingredients as string[])
        : Array.isArray(prod.ingredients)
        ? prod.ingredients
        : [];
      const szList = Array.isArray(existingData.sizes)
        ? (existingData.sizes as string[])
        : Array.isArray(prod.sizes)
        ? prod.sizes
        : [];

      const updatePayload = isExistingProductDocRuleReady(existingData)
        ? {
            visible: nextVis,
            status: nextVis ? 'published' : 'draft',
            updatedBy: authSession.uid.slice(0, 254),
            updatedAt: serverTimestamp(),
          }
        : buildPartialProductUpdatePayload({
            draft: { ...prod, visible: nextVis },
            original: prod,
            allCategories,
            existingData,
            ingredientsList: ingList,
            sizesList: szList,
            cleanImages,
            actorUid: authSession.uid,
          });
      assertValidProductWritePreflight(
        {
          docId: productRef.id,
          payload: updatePayload,
          existingData,
          isCreate: false,
        },
        preflightIssues
      );
      logProductSaveDebug({
        mode: 'UPDATE',
        documentId: productRef.id,
        method: 'updateDoc',
        authSession,
        editingExistingDocument: true,
        existingDocument: true,
        payload: updatePayload,
      });
      await updateDoc(productRef, updatePayload);
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
          collection: 'products',
          documentId: prod.id,
          path: `products/${prod.id}`,
          operation: 'UPDATE',
          staffRole,
          existingIssues,
          preflightIssues,
          authSession,
        }),
      });
    } finally {
      setBusyProductId(null);
    }
  };

  const toggleArchive = async (prod: Product) => {
    if (busyProductId) return;
    setBusyProductId(prod.id);
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
      const existingSnap = await fetchDocFromServer(productRef);
      if (!existingSnap.exists()) {
        throw new AdminAuthError(
          'not-found',
          'The product no longer exists. Refresh the page and try again.'
        );
      }
      const existingData = existingSnap.data() as Record<string, unknown>;
      existingIssues = inspectExistingProductIssues(existingData);
      const nextDeleted = !prod.deleted;
      const cleanImages = sanitizeStoredImageUrls(
        Array.isArray(existingData.images) && existingData.images.length > 0
          ? existingData.images
          : Array.isArray(prod.images) && prod.images.length > 0
          ? prod.images
          : prod.image
          ? [prod.image]
          : []
      );
      const ingList = Array.isArray(existingData.ingredients)
        ? (existingData.ingredients as string[])
        : Array.isArray(prod.ingredients)
        ? prod.ingredients
        : [];
      const szList = Array.isArray(existingData.sizes)
        ? (existingData.sizes as string[])
        : Array.isArray(prod.sizes)
        ? prod.sizes
        : [];

      const updatePayload = isExistingProductDocRuleReady(existingData)
        ? {
            deleted: nextDeleted,
            status: nextDeleted ? 'archived' : 'published',
            updatedBy: authSession.uid.slice(0, 254),
            updatedAt: serverTimestamp(),
          }
        : buildPartialProductUpdatePayload({
            draft: { ...prod, deleted: nextDeleted },
            original: prod,
            allCategories,
            existingData,
            ingredientsList: ingList,
            sizesList: szList,
            cleanImages,
            actorUid: authSession.uid,
          });
      assertValidProductWritePreflight(
        {
          docId: productRef.id,
          payload: updatePayload,
          existingData,
          isCreate: false,
        },
        preflightIssues
      );
      logProductSaveDebug({
        mode: 'UPDATE',
        documentId: productRef.id,
        method: 'updateDoc',
        authSession,
        editingExistingDocument: true,
        existingDocument: true,
        payload: updatePayload,
      });
      await updateDoc(productRef, updatePayload);
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
          collection: 'products',
          documentId: prod.id,
          path: `products/${prod.id}`,
          operation: 'UPDATE',
          staffRole,
          existingIssues,
          preflightIssues,
          authSession,
        }),
      });
    } finally {
      setBusyProductId(null);
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
      const productRef = doc(firestore, 'products', target.id);
      const existingSnap = await fetchDocFromServer(productRef).catch(() => null);
      const r2UrlsToDelete = Array.from(
        new Set([
          ...collectProductR2ImageUrls(target),
          ...collectProductR2ImageUrls(
            existingSnap && existingSnap.exists()
              ? (existingSnap.data() as Record<string, unknown>)
              : undefined
          ),
        ])
      );

      await deleteDoc(productRef);

      if (r2UrlsToDelete.length > 0) {
        await safeDeleteUnreferencedR2Urls({
          urls: r2UrlsToDelete,
          exclude: { collection: 'products', docId: target.id },
          snapshot: {
            allProducts,
            allCategories,
            allShowrooms,
            allHeroBanners,
            mediaItems,
            siteSettings,
            seoSettings,
          },
        });
      }

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
          collection: 'products',
          documentId: target.id,
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
    if (busyProductId) return;
    setBusyProductId(prod.id);
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
      const existingSnap = await fetchDocFromServer(productRef);
      if (!existingSnap.exists()) {
        throw new AdminAuthError(
          'not-found',
          'The product no longer exists. Refresh the page and try again.'
        );
      }
      const existingData = existingSnap.data() as Record<string, unknown>;
      existingIssues = inspectExistingProductIssues(existingData);
      const nextFeatured = !prod.featured;
      const cleanImages = sanitizeStoredImageUrls(
        Array.isArray(existingData.images) && existingData.images.length > 0
          ? existingData.images
          : Array.isArray(prod.images) && prod.images.length > 0
          ? prod.images
          : prod.image
          ? [prod.image]
          : []
      );
      const ingList = Array.isArray(existingData.ingredients)
        ? (existingData.ingredients as string[])
        : Array.isArray(prod.ingredients)
        ? prod.ingredients
        : [];
      const szList = Array.isArray(existingData.sizes)
        ? (existingData.sizes as string[])
        : Array.isArray(prod.sizes)
        ? prod.sizes
        : [];

      const updatePayload = isExistingProductDocRuleReady(existingData)
        ? {
            featured: nextFeatured,
            updatedBy: authSession.uid.slice(0, 254),
            updatedAt: serverTimestamp(),
          }
        : buildPartialProductUpdatePayload({
            draft: { ...prod, featured: nextFeatured },
            original: prod,
            allCategories,
            existingData,
            ingredientsList: ingList,
            sizesList: szList,
            cleanImages,
            actorUid: authSession.uid,
          });
      assertValidProductWritePreflight(
        {
          docId: productRef.id,
          payload: updatePayload,
          existingData,
          isCreate: false,
        },
        preflightIssues
      );
      logProductSaveDebug({
        mode: 'UPDATE',
        documentId: productRef.id,
        method: 'updateDoc',
        authSession,
        editingExistingDocument: true,
        existingDocument: true,
        payload: updatePayload,
      });
      await updateDoc(productRef, updatePayload);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: mapCatalogSaveError(err, 'product_featured', {
          collection: 'products',
          documentId: prod.id,
          path: `products/${prod.id}`,
          operation: 'UPDATE',
          staffRole,
          existingIssues,
          preflightIssues,
          authSession,
        }),
      });
    } finally {
      setBusyProductId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allProducts.filter((p) => {
      if (filterMode === 'active' && (p.deleted || p.visible === false)) return false;
      if (filterMode === 'hidden' && (p.deleted || p.visible !== false)) return false;
      if (filterMode === 'archived' && !p.deleted) return false;
      if (selectedCategoryFilter !== 'all' && p.category !== selectedCategoryFilter) return false;
      const hasImage = Boolean(
        p.imageUrl || p.image || (Array.isArray(p.images) && p.images.length > 0)
      );
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
            <span className="tabular-nums font-semibold text-[#1C1917]">
              {allProducts.length}
            </span>{' '}
            products · Manage English &amp; Bengali names, categories, units, pricing, and Cloudflare R2 photos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshStoreData()}
            disabled={refreshingStoreData}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-2.5 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshingStoreData ? 'animate-spin' : ''}`} />
            <span>{refreshingStoreData ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          {canAdd && (
            <button
              type="button"
              onClick={() => openEditor(null)}
              className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#DC1F26]"
            >
              <Plus className="h-4 w-4" />
              <span>Add Product</span>
            </button>
          )}
        </div>
      </div>

      {/* Authoritative Product Master List Sync Banner */}
      {canAdd && (
        <div className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[#1C1917]">
                <Database className="h-4 w-4 text-[#DC1F26]" />
                <span>
                  Product Master List Status (
                  <span className="tabular-nums">{masterImportStats.totalMaster}</span> items)
                </span>
              </div>
              <p className="text-xs text-[#57534E]">
                Synced:{' '}
                <strong className="font-mono tabular-nums text-[#1C1917]">
                  {masterImportStats.syncedCount}/{masterImportStats.totalMaster}
                </strong>{' '}
                · Missing:{' '}
                <strong className="font-mono tabular-nums text-[#DC1F26]">
                  {masterImportStats.missingCount}
                </strong>{' '}
                · Missing Photo:{' '}
                <strong className="font-mono tabular-nums text-amber-700">
                  {masterImportStats.missingImageCount}
                </strong>
              </p>
              {lastMasterImportSummary && (
                <p className="text-[11px] font-medium text-emerald-700 tabular-nums">
                  Last Sync: Total {lastMasterImportSummary.totalMasterCount} · Existing{' '}
                  {lastMasterImportSummary.existingProductCount} · Newly Added{' '}
                  {lastMasterImportSummary.newlyAddedCount} · Skipped{' '}
                  {lastMasterImportSummary.skippedExistingCount}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && masterImportStats.unsyncedStudioPhotoCount > 0 && (
                <button
                  type="button"
                  onClick={handleAssignStudioPhotosClick}
                  disabled={masterImportRunning}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-amber-700 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-700 hover:text-white disabled:opacity-50"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>
                    Sync Studio Photos ({masterImportStats.unsyncedStudioPhotoCount})
                  </span>
                </button>
              )}
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
                    ? 'Syncing...'
                    : masterImportStats.missingCount > 0
                    ? `Import Master List (${masterImportStats.missingCount} missing)`
                    : 'Verify Master List'}
                </span>
              </button>
            </div>
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
              {isNew ? 'Add New Product' : `Edit Product: ${editing.nameEn || editing.name}`}
            </h3>
            <button
              type="button"
              onClick={() => closeEditor()}
              className="cursor-pointer rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F4F0]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!isNew && (
            <div className="mb-5 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#78716C]">
                Product Summary
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <span className="block text-[10px] text-[#78716C]">English Name</span>
                  <span className="font-semibold text-[#1C1917]">
                    {editing.nameEn || editing.name}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#78716C]">Bengali Name</span>
                  <span className="font-bn font-medium text-[#57534E]">{editing.name}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#78716C]">Category</span>
                  <span className="font-semibold text-[#1C1917]">
                    {editing.categoryNameEn || editing.categoryName}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#78716C]">Unit</span>
                  <span className="font-semibold text-[#1C1917]">
                    {editing.unit || editing.priceUnit}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#78716C]">Price</span>
                  <span className="font-mono tabular-nums font-bold text-[#1C1917]">
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
                      ? `${editorImageSlots.length} photo${editorImageSlots.length > 1 ? 's' : ''} linked`
                      : 'Photo pending'}
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
                    categorySlug: e.target.value,
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
                Price (৳ BDT) *
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
                placeholder="Previous price"
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
                placeholder="e.g. 10% OFF or Festive Offer"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Unit (e.g. Piece, Kg, Box)
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
                placeholder="e.g. Starting from ৳ 1,200"
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
                Weight / Pack Size
              </label>
              <input
                type="text"
                value={editing.weight}
                onChange={(e) => setEditing({ ...editing, weight: e.target.value })}
                placeholder="e.g. 1 kg"
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

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                SKU &amp; Stock Quantity (Optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={80}
                  value={editing.sku ?? ''}
                  onChange={(e) => setEditing({ ...editing, sku: e.target.value })}
                  placeholder="SKU-CODE"
                  className="flex-1 rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-xs"
                />
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  step={1}
                  value={typeof editing.stock === 'number' ? editing.stock : ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      setEditing({ ...editing, stock: undefined });
                      return;
                    }
                    const parsed = Math.max(0, Math.round(Number(raw)));
                    setEditing({
                      ...editing,
                      stock: Number.isFinite(parsed) ? parsed : undefined,
                    });
                  }}
                  placeholder="Stock"
                  className="w-24 rounded-lg border border-[#D6D3D1] px-2 py-2 font-mono text-xs"
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
                Ingredients (comma-separated)
              </label>
              <input
                type="text"
                value={ingredientsText}
                onChange={(e) => setIngredientsText(e.target.value)}
                placeholder="Pure milk, chhana, saffron, pistachio"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Sizes / Variants (comma-separated)
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
                Important Notes
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
              <p className="mb-1.5 text-xs font-semibold text-[#1C1917]">Assign Occasions</p>
              <div className="flex flex-wrap gap-2">
                {allOccasions.map((occ) => {
                  const checked = editing.occasions.includes(occ.slug);
                  const occLabel = occ.nameEn || occ.name;
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
                      <span>{occLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Product Images & R2 URL Manager */}
            <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[#1C1917]">
                    Product Photos &amp; URL Manager (Cloudflare R2)
                  </p>
                  <p className="text-[11px] text-[#57534E]">
                    Select or drag JPG, PNG, WEBP, or GIF files to upload directly to Cloudflare R2, or paste a verified HTTPS image URL below.
                  </p>
                </div>
                <span className="font-mono text-[11px] font-semibold tabular-nums text-[#57534E]">
                  {editorImageSlots.length}/6 photos
                </span>
              </div>

              {/* Upload Progress */}
              {editorUploadProgress !== null && (
                <div className="flex items-center gap-3 rounded-lg border border-[#E7E5E4] bg-white p-3">
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
                            ? `Preparing: ${editorUploadLabel}`
                            : `Uploading to Cloudflare R2: ${editorUploadLabel}`}
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

              {/* Upload Success / Failure Banners */}
              {editorUploadSuccess && (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{editorUploadSuccess}</span>
                </div>
              )}

              {editorUploadError && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{editorUploadError}</span>
                  </div>
                </div>
              )}

              {/* Primary Preview + Image URL Input & Copy URL */}
              {(() => {
                const trimmedUrl = primaryImageUrlInput.trim();
                const urlCheck = trimmedUrl ? validateProductImageUrl(trimmedUrl) : null;
                const activePrimaryKey =
                  (urlCheck && urlCheck.valid ? urlCheck.extractedKey : '') ||
                  editing.imageKey ||
                  '';
                return (
                  <div className="grid grid-cols-1 gap-4 rounded-xl border border-[#E7E5E4] bg-white p-3.5 md:grid-cols-12">
                    <div className="md:col-span-4">
                      <p className="mb-1.5 text-[11px] font-semibold text-[#57534E]">
                        Primary Photo Preview
                      </p>
                      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-[#E7E5E4] bg-[#F5F4F0]">
                        {trimmedUrl && !imagePreviewFailed && !isForbiddenInlineImageUrl(trimmedUrl) ? (
                          <img
                            src={resolveAssetUrl(trimmedUrl)}
                            alt={editing.nameEn || editing.name || 'Product preview'}
                            onError={() => setImagePreviewFailed(true)}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-3 text-center text-[#78716C]">
                            <ImageOff className="h-5 w-5" />
                            <span className="text-[11px]">
                              {imagePreviewFailed
                                ? 'Could not load image from URL'
                                : 'No photo selected'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="md:col-span-8 flex flex-col justify-between gap-3">
                      <div>
                        <label
                          htmlFor="product-primary-image-url"
                          className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold text-[#1C1917]"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Link2 className="h-3.5 w-3.5 text-[#DC1F26]" />
                            <span>Product Image URL (Auto-filled R2 or HTTPS URL)</span>
                          </span>
                          {urlCheck && (
                            <span
                              className={`text-[10px] font-semibold ${
                                urlCheck.valid ? 'text-emerald-700' : 'text-red-700'
                              }`}
                            >
                              {urlCheck.valid
                                ? urlCheck.isR2
                                  ? 'Verified Cloudflare R2'
                                  : 'Valid HTTPS URL'
                                : 'Invalid URL'}
                            </span>
                          )}
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <input
                            id="product-primary-image-url"
                            type="url"
                            value={primaryImageUrlInput}
                            onChange={(e) => syncPrimarySlotFromUrl(e.target.value)}
                            disabled={saving || editorUploadProgress !== null}
                            placeholder="https://images.homerecipefoods.com.bd/products/..."
                            className={`min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-xs focus:outline-none ${
                              urlCheck && !urlCheck.valid
                                ? 'border-red-400 bg-red-50/40 focus:border-red-600'
                                : 'border-[#D6D3D1] bg-[#FAFAF8] focus:border-[#DC1F26]'
                            }`}
                          />
                          <button
                            type="button"
                            disabled={!trimmedUrl}
                            onClick={() => void handleCopyPrimaryImageUrl()}
                            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold text-[#1C1917] transition-colors hover:border-[#1C1917] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {imageUrlCopied ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-700" />
                                <span className="text-emerald-700">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>Copy URL</span>
                              </>
                            )}
                          </button>
                          {(trimmedUrl || editorImageSlots.length > 0) && (
                            <button
                              type="button"
                              disabled={saving || editorUploadProgress !== null}
                              onClick={() => {
                                const firstSlot = editorImageSlots[0];
                                if (firstSlot?.isSessionUpload && firstSlot.imageKey) {
                                  sessionUploadedR2KeysRef.current.delete(firstSlot.imageKey);
                                  void deleteCatalogImageFromStorage({
                                    imageKey: firstSlot.imageKey,
                                    imageUrl: firstSlot.url,
                                  }).catch(() => undefined);
                                }
                                const remainingSlots =
                                  editorImageSlots.length > 1 ? editorImageSlots.slice(1) : [];
                                const nextUrls = remainingSlots.map((s) => s.url);
                                const nextPrimary = remainingSlots[0];
                                setEditorImageSlots(remainingSlots);
                                setPrimaryImageUrlInput(nextPrimary?.url ?? '');
                                setImagePreviewFailed(false);
                                setEditorUploadError(null);
                                setEditorUploadSuccess(null);
                                setEditing({
                                  ...editing,
                                  image: nextPrimary?.url ?? '',
                                  imageUrl: nextPrimary?.url ?? '',
                                  imageKey: nextPrimary?.imageKey ?? '',
                                  images: nextUrls,
                                });
                              }}
                              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <X className="h-3.5 w-3.5" />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>
                        <p className="mt-1.5 text-[11px] text-[#57534E]">
                          Uploading a photo automatically populates the R2 URL here—manual entry is optional.
                        </p>
                      </div>

                      {activePrimaryKey && (
                        <div className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF8] px-3 py-1.5 text-[11px] text-[#57534E]">
                          <span className="font-semibold text-[#1C1917]">R2 Object Key: </span>
                          <span className="font-mono break-all">{activePrimaryKey}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Gallery Thumbnails + Dropzone Upload */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {editorImageSlots.map((slot, i) => {
                  const previewSrc = resolveAssetUrl(slot.url);
                  const isLegacyInline = isForbiddenInlineImageUrl(slot.url);
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
                            Primary
                          </span>
                        )}
                        {slot.isSessionUpload && (
                          <span className="absolute inset-x-1.5 bottom-1.5 rounded bg-emerald-700/90 px-1.5 py-0.5 text-center text-[9px] font-bold text-white">
                            R2 Uploaded · Unsaved
                          </span>
                        )}
                        {isLegacyInline && (
                          <span className="absolute inset-x-1.5 bottom-1.5 rounded bg-amber-600/95 px-1.5 py-0.5 text-center text-[9px] font-bold text-white">
                            Legacy Inline — Replace
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={saving || editorUploadProgress !== null}
                          title="Remove from list"
                          onClick={() => {
                            if (slot.isSessionUpload && slot.imageKey) {
                              sessionUploadedR2KeysRef.current.delete(slot.imageKey);
                              void deleteCatalogImageFromStorage({
                                imageKey: slot.imageKey,
                                imageUrl: slot.url,
                              }).catch(() => undefined);
                            }
                            const nextSlots = editorImageSlots.filter((_, idx) => idx !== i);
                            setEditorImageSlots(nextSlots);
                            const nextUrls = nextSlots.map((s) => s.url);
                            const nextPrimary = nextSlots[0];
                            setPrimaryImageUrlInput(nextPrimary?.url ?? '');
                            setImagePreviewFailed(false);
                            setEditing({
                              ...editing,
                              image: nextPrimary?.url ?? '',
                              imageUrl: nextPrimary?.url ?? '',
                              imageKey: nextPrimary?.imageKey ?? '',
                              images: nextUrls,
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
                          disabled={saving || editorUploadProgress !== null}
                          onClick={() => {
                            const reordered = [
                              slot,
                              ...editorImageSlots.filter((_, idx) => idx !== i),
                            ];
                            setEditorImageSlots(reordered);
                            const nextUrls = reordered.map((s) => s.url);
                            const nextPrimary = reordered[0];
                            setPrimaryImageUrlInput(nextPrimary?.url ?? '');
                            setImagePreviewFailed(false);
                            setEditing({
                              ...editing,
                              image: nextPrimary?.url ?? '',
                              imageUrl: nextPrimary?.url ?? '',
                              imageKey: nextPrimary?.imageKey ?? '',
                              images: nextUrls,
                            });
                          }}
                          className="cursor-pointer border-t border-[#F5F4F0] bg-white px-2 py-1 text-[10px] font-semibold text-[#57534E] hover:bg-[#FAFAF8] hover:text-[#DC1F26] disabled:opacity-40"
                        >
                          Make Primary
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
                      if (saving || editorUploadProgress !== null) return;
                      const dropped = ev.dataTransfer.files
                        ? Array.from(ev.dataTransfer.files)
                        : [];
                      void uploadProductImageFilesNow(dropped);
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
                      {editorUploadProgress !== null ? 'Uploading to R2...' : 'Upload or Drag Photos'}
                    </span>
                    <input
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
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

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#F5F4F0] pt-4">
            <div>
              {!isNew && editing.deleted && canDelete && (
                <button
                  type="button"
                  disabled={saving || editorUploadProgress !== null}
                  onClick={() => setPendingDeleteProduct(editing)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Permanently</span>
                </button>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={saving || editorUploadProgress !== null}
                onClick={() => closeEditor()}
                className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#44403C] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || editorUploadProgress !== null}
                className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Product'}
              </button>
            </div>
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
              placeholder="Search products (English or Bengali)..."
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
              <option value="all">All Categories</option>
              {allCategories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.nameEn ? `${c.nameEn} (${c.name})` : c.name}
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
              <span className="tabular-nums">
                Missing Photo ({masterImportStats.missingImageCount})
              </span>
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
                <th className="px-4 py-3 font-semibold">Product &amp; Image</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Unit</th>
                <th className="px-4 py-3 font-semibold">Price</th>
                <th className="px-4 py-3 font-semibold">Visibility</th>
                <th className="px-4 py-3 font-semibold">Featured</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F4F0]">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#78716C]">
                    No products matched your current filter.
                  </td>
                </tr>
              ) : (
                paginated.map((p) => {
                  const thumbSrc = p.imageUrl || p.image || p.images?.[0] || '';
                  const pt = getProductText(p, allCategories);
                  const titlePair = resolveBilingualPair(pt.nameEn, pt.nameBn);
                  const categoryPair = resolveBilingualPair(
                    pt.categoryNameEn,
                    p.categoryName || pt.categoryNameBn
                  );
                  return (
                    <tr key={p.id} className="hover:bg-[#FAFAF8]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {thumbSrc ? (
                            <img
                              src={resolveAssetUrl(thumbSrc)}
                              alt={titlePair.primary}
                              className="h-10 w-12 shrink-0 rounded-md border border-[#E7E5E4] object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-amber-400 bg-amber-50 text-amber-700">
                              <ImageOff className="h-4 w-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-[#1C1917]">{titlePair.primary}</p>
                            {titlePair.secondaryBn && (
                              <p className="font-bn text-[11px] text-[#78716C]">
                                {titlePair.secondaryBn}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#44403C]">
                        <span>{categoryPair.primary}</span>
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
                          disabled={!canEdit || busyProductId === p.id}
                          onClick={() => canEdit && toggleVisibility(p)}
                          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold ${
                            canEdit && busyProductId !== p.id ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
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
                          disabled={!canEdit || busyProductId === p.id}
                          onClick={() => canEdit && toggleFeatured(p)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
                            canEdit && busyProductId !== p.id ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
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
                                title="Upload product photo"
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
                                      : 'Uploading...'
                                    : thumbSrc
                                    ? 'Change Photo'
                                    : 'Add Photo'}
                                </span>
                                <input
                                  type="file"
                                  accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
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
                              {canAdd && (
                                <button
                                  type="button"
                                  title="Duplicate Product"
                                  onClick={() => duplicateProduct(p)}
                                  className="cursor-pointer rounded-md border border-[#E7E5E4] p-1.5 text-[#57534E] hover:border-[#1C1917] hover:text-[#1C1917]"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busyProductId === p.id}
                                title={p.deleted ? 'Restore' : 'Safe Archive'}
                                onClick={() => toggleArchive(p)}
                                className="cursor-pointer rounded-md border border-[#E7E5E4] p-1.5 text-[#57534E] hover:border-[#1C1917] disabled:opacity-50"
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
            <span className="tabular-nums">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} products
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="cursor-pointer rounded border border-[#D6D3D1] px-2.5 py-1 font-semibold disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2 font-mono tabular-nums font-semibold">
                {safePage}/{totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="cursor-pointer rounded border border-[#D6D3D1] px-2.5 py-1 font-semibold disabled:opacity-40"
              >
                Next
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
                  Delete Product Permanently?
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[#57534E]">
                  You are about to permanently remove{' '}
                  <strong className="text-[#1C1917]">
                    {pendingDeleteProduct.nameEn || pendingDeleteProduct.name}
                    {(pendingDeleteProduct.nameBn || pendingDeleteProduct.name) &&
                    pendingDeleteProduct.nameEn
                      ? ` (${pendingDeleteProduct.nameBn || pendingDeleteProduct.name})`
                      : ''}
                  </strong>
                  . This action cannot be undone.
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
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingProduct}
                onClick={() => void confirmPermanentDelete()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
              >
                {deletingProduct && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Delete Permanently</span>
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
const CATEGORY_ICON_PRESETS = [
  '🎂',
  '🍰',
  '🥖',
  '🥐',
  '🍪',
  '🍮',
  '🍯',
  '🍔',
  '🥟',
  '🧁',
  '🍩',
  '✨',
] as const;

function normalizeCategoryCompare(value: string | undefined | null): string {
  return (value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function AdminCategoriesPanel() {
  const {
    allCategories,
    allProducts,
    allShowrooms,
    allHeroBanners,
    mediaItems,
    siteSettings,
    seoSettings,
    staffRole,
    hasPermission,
    logAdminActivity,
    refreshStoreData,
    refreshingStoreData,
  } = useStore();
  const [editing, setEditing] = useState<Category | null>(null);
  const [originalCategoryImage, setOriginalCategoryImage] = useState<string>('');
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const isNew = formMode === 'create';
  const [catSaving, setCatSaving] = useState(false);
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [catUploading, setCatUploading] = useState(false);
  const [catUploadPct, setCatUploadPct] = useState<number | null>(null);
  const [catPreviewUrl, setCatPreviewUrl] = useState<string | null>(null);
  const [pendingDeleteCat, setPendingDeleteCat] = useState<Category | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const pendingDeleteLinkedCount = useMemo(() => {
    if (!pendingDeleteCat) return 0;
    return allProducts.filter(
      (p) =>
        !p.deleted &&
        (p.category === pendingDeleteCat.slug || p.categorySlug === pendingDeleteCat.slug)
    ).length;
  }, [allProducts, pendingDeleteCat]);

  const startNew = () => {
    setFormMode('create');
    setOriginalCategoryImage('');
    setMsg(null);
    setEditing({
      id: `cat-${Date.now()}`,
      name: '',
      nameEn: '',
      name_bn: '',
      name_en: '',
      slug: '',
      icon: '',
      description: '',
      descriptionEn: '',
      description_bn: '',
      description_en: '',
      image: '/src/assets/images/hero_bakery_clean_1794746110066.jpg',
      order: allCategories.length + 1,
      visible: true,
      active: true,
      deleted: false,
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
    let authSession: VerifiedWriteSession | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
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
        text: 'ছবি সফলভাবে যুক্ত হয়েছে। স্থায়ী করতে "Save Category" বাটনে ক্লিক করুন।',
      });
    } catch (err) {
      setMsg({
        type: 'error',
        text:
          err instanceof CatalogAuthError
            ? mapCatalogSaveError(err, 'category_upload_auth', {
                collection: 'categories',
                documentId: editing.id,
                staffRole,
                authSession,
              })
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
    if (!editing || catSaving) return;

    const rawNameEn = editing.nameEn.trim().slice(0, 120);
    const rawNameBn = editing.name.trim().slice(0, 120);
    if (!rawNameEn && !rawNameBn) {
      setMsg({
        type: 'error',
        text: 'Category could not be saved. Please enter a Category Name (English or বাংলা).',
      });
      return;
    }
    const nameEn = rawNameEn || rawNameBn;
    const nameBn = rawNameBn || rawNameEn;

    if (catUploading) {
      setMsg({ type: 'error', text: 'ছবি আপলোড সম্পন্ন হওয়া পর্যন্ত অনুগ্রহ করে অপেক্ষা করুন।' });
      return;
    }
    if (isForbiddenInlineImageUrl(editing.image)) {
      setMsg({
        type: 'error',
        text: 'অবৈধ ছবির ফরম্যাট পাওয়া গেছে। অনুগ্রহ করে ছবিটি পুনরায় আপলোড করুন।',
      });
      return;
    }

    const slug = toSlug(editing.slug.trim() || nameEn || nameBn);
    if (!/^[a-z0-9-]{1,160}$/.test(slug)) {
      setMsg({
        type: 'error',
        text: 'Category could not be saved. Invalid category slug generated.',
      });
      return;
    }

    const duplicate = allCategories.find((cat) => {
      if (cat.deleted) return false;
      if (!isNew && cat.id === editing.id) return false;
      const existingEn = normalizeCategoryCompare(cat.nameEn || cat.name_en);
      const existingBn = normalizeCategoryCompare(cat.name || cat.name_bn);
      const candidateEn = normalizeCategoryCompare(nameEn);
      const candidateBn = normalizeCategoryCompare(nameBn);
      return (
        cat.slug === slug ||
        (candidateEn.length > 0 && existingEn === candidateEn) ||
        (candidateBn.length > 0 && existingBn === candidateBn)
      );
    });
    if (duplicate) {
      setMsg({
        type: 'error',
        text: `Category could not be saved. A category matching "${duplicate.nameEn || duplicate.name}" (${duplicate.slug}) already exists.`,
      });
      return;
    }

    const descEn = (editing.descriptionEn ?? '').trim().slice(0, 600);
    const descBn = (editing.description.trim() || descEn || nameBn || nameEn).slice(0, 600);
    const iconVal = (editing.icon ?? '').trim().slice(0, 40);
    const rawOrder = Number(editing.order);
    const safeOrder = Number.isFinite(rawOrder)
      ? Math.min(1000, Math.max(0, Math.round(rawOrder)))
      : 1;
    const isVisible = editing.visible !== false && editing.active !== false;

    setCatSaving(true);
    setMsg(null);
    let authSession: VerifiedWriteSession | null = null;
    let targetDocId = editing.id;

    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'categories_manage',
      });
      const firestore = requireDb();

      if (isNew) {
        const rawCandidate = slug.startsWith('cat-') ? slug : `cat-${slug}`;
        const cleanCandidate = rawCandidate.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
        const existingIds = new Set(allCategories.map((c) => c.id));
        if (
          cleanCandidate &&
          /^[a-zA-Z0-9_-]{1,128}$/.test(cleanCandidate) &&
          !existingIds.has(cleanCandidate)
        ) {
          targetDocId = cleanCandidate;
        } else {
          targetDocId = /^[a-zA-Z0-9_-]{1,128}$/.test(editing.id)
            ? editing.id
            : `cat-${Date.now()}`;
        }
      }

      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(targetDocId)) {
        throw new CatalogAuthError(
          'validation/invalid-category-id',
          'Generated category document ID is invalid.'
        );
      }

      let catRef = doc(firestore, 'categories', targetDocId);
      let existingSnap = await fetchDocFromServer(catRef);

      if (isNew && existingSnap.exists()) {
        targetDocId = `${targetDocId.slice(0, 110)}-${Date.now().toString(36)}`;
        catRef = doc(firestore, 'categories', targetDocId);
        existingSnap = await fetchDocFromServer(catRef);
        if (existingSnap.exists()) {
          throw new Error('A category with this ID already exists. Please retry.');
        }
      }

      if (!isNew && !existingSnap.exists()) {
        throw new CatalogAuthError(
          'not-found',
          `ক্যাটাগরি ডকুমেন্ট ("categories/${targetDocId}") Firestore-এ পাওয়া যায়নি। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।`
        );
      }

      const existingData = existingSnap.exists()
        ? (existingSnap.data() as Record<string, unknown>)
        : undefined;
      const preservedValidId =
        existingData &&
        typeof existingData.id === 'string' &&
        /^[a-zA-Z0-9_-]{1,128}$/.test(existingData.id)
          ? existingData.id
          : targetDocId;
      const nextImage = (
        editing.image || '/src/assets/images/hero_bakery_clean_1794746110066.jpg'
      ).trim();

      const payload: Record<string, unknown> = {
        id: preservedValidId,
        name: nameBn,
        nameEn,
        name_bn: nameBn,
        name_en: nameEn,
        slug,
        icon: iconVal,
        description: descBn,
        descriptionEn: descEn,
        description_bn: descBn,
        description_en: descEn,
        image: nextImage,
        order: safeOrder,
        visible: isVisible,
        active: isVisible,
        deleted: Boolean(editing.deleted),
        updatedAt: serverTimestamp(),
      };

      if (isNew) {
        await setDoc(catRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await logAdminActivity('create', 'categories', targetDocId, nameEn);
      } else {
        const updatePayload: Record<string, unknown> = {
          ...payload,
          createdAt: hasValidTimestamp(existingData?.createdAt)
            ? existingData!.createdAt
            : serverTimestamp(),
        };
        for (const unknownKey of getUnknownKeys(existingData!, ALLOWED_CATEGORY_KEYS)) {
          updatePayload[unknownKey] = deleteField();
        }
        await updateDoc(catRef, updatePayload);
        await logAdminActivity('update', 'categories', targetDocId, nameEn);

        const prevImg = originalCategoryImage || (typeof existingData?.image === 'string' ? existingData.image : '');
        if (prevImg && prevImg !== nextImage && isR2ImageUrl(prevImg)) {
          await safeDeleteUnreferencedR2Urls({
            urls: [prevImg],
            exclude: { collection: 'categories', docId: targetDocId },
            snapshot: {
              allProducts,
              allCategories,
              allShowrooms,
              allHeroBanners,
              mediaItems,
              siteSettings,
              seoSettings,
            },
          });
        }
      }
      setEditing(null);
      setOriginalCategoryImage('');
      setFormMode('create');
      setMsg({ type: 'success', text: 'ক্যাটাগরি সফলভাবে সংরক্ষণ হয়েছে।' });
    } catch (err) {
      setMsg({
        type: 'error',
        text: mapCatalogSaveError(err, 'category_save', {
          collection: 'categories',
          documentId: targetDocId,
          path: `categories/${targetDocId}`,
          operation: isNew ? 'CREATE' : 'UPDATE',
          staffRole,
          authSession,
        }),
      });
      if (import.meta.env.DEV) {
        try {
          handleFirestoreError(err, OperationType.WRITE, `categories/${targetDocId}`);
        } catch {
          // Logged for console diagnostics
        }
      }
    } finally {
      setCatSaving(false);
    }
  };

  const toggleCategoryVisibility = async (cat: Category) => {
    if (busyCategoryId) return;
    setBusyCategoryId(cat.id);
    setMsg(null);
    let authSession: VerifiedWriteSession | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'categories_manage',
      });
      const firestore = requireDb();
      const catRef = doc(firestore, 'categories', cat.id);
      const existingSnap = await fetchDocFromServer(catRef);
      if (!existingSnap.exists()) {
        throw new AdminAuthError(
          'not-found',
          `ক্যাটাগরি ("categories/${cat.id}") Firestore-এ পাওয়া যায়নি। রিফ্রেশ করে চেষ্টা করুন।`
        );
      }
      const existingData = existingSnap.data() as Record<string, unknown>;
      const currentlyVisible = cat.visible !== false && cat.active !== false;
      const nextVisible = !currentlyVisible;
      if (isExistingCategoryDocRuleReady(existingData)) {
        await updateDoc(catRef, {
          visible: nextVisible,
          active: nextVisible,
          updatedAt: serverTimestamp(),
        });
      } else {
        const ct = getCategoryText(cat);
        const preservedValidId =
          typeof existingData.id === 'string' &&
          /^[a-zA-Z0-9_-]{1,128}$/.test(existingData.id)
            ? existingData.id
            : cat.id;
        const fullCatPayload: Record<string, unknown> = {
          id: preservedValidId,
          name: ct.nameBn.slice(0, 120),
          nameEn: (ct.nameEn || ct.nameBn).slice(0, 120),
          name_bn: ct.nameBn.slice(0, 120),
          name_en: (ct.nameEn || ct.nameBn).slice(0, 120),
          slug: toSlug(cat.slug || ct.nameEn || ct.nameBn),
          icon: (cat.icon ?? '').trim().slice(0, 40),
          description: (ct.descriptionBn || ct.nameBn || ct.nameEn).slice(0, 600),
          descriptionEn: ct.descriptionEn.slice(0, 600),
          description_bn: (ct.descriptionBn || ct.nameBn || ct.nameEn).slice(0, 600),
          description_en: ct.descriptionEn.slice(0, 600),
          image: cat.image || '/src/assets/images/hero_bakery_clean_1794746110066.jpg',
          order: Math.min(1000, Math.max(0, Math.round(Number(cat.order) || 1))),
          visible: nextVisible,
          active: nextVisible,
          deleted: Boolean(cat.deleted),
          createdAt: hasValidTimestamp(existingData.createdAt)
            ? existingData.createdAt
            : serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        for (const unknownKey of getUnknownKeys(existingData, ALLOWED_CATEGORY_KEYS)) {
          fullCatPayload[unknownKey] = deleteField();
        }
        await updateDoc(catRef, fullCatPayload);
      }
      await logAdminActivity(
        nextVisible ? 'show' : 'hide',
        'categories',
        cat.id,
        cat.nameEn || cat.name
      );
      setMsg({
        type: 'success',
        text: `"${cat.nameEn || cat.name}" এখন ${nextVisible ? 'Visible' : 'Hidden'}।`,
      });
    } catch (err) {
      setMsg({
        type: 'error',
        text: mapCatalogSaveError(err, 'category_visibility', {
          collection: 'categories',
          documentId: cat.id,
          path: `categories/${cat.id}`,
          operation: 'UPDATE',
          staffRole,
          authSession,
        }),
      });
    } finally {
      setBusyCategoryId(null);
    }
  };

  const removeCategory = async (cat: Category) => {
    if (busyCategoryId) return;
    setBusyCategoryId(cat.id);
    setMsg(null);
    let authSession: VerifiedWriteSession | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'categories_manage',
      });
      const firestore = requireDb();
      const catRef = doc(firestore, 'categories', cat.id);
      const existingSnap = await fetchDocFromServer(catRef);
      if (!existingSnap.exists()) {
        throw new AdminAuthError(
          'not-found',
          `ক্যাটাগরি ("categories/${cat.id}") ইতিমধ্যে ডিলিট হয়ে গেছে বা Firestore-এ নেই।`
        );
      }
      const existingImg =
        typeof existingSnap.data()?.image === 'string'
          ? (existingSnap.data().image as string)
          : cat.image;
      await deleteDoc(catRef);
      if (existingImg && isR2ImageUrl(existingImg)) {
        await safeDeleteUnreferencedR2Urls({
          urls: [existingImg],
          exclude: { collection: 'categories', docId: cat.id },
          snapshot: {
            allProducts,
            allCategories,
            allShowrooms,
            allHeroBanners,
            mediaItems,
            siteSettings,
            seoSettings,
          },
        });
      }
      await logAdminActivity('delete', 'categories', cat.id, cat.nameEn || cat.name);
      if (editing?.id === cat.id) {
        setEditing(null);
        setOriginalCategoryImage('');
      }
      setMsg({ type: 'success', text: 'ক্যাটাগরি স্থায়ীভাবে ডিলিট করা হয়েছে।' });
    } catch (err) {
      setMsg({
        type: 'error',
        text: mapCatalogSaveError(err, 'category_delete', {
          collection: 'categories',
          documentId: cat.id,
          path: `categories/${cat.id}`,
          operation: 'DELETE',
          staffRole,
          authSession,
        }),
      });
    } finally {
      setBusyCategoryId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Category Management
          </h2>
          <p className="text-xs text-[#57534E]">
            Add or edit English &amp; Bengali category titles, optional icons, descriptions, active visibility, and sort order.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshStoreData()}
            disabled={refreshingStoreData}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshingStoreData ? 'animate-spin' : ''}`} />
            <span>{refreshingStoreData ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            onClick={startNew}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
          >
            <Plus className="h-4 w-4" />
            <span>Add Category</span>
          </button>
        </div>
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
            <label className="mb-1 block text-xs font-semibold">Name (English) *</label>
            <input
              type="text"
              maxLength={120}
              value={editing.nameEn}
              onChange={(e) =>
                setEditing({ ...editing, nameEn: e.target.value, name_en: e.target.value })
              }
              placeholder="e.g. Customized Cakes"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Name (বাংলা)</label>
            <input
              type="text"
              maxLength={120}
              value={editing.name}
              onChange={(e) =>
                setEditing({ ...editing, name: e.target.value, name_bn: e.target.value })
              }
              placeholder="যেমন: কাস্টমাইজ কেক"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Display Order</label>
            <input
              type="number"
              min={0}
              max={1000}
              value={editing.order}
              onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              Category Icon (Optional)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={40}
                value={editing.icon ?? ''}
                onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                placeholder="e.g. 🍰 or leave blank"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
              {editing.icon && (
                <button
                  type="button"
                  onClick={() => setEditing({ ...editing, icon: '' })}
                  className="shrink-0 cursor-pointer rounded-lg border border-[#D6D3D1] px-2.5 py-2 text-xs font-semibold text-[#57534E] hover:border-[#1C1917] hover:text-[#1C1917]"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {CATEGORY_ICON_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setEditing({ ...editing, icon: preset })}
                  className={`cursor-pointer rounded border px-1.5 py-0.5 text-xs transition-colors ${
                    editing.icon === preset
                      ? 'border-[#DC1F26] bg-red-50'
                      : 'border-[#E7E5E4] bg-[#FAFAF8] hover:border-[#1C1917]'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              Description (English)
            </label>
            <textarea
              rows={2}
              maxLength={600}
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
          <div>
            <label className="mb-1 block text-xs font-semibold">Description (বাংলা)</label>
            <textarea
              rows={2}
              maxLength={600}
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
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold">
              Category Image (JPG, PNG, WEBP, or GIF · Max 5 MB)
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
                    ? `Uploading ${catUploadPct ?? 0}%`
                    : 'Choose Image'}
                </span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
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
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold sm:col-span-2">
            <input
              type="checkbox"
              checked={editing.visible !== false && editing.active !== false}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  visible: e.target.checked,
                  active: e.target.checked,
                })
              }
            />
            <span>Active &amp; Visible on Storefront</span>
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              disabled={catSaving || catUploading}
              onClick={() => {
                setEditing(null);
                setOriginalCategoryImage('');
              }}
              className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={catSaving || catUploading}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#DC1F26] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
            >
              {catSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{catSaving ? 'Saving...' : 'Save Category'}</span>
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {allCategories.map((cat) => {
          const ct = getCategoryText(cat);
          const namePair = resolveBilingualPair(ct.nameEn, ct.nameBn);
          const descPair = resolveBilingualPair(ct.descriptionEn, ct.descriptionBn);
          const isCatVisible = cat.visible !== false && cat.active !== false;
          const isBusy = busyCategoryId === cat.id;
          return (
            <div
              key={cat.id}
              className={`flex flex-col overflow-hidden rounded-xl border bg-white ${
                !isCatVisible ? 'border-amber-300 opacity-75' : 'border-[#E7E5E4]'
              }`}
            >
              <img
                src={resolveAssetUrl(cat.image)}
                alt={namePair.primary}
                className="aspect-[16/9] w-full object-cover"
              />
              <div className="flex flex-1 flex-col justify-between p-4">
                <div>
                  <div className="flex items-center justify-between text-xs text-[#78716C]">
                    <span className="tabular-nums">Order #{cat.order}</span>
                    <span>{!isCatVisible ? 'Hidden / Inactive' : cat.slug}</span>
                  </div>
                  <h3 className="font-display mt-1 flex items-center gap-1.5 text-xl font-bold text-[#1C1917]">
                    {cat.icon && <span aria-hidden="true">{cat.icon}</span>}
                    <span>{namePair.primary}</span>
                  </h3>
                  {namePair.secondaryBn && (
                    <p className="font-bn text-xs font-medium text-[#78716C]">
                      {namePair.secondaryBn}
                    </p>
                  )}
                  {descPair.primary && (
                    <p className="mt-1.5 text-xs text-[#57534E]">{descPair.primary}</p>
                  )}
                  {descPair.secondaryBn && (
                    <p className="font-bn mt-0.5 text-[11px] text-[#78716C]">
                      {descPair.secondaryBn}
                    </p>
                  )}
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t border-[#F5F4F0] pt-3">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => toggleCategoryVisibility(cat)}
                    className="cursor-pointer rounded-md border border-[#E7E5E4] px-2.5 py-1 text-xs font-medium text-[#57534E] disabled:opacity-50"
                  >
                    {!isCatVisible ? 'Show' : 'Hide'}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setFormMode('edit');
                      setOriginalCategoryImage(cat.image || '');
                      setMsg(null);
                      setEditing({
                        ...cat,
                        name: ct.nameBn,
                        nameEn: ct.nameEn,
                        name_bn: ct.nameBn,
                        name_en: ct.nameEn,
                        icon: cat.icon ?? '',
                        description: ct.descriptionBn,
                        descriptionEn: ct.descriptionEn,
                        description_bn: ct.descriptionBn,
                        description_en: ct.descriptionEn,
                        visible: isCatVisible,
                        active: isCatVisible,
                      });
                    }}
                    className="cursor-pointer rounded-md border border-[#E7E5E4] px-3 py-1 text-xs font-medium hover:border-[#DC1F26] disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setPendingDeleteCat(cat)}
                    className="cursor-pointer rounded-md border border-[#E7E5E4] px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
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
              Delete Category?
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[#57534E]">
              You are about to permanently remove{' '}
              <strong className="text-[#1C1917]">
                {pendingDeleteCat.nameEn || pendingDeleteCat.name}
              </strong>
              .
              {pendingDeleteLinkedCount > 0 && (
                <span className="mt-2 block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-semibold text-amber-900">
                  সতর্কতা: বর্তমানে {pendingDeleteLinkedCount}টি পণ্য এই ক্যাটাগরির সাথে যুক্ত আছে। ডিলিট করার আগে পণ্যগুলোর ক্যাটাগরি আপডেট করা ভালো।
                </span>
              )}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busyCategoryId === pendingDeleteCat.id}
                onClick={() => setPendingDeleteCat(null)}
                className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#1C1917]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyCategoryId === pendingDeleteCat.id}
                onClick={() => {
                  const target = pendingDeleteCat;
                  setPendingDeleteCat(null);
                  void removeCategory(target);
                }}
                className="cursor-pointer rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
              >
                Delete Category
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
  const {
    allOccasions,
    allCategories,
    allProducts,
    staffRole,
    hasPermission,
    logAdminActivity,
    refreshStoreData,
    refreshingStoreData,
  } = useStore();
  const [editing, setEditing] = useState<Occasion | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const isNew = formMode === 'create';
  const [savingOccasion, setSavingOccasion] = useState(false);
  const [deletingOccId, setDeletingOccId] = useState<string | null>(null);
  const [togglingProdId, setTogglingProdId] = useState<string | null>(null);
  const [pendingDeleteOcc, setPendingDeleteOcc] = useState<Occasion | null>(null);
  const [assigningSlug, setAssigningSlug] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const pendingDeleteLinkedCount = useMemo(() => {
    if (!pendingDeleteOcc) return 0;
    return allProducts.filter(
      (p) => !p.deleted && Array.isArray(p.occasions) && p.occasions.includes(pendingDeleteOcc.slug)
    ).length;
  }, [allProducts, pendingDeleteOcc]);

  const saveOccasion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || savingOccasion) return;

    const nameBn = editing.name.trim().slice(0, 120);
    const nameEn = editing.nameEn.trim().slice(0, 120);
    if (!nameBn) {
      setMsg({ type: 'error', text: 'অনুগ্রহ করে বাংলা নাম দিন।' });
      return;
    }
    if (!nameEn) {
      setMsg({ type: 'error', text: 'অনুগ্রহ করে English Name দিন।' });
      return;
    }

    const slug = toSlug(editing.slug.trim() || nameEn || nameBn);
    if (!/^[a-z0-9-]{1,160}$/.test(slug)) {
      setMsg({ type: 'error', text: 'উপলক্ষের slug সঠিক নয়। অনুগ্রহ করে নাম যাচাই করুন।' });
      return;
    }

    const duplicate = allOccasions.find((occ) => {
      if (occ.deleted) return false;
      if (!isNew && occ.id === editing.id) return false;
      return occ.slug === slug;
    });
    if (duplicate) {
      setMsg({
        type: 'error',
        text: `এই slug ("${slug}") ইতিমধ্যে "${duplicate.nameEn || duplicate.name}"-এ ব্যবহৃত হচ্ছে।`,
      });
      return;
    }

    const descEn = (editing.descriptionEn ?? '').trim().slice(0, 600);
    const descBn = (editing.description.trim() || descEn || nameBn).slice(0, 600);
    const rawOrder = Number(editing.order);
    const safeOrder = Number.isFinite(rawOrder)
      ? Math.min(1000, Math.max(0, Math.round(rawOrder)))
      : 1;

    setSavingOccasion(true);
    setMsg(null);
    let authSession: VerifiedWriteSession | null = null;
    let targetDocId = editing.id;

    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'categories_manage',
      });
      const firestore = requireDb();

      if (isNew) {
        const candidate = `occ-${slug}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
        const existingIds = new Set(allOccasions.map((o) => o.id));
        if (candidate && /^[a-zA-Z0-9_-]{1,128}$/.test(candidate) && !existingIds.has(candidate)) {
          targetDocId = candidate;
        }
      }

      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(targetDocId)) {
        throw new CatalogAuthError(
          'validation/invalid-occasion-id',
          'উপলক্ষ ডকুমেন্ট আইডি সঠিক নয়।'
        );
      }

      let occRef = doc(firestore, 'occasions', targetDocId);
      let existingSnap = await fetchDocFromServer(occRef);

      if (isNew && existingSnap.exists()) {
        targetDocId = `${targetDocId.slice(0, 110)}-${Date.now().toString(36)}`;
        occRef = doc(firestore, 'occasions', targetDocId);
        existingSnap = await fetchDocFromServer(occRef);
        if (existingSnap.exists()) {
          throw new Error('এই আইডির উপলক্ষ ইতিমধ্যে বিদ্যমান। অনুগ্রহ করে আবার চেষ্টা করুন।');
        }
      }

      if (!isNew && !existingSnap.exists()) {
        throw new CatalogAuthError(
          'not-found',
          `উপলক্ষ ডকুমেন্ট ("occasions/${targetDocId}") Firestore-এ পাওয়া যায়নি। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।`
        );
      }

      const existingData = existingSnap.exists()
        ? (existingSnap.data() as Record<string, unknown>)
        : undefined;
      const preservedValidId =
        existingData &&
        typeof existingData.id === 'string' &&
        /^[a-zA-Z0-9_-]{1,128}$/.test(existingData.id)
          ? existingData.id
          : targetDocId;

      const payload = {
        id: preservedValidId,
        name: nameBn,
        nameEn,
        name_bn: nameBn,
        name_en: nameEn,
        slug,
        icon: (editing.icon ?? '').trim().slice(0, 40),
        description: descBn,
        descriptionEn: descEn,
        description_bn: descBn,
        description_en: descEn,
        order: safeOrder,
        visible: editing.visible !== false,
        deleted: Boolean(editing.deleted),
        updatedAt: serverTimestamp(),
      };

      if (isNew) {
        await setDoc(occRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await logAdminActivity('create', 'occasions', targetDocId, nameEn);
      } else {
        await updateDoc(
          occRef,
          hasValidTimestamp(existingData?.createdAt)
            ? payload
            : { ...payload, createdAt: serverTimestamp() }
        );
        await logAdminActivity('update', 'occasions', targetDocId, nameEn);
      }
      setEditing(null);
      setFormMode('create');
      setMsg({ type: 'success', text: 'উপলক্ষ সফলভাবে সেভ হয়েছে।' });
    } catch (err) {
      setMsg({
        type: 'error',
        text: mapCatalogSaveError(err, 'occasion_save', {
          collection: 'occasions',
          documentId: targetDocId,
          path: `occasions/${targetDocId}`,
          operation: isNew ? 'CREATE' : 'UPDATE',
          staffRole,
          authSession,
        }),
      });
    } finally {
      setSavingOccasion(false);
    }
  };

  const confirmDeleteOccasion = async (occ: Occasion) => {
    setDeletingOccId(occ.id);
    setMsg(null);
    let authSession: VerifiedWriteSession | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'categories_manage',
      });
      const firestore = requireDb();
      const occRef = doc(firestore, 'occasions', occ.id);
      const existingSnap = await fetchDocFromServer(occRef);
      if (!existingSnap.exists()) {
        throw new CatalogAuthError(
          'not-found',
          `উপলক্ষ ডকুমেন্ট ("occasions/${occ.id}") ইতিমধ্যে ডিলিট হয়েছে বা Firestore-এ নেই।`
        );
      }
      await deleteDoc(occRef);
      await logAdminActivity('delete', 'occasions', occ.id, occ.nameEn || occ.name);
      if (editing?.id === occ.id) {
        setEditing(null);
      }
      setMsg({ type: 'success', text: 'উপলক্ষ স্থায়ীভাবে ডিলিট করা হয়েছে।' });
    } catch (err) {
      setMsg({
        type: 'error',
        text: mapCatalogSaveError(err, 'occasion_delete', {
          collection: 'occasions',
          documentId: occ.id,
          path: `occasions/${occ.id}`,
          operation: 'DELETE',
          staffRole,
          authSession,
        }),
      });
    } finally {
      setDeletingOccId(null);
    }
  };

  const toggleProductOccasion = async (product: Product, occSlug: string) => {
    if (togglingProdId) return;
    setTogglingProdId(product.id);
    setMsg(null);
    const has = product.occasions.includes(occSlug);
    const next = (
      has ? product.occasions.filter((o) => o !== occSlug) : [...product.occasions, occSlug]
    ).slice(0, 15);
    let authSession: VerifiedWriteSession | null = null;
    let existingIssues: string[] = [];
    const preflightIssues: string[] = [];
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'products_edit',
      });
      const firestore = requireDb();
      const prodRef = doc(firestore, 'products', product.id);
      const existingSnap = await fetchDocFromServer(prodRef);
      if (!existingSnap.exists()) {
        throw new AdminAuthError(
          'not-found',
          `পণ্যটি ("products/${product.id}") Firestore-এ পাওয়া যায়নি।`
        );
      }
      const existingData = existingSnap.data() as Record<string, unknown>;
      existingIssues = inspectExistingProductIssues(existingData);
      const cleanImages = sanitizeStoredImageUrls(
        Array.isArray(existingData.images) && existingData.images.length > 0
          ? existingData.images
          : Array.isArray(product.images) && product.images.length > 0
          ? product.images
          : product.image
          ? [product.image]
          : []
      );
      const ingList = Array.isArray(existingData.ingredients)
        ? (existingData.ingredients as string[])
        : Array.isArray(product.ingredients)
        ? product.ingredients
        : [];
      const szList = Array.isArray(existingData.sizes)
        ? (existingData.sizes as string[])
        : Array.isArray(product.sizes)
        ? product.sizes
        : [];

      const updatePayload = isExistingProductDocRuleReady(existingData)
        ? {
            occasions: next,
            updatedBy: authSession.uid.slice(0, 254),
            updatedAt: serverTimestamp(),
          }
        : buildPartialProductUpdatePayload({
            draft: { ...product, occasions: next },
            original: product,
            allCategories,
            existingData,
            ingredientsList: ingList,
            sizesList: szList,
            cleanImages,
            actorUid: authSession.uid,
          });

      assertValidProductWritePreflight(
        {
          docId: prodRef.id,
          payload: updatePayload,
          existingData,
          isCreate: false,
        },
        preflightIssues
      );

      await updateDoc(prodRef, updatePayload);
      await logAdminActivity(
        'update',
        'products',
        product.id,
        product.nameEn || product.name,
        `${has ? 'Unassigned' : 'Assigned'} occasion ${occSlug}`
      );
    } catch (err) {
      setMsg({
        type: 'error',
        text: mapCatalogSaveError(err, 'occasion_product_toggle', {
          collection: 'products',
          documentId: product.id,
          path: `products/${product.id}`,
          operation: 'UPDATE',
          staffRole,
          existingIssues,
          preflightIssues,
          authSession,
        }),
      });
    } finally {
      setTogglingProdId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Occasion Management
          </h2>
          <p className="text-xs text-[#57534E]">
            Manage occasions in English and Bengali and assign matching catalog products.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshStoreData()}
            disabled={refreshingStoreData}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshingStoreData ? 'animate-spin' : ''}`} />
            <span>{refreshingStoreData ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFormMode('create');
              setMsg(null);
              setEditing({
                id: `occ-${Date.now()}`,
                name: '',
                nameEn: '',
                name_bn: '',
                name_en: '',
                slug: '',
                icon: '',
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
            <span>Add Occasion</span>
          </button>
        </div>
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
          onSubmit={saveOccasion}
          className="grid grid-cols-1 gap-4 rounded-xl border border-[#D6D3D1] bg-white p-5 sm:grid-cols-3"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold">Icon Label (Optional)</label>
            <input
              type="text"
              maxLength={40}
              value={editing.icon}
              onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Name (বাংলা) *</label>
            <input
              type="text"
              maxLength={120}
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
              maxLength={120}
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
                maxLength={600}
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
                maxLength={600}
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
              disabled={savingOccasion}
              onClick={() => setEditing(null)}
              className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingOccasion}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#DC1F26] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
            >
              {savingOccasion && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{savingOccasion ? 'Saving...' : 'Save Occasion'}</span>
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {allOccasions.map((occ) => {
          const ot = getOccasionText(occ);
          const namePair = resolveBilingualPair(ot.nameEn, ot.nameBn);
          const descPair = resolveBilingualPair(ot.descriptionEn, ot.descriptionBn);
          const matchedCount = allProducts.filter((p) => p.occasions.includes(occ.slug)).length;
          const isDeleting = deletingOccId === occ.id;
          return (
            <div
              key={occ.id}
              className="rounded-xl border border-[#E7E5E4] bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-bold text-[#1C1917]">
                    {namePair.primary}
                  </h3>
                  {namePair.secondaryBn && (
                    <p className="font-bn text-xs font-medium text-[#78716C]">
                      {namePair.secondaryBn}
                    </p>
                  )}
                  {descPair.primary && (
                    <p className="mt-1 text-xs text-[#57534E]">{descPair.primary}</p>
                  )}
                  {descPair.secondaryBn && (
                    <p className="font-bn mt-0.5 text-[11px] text-[#78716C]">
                      {descPair.secondaryBn}
                    </p>
                  )}
                  <p className="mt-2 font-mono tabular-nums text-[11px] text-[#DC1F26]">
                    {matchedCount} products assigned
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() =>
                      setAssigningSlug(assigningSlug === occ.slug ? null : occ.slug)
                    }
                    className="cursor-pointer rounded-md border border-[#E7E5E4] px-2.5 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26] disabled:opacity-50"
                  >
                    Assign Products
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => {
                      setFormMode('edit');
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
                    className="cursor-pointer rounded-md border border-[#E7E5E4] p-1 text-[#57534E] disabled:opacity-50"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => setPendingDeleteOcc(occ)}
                    className="cursor-pointer rounded-md border border-[#E7E5E4] p-1 text-red-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {assigningSlug === occ.slug && (
                <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto border-t border-[#F5F4F0] pt-3">
                  {allProducts.map((prod) => {
                    const checked = prod.occasions.includes(occ.slug);
                    const prodPair = resolveBilingualPair(prod.nameEn, prod.name);
                    return (
                      <button
                        key={prod.id}
                        type="button"
                        disabled={togglingProdId === prod.id}
                        onClick={() => void toggleProductOccasion(prod, occ.slug)}
                        className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-[#FAFAF8] disabled:opacity-50"
                      >
                        <span className="text-[#1C1917]">
                          {prodPair.primary}
                          {prodPair.secondaryBn ? ` (${prodPair.secondaryBn})` : ''}
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

      {pendingDeleteOcc && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E7E5E4] bg-white p-6 shadow-xl">
            <h3 className="font-display text-xl font-bold text-[#1C1917]">
              Delete Occasion?
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[#57534E]">
              You are about to permanently remove{' '}
              <strong className="text-[#1C1917]">
                {pendingDeleteOcc.nameEn || pendingDeleteOcc.name}
              </strong>
              .
              {pendingDeleteLinkedCount > 0 && (
                <span className="mt-2 block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-semibold text-amber-900">
                  সতর্কতা: বর্তমানে {pendingDeleteLinkedCount}টি পণ্য এই উপলক্ষের সাথে যুক্ত আছে।
                </span>
              )}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deletingOccId === pendingDeleteOcc.id}
                onClick={() => setPendingDeleteOcc(null)}
                className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#1C1917]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingOccId === pendingDeleteOcc.id}
                onClick={() => {
                  const target = pendingDeleteOcc;
                  setPendingDeleteOcc(null);
                  void confirmDeleteOccasion(target);
                }}
                className="cursor-pointer rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
              >
                Delete Occasion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================
// 4. SHOWROOM MANAGEMENT
// ========================
export function AdminShowroomsPanel() {
  const {
    allShowrooms,
    allProducts,
    allCategories,
    allHeroBanners,
    mediaItems,
    siteSettings,
    seoSettings,
    firestoreShowrooms,
    legacyDemoShowrooms,
    staffRole,
    hasPermission,
    logAdminActivity,
    refreshStoreData,
    refreshingStoreData,
  } = useStore();
  const [editing, setEditing] = useState<Showroom | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<Showroom | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [purgingDemoDocs, setPurgingDemoDocs] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [busyShowroomId, setBusyShowroomId] = useState<string | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<Showroom | null>(null);

  const firestoreOverrideIds = useMemo(
    () => new Set(firestoreShowrooms.map((s) => s.id)),
    [firestoreShowrooms]
  );
  const canonicalIds = useMemo(
    () => new Set(CANONICAL_OUTLET_SHOWROOMS.map((s) => s.id)),
    []
  );

  const linkedProductsCount = useMemo(() => {
    if (!confirmDeleteTarget) return 0;
    return allProducts.filter(
      (p) => !p.deleted && Array.isArray(p.showrooms) && p.showrooms.includes(confirmDeleteTarget.id)
    ).length;
  }, [allProducts, confirmDeleteTarget]);

  const managedShowrooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allShowrooms
      .filter((sr) => !sr.deleted && !isDemoOrDummyShowroom(sr))
      .filter((sr) => {
        if (regionFilter !== 'all' && (sr.region || '') !== regionFilter) {
          return false;
        }
        if (!q) return true;
        const hay = [
          sr.id,
          sr.name,
          sr.nameEn,
          sr.area,
          sr.areaEn,
          sr.address,
          sr.addressEn,
          sr.phone,
          sr.region,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
  }, [allShowrooms, search, regionFilter]);

  const generateUniqueShowroomSlugId = (nameEn: string, fallbackId: string): string => {
    const existingIds = new Set(allShowrooms.map((s) => s.id));
    const cleanAscii = nameEn
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100)
      .replace(/-+$/g, '');
    const base = cleanAscii || fallbackId;
    if (/^[a-zA-Z0-9_-]{1,128}$/.test(base) && !existingIds.has(base)) {
      return base;
    }
    for (let idx = 2; idx <= 25; idx += 1) {
      const candidate = `${base.slice(0, 118)}-${idx}`;
      if (!existingIds.has(candidate)) {
        return candidate;
      }
    }
    return `${base.slice(0, 110)}-${Date.now().toString(36)}`;
  };

  const buildShowroomFirestorePayload = (
    sr: Showroom,
    existingData?: Record<string, unknown>
  ): Record<string, unknown> => {
    const st = getShowroomText(sr);
    const nameEn = (sr.nameEn || '').trim() || (st.nameEn || '').trim() || (sr.name || '').trim();
    const nameBn = (sr.name || '').trim() || (st.nameBn || '').trim() || nameEn;
    const areaEn = (sr.areaEn || '').trim() || (st.areaEn || '').trim() || (sr.area || '').trim();
    const areaBn = (sr.area || '').trim() || (st.areaBn || '').trim() || areaEn || nameBn;
    const addressEn =
      (sr.addressEn || '').trim() || (st.addressEn || '').trim() || (sr.address || '').trim();
    const addressBn =
      (sr.address || '').trim() || (st.addressBn || '').trim() || addressEn || areaBn;
    const descEn = (sr.descriptionEn || '').trim() || (st.descriptionEn || '').trim();
    const descBn = (sr.description || '').trim() || (st.descriptionBn || '').trim() || descEn;
    const hoursEn = (sr.openingHoursEn || '').trim() || (st.openingHoursEn || '').trim();
    const hoursBn =
      (sr.openingHours || '').trim() ||
      (st.openingHoursBn || '').trim() ||
      hoursEn ||
      'শুক্র–শনিবার · সকাল ৮:০০টা – রাত ১০:০০টা';
    const rawLat = Number(sr.lat);
    const rawLng = Number(sr.lng);
    const safeLat = Number.isFinite(rawLat) && rawLat >= -90 && rawLat <= 90 ? rawLat : 0;
    const safeLng = Number.isFinite(rawLng) && rawLng >= -180 && rawLng <= 180 ? rawLng : 0;
    const hasCoords = safeLat !== 0 || safeLng !== 0;
    const safeMapUrl =
      (sr.mapUrl || '').trim() ||
      (hasCoords
        ? `https://maps.google.com/?q=${safeLat},${safeLng}`
        : `https://maps.google.com/?q=${encodeURIComponent(addressEn || addressBn || nameEn || sr.id)}`);

    const validImages = sanitizeStoredImageUrls(
      sr.images !== undefined ? sr.images : existingData?.images
    );

    const payload: Record<string, unknown> = {
      id: sr.id,
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
      phone: (sr.phone || '').trim().slice(0, 40),
      alternate_phone: (sr.alternate_phone || '').trim().slice(0, 40),
      email: (sr.email || '').trim().slice(0, 254),
      openingHours: hoursBn.slice(0, 160),
      openingHoursEn: hoursEn.slice(0, 160),
      opening_time: (sr.opening_time || '').trim().slice(0, 40),
      closing_time: (sr.closing_time || '').trim().slice(0, 40),
      weekly_holiday: (sr.weekly_holiday || '').trim().slice(0, 80),
      region: (sr.region || '').trim().slice(0, 100),
      orderLineEn: (sr.orderLineEn || '').trim().slice(0, 160),
      orderLineBn: (sr.orderLineBn || '').trim().slice(0, 160),
      mapUrl: safeMapUrl.slice(0, 1000),
      lat: safeLat,
      lng: safeLng,
      images: validImages,
      isMain: Boolean(sr.isMain),
      visible: sr.visible !== false,
      deleted: Boolean(sr.deleted),
      display_order: Math.min(
        1000,
        Math.max(0, Math.round(Number(sr.display_order) || 1))
      ),
      updatedAt: serverTimestamp(),
    };

    const availCats = sr.available_categories ?? existingData?.available_categories;
    if (isBoundedStringArray(availCats, 30, 80)) {
      payload.available_categories = availCats;
    }
    const availProds = sr.available_products ?? existingData?.available_products;
    if (isBoundedStringArray(availProds, 200, 128)) {
      payload.available_products = availProds;
    }
    const seoTitle = sr.seoTitle ?? (typeof existingData?.seoTitle === 'string' ? existingData.seoTitle : undefined);
    if (typeof seoTitle === 'string' && seoTitle.trim().length > 0 && seoTitle.length <= 200) {
      payload.seoTitle = seoTitle.trim();
    }
    const seoDesc =
      sr.seoDescription ??
      (typeof existingData?.seoDescription === 'string' ? existingData.seoDescription : undefined);
    if (typeof seoDesc === 'string' && seoDesc.trim().length > 0 && seoDesc.length <= 400) {
      payload.seoDescription = seoDesc.trim();
    }
    const archivedAt = sr.archivedAt ?? existingData?.archivedAt;
    if (
      hasValidTimestamp(archivedAt) ||
      (typeof archivedAt === 'string' && archivedAt.trim().length > 0 && archivedAt.length <= 80)
    ) {
      payload.archivedAt = archivedAt;
    }

    return payload;
  };

  const fetchShowroomServerSnap = (
    showroomRef: ReturnType<typeof doc>
  ) => fetchDocFromServer(showroomRef);

  const buildPartialShowroomUpdatePayload = (
    draft: Showroom,
    original: Showroom | null,
    existingData: Record<string, unknown>
  ): Record<string, unknown> => {
    const fullNormalized = buildShowroomFirestorePayload(draft, existingData);
    const updatePayload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };

    const trimStr = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const sameStringList = (a: unknown, b: unknown) => {
      const cleanA = sanitizeStoredImageUrls(a);
      const cleanB = sanitizeStoredImageUrls(b);
      return cleanA.length === cleanB.length && cleanA.every((item, idx) => item === cleanB[idx]);
    };

    if (!original) {
      Object.assign(updatePayload, fullNormalized);
      delete updatePayload.id;
    } else {
      if (trimStr(draft.nameEn) !== trimStr(original.nameEn)) {
        updatePayload.nameEn = fullNormalized.nameEn;
        updatePayload.name_en = fullNormalized.name_en;
      }
      if (trimStr(draft.name) !== trimStr(original.name)) {
        updatePayload.name = fullNormalized.name;
        updatePayload.name_bn = fullNormalized.name_bn;
      }
      if (trimStr(draft.areaEn) !== trimStr(original.areaEn)) {
        updatePayload.areaEn = fullNormalized.areaEn;
        if (!trimStr(draft.area)) {
          updatePayload.area = fullNormalized.area;
        }
      }
      if (trimStr(draft.area) !== trimStr(original.area)) {
        updatePayload.area = fullNormalized.area;
      }
      if (trimStr(draft.addressEn) !== trimStr(original.addressEn)) {
        updatePayload.addressEn = fullNormalized.addressEn;
        updatePayload.address_en = fullNormalized.address_en;
        if (!trimStr(draft.address)) {
          updatePayload.address = fullNormalized.address;
          updatePayload.address_bn = fullNormalized.address_bn;
        }
      }
      if (trimStr(draft.address) !== trimStr(original.address)) {
        updatePayload.address = fullNormalized.address;
        updatePayload.address_bn = fullNormalized.address_bn;
      }
      if (trimStr(draft.descriptionEn) !== trimStr(original.descriptionEn)) {
        updatePayload.descriptionEn = fullNormalized.descriptionEn;
        updatePayload.description_en = fullNormalized.description_en;
        updatePayload.description = fullNormalized.description;
        updatePayload.description_bn = fullNormalized.description_bn;
      }
      if (trimStr(draft.phone) !== trimStr(original.phone)) {
        updatePayload.phone = fullNormalized.phone;
      }
      if (trimStr(draft.alternate_phone) !== trimStr(original.alternate_phone)) {
        updatePayload.alternate_phone = fullNormalized.alternate_phone;
      }
      if (trimStr(draft.email) !== trimStr(original.email)) {
        updatePayload.email = fullNormalized.email;
      }
      if (trimStr(draft.openingHoursEn) !== trimStr(original.openingHoursEn)) {
        updatePayload.openingHoursEn = fullNormalized.openingHoursEn;
        if (!trimStr(draft.openingHours)) {
          updatePayload.openingHours = fullNormalized.openingHours;
        }
      }
      if (trimStr(draft.openingHours) !== trimStr(original.openingHours)) {
        updatePayload.openingHours = fullNormalized.openingHours;
      }
      if (trimStr(draft.orderLineEn) !== trimStr(original.orderLineEn)) {
        updatePayload.orderLineEn = fullNormalized.orderLineEn;
      }
      if (trimStr(draft.orderLineBn) !== trimStr(original.orderLineBn)) {
        updatePayload.orderLineBn = fullNormalized.orderLineBn;
      }
      if (trimStr(draft.region) !== trimStr(original.region)) {
        updatePayload.region = fullNormalized.region;
      }
      if (trimStr(draft.weekly_holiday) !== trimStr(original.weekly_holiday)) {
        updatePayload.weekly_holiday = fullNormalized.weekly_holiday;
      }
      if (trimStr(draft.mapUrl) !== trimStr(original.mapUrl)) {
        updatePayload.mapUrl = fullNormalized.mapUrl;
      }
      const origLat = Number(original.lat);
      const draftLat = Number(draft.lat);
      if ((Number.isFinite(draftLat) ? draftLat : 0) !== (Number.isFinite(origLat) ? origLat : 0)) {
        updatePayload.lat = fullNormalized.lat;
      }
      const origLng = Number(original.lng);
      const draftLng = Number(draft.lng);
      if ((Number.isFinite(draftLng) ? draftLng : 0) !== (Number.isFinite(origLng) ? origLng : 0)) {
        updatePayload.lng = fullNormalized.lng;
      }
      if (!sameStringList(draft.images, original.images)) {
        updatePayload.images = fullNormalized.images;
      }
      if (Boolean(draft.isMain) !== Boolean(original.isMain)) {
        updatePayload.isMain = fullNormalized.isMain;
      }
      if ((draft.visible !== false) !== (original.visible !== false)) {
        updatePayload.visible = fullNormalized.visible;
      }
      const origOrder = Math.min(1000, Math.max(0, Math.round(Number(original.display_order) || 1)));
      const draftOrder = Math.min(1000, Math.max(0, Math.round(Number(draft.display_order) || 1)));
      if (draftOrder !== origOrder) {
        updatePayload.display_order = fullNormalized.display_order;
      }
    }

    // Backfill only missing/invalid required or optional fields on legacy documents without overwriting valid fields
    const existingIssues = inspectExistingShowroomIssues(existingData);
    if (existingIssues.length > 0) {
      for (const reqKey of REQUIRED_SHOWROOM_SCHEMA_KEYS) {
        if (!(reqKey in existingData) || existingIssues.includes(`invalid_${reqKey}`)) {
          if (reqKey in fullNormalized) {
            updatePayload[reqKey] = fullNormalized[reqKey];
          }
        }
      }
      const optionalRepairKeys = [
        ...SHOWROOM_OPTIONAL_STRING_BOUNDS.map(([k]) => k),
        'images',
        'available_categories',
        'available_products',
        'visible',
        'deleted',
        'display_order',
        'archivedAt',
      ];
      for (const optKey of optionalRepairKeys) {
        const hasIssue =
          existingIssues.includes(`invalid_${optKey}`) ||
          (optKey === 'images' && existingIssues.includes('forbidden_inline_images'));
        if (hasIssue) {
          updatePayload[optKey] =
            optKey in fullNormalized ? fullNormalized[optKey] : deleteField();
        }
      }
      for (const unknownKey of getUnknownKeys(existingData, ALLOWED_SHOWROOM_KEYS)) {
        updatePayload[unknownKey] = deleteField();
      }
    }

    if (!hasValidTimestamp(existingData.createdAt)) {
      updatePayload.createdAt = serverTimestamp();
    }

    return updatePayload;
  };

  const logShowroomSaveDebug = (params: {
    mode: 'CREATE' | 'UPDATE';
    documentId: string;
    method: 'setDoc' | 'updateDoc';
    authSession?: VerifiedWriteSession | null;
    editingExistingDocument: boolean;
    existingDocument: boolean;
    payload: Record<string, unknown>;
  }) => {
    const uid = params.authSession?.uid ?? auth?.currentUser?.uid ?? null;
    const role = params.authSession?.rbacRole ?? staffRole ?? null;
    const fields = Object.keys(params.payload);
    console.info('[SHOWROOM_SAVE_DEBUG]', {
      mode: params.mode,
      collection: 'showrooms',
      documentId: params.documentId,
      method: params.method,
      uid,
      adminRole: role,
      editingExistingDocument: params.editingExistingDocument,
      documentIdExists: Boolean(params.documentId),
      existingDocument: params.existingDocument,
      fields,
    });
  };

  const createNewShowroomDoc = async (
    sr: Showroom,
    opts?: {
      authSession?: VerifiedWriteSession | null;
      preflightIssuesOut?: string[];
      onOperation?: (op: 'CREATE' | 'UPDATE') => void;
    }
  ) => {
    const firestore = requireDb();
    let targetId = sr.id;
    let showroomRef = doc(firestore, 'showrooms', targetId);
    let existingSnap = await fetchShowroomServerSnap(showroomRef);

    if (existingSnap.exists()) {
      const altId = `${targetId.slice(0, 110)}-${Date.now().toString(36)}`;
      const altRef = doc(firestore, 'showrooms', altId);
      const altSnap = await fetchShowroomServerSnap(altRef);
      if (altSnap.exists()) {
        throw new CatalogAuthError(
          'validation/duplicate-showroom-id',
          `আউটলেট আইডি ("${targetId}") ইতিমধ্যে Firestore-এ রয়েছে। অনুগ্রহ করে ভিন্ন নাম দিয়ে আবার চেষ্টা করুন।`
        );
      }
      targetId = altId;
      showroomRef = altRef;
      existingSnap = altSnap;
    }

    opts?.onOperation?.('CREATE');
    const payload = buildShowroomFirestorePayload({ ...sr, id: targetId });
    const createPayload: Record<string, unknown> = {
      ...payload,
      createdAt: serverTimestamp(),
    };
    assertValidShowroomWritePreflight(
      {
        docId: targetId,
        payload: createPayload,
        isCreate: true,
      },
      opts?.preflightIssuesOut
    );
    logShowroomSaveDebug({
      mode: 'CREATE',
      documentId: targetId,
      method: 'setDoc',
      authSession: opts?.authSession,
      editingExistingDocument: false,
      existingDocument: existingSnap.exists(),
      payload: createPayload,
    });
    await setDoc(showroomRef, createPayload);
    const titleLabel = String(createPayload.nameEn || createPayload.name || targetId);
    await logAdminActivity('create', 'showrooms', targetId, titleLabel);
    return targetId;
  };

  const updateExistingShowroomDoc = async (
    sr: Showroom,
    original: Showroom | null,
    opts?: {
      authSession?: VerifiedWriteSession | null;
      hadFirestoreDoc?: boolean;
      preflightIssuesOut?: string[];
      existingIssuesOut?: string[];
      onOperation?: (op: 'CREATE' | 'UPDATE') => void;
    }
  ) => {
    const firestore = requireDb();
    const targetId = sr.id;
    const showroomRef = doc(firestore, 'showrooms', targetId);
    const existingSnap = await fetchShowroomServerSnap(showroomRef);

    if (existingSnap.exists()) {
      opts?.onOperation?.('UPDATE');
      const existingData = existingSnap.data() as Record<string, unknown>;
      if (opts?.existingIssuesOut) {
        const foundIssues = inspectExistingShowroomIssues(existingData);
        opts.existingIssuesOut.splice(0, opts.existingIssuesOut.length, ...foundIssues);
      }
      const updatePayload = buildPartialShowroomUpdatePayload(sr, original, existingData);
      assertValidShowroomWritePreflight(
        {
          docId: targetId,
          payload: updatePayload,
          existingData,
          isCreate: false,
        },
        opts?.preflightIssuesOut
      );
      logShowroomSaveDebug({
        mode: 'UPDATE',
        documentId: targetId,
        method: 'updateDoc',
        authSession: opts?.authSession,
        editingExistingDocument: true,
        existingDocument: true,
        payload: updatePayload,
      });
      await updateDoc(showroomRef, updatePayload);
      const titleLabel = String(
        updatePayload.nameEn || existingData.nameEn || sr.nameEn || sr.name || targetId
      );
      await logAdminActivity('update', 'showrooms', targetId, titleLabel);
      return { id: targetId, operation: 'UPDATE' as const };
    }

    if (opts?.hadFirestoreDoc || !canonicalIds.has(targetId)) {
      opts?.onOperation?.('UPDATE');
      throw new CatalogAuthError(
        'not-found',
        'The showroom no longer exists. Refresh the page and try again.'
      );
    }

    // Unseeded canonical baseline outlet from outletsData.ts: create its initial Firestore document at its exact canonical ID
    opts?.onOperation?.('CREATE');
    const payload = buildShowroomFirestorePayload({ ...sr, id: targetId });
    const createPayload: Record<string, unknown> = {
      ...payload,
      createdAt: serverTimestamp(),
    };
    assertValidShowroomWritePreflight(
      {
        docId: targetId,
        payload: createPayload,
        isCreate: true,
      },
      opts?.preflightIssuesOut
    );
    logShowroomSaveDebug({
      mode: 'CREATE',
      documentId: targetId,
      method: 'setDoc',
      authSession: opts?.authSession,
      editingExistingDocument: true,
      existingDocument: false,
      payload: createPayload,
    });
    await setDoc(showroomRef, createPayload);
    const titleLabel = String(createPayload.nameEn || createPayload.name || targetId);
    await logAdminActivity('create', 'showrooms', targetId, titleLabel);
    return { id: targetId, operation: 'CREATE' as const };
  };

  const purgeConfirmedDemoShowrooms = async () => {
    if (legacyDemoShowrooms.length === 0) return;
    setPurgingDemoDocs(true);
    setMsg(null);
    let authSession: VerifiedWriteSession | null = null;
    let activeDemoId = legacyDemoShowrooms[0]?.id || 'demo';
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'showrooms_manage',
      });
      const firestore = requireDb();
      let deletedCount = 0;
      for (const demoDoc of legacyDemoShowrooms) {
        if (!CONFIRMED_DEMO_SHOWROOM_IDS.has(demoDoc.id) && !isDemoOrDummyShowroom(demoDoc)) {
          continue;
        }
        activeDemoId = demoDoc.id;
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
      setMsg({
        type: 'ok',
        text:
          deletedCount > 0
            ? `Removed ${deletedCount} legacy demo showroom document(s) from Firestore.`
            : 'No flagged demo showroom documents remain.',
      });
    } catch (err) {
      setMsg({
        type: 'err',
        text: mapCatalogSaveError(err, 'showroom_purge', {
          collection: 'showrooms',
          documentId: activeDemoId,
          path: `showrooms/${activeDemoId}`,
          operation: 'DELETE',
          staffRole,
          authSession,
        }),
      });
    } finally {
      setPurgingDemoDocs(false);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    if (!editing) return;
    const validationErr = validateCatalogImageFile(file);
    if (validationErr) {
      setMsg({ type: 'err', text: validationErr });
      return;
    }
    setUploadingPhoto(true);
    setMsg(null);
    let authSession: VerifiedWriteSession | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'showrooms_manage',
      });
      const res = await uploadCatalogImageToStorage({
        folder: 'showrooms',
        entityId: editing.id || `showroom-${Date.now()}`,
        file,
      });
      setEditing((prev) => (prev ? { ...prev, images: [res.downloadUrl] } : null));
      setMsg({ type: 'ok', text: 'Outlet photo uploaded to Cloudflare R2. Click Save Outlet to apply.' });
    } catch (err) {
      setMsg({
        type: 'err',
        text: mapCatalogSaveError(err, 'showroom_photo_upload', {
          collection: 'showrooms',
          documentId: editing.id,
          path: `showrooms/${editing.id}`,
          operation: 'UPLOAD',
          staffRole,
          authSession,
        }),
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const saveShowroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || busyShowroomId !== null || uploadingPhoto) return;

    const nameEn = (editing.nameEn ?? '').trim();
    const nameBn = (editing.name || '').trim();
    if (!nameEn) {
      setMsg({ type: 'err', text: 'Please enter the Outlet Name in English.' });
      return;
    }
    if (!nameBn) {
      setMsg({ type: 'err', text: 'Please enter the Outlet Name in Bengali (বাংলা).' });
      return;
    }

    const areaEn = (editing.areaEn ?? '').trim();
    const areaBn = (editing.area || '').trim() || areaEn;
    if (!areaBn && !areaEn) {
      setMsg({ type: 'err', text: 'Please enter the outlet area.' });
      return;
    }

    const addressEn = (editing.addressEn ?? '').trim();
    const addressBn = (editing.address || '').trim() || addressEn;
    if (!addressBn && !addressEn) {
      setMsg({ type: 'err', text: 'Please enter the outlet address.' });
      return;
    }

    const phone = editing.phone.trim();
    if (phone.length < 5 || phone.length > 40) {
      setMsg({ type: 'err', text: 'Please enter a valid contact phone number (5 to 40 characters).' });
      return;
    }

    const rawLat = Number(editing.lat);
    const rawLng = Number(editing.lng);
    if (!Number.isFinite(rawLat) || rawLat < -90 || rawLat > 90) {
      setMsg({ type: 'err', text: 'Latitude must be a valid number between -90 and 90.' });
      return;
    }
    if (!Number.isFinite(rawLng) || rawLng < -180 || rawLng > 180) {
      setMsg({ type: 'err', text: 'Longitude must be a valid number between -180 and 180.' });
      return;
    }

    const mapUrlTrimmed = (editing.mapUrl || '').trim();
    if (mapUrlTrimmed.length > 1000) {
      setMsg({ type: 'err', text: 'Google Maps URL must be 1000 characters or fewer.' });
      return;
    }
    if (mapUrlTrimmed && !/^https?:\/\/\S+$/i.test(mapUrlTrimmed)) {
      setMsg({ type: 'err', text: 'Google Maps URL must start with http:// or https://.' });
      return;
    }

    const rawImageUrl = editing.images?.[0]?.trim() || '';
    let validatedImages = editing.images;
    if (rawImageUrl) {
      const imageCheck = validateProductImageUrl(rawImageUrl);
      if (!imageCheck.valid) {
        setMsg({ type: 'err', text: imageCheck.message });
        return;
      }
      validatedImages = [imageCheck.normalizedUrl];
    }

    const isCreateMode = formMode === 'create';
    const editTargetId = (editingOriginal?.id || editing.id || '').trim();
    if (!isCreateMode && !/^[a-zA-Z0-9_-]{1,128}$/.test(editTargetId)) {
      setMsg({ type: 'err', text: 'Invalid outlet document ID. Refresh the page and try again.' });
      return;
    }
    const targetId = isCreateMode
      ? generateUniqueShowroomSlugId(nameEn, editing.id || `showroom-${Date.now()}`)
      : editTargetId;
    const hadFirestoreDoc = !isCreateMode && firestoreOverrideIds.has(targetId);
    const preflightIssues: string[] = [];
    const existingIssues: string[] = [];
    let authSession: VerifiedWriteSession | null = null;
    let executedOperation: 'CREATE' | 'UPDATE' = isCreateMode ? 'CREATE' : 'UPDATE';

    try {
      setBusyShowroomId(targetId);
      setMsg(null);
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'showrooms_manage',
      });
      const draft: Showroom = { ...editing, id: targetId, images: validatedImages };
      const savedId = isCreateMode
        ? await createNewShowroomDoc(draft, {
            authSession,
            preflightIssuesOut: preflightIssues,
            onOperation: (op) => {
              executedOperation = op;
            },
          })
        : (
            await updateExistingShowroomDoc(draft, editingOriginal, {
              authSession,
              hadFirestoreDoc,
              preflightIssuesOut: preflightIssues,
              existingIssuesOut: existingIssues,
              onOperation: (op) => {
                executedOperation = op;
              },
            })
          ).id;

      if (!isCreateMode && editingOriginal && Array.isArray(editingOriginal.images)) {
        const nextSet = new Set(validatedImages || []);
        const removedUrls = editingOriginal.images.filter(
          (u) => typeof u === 'string' && isR2ImageUrl(u) && !nextSet.has(u)
        );
        if (removedUrls.length > 0) {
          await safeDeleteUnreferencedR2Urls({
            urls: removedUrls,
            exclude: { collection: 'showrooms', docId: savedId },
            snapshot: {
              allProducts,
              allCategories,
              allShowrooms,
              allHeroBanners,
              mediaItems,
              siteSettings,
              seoSettings,
            },
          });
        }
      }

      setEditing(null);
      setEditingOriginal(null);
      setFormMode('create');
      setMsg({
        type: 'ok',
        text: isCreateMode
          ? `Created new outlet "${nameEn}" (${savedId}) in Firestore.`
          : `Updated outlet "${nameEn}" (${savedId}) in Firestore.`,
      });
    } catch (err) {
      setMsg({
        type: 'err',
        text: mapCatalogSaveError(err, 'showroom_save', {
          collection: 'showrooms',
          documentId: targetId,
          path: `showrooms/${targetId}`,
          operation: executedOperation,
          staffRole,
          authSession,
          preflightIssues,
          existingIssues,
        }),
      });
    } finally {
      setBusyShowroomId(null);
    }
  };

  const toggleShowroomVisibility = async (sr: Showroom) => {
    if (busyShowroomId) return;
    setBusyShowroomId(sr.id);
    setMsg(null);
    let authSession: VerifiedWriteSession | null = null;
    const preflightIssues: string[] = [];
    const existingIssues: string[] = [];
    let executedOperation: 'CREATE' | 'UPDATE' = 'UPDATE';
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'showrooms_manage',
      });
      const firestore = requireDb();
      const showroomRef = doc(firestore, 'showrooms', sr.id);
      const existingSnap = await fetchShowroomServerSnap(showroomRef);
      const nextVisible = sr.visible === false;

      if (existingSnap.exists()) {
        executedOperation = 'UPDATE';
        const existingData = existingSnap.data() as Record<string, unknown>;
        existingIssues.push(...inspectExistingShowroomIssues(existingData));
        const minimalUpdate = buildPartialShowroomUpdatePayload(
          { ...sr, visible: nextVisible },
          sr,
          existingData
        );
        minimalUpdate.visible = nextVisible;
        assertValidShowroomWritePreflight(
          {
            docId: sr.id,
            payload: minimalUpdate,
            existingData,
            isCreate: false,
          },
          preflightIssues
        );
        logShowroomSaveDebug({
          mode: 'UPDATE',
          documentId: sr.id,
          method: 'updateDoc',
          authSession,
          editingExistingDocument: true,
          existingDocument: true,
          payload: minimalUpdate,
        });
        await updateDoc(showroomRef, minimalUpdate);
        await logAdminActivity(
          nextVisible ? 'show' : 'hide',
          'showrooms',
          sr.id,
          sr.nameEn || sr.name
        );
      } else {
        await updateExistingShowroomDoc({ ...sr, visible: nextVisible }, sr, {
          authSession,
          hadFirestoreDoc: firestoreOverrideIds.has(sr.id),
          preflightIssuesOut: preflightIssues,
          existingIssuesOut: existingIssues,
          onOperation: (op) => {
            executedOperation = op;
          },
        });
      }
      setMsg({
        type: 'ok',
        text: `"${sr.nameEn || sr.name}" is now ${nextVisible ? 'visible' : 'hidden'} on the website.`,
      });
    } catch (err) {
      setMsg({
        type: 'err',
        text: mapCatalogSaveError(err, 'showroom_visibility', {
          collection: 'showrooms',
          documentId: sr.id,
          path: `showrooms/${sr.id}`,
          operation: executedOperation,
          staffRole,
          authSession,
          preflightIssues,
          existingIssues,
        }),
      });
    } finally {
      setBusyShowroomId(null);
    }
  };

  const nudgeShowroomOrder = async (sr: Showroom, delta: number) => {
    if (busyShowroomId) return;
    const nextOrder = Math.min(1000, Math.max(1, Math.round(Number(sr.display_order ?? 1)) + delta));
    setBusyShowroomId(sr.id);
    setMsg(null);
    let authSession: VerifiedWriteSession | null = null;
    const preflightIssues: string[] = [];
    const existingIssues: string[] = [];
    let executedOperation: 'CREATE' | 'UPDATE' = 'UPDATE';
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'showrooms_manage',
      });
      const firestore = requireDb();
      const showroomRef = doc(firestore, 'showrooms', sr.id);
      const existingSnap = await fetchShowroomServerSnap(showroomRef);

      if (existingSnap.exists()) {
        executedOperation = 'UPDATE';
        const existingData = existingSnap.data() as Record<string, unknown>;
        existingIssues.push(...inspectExistingShowroomIssues(existingData));
        const orderUpdate = buildPartialShowroomUpdatePayload(
          { ...sr, display_order: nextOrder },
          sr,
          existingData
        );
        orderUpdate.display_order = nextOrder;
        assertValidShowroomWritePreflight(
          {
            docId: sr.id,
            payload: orderUpdate,
            existingData,
            isCreate: false,
          },
          preflightIssues
        );
        logShowroomSaveDebug({
          mode: 'UPDATE',
          documentId: sr.id,
          method: 'updateDoc',
          authSession,
          editingExistingDocument: true,
          existingDocument: true,
          payload: orderUpdate,
        });
        await updateDoc(showroomRef, orderUpdate);
        await logAdminActivity('update', 'showrooms', sr.id, sr.nameEn || sr.name);
      } else {
        await updateExistingShowroomDoc({ ...sr, display_order: nextOrder }, sr, {
          authSession,
          hadFirestoreDoc: firestoreOverrideIds.has(sr.id),
          preflightIssuesOut: preflightIssues,
          existingIssuesOut: existingIssues,
          onOperation: (op) => {
            executedOperation = op;
          },
        });
      }
      setMsg({
        type: 'ok',
        text: `Updated display order for "${sr.nameEn || sr.name}" to #${nextOrder}.`,
      });
    } catch (err) {
      setMsg({
        type: 'err',
        text: mapCatalogSaveError(err, 'showroom_order', {
          collection: 'showrooms',
          documentId: sr.id,
          path: `showrooms/${sr.id}`,
          operation: executedOperation,
          staffRole,
          authSession,
          preflightIssues,
          existingIssues,
        }),
      });
    } finally {
      setBusyShowroomId(null);
    }
  };

  const handleConfirmDeleteOrReset = async () => {
    if (!confirmDeleteTarget) return;
    const target = confirmDeleteTarget;
    setBusyShowroomId(target.id);
    setMsg(null);
    let authSession: VerifiedWriteSession | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'showrooms_manage',
      });
      const showroomRef = doc(requireDb(), 'showrooms', target.id);
      const existingSnap = await fetchDocFromServer(showroomRef);
      const existingR2Imgs =
        existingSnap.exists() && Array.isArray(existingSnap.data()?.images)
          ? (existingSnap.data().images as string[])
          : Array.isArray(target.images)
          ? target.images
          : [];
      await deleteDoc(showroomRef);
      if (existingR2Imgs.length > 0) {
        await safeDeleteUnreferencedR2Urls({
          urls: existingR2Imgs,
          exclude: { collection: 'showrooms', docId: target.id },
          snapshot: {
            allProducts,
            allCategories,
            allShowrooms,
            allHeroBanners,
            mediaItems,
            siteSettings,
            seoSettings,
          },
        });
      }
      const isOfficial = canonicalIds.has(target.id);
      await logAdminActivity(
        'delete',
        'showrooms',
        target.id,
        target.nameEn || target.name,
        isOfficial ? 'Reset official outlet override to default' : 'Deleted custom outlet'
      );
      setConfirmDeleteTarget(null);
      setMsg({
        type: 'ok',
        text: isOfficial
          ? `Reset "${target.nameEn || target.name}" to its default official configuration.`
          : `Deleted custom outlet "${target.nameEn || target.name}".`,
      });
    } catch (err) {
      setMsg({
        type: 'err',
        text: mapCatalogSaveError(err, 'showroom_delete', {
          collection: 'showrooms',
          documentId: target.id,
          path: `showrooms/${target.id}`,
          operation: 'DELETE',
          staffRole,
          authSession,
        }),
      });
    } finally {
      setBusyShowroomId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Our Outlets &amp; Showrooms CMS
          </h2>
          <p className="text-xs text-[#57534E]">
            Edit any of the <span className="tabular-nums font-semibold">{allShowrooms.filter((s) => !s.deleted).length}</span> active Chattogram outlets or add new branches. Changes reflect live across Our Outlets, Contact, Footer, and Complaint forms.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshStoreData()}
            disabled={refreshingStoreData}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshingStoreData ? 'animate-spin' : ''}`} />
            <span>{refreshingStoreData ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
            setFormMode('create');
            setEditingOriginal(null);
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
              phone: '+880',
              alternate_phone: '',
              email: '',
              openingHours: 'শুক্র–শনিবার · সকাল ৮:০০টা – রাত ১০:০০টা',
              openingHoursEn: 'Friday – Saturday · 8:00 AM – 10:00 PM',
              orderLineEn: 'Daily · 8:00 AM – 7:00 PM',
              orderLineBn: 'প্রতিদিন · সকাল ৮:০০টা – সন্ধ্যা ৭:০০টা',
              region: 'khulshi-gec',
              opening_time: '08:00 AM',
              closing_time: '10:00 PM',
              weekly_holiday: 'Open Daily',
              mapUrl: '',
              lat: 0,
              lng: 0,
              images: [],
              isMain: false,
              visible: true,
              display_order: Math.min(1000, allShowrooms.length + 1),
            });
          }}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
        >
            <Plus className="h-4 w-4" />
            <span>Add New Outlet</span>
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-semibold ${
            msg.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-[#B91C1C]'
          }`}
        >
          {msg.type === 'ok' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {legacyDemoShowrooms.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold text-amber-950">
                Legacy Demo Showroom Documents Detected (<span className="tabular-nums">{legacyDemoShowrooms.length}</span>)
              </p>
              <p className="mt-1 text-[11px] text-amber-900">
                These records are already hidden from the storefront and complaint form. Click below to permanently remove only these flagged demo documents:
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
              <span>Remove Flagged Demo Records</span>
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
          <div className="flex items-center justify-between border-b border-[#F5F4F0] pb-3 sm:col-span-2">
            <div>
              <h3 className="font-display text-lg font-bold text-[#1C1917]">
                {formMode === 'create'
                  ? 'Add New Outlet'
                  : `Edit Outlet · ${editing.nameEn || editing.name}`}
              </h3>
              <p className="font-mono text-[11px] text-[#78716C]">
                ID:{' '}
                {formMode === 'create'
                  ? generateUniqueShowroomSlugId(editing.nameEn || '', editing.id)
                  : editing.id}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setEditingOriginal(null);
                setFormMode('create');
              }}
              className="cursor-pointer rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F4F0]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold">Outlet Name (English) *</label>
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
            <label className="mb-1 block text-xs font-semibold">Outlet Name (বাংলা) *</label>
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
            <label className="mb-1 block text-xs font-semibold">Area (English) *</label>
            <input
              type="text"
              value={editing.areaEn ?? ''}
              onChange={(e) => setEditing({ ...editing, areaEn: e.target.value })}
              placeholder="e.g. Khulshi, Chattogram"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              Area (বাংলা) <span className="font-normal text-[#78716C]">(optional · defaults from English)</span>
            </label>
            <input
              type="text"
              value={editing.area}
              onChange={(e) => setEditing({ ...editing, area: e.target.value })}
              placeholder="যেমন: খুলশী, চট্টগ্রাম"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold">Region Filter Group</label>
            <select
              value={editing.region || 'khulshi-gec'}
              onChange={(e) => setEditing({ ...editing, region: e.target.value as OutletRegion })}
              className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-sm"
            >
              {OUTLET_REGION_FILTERS.filter((f) => f.id !== 'all').map((f) => (
                <option key={f.id} value={f.id}>
                  {f.labelEn} ({f.labelBn})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Display Order</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={editing.display_order ?? 1}
              onChange={(e) =>
                setEditing({ ...editing, display_order: Number(e.target.value) || 1 })
              }
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-sm tabular-nums"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold">Primary Phone *</label>
            <input
              type="text"
              value={editing.phone}
              onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              placeholder="+8801XXXXXXXXX"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              Alternate Phone / Email <span className="font-normal text-[#78716C]">(optional)</span>
            </label>
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
            <label className="mb-1 block text-xs font-semibold">Full Address (English) *</label>
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
            <label className="mb-1 block text-xs font-semibold">
              Full Address (বাংলা) <span className="font-normal text-[#78716C]">(optional · defaults from English)</span>
            </label>
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
            <label className="mb-1 block text-xs font-semibold">
              Counter Hours (English) <span className="font-normal text-[#78716C]">(optional)</span>
            </label>
            <input
              type="text"
              value={editing.openingHoursEn ?? ''}
              onChange={(e) => setEditing({ ...editing, openingHoursEn: e.target.value })}
              placeholder="e.g. Friday – Saturday · 8:00 AM – 10:00 PM"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              Counter Hours (বাংলা) <span className="font-normal text-[#78716C]">(optional · defaults automatically)</span>
            </label>
            <input
              type="text"
              value={editing.openingHours}
              onChange={(e) => setEditing({ ...editing, openingHours: e.target.value })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold">Order Line Hours (English)</label>
            <input
              type="text"
              value={editing.orderLineEn ?? ''}
              onChange={(e) => setEditing({ ...editing, orderLineEn: e.target.value })}
              placeholder="Daily · 8:00 AM – 7:00 PM"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Order Line Hours (বাংলা)</label>
            <input
              type="text"
              value={editing.orderLineBn ?? ''}
              onChange={(e) => setEditing({ ...editing, orderLineBn: e.target.value })}
              placeholder="প্রতিদিন · সকাল ৮:০০টা – সন্ধ্যা ৭:০০টা"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold">
              Google Maps URL <span className="font-normal text-[#78716C]">(optional · auto-generated if empty)</span>
            </label>
            <input
              type="url"
              value={editing.mapUrl}
              onChange={(e) => setEditing({ ...editing, mapUrl: e.target.value })}
              placeholder="https://maps.app.goo.gl/..."
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Weekly Holiday / Badge Note</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={editing.weekly_holiday ?? ''}
                onChange={(e) => setEditing({ ...editing, weekly_holiday: e.target.value })}
                placeholder="e.g. Open Daily"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={editing.descriptionEn ?? ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    descriptionEn: e.target.value,
                    description_en: e.target.value,
                    description: e.target.value,
                    description_bn: e.target.value,
                  })
                }
                placeholder="e.g. Office & Outlet"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold">
              Latitude <span className="font-normal text-[#78716C]">(optional · -90 to 90)</span>
            </label>
            <input
              type="number"
              step="any"
              value={editing.lat}
              onChange={(e) => setEditing({ ...editing, lat: Number(e.target.value) })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              Longitude <span className="font-normal text-[#78716C]">(optional · -180 to 180)</span>
            </label>
            <input
              type="number"
              step="any"
              value={editing.lng}
              onChange={(e) => setEditing({ ...editing, lng: Number(e.target.value) })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-sm"
            />
          </div>

          {/* Outlet Photo Upload (Cloudflare R2) */}
          <div className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#1C1917]">
                  Outlet Photo (Cloudflare R2 · Optional)
                </p>
                <p className="text-[11px] text-[#78716C]">
                  Upload a real storefront photograph or paste a valid R2 image URL.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#DC1F26]">
                  {uploadingPhoto ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#DC1F26]" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 text-[#DC1F26]" />
                  )}
                  <span>{uploadingPhoto ? 'Uploading...' : 'Upload Photo'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadingPhoto}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void handlePhotoUpload(f);
                    }}
                    className="hidden"
                  />
                </label>
                {editing.images && editing.images.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, images: [] })}
                    className="cursor-pointer rounded-lg border border-red-200 bg-white px-2.5 py-2 text-xs font-semibold text-[#B91C1C] hover:bg-red-50"
                  >
                    Remove Photo
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              {editing.images?.[0] && (
                <img
                  src={resolveAssetUrl(editing.images[0])}
                  alt={editing.nameEn || editing.name}
                  className="h-20 w-32 shrink-0 rounded-lg border border-[#E7E5E4] object-cover bg-white"
                />
              )}
              <input
                type="url"
                value={editing.images?.[0] ?? ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    images: e.target.value.trim() ? [e.target.value] : [],
                  })
                }
                placeholder="https://images.homerecipefoods.com.bd/showrooms/..."
                className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
              />
            </div>
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
              onClick={() => {
                setEditing(null);
                setEditingOriginal(null);
                setFormMode('create');
              }}
              className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busyShowroomId === editing.id || uploadingPhoto}
              className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
            >
              {busyShowroomId === editing.id ? 'Saving...' : 'Save Outlet'}
            </button>
          </div>
        </form>
      )}

      {/* Search & Region Filter */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E7E5E4] bg-white p-3.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search outlet name, area, address, or phone..."
          className="min-w-[220px] flex-1 rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs focus:border-[#DC1F26] focus:bg-white focus:outline-none"
        />
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          className="rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs font-semibold text-[#1C1917]"
        >
          {OUTLET_REGION_FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.labelEn}
            </option>
          ))}
        </select>
      </div>

      {/* Unified Dynamic Outlet List (All 16+ Outlets) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {managedShowrooms.map((sr) => {
          const st = getShowroomText(sr);
          const namePair = resolveBilingualPair(st.nameEn, st.nameBn);
          const areaPair = resolveBilingualPair(st.areaEn, st.areaBn);
          const addrPair = resolveBilingualPair(st.addressEn, st.addressBn);
          const isOfficial = canonicalIds.has(sr.id);
          const hasOverride = firestoreOverrideIds.has(sr.id);
          const isBusy = busyShowroomId === sr.id;
          const regionMeta = OUTLET_REGION_FILTERS.find((r) => r.id === sr.region);

          return (
            <div
              key={sr.id}
              className={`flex flex-col justify-between rounded-xl border bg-white p-5 ${
                sr.visible === false ? 'border-[#E7E5E4] opacity-70' : 'border-[#E7E5E4]'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    {sr.images?.[0] && (
                      <img
                        src={resolveAssetUrl(sr.images[0])}
                        alt={namePair.primary}
                        className="h-14 w-14 shrink-0 rounded-lg border border-[#E7E5E4] object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-[#B91C1C]">
                        <span className="tabular-nums">#{sr.display_order ?? 1}</span>
                        {' · '}
                        {regionMeta ? regionMeta.labelEn : areaPair.primary}
                        {sr.isMain ? ' · Office & Outlet' : ''}
                        {hasOverride ? ' · Synced' : ' · Default'}
                      </p>
                      <h3 className="font-display mt-0.5 text-lg font-bold text-[#1C1917]">
                        {namePair.primary}
                      </h3>
                      {namePair.secondaryBn && (
                        <p className="font-bn text-xs font-medium text-[#78716C]">
                          {namePair.secondaryBn}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-[11px] font-semibold ${
                      sr.visible === false ? 'text-[#78716C]' : 'text-emerald-700'
                    }`}
                  >
                    {sr.visible === false ? 'Hidden' : 'Visible'}
                  </span>
                </div>

                {addrPair.primary && (
                  <p className="mt-2.5 text-xs leading-relaxed text-[#57534E]">{addrPair.primary}</p>
                )}
                {addrPair.secondaryBn && (
                  <p className="font-bn mt-0.5 text-[11px] text-[#78716C]">{addrPair.secondaryBn}</p>
                )}

                <p className="mt-2 font-mono text-xs font-semibold tabular-nums text-[#1C1917]">
                  {sr.phone} {sr.alternate_phone ? `· ${sr.alternate_phone}` : ''}
                </p>
                <p className="mt-1 text-xs text-[#78716C]">
                  {st.openingHoursEn || st.openingHoursBn}
                  {sr.orderLineEn ? ` · Orders: ${sr.orderLineEn}` : ''}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#F5F4F0] pt-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void nudgeShowroomOrder(sr, -1)}
                    title="Move earlier in display order"
                    className="cursor-pointer rounded-md border border-[#E7E5E4] px-2 py-1 text-[11px] font-semibold text-[#57534E] hover:border-[#1C1917] hover:text-[#1C1917] disabled:opacity-50"
                  >
                    Order −
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void nudgeShowroomOrder(sr, 1)}
                    title="Move later in display order"
                    className="cursor-pointer rounded-md border border-[#E7E5E4] px-2 py-1 text-[11px] font-semibold text-[#57534E] hover:border-[#1C1917] hover:text-[#1C1917] disabled:opacity-50"
                  >
                    Order +
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void toggleShowroomVisibility(sr)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E7E5E4] px-2.5 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26] disabled:opacity-50"
                  >
                    {sr.visible === false ? (
                      <>
                        <Eye className="h-3 w-3 text-emerald-700" />
                        <span>Show</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3 text-[#78716C]" />
                        <span>Hide</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      const initialDraft: Showroom = {
                        ...sr,
                        name: st.nameBn || st.nameEn,
                        nameEn: st.nameEn,
                        name_bn: st.nameBn || st.nameEn,
                        name_en: st.nameEn,
                        area: st.areaBn || st.areaEn,
                        areaEn: st.areaEn,
                        address: st.addressBn || st.addressEn,
                        addressEn: st.addressEn,
                        address_bn: st.addressBn || st.addressEn,
                        address_en: st.addressEn,
                        description: st.descriptionBn,
                        descriptionEn: st.descriptionEn,
                        description_bn: st.descriptionBn,
                        description_en: st.descriptionEn,
                        openingHours: st.openingHoursBn || st.openingHoursEn,
                        openingHoursEn: st.openingHoursEn,
                      };
                      setFormMode('edit');
                      setMsg(null);
                      setEditingOriginal(initialDraft);
                      setEditing(initialDraft);
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E7E5E4] px-2.5 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#1C1917]"
                  >
                    <Edit3 className="h-3 w-3" />
                    <span>Edit</span>
                  </button>

                  {hasOverride && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setConfirmDeleteTarget(sr)}
                      title={isOfficial ? 'Reset to official default' : 'Delete custom outlet'}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E7E5E4] px-2.5 py-1 text-[11px] font-semibold text-[#B91C1C] hover:bg-red-50"
                    >
                      {isOfficial ? (
                        <>
                          <RotateCcw className="h-3 w-3" />
                          <span>Reset</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-3 w-3" />
                          <span>Delete</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete / Reset Confirmation Modal */}
      {confirmDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-xl">
            <h3 className="font-display text-lg font-bold text-[#1C1917]">
              {canonicalIds.has(confirmDeleteTarget.id)
                ? 'Reset Outlet to Default?'
                : 'Delete Custom Outlet?'}
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-[#57534E]">
              {canonicalIds.has(confirmDeleteTarget.id)
                ? `This removes custom Firestore overrides for "${confirmDeleteTarget.nameEn || confirmDeleteTarget.name}" and restores the official baseline configuration.`
                : `This permanently deletes custom outlet "${confirmDeleteTarget.nameEn || confirmDeleteTarget.name}" from Firestore.`}
            </p>
            {!canonicalIds.has(confirmDeleteTarget.id) && linkedProductsCount > 0 && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-950">
                <span className="font-bold">Impact Notice:</span>{' '}
                <span className="tabular-nums font-semibold">{linkedProductsCount}</span> active product(s) currently reference outlet ID <code className="font-mono">{confirmDeleteTarget.id}</code>. Those products will not be deleted, and their outlet tags will remain unchanged unless updated in Products.
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#44403C]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyShowroomId === confirmDeleteTarget.id}
                onClick={() => void handleConfirmDeleteOrReset()}
                className="cursor-pointer rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
              >
                {canonicalIds.has(confirmDeleteTarget.id) ? 'Reset to Default' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
