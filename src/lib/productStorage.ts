import { auth } from './firebase';

export const ALLOWED_PRODUCT_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const OPTIMIZE_THRESHOLD_BYTES = 1200 * 1024; // ~1.2 MB
const MAX_UPLOAD_DIMENSION = 1600;
const UPLOAD_TIMEOUT_MS = 25000;
const PRODUCTION_R2_IMAGE_HOST = 'images.homerecipefoods.com.bd';

export type MediaUploadFolder = 'products' | 'categories' | 'media' | 'banners' | 'showrooms';

export interface CatalogImageUploadResult {
  downloadUrl: string;
  storagePath: string;
  imageUrl: string;
  imageKey: string;
  fileName: string;
  sizeBytes: number;
}

interface MediaUploadApiResponse {
  success?: boolean;
  ok?: boolean;
  downloadUrl?: string;
  storagePath?: string;
  imageUrl?: string;
  imageKey?: string;
  fileName?: string;
  sizeBytes?: number;
  error?: string;
  code?: string;
  message?: string;
}

export function isForbiddenInlineImageUrl(url: string | null | undefined): boolean {
  if (typeof url !== 'string') return false;
  const normalized = url.trim().toLowerCase();
  return normalized.startsWith('data:') || normalized.startsWith('blob:');
}

export function extractR2ImageKey(url: string | null | undefined): string {
  if (typeof url !== 'string') return '';
  const raw = url.trim();
  if (!raw || isForbiddenInlineImageUrl(raw)) return '';
  const apiPrefix = '/api/media/file/';
  if (raw.startsWith(apiPrefix)) {
    const key = raw.slice(apiPrefix.length).replace(/^\/+/, '');
    return /^(products|categories|media|banners|showrooms)\//.test(key) ? key : '';
  }
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const pathKey = parsed.pathname.replace(/^\/+/, '');
    if (host === PRODUCTION_R2_IMAGE_HOST) {
      return /^(products|categories|media|banners|showrooms)\//.test(pathKey) ? pathKey : '';
    }
    const idx = parsed.pathname.indexOf(apiPrefix);
    if (idx !== -1) {
      const key = parsed.pathname.slice(idx + apiPrefix.length).replace(/^\/+/, '');
      return /^(products|categories|media|banners|showrooms)\//.test(key) ? key : '';
    }
    return '';
  } catch {
    return '';
  }
}

export function isR2ImageUrl(url: string | null | undefined): boolean {
  return Boolean(extractR2ImageKey(url));
}

export type ImageUrlValidationResult =
  | {
      valid: true;
      normalizedUrl: string;
      isR2: boolean;
      extractedKey: string;
    }
  | {
      valid: false;
      message: string;
    };

export function validateProductImageUrl(url: string | null | undefined): ImageUrlValidationResult {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) {
    return {
      valid: false,
      message: 'অনুগ্রহ করে একটি বৈধ ছবির URL দিন।',
    };
  }
  if (raw.length > 2048) {
    return {
      valid: false,
      message: 'ছবির URL অনেক দীর্ঘ (সর্বোচ্চ ২,০৪৮ অক্ষর)।',
    };
  }
  const lower = raw.toLowerCase();
  if (
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:')
  ) {
    return {
      valid: false,
      message: 'অবৈধ URL প্রোটোকল (data/blob/javascript অনুমোদিত নয়)।',
    };
  }
  if (raw.startsWith('/api/media/file/')) {
    const extractedKey = extractR2ImageKey(raw);
    if (!extractedKey) {
      return {
        valid: false,
        message: 'অবৈধ Cloudflare R2 মিডিয়া পাথ।',
      };
    }
    return {
      valid: true,
      normalizedUrl: raw,
      isR2: true,
      extractedKey,
    };
  }
  if (
    (raw.startsWith('/src/assets/') || raw.startsWith('/assets/')) &&
    !raw.includes('..') &&
    !raw.includes('\\') &&
    !/\s/.test(raw)
  ) {
    return {
      valid: true,
      normalizedUrl: raw,
      isR2: false,
      extractedKey: '',
    };
  }
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith('.r2.cloudflarestorage.com') || host.endsWith('.r2.dev')) {
      return {
        valid: false,
        message: 'প্রাইভেট S3 বা .r2.dev ডেভেলপমেন্ট লিংক গ্রহণযোগ্য নয়। https://images.homerecipefoods.com.bd/... ব্যবহার করুন।',
      };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        valid: false,
        message: 'শুধুমাত্র HTTPS অথবা বৈধ মিডিয়া URL ব্যবহার করুন।',
      };
    }
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    if (parsed.protocol === 'http:' && !isLocalHost) {
      return {
        valid: false,
        message: 'নিরাপত্তার জন্য বাহ্যিক ছবির লিংক অবশ্যই https:// দিয়ে শুরু হতে হবে।',
      };
    }
    const extractedKey = extractR2ImageKey(raw);
    return {
      valid: true,
      normalizedUrl: raw,
      isR2: Boolean(extractedKey),
      extractedKey,
    };
  } catch {
    return {
      valid: false,
      message: 'সঠিক ছবির URL ফরম্যাট নয় (যেমন: https://images.homerecipefoods.com.bd/...)।',
    };
  }
}

