import { useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { ComplaintForm } from '../components/ComplaintForm';

export function ComplaintPage() {
  useEffect(() => {
    document.title = 'অভিযোগ বক্স · Private Complaint Box – Home Recipe Foods';
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="flex flex-col justify-between gap-4 border-b border-[#E7E5E4] pb-6 sm:flex-row sm:items-end">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-[#B91C1C]">
            <ShieldCheck className="h-4 w-4" />
            <span>গোপনীয় গ্রাহক মতামত</span>
          </div>
          <h1 className="font-display mt-1 text-3xl font-bold text-[#1C1917] sm:text-5xl">
            অভিযোগ বক্স
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#57534E]">
            আমাদের পণ্যের মান বা শোরুমের সেবা নিয়ে আপনার কোনো অভিযোগ বা পরামর্শ থাকলে নিচের ফর্মের মাধ্যমে সরাসরি জানান। আপনার অভিযোগ সম্পূর্ণ গোপন থাকে এবং শুধুমাত্র অনুমোদিত অ্যাডমিন টিম এটি পর্যালোচনা করেন।
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
