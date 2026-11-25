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
import { resolveBilingualPair } from '../lib/bilingual';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import {
  formatRecruitmentDateEn,
  getEmploymentTypeEn,
  getJobCategoryDisplay,
  getJobWindowLabelEn,
  getJobWindowState,
} from '../lib/recruitment';
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
          const titleInfo = resolveBilingualPair(foundJob.titleEn, foundJob.title);
          document.title = `${titleInfo.primary} – Careers | Home Recipe Foods`;
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
        <p className="mb-3 text-xs font-medium text-[#78716C]">Loading circular details...</p>
        <div className="h-80 rounded-2xl border border-[#E7E5E4] bg-white" />
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
          Job Circular Not Found
        </h1>
        <p className="font-bn mt-1 text-xs text-[#78716C]">নিয়োগ বিজ্ঞপ্তিটি পাওয়া যায়নি</p>
        <p className="mt-2 text-sm text-[#57534E]">
          This position may no longer be published or has been closed.
        </p>
        <Link
          to="/jobs"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1C1917] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#DC1F26]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>View All Openings</span>
        </Link>
      </div>
    );
  }

  const winState = getJobWindowState(job);
  const statusLabel = getJobWindowLabelEn(winState);
  const isOpen = winState === 'open';
  const catInfo = getJobCategoryDisplay(job.category);
  const titlePair = resolveBilingualPair(job.titleEn, job.title);

  return (
    <div className="bg-[#FAFAF8] pb-24 md:pb-16">
      <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6 sm:pt-10 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            to="/jobs"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#57534E] transition-colors hover:text-[#DC1F26]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>All Job Openings</span>
          </Link>
          <Link
            to="/application-status"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E4] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C1917] transition-colors hover:border-[#DC1F26] hover:text-[#DC1F26]"
          >
            <span>Check Application Status</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Main Header Card */}
        <div className="mt-4 rounded-2xl border border-[#E7E5E4] bg-white p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF8] px-3 py-1 text-xs font-semibold text-[#1C1917]">
              {job.department ? `${job.department} · ${catInfo.en}` : catInfo.en}
            </span>
            <span
              className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
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
            {titlePair.primary}
          </h1>
          {titlePair.secondaryBn && (
            <p className="font-bn mt-1 text-sm font-medium text-[#78716C]">
              {titlePair.secondaryBn}
            </p>
          )}

          {/* Key Info Grid */}
          <div className="mt-6 grid grid-cols-1 gap-3 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p className="text-[11px] font-semibold text-[#78716C]">Location</p>
                <p className="text-xs font-semibold text-[#1C1917] sm:text-sm">{job.workplace}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p className="text-[11px] font-semibold text-[#78716C]">Vacancies</p>
                <p className="text-xs font-semibold tabular-nums text-[#1C1917] sm:text-sm">
                  {job.vacancies}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p className="text-[11px] font-semibold text-[#78716C]">Compensation</p>
                <p className="text-xs font-semibold text-[#1C1917] sm:text-sm">
                  {job.salary}
                  {job.salaryType ? ` (${job.salaryType})` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p className="text-[11px] font-semibold text-[#78716C]">Employment Type</p>
                <p className="text-xs font-semibold text-[#1C1917] sm:text-sm">
                  {getEmploymentTypeEn(job.employmentType)}
                  {job.workingHours ? ` · ${job.workingHours}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p className="text-[11px] font-semibold text-[#78716C]">Applications Open</p>
                <p className="text-xs font-semibold tabular-nums text-[#1C1917] sm:text-sm">
                  {formatRecruitmentDateEn(job.startDate)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p className="text-[11px] font-semibold text-[#78716C]">Application Deadline</p>
                <p className="text-xs font-semibold tabular-nums text-[#DC1F26] sm:text-sm">
                  {formatRecruitmentDateEn(job.deadline)}
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
                    Interested and qualified for this position?
                  </p>
                  <p className="text-xs text-[#57534E]">
                    Complete our online application form with accurate details.
                  </p>
                </div>
                <Link
                  to={`/apply/${job.slug}`}
                  className="inline-flex min-h-[46px] w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#DC1F26] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C] sm:w-auto"
                >
                  <span>Apply Online</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm font-bold text-[#1C1917]">{statusLabel}</p>
                  <p className="text-xs text-[#57534E]">
                    {winState === 'upcoming'
                      ? `Applications will open on ${formatRecruitmentDateEn(job.startDate)}.`
                      : 'The application deadline for this role has passed.'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  className="min-h-[44px] w-full cursor-not-allowed rounded-xl bg-[#E7E5E4] px-6 py-2.5 text-sm font-semibold text-[#78716C] sm:w-auto"
                >
                  {winState === 'upcoming' ? 'Opening Soon' : 'Applications Closed'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Detailed Sections */}
        <div className="mt-6 space-y-6">
          <section className="rounded-2xl border border-[#E7E5E4] bg-white p-6 sm:p-8">
            <h2 className="font-display text-xl font-bold text-[#1C1917]">Role Overview</h2>
            <p className="font-bn text-xs text-[#78716C]">কাজের বিবরণ</p>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[#44403C]">
              {job.description}
            </p>
          </section>

          {job.responsibilities && job.responsibilities.length > 0 && (
            <section className="rounded-2xl border border-[#E7E5E4] bg-white p-6 sm:p-8">
              <h2 className="font-display text-xl font-bold text-[#1C1917]">
                Key Responsibilities
              </h2>
              <p className="font-bn text-xs text-[#78716C]">দায়িত্ব ও কর্তব্য</p>
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
              Qualifications &amp; Experience
            </h2>
            <p className="font-bn text-xs text-[#78716C]">যোগ্যতা ও অভিজ্ঞতা</p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {job.educationRequirement && (
                <div className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#1C1917]">
                    <GraduationCap className="h-4 w-4 text-[#DC1F26]" />
                    <span>Education Requirement</span>
                  </div>
                  <p className="mt-1.5 text-sm text-[#44403C]">{job.educationRequirement}</p>
                </div>
              )}
              {job.experienceRequirement && (
                <div className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#1C1917]">
                    <Briefcase className="h-4 w-4 text-[#DC1F26]" />
                    <span>Experience</span>
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
                Benefits &amp; Perks
              </h2>
              <p className="font-bn text-xs text-[#78716C]">অন্যান্য সুবিধা</p>
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
                Instructions &amp; Contact
              </h2>
              <p className="font-bn text-xs text-[#78716C]">নির্দেশনা ও যোগাযোগ</p>
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
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-[#E7E5E4] bg-white px-4 py-3 shadow-sm md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-[#1C1917]">{titlePair.primary}</p>
              <p className="text-[11px] tabular-nums text-[#DC1F26]">
                Deadline: {formatRecruitmentDateEn(job.deadline)}
              </p>
            </div>
            <Link
              to={`/apply/${job.slug}`}
              className="inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-xl bg-[#DC1F26] px-5 text-xs font-semibold text-white"
            >
              <span>Apply Now</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