function sanitizeImageFileName(fileName: string): string {
  const cleaned = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.slice(-72) || `image_${Date.now()}.jpg`;
}

function sanitizeEntityId(id: string): string {
  const cleaned = id.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  return cleaned.slice(0, 96) || `item-${Date.now()}`;
}

function inferContentTypeFromFile(file: File): string {
  const mime = file.type.trim().toLowerCase();
  if (mime === 'image/jpg' || mime === 'image/jpeg') return 'image/jpeg';
  if (mime === 'image/png') return 'image/png';
  if (mime === 'image/webp') return 'image/webp';
  if (mime === 'image/gif') return 'image/gif';

  const lower = file.name.trim().toLowerCase();
  if (/\.png$/.test(lower)) return 'image/png';
  if (/\.webp$/.test(lower)) return 'image/webp';
  if (/\.gif$/.test(lower)) return 'image/gif';
  return 'image/jpeg';
}

export function validateCatalogImageFile(file: File): string | null {
  if (!file) {
    return 'অনুগ্রহ করে একটি ছবি নির্বাচন করুন।';
  }

  const lowerName = file.name.trim().toLowerCase();
  const rawMime = file.type.trim().toLowerCase();
  const validExtension = /\.(jpe?g|png|webp|gif)$/.test(lowerName);
  const validMime = ALLOWED_PRODUCT_IMAGE_TYPES.includes(
    rawMime as (typeof ALLOWED_PRODUCT_IMAGE_TYPES)[number]
  );

  // Reject non-image MIME types strictly even if renamed (e.g. document.pdf -> photo.jpg)
  if (rawMime ? !validMime : !validExtension) {
    return 'অসমর্থিত ফাইল ফরম্যাট। শুধু JPG, PNG, WEBP অথবা GIF ছবি ব্যবহার করুন।';
  }

  if (file.size <= 0) {
    return 'নির্বাচিত ফাইলটি খালি। অনুগ্রহ করে সঠিক ছবি দিন।';
  }

  if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return `ছবির আকার অনেক বড় (${sizeMb} MB)। সর্বোচ্চ ৫ এমবি আকারের ছবি আপলোড করা যাবে।`;
  }

  return null;
}

/**
 * Gently optimizes large raster images (> 1.2 MB) into a crisp File before uploading
 * to Cloudflare R2. Preserves GIF animations untouched and never embeds files in Firestore.
 */
