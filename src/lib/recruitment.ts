import {
  type Firestore,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import type { JobApplicationStatus, JobPosting } from '../types';
import { toBengaliDigits } from './utils';

export const JOB_CATEGORY_PRESETS = [
  'গোডাউন কর্মচারী',
  'ডেলিভারি ম্যান',
  'সেলসম্যান',
  'অফিস ম্যানেজমেন্ট',
  'অফিস সহকারী',
  'হিসাবরক্ষক',
  'কাস্টমার সার্ভিস',
  'মার্কেটিং',
  'ডিজিটাল মার্কেটিং',
  'প্যাকেজিং কর্মী',
  'কুক / বেকারি কর্মী',
  'ড্রাইভার',
  'অন্যান্য',
] as const;

export const JOB_CATEGORY_LABELS_EN: Record<string, string> = {
  'গোডাউন কর্মচারী': 'Warehouse & Store Staff',
  'ডেলিভারি ম্যান': 'Delivery Executive',
  'সেলসম্যান': 'Showroom Sales Associate',
  'অফিস ম্যানেজমেন্ট': 'Office Management',
  'অফিস সহকারী': 'Office Assistant',
  'হিসাবরক্ষক': 'Accountant',
  'কাস্টমার সার্ভিস': 'Customer Service',
  'মার্কেটিং': 'Marketing',
  'ডিজিটাল মার্কেটিং': 'Digital Marketing',
  'প্যাকেজিং কর্মী': 'Packaging Staff',
  'কুক / বেকারি কর্মী': 'Bakery & Kitchen Staff',
  'ড্রাইভার': 'Driver',
  'অন্যান্য': 'Other Roles',
};

export function getJobCategoryDisplay(category: string): { en: string; bn: string } {
  const trimmed = (category || '').trim();
  const en = JOB_CATEGORY_LABELS_EN[trimmed] || trimmed || 'General Role';
  const bn = en !== trimmed ? trimmed : '';
  return { en, bn };
}

export const EMPLOYMENT_TYPE_OPTIONS: ReadonlyArray<{
  value: string;
  labelEn: string;
  labelBn: string;
}> = [
  { value: 'Full-time', labelEn: 'Full-time', labelBn: 'পূর্ণকালীন' },
  { value: 'Part-time', labelEn: 'Part-time', labelBn: 'খণ্ডকালীন' },
  { value: 'Contractual', labelEn: 'Contractual', labelBn: 'চুক্তিভিত্তিক' },
  { value: 'Shift-based', labelEn: 'Shift-based', labelBn: 'শিফট ভিত্তিক' },
];

export const SALARY_TYPE_OPTIONS: ReadonlyArray<{
  value: string;
  labelEn: string;
  labelBn: string;
}> = [
  { value: 'Fixed', labelEn: 'Fixed Salary', labelBn: 'নির্ধারিত বেতন' },
  { value: 'Range', labelEn: 'Salary Range', labelBn: 'বেতন পরিসীমা' },
  { value: 'Negotiable', labelEn: 'Negotiable', labelBn: 'আলোচনা সাপেক্ষে' },
];

export const APPLICATION_STATUS_OPTIONS: JobApplicationStatus[] = [
  'Submitted',
  'Under Review',
  'Shortlisted',
  'Exam Scheduled',
  'Exam Completed',
  'Interview',
  'Selected',
  'Rejected',
  'On Hold',
  'Withdrawn',
];

export const APPLICATION_STATUS_META: Record<
  JobApplicationStatus,
  { labelBn: string; labelEn: string; badgeClass: string }
> = {
  Submitted: {
    labelBn: 'আবেদন গৃহীত',
    labelEn: 'Submitted',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  'Under Review': {
    labelBn: 'পর্যালোচনাধীন',
    labelEn: 'Under Review',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  Shortlisted: {
    labelBn: 'সংক্ষিপ্ত তালিকাভুক্ত',
    labelEn: 'Shortlisted',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  'Exam Scheduled': {
    labelBn: 'পরীক্ষার সময় নির্ধারিত',
    labelEn: 'Exam Scheduled',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
  },
  'Exam Completed': {
    labelBn: 'পরীক্ষা সম্পন্ন',
    labelEn: 'Exam Completed',
    badgeClass: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  },
  Interview: {
    labelBn: 'মৌখিক পরীক্ষা / ইন্টারভিউ',
    labelEn: 'Interview',
    badgeClass: 'bg-[#FEF9C3] text-[#854D0E] border-[#FDE047]',
  },
  Selected: {
    labelBn: 'চূড়ান্তভাবে নির্বাচিত',
    labelEn: 'Selected',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  Rejected: {
    labelBn: 'অনির্বাচিত',
    labelEn: 'Rejected',
    badgeClass: 'bg-red-50 text-red-800 border-red-200',
  },
  'On Hold': {
    labelBn: 'অপেক্ষমাণ',
    labelEn: 'On Hold',
    badgeClass: 'bg-stone-100 text-stone-700 border-stone-300',
  },
  Withdrawn: {
    labelBn: 'প্রত্যাহারকৃত',
    labelEn: 'Withdrawn',
    badgeClass: 'bg-neutral-100 text-neutral-600 border-neutral-300',
  },
};

export function getLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type JobWindowState = 'open' | 'upcoming' | 'expired' | 'closed' | 'draft' | 'hidden';

export function getJobWindowState(job: JobPosting, todayIso = getLocalTodayIso()): JobWindowState {
  if (job.deleted || job.status === 'Hidden') return 'hidden';
  if (job.status === 'Draft') return 'draft';
  if (job.status === 'Closed') return 'closed';
  if (job.startDate && todayIso < job.startDate) return 'upcoming';
  if (job.deadline && todayIso > job.deadline) return 'expired';
  return 'open';
}

export function getJobWindowLabelEn(state: JobWindowState): string {
  switch (state) {
    case 'open':
      return 'Accepting Applications';
    case 'upcoming':
      return 'Opening Soon';
    case 'expired':
      return 'Deadline Passed';
    case 'closed':
      return 'Recruitment Closed';
    case 'draft':
      return 'Draft';
    case 'hidden':
      return 'Hidden';
  }
}

export function getJobWindowLabelBn(state: JobWindowState): string {
  switch (state) {
    case 'open':
      return 'আবেদন চলছে';
    case 'upcoming':
      return 'আবেদন এখনো শুরু হয়নি';
    case 'expired':
      return 'আবেদনের সময় শেষ হয়েছে';
    case 'closed':
      return 'নিয়োগ বন্ধ করা হয়েছে';
    case 'draft':
      return 'খসড়া (Draft)';
    case 'hidden':
      return 'গোপন (Hidden)';
  }
}

const EN_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const BN_MONTHS = [
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

export function formatRecruitmentDateEn(isoDate?: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return isoDate || '—';
  }
  const [y, m, d] = isoDate.split('-').map(Number);
  const monthName = EN_MONTHS[(m || 1) - 1] || '';
  return `${String(d).padStart(2, '0')} ${monthName} ${y}`;
}

export function formatRecruitmentDateBn(isoDate?: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return isoDate || '—';
  }
  const [y, m, d] = isoDate.split('-').map(Number);
  const monthName = BN_MONTHS[(m || 1) - 1] || '';
  return `${toBengaliDigits(d)} ${monthName}, ${toBengaliDigits(y)}`;
}

export function getEmploymentTypeEn(val: string): string {
  const found = EMPLOYMENT_TYPE_OPTIONS.find((opt) => opt.value === val);
  return found ? found.labelEn : val || 'Full-time';
}

export function getEmploymentTypeBn(val: string): string {
  const found = EMPLOYMENT_TYPE_OPTIONS.find((opt) => opt.value === val);
  return found ? found.labelBn : val || 'Full-time';
}

export function normalizeBdMobile(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, '').replace(/^\+?88/, '');
  return digits;
}

export function isValidBdMobile(raw: string): boolean {
  const normalized = normalizeBdMobile(raw);
  return /^01[3-9]\d{8}$/.test(normalized);
}

export function normalizeNidNumber(raw: string): string {
  return raw.replace(/[\s-]/g, '').trim();
}

export function isValidOptionalEmail(raw: string): boolean {
  const clean = raw.trim();
  if (!clean) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean);
}

export function formatSnJobApplicationId(year: number, seq: number): string {
  const safeSeq = Math.max(1, Math.floor(seq));
  return `SN-JOB-${year}-${String(safeSeq).padStart(5, '0')}`;
}

export async function reserveNextApplicationId(firestore: Firestore): Promise<string> {
  const year = new Date().getFullYear();
  const yearId = String(year);
  const counterRef = doc(firestore, 'jobApplicationCounters', yearId);

  const nextSeq = await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(counterRef);
    const currentSeq = snap.exists() ? Number(snap.data()?.lastSeq || 0) : 0;
    const incremented = currentSeq + 1;
    tx.set(counterRef, {
      id: yearId,
      lastSeq: incremented,
      updatedAt: serverTimestamp(),
    });
    return incremented;
  });

  return formatSnJobApplicationId(year, nextSeq);
}

