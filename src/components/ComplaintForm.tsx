import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Lock, Upload, X } from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useStore } from '../context/StoreContext';
import { CANONICAL_OUTLET_SHOWROOMS, isDemoOrDummyShowroom } from '../data/outletsData';
import { getShowroomText } from '../lib/bilingual';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { compressImageToDataUrl, generateComplaintReference } from '../lib/utils';
import type { ComplaintCategory } from '../types';

const DEFAULT_COMPLAINT_CATEGORIES: ComplaintCategory[] = [
  'পণ্যের মান',
  'সেবার মান',
  'কর্মচারীর আচরণ',
  'মূল্য সংক্রান্ত',
  'শোরুম সংক্রান্ত',
  'অন্যান্য',
];

const COMPLAINT_CATEGORY_LABELS_EN: Record<string, string> = {
  'পণ্যের মান': 'Product Quality',
  'সেবার মান': 'Service Quality',
  'কর্মচারীর আচরণ': 'Staff Behaviour',
  'মূল্য সংক্রান্ত': 'Pricing & Billing',
  'শোরুম সংক্রান্ত': 'Showroom Environment',
  'অন্যান্য': 'Other Feedback',
};

function formatCategoryOptionLabel(cat: string): string {
  const en = COMPLAINT_CATEGORY_LABELS_EN[cat];
  return en ? `${en} — ${cat}` : cat;
}

function formatOutletTitleEn(raw: string): string {
  const cleaned = (raw || '').trim();
  if (!cleaned) return '';
  if (cleaned !== cleaned.toUpperCase()) return cleaned;
  return cleaned
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bH\/S\b/gi, 'H/S')
    .replace(/\bG\.e\.c\b/gi, 'G.E.C')
    .replace(/\bA\.k\b/gi, 'A.K');
}

interface ShowroomOption {
  id: string;
  label: string;
  saveName: string;
}

function normalizeLookupName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, '');
}