async function optimizeImageFileForStorage(file: File): Promise<File> {
  const inferredMime = inferContentTypeFromFile(file);
  if (
    typeof document === 'undefined' ||
    inferredMime === 'image/gif' ||
    file.size <= OPTIMIZE_THRESHOLD_BYTES
  ) {
    return file;
  }

  const targetMime = inferredMime === 'image/png' ? 'image/webp' : inferredMime;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = objectUrl;
    });

    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (!width || !height) return file;

    if (
      width <= MAX_UPLOAD_DIMENSION &&
      height <= MAX_UPLOAD_DIMENSION &&
      file.size <= OPTIMIZE_THRESHOLD_BYTES
    ) {
      return file;
    }

    if (width > MAX_UPLOAD_DIMENSION || height > MAX_UPLOAD_DIMENSION) {
      if (width >= height) {
        height = Math.max(1, Math.round((height * MAX_UPLOAD_DIMENSION) / width));
        width = MAX_UPLOAD_DIMENSION;
      } else {
        width = Math.max(1, Math.round((width * MAX_UPLOAD_DIMENSION) / height));
        height = MAX_UPLOAD_DIMENSION;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    if (targetMime === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), targetMime, 0.86);
    });

    if (!blob || blob.size <= 0 || blob.size >= file.size) {
      return file;
    }

    const ext = targetMime === 'image/webp' ? 'webp' : targetMime === 'image/png' ? 'png' : 'jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'product';
    return new File([blob], `${baseName}.${ext}`, {
      type: targetMime,
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn('[ProductStorage] Pre-upload image optimization skipped:', err);
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function mapUploadHttpError(status: number, body: MediaUploadApiResponse | null): string {
  const serverMessage = typeof body?.message === 'string' ? body.message.trim() : '';
  if (serverMessage) {
    return serverMessage;
  }

  switch (status) {
    case 401:
      return 'আপনার লগইন সেশন শেষ হয়ে গেছে। অনুগ্রহ করে আবার লগইন করুন।';
    case 403:
      return 'ছবিটি আপলোড করা যায়নি। আপনার প্রশাসনিক অনুমতি যাচাই করুন।';
    case 413:
      return 'ছবির আকার অনেক বড়। সর্বোচ্চ ৫ এমবি আকারের ছবি আপলোড করা যাবে।';
    case 415:
      return 'অসমর্থিত ফাইল ফরম্যাট। শুধু JPG, PNG, WEBP অথবা GIF ছবি ব্যবহার করুন।';
    case 503:
      return 'Cloudflare R2 বাকেট (home-recipe-foods-images) এখনো Worker-এর PRODUCT_IMAGES বাইন্ডিংয়ে সংযুক্ত করা হয়নি।';
    default:
      return 'Cloudflare R2-তে ছবি সংরক্ষণ করা যাচ্ছে না। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।';
  }
}

function sendBinaryUploadRequest(params: {
  endpointUrl: string;
  idToken: string;
  file: File;
  contentType: string;
  onProgress?: (percent: number) => void;
}): Promise<{ status: number; body: MediaUploadApiResponse | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', params.endpointUrl, true);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader('Authorization', `Bearer ${params.idToken}`);
    xhr.setRequestHeader('Content-Type', params.contentType);

    xhr.upload.onprogress = (event) => {
      if (!params.onProgress || !event.lengthComputable || event.total <= 0) return;
      const pct = Math.min(95, Math.max(1, Math.round((event.loaded / event.total) * 95)));
      params.onProgress(pct);
    };

    xhr.upload.onload = () => {
      params.onProgress?.(98);
    };

    xhr.onload = () => {
      let parsed: MediaUploadApiResponse | null = null;
      try {
        parsed = xhr.responseText ? (JSON.parse(xhr.responseText) as MediaUploadApiResponse) : null;
      } catch {
        parsed = null;
      }
      resolve({ status: xhr.status, body: parsed });
    };

    xhr.onerror = () => {
      reject(new Error('ইন্টারনেট সংযোগের কারণে ছবিটি আপলোড করা যায়নি। আবার চেষ্টা করুন।'));
    };

    xhr.ontimeout = () => {
      reject(new Error('ইন্টারনেট সংযোগের কারণে ছবিটি আপলোড করা যায়নি। আবার চেষ্টা করুন।'));
    };

    xhr.onabort = () => {
      reject(new Error('ছবি আপলোড বাতিল করা হয়েছে।'));
    };

    xhr.send(params.file);
  });
}

function isValidHostedImageUrl(url: string): boolean {
  if (!url || isForbiddenInlineImageUrl(url)) return false;
  if (url.startsWith('/api/media/file/')) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith('.r2.cloudflarestorage.com') || host.endsWith('.r2.dev')) return false;
    return true;
  } catch {
    return false;
  }
}

