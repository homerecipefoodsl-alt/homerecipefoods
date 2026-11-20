const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

const BENGALI_MONTHS = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
];

export function toBengaliDigits(value: number | string): string {
  return String(value).replace(/\d/g, (digit) => BENGALI_DIGITS[Number(digit)] ?? digit);
}

export function getDynamicBengaliDate(date: Date = new Date()): string {
  const day = toBengaliDigits(date.getDate());
  const month = BENGALI_MONTHS[date.getMonth()] ?? '';
  const year = toBengaliDigits(date.getFullYear());
  return `আজ ${day} ${month}, ${year}`;
}

export function formatBdtPrice(amount: number): string {
  const formatted = new Intl.NumberFormat('en-IN').format(Math.round(amount));
  return `৳ ${formatted}`;
}

export function toSlug(text: string): string {
  const normalized = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140)
    .replace(/-+$/g, '');
  return normalized || `item-${Date.now()}`;
}

export function generateSessionId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(28);
  crypto.getRandomValues(array);
  return 'hrf_' + Array.from(array, (b) => chars[b % chars.length]).join('');
}

export function generateComplaintReference(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  const code = Array.from(array, (b) => chars[b % chars.length]).join('');
  return `HRF-${code}`;
}

export async function compressImageToDataUrl(
  file: File,
  maxDimension = 960,
  quality = 0.78,
  maxBytes = 380000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        let targetMax = maxDimension;
        const attemptQualities = [quality, 0.72, 0.62, 0.52, 0.42];
        let bestDataUrl = '';

        for (let pass = 0; pass < 3; pass += 1) {
          let width = img.width;
          let height = img.height;
          if (width > targetMax || height > targetMax) {
            if (width >= height) {
              height = Math.max(1, Math.round((height * targetMax) / width));
              width = targetMax;
            } else {
              width = Math.max(1, Math.round((width * targetMax) / height));
              height = targetMax;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context unavailable.'));
            return;
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          for (const q of attemptQualities) {
            const candidate = canvas.toDataURL('image/jpeg', q);
            bestDataUrl = candidate;
            if (candidate.length <= maxBytes) {
              resolve(candidate);
              return;
            }
          }
          targetMax = Math.round(targetMax * 0.72);
        }

        if (bestDataUrl.length <= 395000) {
          resolve(bestDataUrl);
          return;
        }
        reject(new Error('ছবিটি কমপ্রেস করার পরও ডাটাবেস সীমার চেয়ে বড় রয়ে গেছে। অনুগ্রহ করে অপেক্ষাকৃত ছোট ছবি দিন।'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