export function ComplaintForm() {
  const { showrooms, showroomsLoading, showroomsError, siteSettings, user } = useStore();
  const categoriesList =
    siteSettings.complaintCategories && siteSettings.complaintCategories.length > 0
      ? siteSettings.complaintCategories
      : DEFAULT_COMPLAINT_CATEGORIES;

  const showroomOptions = useMemo<ShowroomOption[]>(() => {
    const source = showrooms.length > 0 ? showrooms : CANONICAL_OUTLET_SHOWROOMS;
    const list: ShowroomOption[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();

    [...source]
      .sort((a, b) => (a.display_order ?? 99) - (b.display_order ?? 99))
      .forEach((sr) => {
        if (!sr.id || sr.deleted || sr.visible === false || isDemoOrDummyShowroom(sr)) return;
        const safeId = sr.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
        const st = getShowroomText(sr);
        const normBn = normalizeLookupName(st.nameBn || sr.name || '');
        const normEn = normalizeLookupName(st.nameEn || sr.nameEn || '');
        if (
          !safeId ||
          seenIds.has(safeId) ||
          (normBn && normEn && seenNames.has(normEn) && seenNames.has(normBn))
        ) {
          return;
        }
        seenIds.add(safeId);
        if (normBn) seenNames.add(normBn);
        if (normEn) seenNames.add(normEn);

        const enTitle = formatOutletTitleEn(st.nameEn || sr.nameEn || st.nameBn || sr.name || safeId);
        const bnTitle = st.nameBn || sr.name || '';
        const baseLabel = bnTitle && bnTitle !== enTitle ? `${enTitle} (${bnTitle})` : enTitle;
        const typeSuffix = sr.isMain ? ' · Office & Outlet' : '';

        list.push({
          id: safeId,
          label: `${baseLabel}${typeSuffix}`,
          saveName: baseLabel.slice(0, 140),
        });
      });

    return list;
  }, [showrooms]);

  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState<string>(categoriesList[0] ?? 'পণ্যের মান');
  const [showroomId, setShowroomId] = useState<string>(
    () => showroomOptions[0]?.id ?? 'general'
  );
  const [message, setMessage] = useState('');
  const [attachmentImage, setAttachmentImage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  useEffect(() => {
    if (categoriesList.length > 0 && !categoriesList.includes(category)) {
      setCategory(categoriesList[0]);
    }
  }, [categoriesList, category]);

  useEffect(() => {
    if (showroomOptions.length === 0) {
      if (showroomId !== 'general') setShowroomId('general');
      return;
    }
    if (
      showroomId !== 'general' &&
      !showroomOptions.some((opt) => opt.id === showroomId)
    ) {
      setShowroomId(showroomOptions[0].id);
    }
  }, [showroomOptions, showroomId]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file, 900, 0.72);
      setAttachmentImage(compressed);
      setError(null);
    } catch {
      setError('Unable to process this image. Please choose a valid JPG or PNG file.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!db) {
      setError('Database connection is unavailable right now. Please call our hotline.');
      return;
    }

    if (customerName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (phone.trim().length < 6) {
      setError('Please enter a valid contact phone number.');
      return;
    }
    if (!showroomId) {
      setError('Please select the relevant showroom.');
      return;
    }
    if (message.trim().length < 5) {
      setError('Please describe your concern in detail (at least 5 characters).');
      return;
    }

    setSubmitting(true);
    const id = `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const rawRef = generateComplaintReference();
    const prefix =
      (siteSettings.complaintRefPrefix || 'HRF').replace(/[^A-Z0-9]/gi, '').toUpperCase() ||
      'HRF';
    const referenceCode = rawRef.replace(/^HRF-/, `${prefix}-`);
    const selectedOption = showroomOptions.find((s) => s.id === showroomId);

    try {
      await setDoc(doc(db, 'complaints', id), {
        id,
        referenceCode,
        submittedByUid: user?.uid || '',
        customerName: customerName.trim().slice(0, 120),
        phone: phone.trim().slice(0, 32),
        email: email.trim().slice(0, 254),
        category,
        showroomId: selectedOption?.id ?? 'general',
        showroomName: selectedOption?.saveName ?? 'General / Multiple Outlets',
        message: message.trim().slice(0, 3000),
        attachmentImage,
        status: 'New',
        priority: 'Normal',
        adminNote: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSubmittedRef(referenceCode);
      setCustomerName('');
      setPhone('');
      setEmail('');
      setMessage('');
      setAttachmentImage('');
    } catch (err) {
      setError('Unable to submit your complaint right now. Please try again.');
      try {
        handleFirestoreError(err, OperationType.CREATE, `complaints/${id}`);
      } catch {
        // Logged cleanly
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedRef) {
    return (
      <div className="rounded-2xl border border-[#E7E5E4] bg-white p-8 text-center sm:p-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="font-display mt-4 text-2xl font-bold text-[#1C1917]">
          Complaint Received
        </h3>
        <p className="font-bn mt-0.5 text-xs text-[#78716C]">আপনার অভিযোগ সফলভাবে গ্রহণ করা হয়েছে</p>
        <p className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-[#44403C]">
          Thank you for bringing this to our attention. Our management team will review your note
          and follow up promptly.
        </p>
        <div className="mx-auto mt-5 inline-block rounded-lg border border-[#E7E5E4] bg-[#FAFAF8] px-5 py-3">
          <p className="text-xs text-[#78716C]">Reference Number</p>
          <p className="font-mono tabular-nums mt-0.5 text-lg font-bold text-[#DC1F26]">
            {submittedRef}
          </p>
        </div>
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setSubmittedRef(null)}
            className="cursor-pointer rounded-lg bg-[#1C1917] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#DC1F26]"
          >
            Submit Another Feedback
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-8"
    >
      <div className="mb-6 flex items-start gap-3 border-b border-[#F5F4F0] pb-4">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-[#DC1F26]" />
        <div>
          <h3 className="font-display text-xl font-bold text-[#1C1917]">
            Confidential Feedback Form
          </h3>
          <p className="mt-0.5 text-xs text-[#57534E]">
            Your submission is strictly private and visible only to our authorized management team—never
            to other visitors.
          </p>
          <p className="font-bn mt-0.5 text-[11px] text-[#78716C]">
            আপনার অভিযোগ সম্পূর্ণ গোপন রাখা হয়।
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 sm:text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label
            htmlFor="complaint-name"
            className="mb-1.5 block text-xs font-semibold text-[#1C1917]"
          >
            Your Full Name <span className="text-red-600">*</span>
          </label>
          <input
            id="complaint-name"
            type="text"
            required
            maxLength={120}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="e.g. Tanvir Ahmed"
            className="min-h-[44px] w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="complaint-phone"
            className="mb-1.5 block text-xs font-semibold text-[#1C1917]"
          >
            Phone Number <span className="text-red-600">*</span>
          </label>
          <input
            id="complaint-phone"
            type="tel"
            required
            maxLength={32}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
            className="min-h-[44px] w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="complaint-email"
            className="mb-1.5 block text-xs font-semibold text-[#1C1917]"
          >
            Email (Optional)
          </label>
          <input
            id="complaint-email"
            type="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@email.com"
            className="min-h-[44px] w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="complaint-category"
            className="mb-1.5 block text-xs font-semibold text-[#1C1917]"
          >
            Feedback Category <span className="text-red-600">*</span>
          </label>
          <select
            id="complaint-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
          >
            {categoriesList.map((cat) => (
              <option key={cat} value={cat}>
                {formatCategoryOptionLabel(cat)}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label
              htmlFor="complaint-showroom"
              className="block text-xs font-semibold text-[#1C1917]"
            >
              Showroom / Outlet <span className="text-red-600">*</span>
            </label>
            {showroomsLoading && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#78716C]">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Loading outlets...</span>
              </span>
            )}
          </div>
          <select
            id="complaint-showroom"
            required
            value={showroomId}
            onChange={(e) => setShowroomId(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
          >
            {showroomOptions.length === 0 ? (
              <option value="general">General / Multiple Outlets</option>
            ) : (
              <>
                {showroomOptions.map((sr) => (
                  <option key={sr.id} value={sr.id}>
                    {sr.label}
                  </option>
                ))}
                <option value="general">General / Multiple Outlets (সাধারণ)</option>
              </>
            )}
          </select>
          {showroomsError && (
            <p className="mt-1.5 text-[11px] text-amber-800">{showroomsError}</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="complaint-message"
            className="mb-1.5 block text-xs font-semibold text-[#1C1917]"
          >
            Details <span className="text-red-600">*</span>
          </label>
          <textarea
            id="complaint-message"
            required
            rows={4}
            maxLength={3000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Please share what happened, including approximate date, time, and item details..."
            className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
            Attach Photo (Optional)
          </label>
          {attachmentImage ? (
            <div className="relative inline-block overflow-hidden rounded-lg border border-[#D6D3D1]">
              <img
                src={attachmentImage}
                alt="Complaint attachment preview"
                className="h-28 w-auto object-cover"
              />
              <button
                type="button"
                onClick={() => setAttachmentImage('')}
                aria-label="Remove attachment"
                className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-white hover:bg-black"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#D6D3D1] bg-[#FAFAF8] px-4 py-4 text-xs font-medium text-[#57534E] transition-colors hover:border-[#DC1F26] hover:text-[#1C1917]">
              <Upload className="h-4 w-4" />
              <span>Click to attach a photo (JPG / PNG)</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-[#F5F4F0] pt-5 sm:flex-row">
        <span className="text-xs text-[#78716C]">
          You will receive a confidential reference code immediately upon submission.
        </span>
        <button
          type="submit"
          disabled={submitting}
          className="min-h-[44px] w-full cursor-pointer rounded-lg bg-[#1C1917] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#DC1F26] disabled:opacity-50 sm:w-auto"
        >
          {submitting ? 'Submitting...' : 'Submit Feedback'}
        </button>
      </div>
    </form>
  );
}
