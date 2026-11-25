import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  Clock,
  MapPin,
  Search,
  Users,
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
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

export function JobsPage() {
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [employmentFilter, setEmploymentFilter] = useState('all');

  useEffect(() => {
    document.title = 'Careers & Job Openings – Home Recipe Foods';
  }, []);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'jobPostings'),
      where('status', '==', 'Published')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as JobPosting)
          .filter((j) => !j.deleted);
        list.sort((a, b) => (b.deadline || '').localeCompare(a.deadline || ''));
        setJobs(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, 'jobPostings');
        } catch {
          // Handled cleanly
        }
      }
    );

    return () => unsub();
  }, []);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => {
      if (j.category) set.add(j.category);
    });
    return Array.from(set);
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return jobs.filter((job) => {
      if (categoryFilter !== 'all' && job.category !== categoryFilter) return false;
      if (employmentFilter !== 'all' && job.employmentType !== employmentFilter) return false;
      if (q) {
        const hay = `${job.title} ${job.titleEn || ''} ${job.category} ${job.workplace} ${job.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, searchQuery, categoryFilter, employmentFilter]);

  const activeJobs = useMemo(
    () =>
      filteredJobs.filter((j) => {
        const state = getJobWindowState(j);
        return state === 'open' || state === 'upcoming';
      }),
    [filteredJobs]
  );

  const expiredJobs = useMemo(
    () => filteredJobs.filter((j) => getJobWindowState(j) === 'expired'),
    [filteredJobs]
  );

  return (
    <div className="bg-[#FAFAF8] pb-16">
      {/* Editorial Career Hero Header */}
      <section className="border-b border-[#E7E5E4] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[#E7E5E4] bg-[#FAFAF8] px-2.5 py-1 text-xs font-semibold text-[#1C1917]">
                <Briefcase className="h-3.5 w-3.5 text-[#DC1F26]" />
                <span>Careers &amp; Recruitment · Home Recipe Foods</span>
              </span>
              <Link
                to="/application-status"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-1.5 text-xs font-semibold text-[#1C1917] transition-colors hover:border-[#DC1F26] hover:text-[#DC1F26]"
              >
                <span>Check Application Status</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <h1 className="font-display mt-3 text-3xl font-bold tracking-tight text-[#1C1917] sm:text-4xl lg:text-5xl">
              Join Our Team
            </h1>
            <p className="font-bn mt-0.5 text-sm text-[#78716C]">আমাদের টিমে যোগ দিন</p>
            <p className="mt-2.5 text-sm leading-relaxed text-[#57534E] sm:text-base">
              Explore current openings across Home Recipe Foods bakeries, showrooms, delivery
              operations, and management in Chattogram, and submit your application online.
            </p>
          </div>

          {/* Search & Filters */}
          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="relative sm:col-span-6">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716C]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search role title, location, or department..."
                className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] pl-10 pr-4 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
              />
            </div>

            <div className="sm:col-span-3">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by role category"
                className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
              >
                <option value="all">All Categories</option>
                {availableCategories.map((cat) => {
                  const catInfo = getJobCategoryDisplay(cat);
                  return (
                    <option key={cat} value={cat}>
                      {catInfo.bn ? `${catInfo.en} — ${catInfo.bn}` : catInfo.en}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="sm:col-span-3">
              <select
                value={employmentFilter}
                onChange={(e) => setEmploymentFilter(e.target.value)}
                aria-label="Filter by employment type"
                className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
              >
                <option value="all">All Work Types</option>
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contractual">Contractual</option>
                <option value="Shift-based">Shift-based</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl space-y-12 px-4 pt-8 sm:px-6 lg:px-8">
        {loading ? (
          <div className="space-y-4">
            <p className="text-xs font-medium text-[#78716C]">Loading job openings...</p>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="h-64 rounded-2xl border border-[#E7E5E4] bg-white p-6"
                />
              ))}
            </div>
          </div>
        ) : activeJobs.length === 0 ? (
          <div className="rounded-2xl border border-[#E7E5E4] bg-white px-6 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E7E5E4] bg-[#FAFAF8] text-[#DC1F26]">
              <Briefcase className="h-6 w-6" />
            </div>
            <h2 className="font-display mt-4 text-2xl font-bold text-[#1C1917]">
              No Active Job Openings Right Now
            </h2>
            <p className="font-bn mt-1 text-xs text-[#78716C]">
              বর্তমানে কোনো সক্রিয় নিয়োগ বিজ্ঞপ্তি নেই
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#57534E]">
              New career openings will appear here as soon as they are published. If you have
              already submitted an application, you can check your status below.
            </p>
            {(searchQuery || categoryFilter !== 'all' || employmentFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setCategoryFilter('all');
                  setEmploymentFilter('all');
                }}
                className="mt-5 cursor-pointer rounded-xl border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#DC1F26]"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-[#1C1917] sm:text-2xl">
                  Current Openings{' '}
                  <span className="font-sans text-base font-medium tabular-nums text-[#78716C]">
                    ({activeJobs.length})
                  </span>
                </h2>
                <p className="font-bn text-xs text-[#78716C]">চলমান নিয়োগ বিজ্ঞপ্তি</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {activeJobs.map((job) => {
                const winState = getJobWindowState(job);
                const statusLabel = getJobWindowLabelEn(winState);
                const isOpen = winState === 'open';
                const catInfo = getJobCategoryDisplay(job.category);
                const titlePair = resolveBilingualPair(job.titleEn, job.title);

                return (
                  <article
                    key={job.id}
                    className="flex flex-col justify-between rounded-2xl border border-[#E7E5E4] bg-white p-5 transition-colors hover:border-[#D6D3D1] sm:p-6"
                  >
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-md border border-[#E7E5E4] bg-[#FAFAF8] px-2.5 py-1 text-[11px] font-semibold text-[#57534E]">
                          {job.department ? `${job.department} · ${catInfo.en}` : catInfo.en}
                        </span>
                        <span
                          className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                            isOpen
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-amber-200 bg-amber-50 text-amber-800'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      <h3 className="font-display mt-3.5 text-xl font-bold leading-snug text-[#1C1917]">
                        <Link
                          to={`/jobs/${job.slug}`}
                          className="transition-colors hover:text-[#DC1F26]"
                        >
                          {titlePair.primary}
                        </Link>
                      </h3>
                      {titlePair.secondaryBn && (
                        <p className="font-bn mt-0.5 text-xs font-medium text-[#78716C]">
                          {titlePair.secondaryBn}
                        </p>
                      )}
                      {job.description && (
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#57534E]">
                          {job.description}
                        </p>
                      )}

                      <div className="mt-4 space-y-2 text-xs text-[#44403C]">
                        <p className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#DC1F26]" />
                          <span className="line-clamp-1">{job.workplace}</span>
                        </p>
                        <p className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 shrink-0 text-[#78716C]" />
                          <span>{getEmploymentTypeEn(job.employmentType)}</span>
                        </p>
                        <p className="flex items-center gap-2 tabular-nums">
                          <Users className="h-3.5 w-3.5 shrink-0 text-[#78716C]" />
                          <span>
                            Vacancies: {job.vacancies} · Salary: {job.salary}
                          </span>
                        </p>
                        <p className="flex items-center gap-2">
                          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[#DC1F26]" />
                          <span>
                            Deadline:{' '}
                            <strong className="font-semibold tabular-nums text-[#1C1917]">
                              {formatRecruitmentDateEn(job.deadline)}
                            </strong>
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-2.5 border-t border-[#F5F4F0] pt-4">
                      <Link
                        to={`/jobs/${job.slug}`}
                        className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-[#D6D3D1] bg-white px-3 text-xs font-semibold text-[#1C1917] transition-colors hover:border-[#1C1917]"
                      >
                        View Details
                      </Link>
                      {isOpen ? (
                        <Link
                          to={`/apply/${job.slug}`}
                          className="inline-flex min-h-[42px] items-center justify-center gap-1 rounded-xl bg-[#DC1F26] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#B91C1C]"
                        >
                          <span>Apply Now</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      ) : (
                        <span className="inline-flex min-h-[42px] cursor-not-allowed items-center justify-center rounded-xl bg-[#F5F4F0] px-3 text-xs font-semibold text-[#78716C]">
                          Opening Soon
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {/* Expired Circulars Archive Section */}
        {!loading && expiredJobs.length > 0 && (
          <section className="border-t border-[#E7E5E4] pt-8">
            <h2 className="font-display text-lg font-bold text-[#57534E] sm:text-xl">
              Previous Recruitment Circulars{' '}
              <span className="font-sans text-sm font-medium tabular-nums">
                ({expiredJobs.length})
              </span>
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {expiredJobs.map((job) => {
                const catInfo = getJobCategoryDisplay(job.category);
                const titlePair = resolveBilingualPair(job.titleEn, job.title);
                return (
                  <article
                    key={job.id}
                    className="rounded-2xl border border-[#E7E5E4] bg-white/80 p-5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-[#F5F4F0] px-2 py-0.5 text-[11px] font-semibold text-[#57534E]">
                        {catInfo.en}
                      </span>
                      <span className="rounded bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                        Closed
                      </span>
                    </div>
                    <h3 className="font-display mt-2.5 text-lg font-bold text-[#1C1917]">
                      {titlePair.primary}
                    </h3>
                    {titlePair.secondaryBn && (
                      <p className="font-bn text-xs text-[#78716C]">{titlePair.secondaryBn}</p>
                    )}
                    <p className="mt-1 text-xs tabular-nums text-[#78716C]">
                      {job.workplace} · Deadline: {formatRecruitmentDateEn(job.deadline)}
                    </p>
                    <Link
                      to={`/jobs/${job.slug}`}
                      className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#DC1F26] hover:underline"
                    >
                      <span>View Circular</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Candidate Status Lookup */}
        <section id="check-status" className="pt-2">
          <ApplicationStatusTracker />
        </section>
      </div>
    </div>
  );
}
