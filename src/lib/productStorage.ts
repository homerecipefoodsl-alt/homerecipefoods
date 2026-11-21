import {
  FirebaseStorage,
  StorageError,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { auth, storage } from './firebase';

export const ALLOWED_PRODUCT_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const OPTIMIZE_THRESHOLD_BYTES = 1200 * 1024; // ~1.2 MB
const MAX_UPLOAD_DIMENSION = 1600;
const STORAGE_STALL_TIMEOUT_MS = 12000;
const BUCKET_PROBE_TIMEOUT_MS = 3500;

export interface CatalogImageUploadResult {
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  sizeBytes: number;
}

interface BucketHealthCacheEntry {
  exists: boolean;
  checkedAt: number;
  reason?: string;
}

const bucketHealthCache = new Map<string, BucketHealthCacheEntry>();

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
 * Gently optimizes large images (> 1.2 MB) into a crisp File/Blob before uploading
 * to Firebase Storage. Never generates data: URLs or touches the database.
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

    if (width <= MAX_UPLOAD_DIMENSION && height <= MAX_UPLOAD_DIMENSION && file.size <= OPTIMIZE_THRESHOLD_BYTES) {
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

/**
 * Simple CORS GET request (no custom headers -> no preflight OPTIONS) to check
 * whether the Firebase Storage bucket actually exists before calling uploadBytesResumable.
 * When a bucket doesn't exist, preflight OPTIONS returns 404, which browsers turn into
 * status=0 network errors that cause Firebase Storage SDK to retry silently for minutes.
 */
async function probeStorageBucketHealth(
  bucketName: string
): Promise<{ exists: boolean; reason?: string }> {
  const normalizedBucket = bucketName.replace(/^gs:\/\//i, '').trim();
  if (!normalizedBucket) {
    console.error('[ProductStorage] Missing VITE_FIREBASE_STORAGE_BUCKET configuration.');
    return {
      exists: false,
      reason: 'ছবি আপলোড করার জন্য Firebase Storage চালু করা প্রয়োজন।',
    };
  }

  const cached = bucketHealthCache.get(normalizedBucket);
  const now = Date.now();
  if (cached) {
    const ttl = cached.exists ? 60_000 : 15_000;
    if (now - cached.checkedAt < ttl) {
      return { exists: cached.exists, reason: cached.reason };
    }
  }

  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), BUCKET_PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(normalizedBucket)}/o?maxResults=1`,
      {
        method: 'GET',
        signal: controller.signal,
      }
    );

    if (response.status === 404) {
      console.error(
        `[ProductStorage] Firebase Storage bucket "${normalizedBucket}" returned 404 Not Found. Enable Storage in Firebase Console → Build → Storage → Get Started.`
      );
      const reason = 'ছবি আপলোড করার জন্য Firebase Storage চালু করা প্রয়োজন।';
      bucketHealthCache.set(normalizedBucket, {
        exists: false,
        checkedAt: now,
        reason,
      });
      return { exists: false, reason };
    }

    // 200, 401, or 403 confirms the Storage bucket exists
    bucketHealthCache.set(normalizedBucket, { exists: true, checkedAt: now });
    return { exists: true };
  } catch {
    // If probe itself hits timeout/offline, proceed to resumable upload + stall watchdog
    return { exists: true };
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function mapStorageUploadError(err: unknown, storagePath: string): string {
  console.error('[ProductStorage] Upload error:', { path: storagePath, error: err });

  if (err instanceof StorageError) {
    const details = `${err.message || ''} ${err.serverResponse || ''}`.toLowerCase();
    switch (err.code) {
      case 'storage/bucket-not-found':
      case 'storage/project-not-found':
        return 'ছবি আপলোড করার জন্য Firebase Storage চালু করা প্রয়োজন।';
      case 'storage/unauthorized':
      case 'storage/unauthenticated':
        return 'ছবিটি আপলোড করা যায়নি। আপনার প্রশাসনিক অনুমতি বা Firebase Storage সেটিংস পরীক্ষা করুন।';
      case 'storage/quota-exceeded':
        return 'ছবি সংরক্ষণের নির্ধারিত জায়গা পূর্ণ হয়ে গেছে। অনুগ্রহ করে অ্যাডমিনিস্ট্রেটরের সাথে যোগাযোগ করুন।';
      case 'storage/canceled':
      case 'storage/retry-limit-exceeded':
        return 'ইন্টারনেট সংযোগের কারণে ছবিটি আপলোড করা যায়নি। আবার চেষ্টা করুন।';
      case 'storage/unknown':
        if (
          details.includes('404') ||
          details.includes('not found') ||
          details.includes('bucket')
        ) {
          return 'ছবি আপলোড করার জন্য Firebase Storage চালু করা প্রয়োজন।';
        }
        return 'ছবি সংরক্ষণ করা যাচ্ছে না। Firebase Storage বর্তমানে উপলভ্য নয়।';
      default:
        return 'ছবি সংরক্ষণ করা যাচ্ছে না। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।';
    }
  }

  if (err instanceof Error) {
    if (err.message.includes('STORAGE_STALL_TIMEOUT')) {
      return 'ইন্টারনেট সংযোগের কারণে ছবিটি আপলোড করা যায়নি। আবার চেষ্টা করুন।';
    }
    if (err.message) {
      return err.message;
    }
  }

  return 'ছবি সংরক্ষণ করা যাচ্ছে না। Firebase Storage বর্তমানে উপলভ্য নয়।';
}

function uploadResumableToPath(
  activeStorage: FirebaseStorage,
  storagePath: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<CatalogImageUploadResult> {
  activeStorage.maxUploadRetryTime = 15000;
  activeStorage.maxOperationRetryTime = 15000;

  return new Promise((resolve, reject) => {
    const storageRef = ref(activeStorage, storagePath);
    const contentType = inferContentTypeFromFile(file);
    const task = uploadBytesResumable(storageRef, file, {
      contentType,
      cacheControl: 'public, max-age=31536000',
    });

    let settled = false;
    let lastBytesTransferred = -1;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const clearStallTimer = () => {
      if (stallTimer !== null) {
        globalThis.clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    const resetStallTimer = () => {
      clearStallTimer();
      stallTimer = globalThis.setTimeout(() => {
        if (settled) return;
        settled = true;
        task.cancel();
        reject(
          new Error(
            'STORAGE_STALL_TIMEOUT: Upload connection stalled with no bytes transferred.'
          )
        );
      }, STORAGE_STALL_TIMEOUT_MS);
    };

    resetStallTimer();

    task.on(
      'state_changed',
      (snapshot) => {
        if (settled) return;
        if (snapshot.bytesTransferred > lastBytesTransferred) {
          lastBytesTransferred = snapshot.bytesTransferred;
          resetStallTimer();
        }
        if (snapshot.totalBytes > 0 && snapshot.bytesTransferred > 0 && onProgress) {
          const pct = Math.min(
            99,
            Math.max(1, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100))
          );
          onProgress(pct);
        }
      },
      (err) => {
        clearStallTimer();
        if (settled) return;
        settled = true;
        reject(err);
      },
      async () => {
        clearStallTimer();
        if (settled) return;
        try {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          if (
            !downloadUrl ||
            !downloadUrl.startsWith('https://') ||
            isForbiddenInlineImageUrl(downloadUrl)
          ) {
            settled = true;
            reject(new Error('ছবি আপলোডের পর বৈধ ছবির লিংক পাওয়া যায়নি।'));
            return;
          }
          settled = true;
          onProgress?.(100);
          resolve({
            downloadUrl,
            storagePath,
            fileName: file.name,
            sizeBytes: file.size,
          });
        } catch (urlErr) {
          settled = true;
          reject(urlErr);
        }
      }
    );
  });
}

export async function uploadCatalogImageToStorage(params: {
  folder: 'products' | 'categories' | 'media';
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

  try {
    await auth.currentUser.getIdToken();
  } catch (tokenErr) {
    console.error('[ProductStorage] Failed to refresh ID token:', tokenErr);
    throw new Error('আপনার লগইন সেশন শেষ হয়ে গেছে। অনুগ্রহ করে আবার লগইন করুন।');
  }

  if (!storage) {
    console.error('[ProductStorage] Firebase Storage SDK instance is not initialized.');
    throw new Error('ছবি সংরক্ষণ করা যাচ্ছে না। Firebase Storage বর্তমানে উপলভ্য নয়।');
  }

  const configuredBucket = storage.app.options.storageBucket || '';
  const health = await probeStorageBucketHealth(configuredBucket);
  if (!health.exists) {
    throw new Error(health.reason || 'ছবি আপলোড করার জন্য Firebase Storage চালু করা প্রয়োজন।');
  }

  const preparedFile = await optimizeImageFileForStorage(params.file);
  const safeId = sanitizeEntityId(params.entityId);
  const safeFile = sanitizeImageFileName(preparedFile.name);
  const uniqueStamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const primaryPath = `${params.folder}/${safeId}/${uniqueStamp}_${safeFile}`;

  try {
    return await uploadResumableToPath(storage, primaryPath, preparedFile, params.onProgress);
  } catch (err) {
    // If updated storage.rules (/products/ or /categories/) has not yet been published,
    // attempt the /media/{folder}/{fileName} path from existing storage.rules.
    if (
      params.folder !== 'media' &&
      err instanceof StorageError &&
      err.code === 'storage/unauthorized'
    ) {
      const legacyMediaPath = `media/${params.folder}/${safeId}_${uniqueStamp}_${safeFile}`;
      try {
        return await uploadResumableToPath(
          storage,
          legacyMediaPath,
          preparedFile,
          params.onProgress
        );
      } catch (fallbackErr) {
        throw new Error(mapStorageUploadError(fallbackErr, legacyMediaPath));
      }
    }

    throw new Error(mapStorageUploadError(err, primaryPath));
  }
}
