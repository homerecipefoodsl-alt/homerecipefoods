import { auth } from './firebase';

export const ALLOWED_PRODUCT_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const OPTIMIZE_THRESHOLD_BYTES = 1200 * 1024; // ~1.2 MB
const MAX_UPLOAD_DIMENSION = 1600;
const UPLOAD_TIMEOUT_MS = 25000;

export type MediaUploadFolder = 'products' | 'categories' | 'media' | 'banners' | 'showrooms';

export interface CatalogImageUploadResult {
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  sizeBytes: number;
}

interface MediaUploadApiResponse {
  success?: boolean;
  ok?: boolean;
  downloadUrl?: string;
  storagePath?: string;
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

  const lower = file.name.trim().toLowerCase();
  if (/\.png$/.test(lower)) return 'image/png';
  if (/\.webp$/.test(lower)) return 'image/webp';
  return 'image/jpeg';
}

export function validateCatalogImageFile(file: File): string | null {
  if (!file) {
    return 'অনুগ্রহ করে একটি ছবি নির্বাচন করুন।';
  }

  const lowerName = file.name.trim().toLowerCase();
  const rawMime = file.type.trim().toLowerCase();
  const validExtension = /\.(jpe?g|png|webp)$/.test(lowerName);
  const validMime = ALLOWED_PRODUCT_IMAGE_TYPES.includes(
    rawMime as (typeof ALLOWED_PRODUCT_IMAGE_TYPES)[number]
  );

  // Reject non-image MIME types strictly even if renamed (e.g. document.pdf -> photo.jpg)
  if (rawMime ? !validMime : !validExtension) {
    return 'অসমর্থিত ফাইল ফরম্যাট। শুধু JPG, PNG অথবা WEBP ছবি ব্যবহার করুন।';
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
 * Gently optimizes large images (> 1.2 MB) into a crisp File before uploading
 * to Cloudflare R2. Never generates data: URLs or embeds files in Firestore.
 */
async function optimizeImageFileForStorage(file: File): Promise<File> {
  if (typeof document === 'undefined' || file.size <= OPTIMIZE_THRESHOLD_BYTES) {
    return file;
  }

  const targetMime =
    inferContentTypeFromFile(file) === 'image/png' ? 'image/webp' : inferContentTypeFromFile(file);

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
      return 'অসমর্থিত ফাইল ফরম্যাট। শুধু JPG, PNG অথবা WEBP ছবি ব্যবহার করুন।';
    case 503:
      return 'Cloudflare R2 স্টোরেজ বাকেট এখনো সংযুক্ত করা হয়নি। Cloudflare Dashboard → R2-তে "homerecipefoods-media" বাকেট তৈরি করুন।';
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
  return url.startsWith('https://') || url.startsWith('http://') || url.startsWith('/api/media/file/');
}

export async function uploadCatalogImageToStorage(params: {
  folder: MediaUploadFolder;
  entityId: string;
  file: File;
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

  const downloadUrl = (response.body.downloadUrl || '').trim();
  const storagePath = (response.body.storagePath || '').trim();
  if (!isValidHostedImageUrl(downloadUrl) || !storagePath) {
    throw new Error('ছবি আপলোডের পর বৈধ Cloudflare R2 লিংক পাওয়া যায়নি।');
  }

  params.onProgress?.(100);
  return {
    downloadUrl,
    storagePath,
    fileName: preparedFile.name,
    sizeBytes: response.body.sizeBytes || preparedFile.size,
  };
}
