import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Clock,
  GraduationCap,
  MapPin,
  Phone,
  Users,
} from 'lucide-react';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { ApplicationStatusTracker } from '../components/ApplicationStatusTracker';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import {
  formatRecruitmentDateBn,
  getEmploymentTypeBn,
  getJobWindowLabelBn,
  getJobWindowState,
} from '../lib/recruitment';
import { toBengaliDigits } from '../lib/utils';
import type { JobPosting } from '../types';

export function JobDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [job, setJob] = useState<JobPosting | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadJob = async () => {
      if (!db || !slug) {
        if (active) setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, 'jobPostings'),
            where('status', '==', 'Published'),
            where('slug', '==', slug),
            limit(1)
          )
        );
        if (!active) return;
        let foundJob: JobPosting | null = null;
        if (!snap.empty) {
          const data = snap.docs[0].data() as JobPosting;
          if (!data.deleted) foundJob = data;
        } else if (/^[a-zA-Z0-9_-]{1,128}$/.test(slug)) {
          // Fallback lookup by document ID (/jobs/:jobId)
          try {
            const byIdSnap = await getDoc(doc(db, 'jobPostings', slug));
            if (byIdSnap.exists()) {
              const data = byIdSnap.data() as JobPosting;
              if (data.status === 'Published' && !data.deleted) {
                foundJob = data;
              }
            }
          } catch {
            // Doc may be non-published or not exist; handled cleanly as not found
          }
        }
        if (!active) return;
        if (foundJob) {
          setJob(foundJob);
          document.title = `${foundJob.title} – নিয়োগ বিজ্ঞপ্তি | Home Recipe Foods`;
        } else {
          setJob(null);
        }
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.LIST, `jobPostings/${slug}`);
        } catch {
          // Handled cleanly
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadJob();
    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="h-96 animate-pulse rounded-2xl border border-[#E7E5E4] bg-white" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E7E5E4] bg-white text-[#DC1F26]">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="font-display mt-4 text-2xl font-bold text-[#1C1917] sm:text-3xl">
          নিয়োগ বিজ্ঞপ্তিটি পাওয়া যায়নি
        </h1>
        <p className="mt-2 text-sm text-[#57534E]">
          সম্ভবত এই বিজ্ঞপ্তিটি বর্তমানে প্রকাশিত নয় বা বন্ধ করা হয়েছে।
        </p>
        <Link
          to="/jobs"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1C1917] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#DC1F26]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>সকল নিয়োগ বিজ্ঞপ্তি দেখুন</span>
        </Link>
      </div>
    );
  }

  const winState = getJobWindowState(job);
  const statusLabel = getJobWindowLabelBn(winState);
  const isOpen = winState === 'open';

  return (
    <div className="bg-[#FAFAF8] pb-24 md:pb-16">
      <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6 sm:pt-10 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            to="/jobs"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#57534E] transition-colors hover:text-[#DC1F26]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>সব নিয়োগ বিজ্ঞপ্তি</span>
          </Link>
          <Link
            to="/application-status"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E4] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C1917] transition-colors hover:border-[#DC1F26] hover:text-[#DC1F26]"
          >
            <span>আবেদনের অবস্থা যাচাই করুন</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Main Header Card */}
        <div className="mt-4 rounded-2xl border border-[#E7E5E4] bg-white p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF8] px-3 py-1 text-xs font-bold text-[#1C1917]">
              {job.department ? `${job.department} · ${job.category}` : job.category}
            </span>
            <span
              className={`rounded-lg border px-3 py-1 text-xs font-bold ${
                isOpen
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : winState === 'upcoming'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {statusLabel}
            </span>
          </div>

          <h1 className="font-display mt-4 text-2xl font-bold leading-snug text-[#1C1917] sm:text-4xl">
            {job.title}
          </h1>
          {job.titleEn && (
            <p className="mt-1 text-sm font-medium text-[#78716C]">{job.titleEn}</p>
          )}

          {/* Key Info Grid */}
          <div className="mt-6 grid grid-cols-1 gap-3 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p className="text-[11px] font-semibold text-[#78716C]">কর্মস্থল</p>
                <p className="text-xs font-bold text-[#1C1917] sm:text-sm">{job.workplace}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p className="text-[11px] font-semibold text-[#78716C]">শূন্যপদ</p>
                <p className="text-xs font-bold text-[#1C1917] sm:text-sm">
                  {toBengaliDigits(job.vacancies)} জন
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p className="text-[11px] font-semibold text-[#78716C]">বেতন</p>
                <p className="text-xs font-bold text-[#1C1917] sm:text-sm">
                  {job.salary}
                  {job.salaryType ? ` (${job.salaryType})` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p className="text-[11px] font-semibold text-[#78716C]">চাকরির ধরন</p>
                <p className="text-xs font-bold text-[#1C1917] sm:text-sm">
                  {getEmploymentTypeBn(job.employmentType)}
                  {job.workingHours ? ` · ${job.workingHours}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p className="text-[11px] font-semibold text-[#78716C]">আবেদন শুরু</p>
                <p className="text-xs font-bold text-[#1C1917] sm:text-sm">
                  {formatRecruitmentDateBn(job.startDate)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p className="text-[11px] font-semibold text-[#78716C]">আবেদনের শেষ তারিখ</p>
                <p className="text-xs font-bold text-[#DC1F26] sm:text-sm">
                  {formatRecruitmentDateBn(job.deadline)}
                </p>
              </div>
            </div>
          </div>

          {/* Primary Apply Action Banner */}
          <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-[#E7E5E4] bg-white p-4 sm:flex-row sm:items-center">
            {isOpen ? (
              <>
                <div>
                  <p className="text-sm font-bold text-[#1C1917]">
                    আপনি কি এই পদের জন্য যোগ্য ও আগ্রহী?
                  </p>
                  <p className="text-xs text-[#57534E]">
                    সঠিক তথ্য দিয়ে অনলাইনে আবেদন ফর্ম পূরণ করুন।
                  </p>
                </div>
                <Link
                  to={`/apply/${job.slug}`}
                  className="inline-flex min-h-[46px] w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#DC1F26] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#B91C1C] sm:w-auto"
                >
                  <span>আবেদন করুন</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm font-bold text-[#1C1917]">{statusLabel}</p>
                  <p className="text-xs text-[#57534E]">
                    {winState === 'upcoming'
                      ? `আবেদন গ্রহণ শুরু হবে ${formatRecruitmentDateBn(job.startDate)} তারিখে।`
                      : 'এই পদের আবেদনের সময়সীমা শেষ হয়েছে।'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  className="min-h-[44px] w-full cursor-not-allowed rounded-xl bg-[#E7E5E4] px-6 py-2.5 text-sm font-semibold text-[#78716C] sm:w-auto"
                >
                  {winState === 'upcoming' ? 'আবেদন এখনো শুরু হয়নি' : 'আবেদনের সময় শেষ'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Detailed Sections */}
        <div className="mt-6 space-y-6">
          <section className="rounded-2xl border border-[#E7E5E4] bg-white p-6 sm:p-8">
            <h2 className="font-display text-xl font-bold text-[#1C1917]">কাজের বিবরণ</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[#44403C]">
              {job.description}
            </p>
          </section>

          {job.responsibilities && job.responsibilities.length > 0 && (
            <section className="rounded-2xl border border-[#E7E5E4] bg-white p-6 sm:p-8">
              <h2 className="font-display text-xl font-bold text-[#1C1917]">
                দায়িত্ব ও কর্তব্য
              </h2>
              <ul className="mt-4 space-y-2.5 text-sm text-[#44403C]">
                {job.responsibilities.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-[#E7E5E4] bg-white p-6 sm:p-8">
            <h2 className="font-display text-xl font-bold text-[#1C1917]">
              যোগ্যতা ও অভিজ্ঞতা
            </h2>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {job.educationRequirement && (
                <div className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#1C1917]">
                    <GraduationCap className="h-4 w-4 text-[#DC1F26]" />
                    <span>শিক্ষাগত যোগ্যতা</span>
                  </div>
                  <p className="mt-1.5 text-sm text-[#44403C]">{job.educationRequirement}</p>
                </div>
              )}
              {job.experienceRequirement && (
                <div className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#1C1917]">
                    <Briefcase className="h-4 w-4 text-[#DC1F26]" />
                    <span>অভিজ্ঞতা</span>
                  </div>
                  <p className="mt-1.5 text-sm text-[#44403C]">{job.experienceRequirement}</p>
                </div>
              )}
            </div>

            {job.requirements && job.requirements.length > 0 && (
              <ul className="mt-4 space-y-2.5 text-sm text-[#44403C]">
                {job.requirements.map((reqItem, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                    <span>{reqItem}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {job.benefits && job.benefits.length > 0 && (
            <section className="rounded-2xl border border-[#E7E5E4] bg-white p-6 sm:p-8">
              <h2 className="font-display text-xl font-bold text-[#1C1917]">
                অন্যান্য সুবিধা
              </h2>
              <ul className="mt-4 space-y-2.5 text-sm text-[#44403C]">
                {job.benefits.map((b, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(job.instructions || job.contactInfo) && (
            <section className="rounded-2xl border border-[#E7E5E4] bg-white p-6 sm:p-8">
              <h2 className="font-display text-xl font-bold text-[#1C1917]">
                নির্দেশনা ও যোগাযোগ
              </h2>
              {job.instructions && (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[#44403C]">
                  {job.instructions}
                </p>
              )}
              {job.contactInfo && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] px-4 py-2.5 text-xs font-semibold text-[#1C1917] sm:text-sm">
                  <Phone className="h-4 w-4 text-[#DC1F26]" />
                  <span>{job.contactInfo}</span>
                </div>
              )}
            </section>
          )}

          <ApplicationStatusTracker />
        </div>
      </div>

      {/* Mobile Sticky Apply CTA */}
      {isOpen && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-[#E7E5E4] bg-white/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-[#1C1917]">{job.title}</p>
              <p className="text-[11px] text-[#DC1F26]">
                শেষ তারিখ: {formatRecruitmentDateBn(job.deadline)}
              </p>
            </div>
            <Link
              to={`/apply/${job.slug}`}
              className="inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-xl bg-[#DC1F26] px-5 text-xs font-bold text-white"
            >
              <span>আবেদন করুন</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
