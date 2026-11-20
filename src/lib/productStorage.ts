import {
  FirebaseStorage,
  StorageError,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { auth, storage } from './firebase';
import { compressImageToDataUrl } from './utils';

export const ALLOWED_PRODUCT_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const STORAGE_STALL_TIMEOUT_MS = 12000;
const BUCKET_PROBE_TIMEOUT_MS = 3500;
const FIRESTORE_IMAGE_MAX_BYTES = 135000;

export type CatalogUploadMode = 'firebase-storage' | 'firestore-compressed';

export interface CatalogImageUploadResult {
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  sizeBytes: number;
  mode: CatalogUploadMode;
  fallbackReason?: string;
}

interface BucketHealthCacheEntry {
  exists: boolean;
  checkedAt: number;
  reason?: string;
}

const bucketHealthCache = new Map<string, BucketHealthCacheEntry>();

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
    return 'অনুগ্রহ করে একটি ছবি নির্বাচন করুন। (No file selected)';
  }

  const lowerName = file.name.trim().toLowerCase();
  const rawMime = file.type.trim().toLowerCase();
  const validExtension = /\.(jpe?g|png|webp)$/.test(lowerName);
  const validMime = ALLOWED_PRODUCT_IMAGE_TYPES.includes(
    rawMime as (typeof ALLOWED_PRODUCT_IMAGE_TYPES)[number]
  );

  // Reject non-image MIME types strictly even if a user renamed e.g. file.pdf -> file.jpg
  if (rawMime ? !validMime : !validExtension) {
    return 'অসমর্থিত ফাইল ফরম্যাট! শুধু JPG, JPEG, PNG অথবা WEBP ছবি আপলোড করুন।';
  }

  if (file.size <= 0) {
    return 'নির্বাচিত ফাইলটি খালি। অনুগ্রহ করে সঠিক ছবি দিন।';
  }

  if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return `ছবির আকার অনেক বড় (${sizeMb} MB)। সর্বোচ্চ 5 MB আকারের ছবি আপলোড করা যাবে।`;
  }

  return null;
}

/**
 * Simple CORS GET request (no custom headers -> no preflight OPTIONS) to check
 * whether the Firebase Storage bucket actually exists before calling uploadBytesResumable.
 * When a bucket doesn't exist, preflight OPTIONS returns 404, which browsers turn into
 * status=0 network errors that cause Firebase Storage SDK to retry silently for 10 minutes.
 */
async function probeStorageBucketHealth(
  bucketName: string
): Promise<{ exists: boolean; reason?: string }> {
  const normalizedBucket = bucketName.replace(/^gs:\/\//, '').trim();
  if (!normalizedBucket) {
    return {
      exists: false,
      reason: 'VITE_FIREBASE_STORAGE_BUCKET কনফিগার করা নেই।',
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
      const reason = `Firebase Storage bucket (${normalizedBucket}) এখনো Firebase Console-এ চালু করা হয়নি (404 Bucket Not Found)।`;
      bucketHealthCache.set(normalizedBucket, {
        exists: false,
        checkedAt: now,
        reason,
      });
      return { exists: false, reason };
    }

    // 200, 401, or 403 means the bucket exists and Storage rules responded
    bucketHealthCache.set(normalizedBucket, { exists: true, checkedAt: now });
    return { exists: true };
  } catch {
    // If probe itself hits a timeout or network block, let uploadResumableToPath + stall watchdog decide
    return { exists: true };
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function mapStorageUploadError(err: unknown): string {
  if (err instanceof StorageError) {
    const details = `${err.message || ''} ${err.serverResponse || ''}`.toLowerCase();
    switch (err.code) {
      case 'storage/bucket-not-found':
      case 'storage/project-not-found':
        return 'Firebase Storage bucket পাওয়া যায়নি (404)। Firebase Console → Build → Storage → Get Started চালু করে storage.rules পাবলিশ করুন।';
      case 'storage/unauthorized':
        return 'Firebase Storage-এ ছবি আপলোডের অনুমতি পাওয়া যায়নি (403)। অ্যাডমিন একাউন্ট রিফ্রেশ করুন বা Firebase Console-এ storage.rules পাবলিশ করুন।';
      case 'storage/canceled':
        return 'আপলোড সংযোগ দীর্ঘক্ষণ সাড়া দেয়নি বা বাতিল হয়েছে (Storage bucket বা নেটওয়ার্ক যাচাই করুন)।';
      case 'storage/quota-exceeded':
        return 'Firebase Storage কোটা পূর্ণ হয়ে গেছে।';
      case 'storage/retry-limit-exceeded':
        return 'Firebase Storage-এ সংযোগ সম্পন্ন হয়নি (সম্ভবত Storage bucket চালু নেই অথবা CORS/নেটওয়ার্ক ব্লক হয়েছে)।';
      case 'storage/unauthenticated':
        return 'অ্যাডমিন লগইন সেশন পাওয়া যায়নি। পুনরায় লগইন করুন।';
      case 'storage/unknown':
        if (
          details.includes('404') ||
          details.includes('not found') ||
          details.includes('bucket')
        ) {
          return 'Firebase Storage চালু বা কনফিগার করা পাওয়া যায়নি (404)। Firebase Console → Build → Storage → Get Started চালু করুন।';
        }
        return `Storage আপলোড ব্যর্থ (${err.code})। Firebase Storage সেটআপ ও নেটওয়ার্ক যাচাই করুন।`;
      default:
        return `Storage আপলোড ব্যর্থ (${err.code})। আবার চেষ্টা করুন।`;
    }
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'ছবি আপলোড করা যায়নি। নেটওয়ার্ক ও Firebase Storage কনফিগারেশন যাচাই করুন।';
}

function isStorageInfrastructureUnavailable(err: unknown): boolean {
  if (err instanceof StorageError) {
    if (
      err.code === 'storage/bucket-not-found' ||
      err.code === 'storage/project-not-found' ||
      err.code === 'storage/unauthorized' ||
      err.code === 'storage/retry-limit-exceeded' ||
      err.code === 'storage/canceled' ||
      err.code === 'storage/unknown'
    ) {
      return true;
    }
  }
  if (err instanceof Error && err.message.includes('STORAGE_STALL_TIMEOUT')) {
    return true;
  }
  return false;
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
            'STORAGE_STALL_TIMEOUT: Firebase Storage ১২ সেকেন্ডে কোনো সাড়া দেয়নি (সম্ভবত Storage bucket চালু নেই বা CORS ব্লক হয়েছে)।'
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
        // Only report 1-99% after actual bytes move; avoid fake 1% on 0 bytes
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
          if (!downloadUrl || !downloadUrl.startsWith('https://')) {
            settled = true;
            reject(new Error('Firebase Storage থেকে বৈধ ডাউনলোড URL পাওয়া যায়নি।'));
            return;
          }
          settled = true;
          onProgress?.(100);
          resolve({
            downloadUrl,
            storagePath,
            fileName: file.name,
            sizeBytes: file.size,
            mode: 'firebase-storage',
          });
        } catch (urlErr) {
          settled = true;
          reject(urlErr);
        }
      }
    );
  });
}

