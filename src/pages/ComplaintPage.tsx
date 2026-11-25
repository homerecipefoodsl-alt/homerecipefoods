import { useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { ComplaintForm } from '../components/ComplaintForm';

export function ComplaintPage() {
  useEffect(() => {
    document.title = 'Complaint Box · Confidential Customer Feedback – Home Recipe Foods';
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="flex flex-col justify-between gap-4 border-b border-[#E7E5E4] pb-6 sm:flex-row sm:items-end">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#B91C1C]">
            <ShieldCheck className="h-4 w-4" />
            <span>Confidential Customer Feedback</span>
          </div>
          <h1 className="font-display mt-1.5 text-3xl font-bold text-[#1C1917] sm:text-5xl">
            Private Complaint Box
          </h1>
          <p className="font-bn mt-0.5 text-sm text-[#78716C]">গোপনীয় অভিযোগ বক্স</p>
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-[#57534E]">
            If you have any concern regarding product quality or showroom hospitality, please share
            it directly below. Submissions remain strictly confidential and are reviewed solely by
            our authorized management team.
          </p>
          <p className="font-bn mt-1.5 text-xs text-[#78716C]">
            আপনার অভিযোগ সম্পূর্ণ গোপন থাকে এবং শুধুমাত্র অনুমোদিত অ্যাডমিন টিম এটি পর্যালোচনা করেন।
          </p>
        </div>
        <div className="shrink-0">
          <BrandLogo variant="compact" />
        </div>
      </div>

      <div className="mt-8">
        <ComplaintForm />
      </div>
    </div>
  );
}