async function verifyUploadedImageAccessible(url: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return true;
  }

  let isSameOrigin = url.startsWith('/');
  if (!isSameOrigin) {
    try {
      isSameOrigin = new URL(url, window.location.origin).origin === window.location.origin;
    } catch {
      return false;
    }
  }

  if (isSameOrigin) {
    try {
      const resp = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (resp.ok) {
        const mime = (resp.headers.get('content-type') || '').toLowerCase();
        return !mime || mime.startsWith('image/');
      }
      if (resp.status === 405 || resp.status === 501) {
        const getResp = await fetch(url, { method: 'GET', cache: 'no-store' });
        return getResp.ok;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Cross-origin R2 custom domain (images.homerecipefoods.com.bd): verify via browser Image loader
  if (typeof Image === 'undefined') return true;
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      resolve(false);
    }, 8000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

export async function uploadCatalogImageToStorage(params: {
  folder: MediaUploadFolder;
  entityId: string;
  file: File;
  isPrimary?: boolean;
  onProgress?: (percent: number) => void;
}): Promise<CatalogImageUploadResult> {
  const validationError = validateCatalogImageFile(params.file);
  if (validationError) {
    throw new Error(validationError);
  }

  if (!auth?.currentUser) {
    throw new Error('ছবি আপলোড করতে অ্যাডমিন অ্যাকাউন্টে লগইন থাকতে হবে।');
  }

  if (!auth.currentUser.emailVerified) {
    throw new Error(
      'অ্যাডমিন ইমেইল যাচাইকৃত না হলে ছবি আপলোড করা যাবে না। অনুগ্রহ করে ইমেইল যাচাই করে আবার চেষ্টা করুন।'
    );
  }

  let idToken: string;
  try {
    idToken = await auth.currentUser.getIdToken();
  } catch (tokenErr) {
    console.error('[ProductStorage] Failed to refresh ID token:', tokenErr);
    throw new Error('আপনার লগইন সেশন শেষ হয়ে গেছে। অনুগ্রহ করে আবার লগইন করুন।');
  }

  const preparedFile = await optimizeImageFileForStorage(params.file);
  const safeId = sanitizeEntityId(params.entityId);
  const safeFile = sanitizeImageFileName(preparedFile.name);
  const contentType = inferContentTypeFromFile(preparedFile);

  const query = new URLSearchParams({
    folder: params.folder,
    entityId: safeId,
    filename: safeFile,
  });
  if (params.isPrimary) {
    query.set('isPrimary', 'true');
  }
  const endpointUrl = `/api/media/upload?${query.toString()}`;

  let response = await sendBinaryUploadRequest({
    endpointUrl,
    idToken,
    file: preparedFile,
    contentType,
    onProgress: params.onProgress,
  });

  if (response.status === 401 && auth.currentUser) {
    try {
      const refreshedToken = await auth.currentUser.getIdToken(true);
      response = await sendBinaryUploadRequest({
        endpointUrl,
        idToken: refreshedToken,
        file: preparedFile,
        contentType,
        onProgress: params.onProgress,
      });
    } catch {
      // Keep original 401 handling
    }
  }

  if (response.status < 200 || response.status >= 300 || !response.body?.ok) {
    throw new Error(mapUploadHttpError(response.status, response.body));
  }

  const downloadUrl = (response.body.imageUrl || response.body.downloadUrl || '').trim();
  const storagePath = (response.body.imageKey || response.body.storagePath || '').trim();
  if (!isValidHostedImageUrl(downloadUrl) || !storagePath) {
    throw new Error('ছবি আপলোডের পর বৈধ Cloudflare R2 লিংক পাওয়া যায়নি।');
  }

  const accessible = await verifyUploadedImageAccessible(downloadUrl);
  if (!accessible) {
    try {
      await deleteCatalogImageFromStorage({ storagePath, downloadUrl });
    } catch {
      // Best-effort cleanup of unreachable upload
    }
    throw new Error(
      'ছবি আপলোড হয়েছে কিন্তু পাবলিক URL থেকে লোড করা যাচ্ছে না। অনুগ্রহ করে R2 কাস্টম ডোমেইন ও Worker রাউট যাচাই করে আবার চেষ্টা করুন।'
    );
  }

  params.onProgress?.(100);
  return {
    downloadUrl,
    storagePath,
    imageUrl: downloadUrl,
    imageKey: storagePath,
    fileName: preparedFile.name,
    sizeBytes: response.body.sizeBytes || preparedFile.size,
  };
}

export async function deleteCatalogImageFromStorage(params: {
  storagePath?: string;
  imageKey?: string;
  downloadUrl?: string;
  imageUrl?: string;
}): Promise<void> {
  if (!auth?.currentUser || !auth.currentUser.emailVerified) {
    throw new Error('ছবি মুছতে যাচাইকৃত অ্যাডমিন অ্যাকাউন্টে লগইন থাকতে হবে।');
  }

  const idToken = await auth.currentUser.getIdToken();
  const resp = await fetch('/api/media/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      storagePath: params.imageKey || params.storagePath,
      imageKey: params.imageKey || params.storagePath,
      downloadUrl: params.imageUrl || params.downloadUrl,
      imageUrl: params.imageUrl || params.downloadUrl,
    }),
  });

  if (!resp.ok) {
    const body = (await resp.json().catch(() => null)) as MediaUploadApiResponse | null;
    throw new Error(mapUploadHttpError(resp.status, body));
  }
}