async function compressCatalogFallback(
  file: File,
  fallbackReason: string,
  onProgress?: (percent: number) => void
): Promise<CatalogImageUploadResult> {
  onProgress?.(45);
  const compressedDataUrl = await compressImageToDataUrl(
    file,
    840,
    0.8,
    FIRESTORE_IMAGE_MAX_BYTES
  );
  onProgress?.(100);
  return {
    downloadUrl: compressedDataUrl,
    storagePath: '',
    fileName: file.name,
    sizeBytes: compressedDataUrl.length,
    mode: 'firestore-compressed',
    fallbackReason,
  };
}

export async function uploadCatalogImageToStorage(params: {
  folder: 'products' | 'categories';
  entityId: string;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<CatalogImageUploadResult> {
  const validationError = validateCatalogImageFile(params.file);
  if (validationError) {
    throw new Error(validationError);
  }

  if (!auth?.currentUser) {
    throw new Error('ছবি আপলোড করতে অ্যাডমিন একাউন্টে লগইন থাকতে হবে।');
  }

  if (!auth.currentUser.emailVerified) {
    throw new Error(
      'অ্যাডমিন ইমেইল ভেরিফাইড না হলে ছবি আপলোড করা যাবে না। ইমেইল ভেরিফাই করে পুনরায় চেষ্টা করুন।'
    );
  }

  try {
    await auth.currentUser.getIdToken();
  } catch {
    throw new Error('অ্যাডমিন লগইন টোকেন রিফ্রেশ করা যায়নি। পুনরায় লগইন করুন।');
  }

  if (!storage) {
    return compressCatalogFallback(
      params.file,
      'Firebase Storage কনফিগার করা নেই; অপ্টিমাইজড ডাটাবেস ছবি হিসেবে প্রস্তুত করা হয়েছে।',
      params.onProgress
    );
  }

  const configuredBucket = storage.app.options.storageBucket || '';
  const health = await probeStorageBucketHealth(configuredBucket);
  if (!health.exists) {
    return compressCatalogFallback(
      params.file,
      health.reason ||
        'Firebase Storage bucket এখনো চালু নেই (404); অপ্টিমাইজড ছবি হিসেবে ডাটাবেসের জন্য প্রস্তুত করা হয়েছে।',
      params.onProgress
    );
  }

  const safeId = sanitizeEntityId(params.entityId);
  const safeFile = sanitizeImageFileName(params.file.name);
  const uniqueStamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const primaryPath = `${params.folder}/${safeId}/${uniqueStamp}_${safeFile}`;

  try {
    return await uploadResumableToPath(storage, primaryPath, params.file, params.onProgress);
  } catch (err) {
    // If updated storage.rules (/products/ or /categories/) has not yet been deployed to Firebase Console,
    // attempt the existing /media/{folder}/{fileName} path allowed in prior storage.rules.
    if (err instanceof StorageError && err.code === 'storage/unauthorized') {
      const legacyMediaPath = `media/${params.folder}/${safeId}_${uniqueStamp}_${safeFile}`;
      try {
        return await uploadResumableToPath(
          storage,
          legacyMediaPath,
          params.file,
          params.onProgress
        );
      } catch (fallbackErr) {
        if (isStorageInfrastructureUnavailable(fallbackErr)) {
          return compressCatalogFallback(
            params.file,
            mapStorageUploadError(fallbackErr),
            params.onProgress
          );
        }
        throw new Error(mapStorageUploadError(fallbackErr));
      }
    }

    if (isStorageInfrastructureUnavailable(err)) {
      return compressCatalogFallback(
        params.file,
        mapStorageUploadError(err),
        params.onProgress
      );
    }

    throw new Error(mapStorageUploadError(err));
  }
}