export function generateApplicationCode(): string {
  const year = new Date().getFullYear();
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  const suffix = Array.from(arr, (b) => chars[b % chars.length]).join('');
  return `SN-JOB-${year}-${suffix}`;
}

export function toJobSlug(title: string, category?: string): string {
  const base = `${title} ${category || ''}`
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const shortRand = Math.random().toString(36).slice(2, 6);
  if (base.length >= 3) {
    return `${base.slice(0, 72)}-${shortRand}`;
  }
  return `job-circular-${Date.now().toString(36)}-${shortRand}`;
}

export async function computeSha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${(h >>> 0).toString(16).padStart(8, '0')}${input.length.toString(16).padStart(8, '0')}`;
}

export async function computeMobileVerificationHash(rawMobile: string): Promise<string> {
  const normalized = normalizeBdMobile(rawMobile);
  return computeSha256Hex(`hrf-status::${normalized}`);
}

export async function computeJobApplicationLock(
  jobId: string,
  rawValue: string,
  keyType: 'mobile' | 'nid' = 'mobile'
): Promise<{ lockId: string; keyHash: string }> {
  const normalized =
    keyType === 'nid' ? normalizeNidNumber(rawValue) : normalizeBdMobile(rawValue);
  const input = `${jobId}::${keyType}::${normalized}`;
  const keyHash = await computeSha256Hex(input);
  const safeJobPrefix = jobId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  const prefix = keyType === 'nid' ? 'n' : 'm';
  const lockId = `${safeJobPrefix}__${prefix}_${keyHash.slice(0, 32)}`;
  return { lockId, keyHash };
}

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_DOC_BYTES = 5 * 1024 * 1024;

export function validatePhotoFile(file: File): string | null {
  const nameLower = file.name.toLowerCase();
  const validExt = /\.(jpe?g|png)$/.test(nameLower);
  const validMime = ['image/jpeg', 'image/jpg', 'image/png'].includes(file.type);
  if (!validMime && !validExt) {
    return 'Please upload the candidate photo in JPG, JPEG, or PNG format only.';
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return 'Candidate photo size must not exceed 2 MB.';
  }
  return null;
}

export function validateDocumentFile(file: File): string | null {
  const nameLower = file.name.toLowerCase();
  const validExt = /\.(jpe?g|png|pdf|docx?)$/.test(nameLower);
  const validMime = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ].includes(file.type);
  if (!validMime && !validExt) {
    return 'Please upload documents in PDF, DOC, DOCX, JPG, or PNG format only.';
  }
  if (file.size > MAX_DOC_BYTES) {
    return 'Each document file must not exceed 5 MB.';
  }
  return null;
}

export function sanitizeUploadFileName(fileName: string): string {
  const cleaned = fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  return cleaned.slice(-80) || `file_${Date.now()}`;
}

export async function uploadRecruitmentFile(
  _storagePath: string,
  _file: File
): Promise<string> {
  throw new Error(
    'Document upload storage is currently being connected. Please try again shortly.'
  );
}
