import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { ApplicationStatusTracker } from '../components/ApplicationStatusTracker';

export function ApplicationStatusPage() {
  const [searchParams] = useSearchParams();
  const initialCode = (searchParams.get('id') || '').toUpperCase();
  const initialMobile = searchParams.get('mobile') || '';

  useEffect(() => {
    document.title = 'আবেদনের অবস্থা যাচাই (Application Status) – Home Recipe Foods';
  }, []);

  return (
    <div className="bg-[#FAFAF8] pb-20 pt-8 sm:pt-12">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/jobs"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#57534E] transition-colors hover:text-[#DC1F26]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>সব নিয়োগ বিজ্ঞপ্তি দেখুন</span>
          </Link>

          <span className="inline-flex items-center gap-1.5 rounded-md border border-[#E7E5E4] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#57534E]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#DC1F26]" />
            <span>গোপনীয়তা সুরক্ষিত পোর্টাল</span>
          </span>
        </div>

        <ApplicationStatusTracker
          initialCode={initialCode}
          initialMobile={initialMobile}
        />

        <div className="mt-6 rounded-2xl border border-[#E7E5E4] bg-white p-5 text-xs leading-relaxed text-[#57534E]">
          <p className="font-bold text-[#1C1917]">গুরুত্বপূর্ণ তথ্য:</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              আবেদন জমা দেওয়ার পর প্রাপ্ত Application ID (যেমন:{' '}
              <span className="font-mono font-semibold text-[#1C1917]">
                SN-JOB-2026-00001
              </span>
              ) এবং আবেদনকৃত মোবাইল নম্বর দিয়ে এখানে স্ট্যাটাস দেখা যাবে।
            </li>
            <li>
              পরীক্ষা বা ইন্টারভিউয়ের সময়সূচি নির্ধারিত হলে তা এখানে প্রদর্শিত হবে এবং প্রয়োজনীয় নির্দেশনাসহ ফোনে যোগাযোগ করা হবে।
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
