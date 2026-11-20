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

export interface CatalogImageUploadResult {
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  sizeBytes: number;
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

export function validateCatalogImageFile(file: File): string | null {
  if (!file) {
    return 'অনুগ্রহ করে একটি ছবি নির্বাচন করুন। (No file selected)';
  }

  const lowerName = file.name.toLowerCase();
  const validExtension = /\.(jpe?g|png|webp)$/.test(lowerName);
  const validMime = ALLOWED_PRODUCT_IMAGE_TYPES.includes(
    file.type.toLowerCase() as (typeof ALLOWED_PRODUCT_IMAGE_TYPES)[number]
  );

  if (!validMime && !validExtension) {
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

function mapStorageUploadError(err: unknown): string {
  if (err instanceof StorageError) {
    switch (err.code) {
      case 'storage/unauthorized':
        return 'Firebase Storage-এ ছবি আপলোডের অনুমতি পাওয়া যায়নি। লগইন সেশন রিফ্রেশ করুন অথবা Firebase Console-এ storage.rules পাবলিশ করুন।';
      case 'storage/canceled':
        return 'ছবি আপলোড বাতিল করা হয়েছে।';
      case 'storage/quota-exceeded':
        return 'Firebase Storage কোটা পূর্ণ হয়ে গেছে।';
      case 'storage/retry-limit-exceeded':
        return 'নেটওয়ার্ক সমস্যার কারণে আপলোড সম্পন্ন হয়নি। ইন্টারনেট সংযোগ যাচাই করে আবার চেষ্টা করুন।';
      case 'storage/unauthenticated':
        return 'অ্যাডমিন লগইন সেশন পাওয়া যায়নি। পুনরায় লগইন করুন।';
      default:
        return `Storage আপলোড ব্যর্থ (${err.code})। আবার চেষ্টা করুন।`;
    }
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'ছবি আপলোড করা যায়নি। নেটওয়ার্ক ও Firebase Storage কনফিগারেশন যাচাই করুন।';
}

function uploadResumableToPath(
  activeStorage: FirebaseStorage,
  storagePath: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<CatalogImageUploadResult> {
  return new Promise((resolve, reject) => {
    const storageRef = ref(activeStorage, storagePath);
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
    });

    task.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0 && onProgress) {
          const pct = Math.min(
            99,
            Math.max(1, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100))
          );
          onProgress(pct);
        }
      },
      (err) => reject(err),
      async () => {
        try {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          onProgress?.(100);
          resolve({
            downloadUrl,
            storagePath,
            fileName: file.name,
            sizeBytes: file.size,
          });
        } catch (urlErr) {
          reject(urlErr);
        }
      }
    );
  });
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

  if (!storage) {
    throw new Error(
      'Firebase Storage কনফিগার করা নেই। VITE_FIREBASE_STORAGE_BUCKET যাচাই করুন।'
    );
  }

  if (!auth?.currentUser) {
    throw new Error('ছবি আপলোড করতে অ্যাডমিন একাউন্টে লগইন থাকতে হবে।');
  }

  const safeId = sanitizeEntityId(params.entityId);
  const safeFile = sanitizeImageFileName(params.file.name);
  const uniqueStamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const primaryPath = `${params.folder}/${safeId}/${uniqueStamp}_${safeFile}`;

  try {
    return await uploadResumableToPath(storage, primaryPath, params.file, params.onProgress);
  } catch (err) {
    // If updated storage.rules (/products/ or /categories/) has not yet been deployed to Firebase Console,
    // attempt the existing /media/{folder}/{fileName} path allowed in the prior deployed storage.rules.
    if (err instanceof StorageError && err.code === 'storage/unauthorized') {
      const legacyMediaPath = `media/${params.folder}/${safeId}_${uniqueStamp}_${safeFile}`;
      try {
        return await uploadResumableToPath(storage, legacyMediaPath, params.file, params.onProgress);
      } catch (fallbackErr) {
        throw new Error(mapStorageUploadError(fallbackErr));
      }
    }
    throw new Error(mapStorageUploadError(err));
  }
}
