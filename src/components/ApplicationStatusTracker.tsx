import { useState } from 'react';
import {
  Award,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileSearch,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import {
  APPLICATION_STATUS_META,
  computeMobileVerificationHash,
  formatRecruitmentDateBn,
  isValidBdMobile,
} from '../lib/recruitment';
import { toBengaliDigits } from '../lib/utils';
import type { JobApplicationStatus, JobApplicationStatusSummary } from '../types';

const STATUS_TIMELINE_STEPS: Array<{
  key: string;
  labelBn: string;
  statuses: JobApplicationStatus[];
}> = [
  { key: 'submitted', labelBn: 'গৃহীত', statuses: ['Submitted'] },
  { key: 'review', labelBn: 'পর্যালোচনা', statuses: ['Under Review'] },
  { key: 'shortlisted', labelBn: 'শর্টলিস্টেড', statuses: ['Shortlisted'] },
  {
    key: 'exam',
    labelBn: 'পরীক্ষা',
    statuses: ['Exam Scheduled', 'Exam Completed'],
  },
  { key: 'interview', labelBn: 'ইন্টারভিউ', statuses: ['Interview'] },
  {
    key: 'decision',
    labelBn: 'চূড়ান্ত ফল',
    statuses: ['Selected', 'Rejected', 'On Hold', 'Withdrawn'],
  },
];

function getStepIndex(status: JobApplicationStatus): number {
  const idx = STATUS_TIMELINE_STEPS.findIndex((s) => s.statuses.includes(status));
  return idx >= 0 ? idx : 0;
}

const INTERVIEW_STATUS_LABEL: Record<string, string> = {
  scheduled: 'নির্ধারিত (Scheduled)',
  completed: 'সম্পন্ন (Completed)',
  cancelled: 'বাতিল (Cancelled)',
};

export function ApplicationStatusTracker({
  initialCode = '',
  initialMobile = '',
}: {
  initialCode?: string;
  initialMobile?: string;
}) {
  const [code, setCode] = useState(initialCode);
  const [mobile, setMobile] = useState(initialMobile);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JobApplicationStatusSummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    setErrorMsg(null);
    setNotFound(false);
    setResult(null);

    if (!cleanCode || !/^[A-Z0-9-]+$/.test(cleanCode) || cleanCode.length < 6) {
      setErrorMsg(
        'অনুগ্রহ করে সঠিক Application ID দিন (যেমন: SN-JOB-2026-00001)।'
      );
      return;
    }

    if (!isValidBdMobile(mobile)) {
      setErrorMsg(
        'যাচাইয়ের জন্য আবেদনকৃত ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।'
      );
      return;
    }

    if (!db) {
      setErrorMsg('ডাটাবেস সংযোগ এই মুহূর্তে সক্রিয় নয়।');
      return;
    }

    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'jobApplicationStatuses', cleanCode));
      if (!snap.exists()) {
        setNotFound(true);
        return;
      }

      const data = snap.data() as JobApplicationStatusSummary;
      if (data.mobileHash) {
        const enteredHash = await computeMobileVerificationHash(mobile);
        if (enteredHash !== data.mobileHash) {
          setErrorMsg(
            'Application ID এবং মোবাইল নম্বর মেলেনি। অনুগ্রহ করে সঠিক মোবাইল নম্বর দিন।'
          );
          return;
        }
      }

      setResult(data);
    } catch (err) {
      setErrorMsg('আবেদনের অবস্থা যাচাই করা যায়নি। একটু পরে আবার চেষ্টা করুন।');
      try {
        handleFirestoreError(err, OperationType.GET, `jobApplicationStatuses/${cleanCode}`);
      } catch {
        // Logged structurally
      }
    } finally {
      setLoading(false);
    }
  };

  const statusMeta = result ? APPLICATION_STATUS_META[result.status] : null;
  const activeStepIdx = result ? getStepIndex(result.status) : 0;

  return (
    <div className="rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] text-[#DC1F26]">
          <FileSearch className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-[#1C1917] sm:text-2xl">
            আবেদনের অবস্থা যাচাই করুন
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-[#57534E] sm:text-sm">
            আপনার Application ID এবং আবেদনকৃত মোবাইল নম্বর দিয়ে বর্তমান অবস্থা, পরীক্ষার সময়সূচি ও ইন্টারভিউ তথ্য দেখুন। নিরাপত্তার স্বার্থে কোনো ব্যক্তিগত তথ্য প্রকাশ করা হয় না।
          </p>
        </div>
      </div>

      <form onSubmit={handleLookup} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-12">
        <div className="sm:col-span-5">
          <label className="mb-1 block text-[11px] font-semibold text-[#57534E]">
            Application ID <span className="text-[#DC1F26]">*</span>
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="যেমন: SN-JOB-2026-00001"
            className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-4 py-2.5 font-mono text-sm uppercase text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
          />
        </div>

        <div className="sm:col-span-4">
          <label className="mb-1 block text-[11px] font-semibold text-[#57534E]">
            মোবাইল নম্বর <span className="text-[#DC1F26]">*</span>
          </label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716C]" />
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="01XXXXXXXXX"
              className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] pl-10 pr-4 py-2.5 font-mono text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-end sm:col-span-3">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#1C1917] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#DC1F26] disabled:opacity-60"
          >
            <Search className="h-4 w-4" />
            <span>{loading ? 'খুঁজছে...' : 'অবস্থা দেখুন'}</span>
          </button>
        </div>
      </form>

      {errorMsg && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 sm:text-sm">
          {errorMsg}
        </div>
      )}

      {notFound && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900 sm:text-sm">
          এই আবেদন নম্বরটি খুঁজে পাওয়া যায়নি। অনুগ্রহ করে Application ID পুনরায় মিলিয়ে দেখুন।
        </div>
      )}

      {result && statusMeta && (
        <div className="mt-6 space-y-5 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4 sm:p-6">
          {/* Header summary */}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E7E5E4] pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-[#DC1F26] sm:text-sm">
                  {result.id}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                  <ShieldCheck className="h-3 w-3" />
                  <span>Verified</span>
                </span>
              </div>
              <h3 className="mt-1 text-base font-bold text-[#1C1917] sm:text-lg">
                {result.jobTitle}
              </h3>
              <p className="text-xs text-[#57534E]">
                ক্যাটাগরি: {result.jobCategory} · আবেদনের তারিখ: {result.submittedDateText}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold ${statusMeta.badgeClass}`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{statusMeta.labelBn}</span>
            </span>
          </div>

          {/* 6-step Progress Indicator */}
          <div>
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-[#78716C]">
              নিয়োগ প্রক্রিয়ার ধাপ
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {STATUS_TIMELINE_STEPS.map((step, idx) => {
                const reached = idx <= activeStepIdx;
                const isCurrent = idx === activeStepIdx;
                const isRejectedFinal =
                  idx === STATUS_TIMELINE_STEPS.length - 1 &&
                  isCurrent &&
                  result.status === 'Rejected';
                return (
                  <div
                    key={step.key}
                    className={`rounded-xl border px-2.5 py-2 text-center transition-colors ${
                      isRejectedFinal
                        ? 'border-red-300 bg-red-50 text-red-800'
                        : isCurrent
                        ? 'border-[#DC1F26] bg-white text-[#DC1F26] shadow-xs'
                        : reached
                        ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
                        : 'border-[#E7E5E4] bg-white/70 text-[#78716C]'
                    }`}
                  >
                    <div className="font-mono text-[10px] font-bold tabular-nums">
                      {toBengaliDigits(idx + 1)}
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold leading-tight">
                      {step.labelBn}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Exam Details */}
          {result.examDate && (
            <div className="rounded-xl border border-purple-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-900 sm:text-sm">
                  <CalendarClock className="h-4 w-4" />
                  <span>{result.examTitle || 'পরীক্ষার সময়সূচি'}</span>
                </div>
                {result.examType && (
                  <span className="rounded-md bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold text-purple-800">
                    {result.examType}
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-[#1C1917] sm:grid-cols-2">
                <p>
                  <span className="font-semibold text-[#57534E]">তারিখ:</span>{' '}
                  {formatRecruitmentDateBn(result.examDate)}
                </p>
                {(result.examStartTime || result.examTime) && (
                  <p className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-purple-700" />
                    <span className="font-semibold text-[#57534E]">সময়:</span>{' '}
                    {result.examStartTime && result.examEndTime
                      ? `${result.examStartTime} – ${result.examEndTime}`
                      : result.examTime || result.examStartTime}
                  </p>
                )}
                {result.examDuration && (
                  <p>
                    <span className="font-semibold text-[#57534E]">সময়কাল:</span>{' '}
                    {result.examDuration}
                  </p>
                )}
                {typeof result.examTotalMarks === 'number' && (
                  <p className="inline-flex items-center gap-1">
                    <Award className="h-3.5 w-3.5 text-purple-700" />
                    <span className="font-semibold text-[#57534E]">মোট নম্বর:</span>{' '}
                    {toBengaliDigits(result.examTotalMarks)}
                    {typeof result.examPassMarks === 'number'
                      ? ` (পাশ: ${toBengaliDigits(result.examPassMarks)})`
                      : ''}
                  </p>
                )}
                {result.examLocation && (
                  <p className="inline-flex items-start gap-1 sm:col-span-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#DC1F26]" />
                    <span>
                      <strong className="font-semibold text-[#57534E]">স্থান:</strong>{' '}
                      {result.examLocation}
                    </span>
                  </p>
                )}
              </div>

              {result.examInstructions && (
                <p className="mt-3 rounded-lg bg-[#FAFAF8] px-3 py-2 text-xs text-[#44403C]">
                  <span className="font-semibold">নির্দেশনা:</span> {result.examInstructions}
                </p>
              )}
            </div>
          )}

          {/* Interview Details */}
          {result.interviewDate && (
            <div className="rounded-xl border border-amber-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#854D0E] sm:text-sm">
                  <CalendarClock className="h-4 w-4" />
                  <span>মৌখিক পরীক্ষা / ইন্টারভিউ</span>
                </div>
                {result.interviewStatus && (
                  <span className="rounded-md bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#854D0E]">
                    {INTERVIEW_STATUS_LABEL[result.interviewStatus] || result.interviewStatus}
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-[#1C1917] sm:grid-cols-2">
                <p>
                  <span className="font-semibold text-[#57534E]">তারিখ:</span>{' '}
                  {formatRecruitmentDateBn(result.interviewDate)}
                </p>
                {result.interviewTime && (
                  <p>
                    <span className="font-semibold text-[#57534E]">সময়:</span>{' '}
                    {result.interviewTime}
                  </p>
                )}
                {result.interviewType && (
                  <p>
                    <span className="font-semibold text-[#57534E]">ধরন:</span>{' '}
                    {result.interviewType}
                  </p>
                )}
                {result.interviewLocation && (
                  <p className="sm:col-span-2">
                    <span className="font-semibold text-[#57534E]">স্থান:</span>{' '}
                    {result.interviewLocation}
                  </p>
                )}
              </div>

              {result.interviewNotes && (
                <p className="mt-3 rounded-lg bg-[#FAFAF8] px-3 py-2 text-xs text-[#44403C]">
                  <span className="font-semibold">নির্দেশনা / নোট:</span>{' '}
                  {result.interviewNotes}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

