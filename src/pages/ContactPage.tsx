import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, MessageCircle, Phone, ShieldAlert } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useStore } from '../context/StoreContext';

interface ContactPageProps {
  onOpenChat: (mode?: 'ai' | 'human') => void;
}

export function ContactPage({ onOpenChat }: ContactPageProps) {
  const { showrooms, siteSettings } = useStore();

  useEffect(() => {
    document.title = 'যোগাযোগ · Contact Us – Home Recipe Foods';
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="flex flex-col justify-between gap-4 border-b border-[#E7E5E4] pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-wider text-[#B91C1C]">
            সহায়তা ও যোগাযোগ
          </p>
          <h1 className="font-display mt-1 text-3xl font-bold text-[#1C1917] sm:text-5xl">
            যোগাযোগ করুন
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#57534E]">
            পণ্য সম্পর্কে জানতে, কাস্টম কেকের পরামর্শ নিতে বা আপনার মতামত জানাতে আমাদের হটলাইন, লাইভ চ্যাট অথবা সরাসরি শোরুমে যোগাযোগ করুন।
          </p>
        </div>
        <div className="shrink-0">
          <BrandLogo variant="compact" />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
          <Phone className="h-6 w-6 text-[#DC1F26]" />
          <h3 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
            কাস্টমার হটলাইন
          </h3>
          <p className="mt-1 text-sm text-[#57534E]">
            প্রতিদিন সকাল ৮:০০ থেকে রাত ১১:০০ পর্যন্ত সরাসরি ফোনে কথা বলুন।
          </p>
          <a
            href={`tel:${siteSettings.supportPhone.replace(/\s+/g, '')}`}
            className="mt-4 inline-block font-mono tabular-nums text-base font-bold text-[#B91C1C] hover:underline"
          >
            {siteSettings.supportPhone}
          </a>
        </div>

        <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
          <MessageCircle className="h-6 w-6 text-[#DC1F26]" />
          <h3 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
            AI ও লাইভ চ্যাট
          </h3>
          <p className="mt-1 text-sm text-[#57534E]">
            তাৎক্ষণিক পণ্যের তথ্য জানতে বা সরাসরি আমাদের প্রতিনিধির সাথে চ্যাট করতে।
          </p>
          <button
            type="button"
            onClick={() => onOpenChat()}
            className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]"
          >
            <span>লাইভ চ্যাট খুলুন</span>
          </button>
        </div>

        <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
          <ShieldAlert className="h-6 w-6 text-[#DC1F26]" />
          <h3 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
            গোপনীয় অভিযোগ বক্স
          </h3>
          <p className="mt-1 text-sm text-[#57534E]">
            যেকোনো অভিযোগ বা মান-সম্পর্কিত মতামত সরাসরি ম্যানেজমেন্টের কাছে পাঠান।
          </p>
          <Link
            to="/complaint"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#DC1F26] hover:text-[#B91C1C]"
          >
            <span>অভিযোগ বক্সে যান</span>
          </Link>
        </div>
      </div>

      {/* Showroom Directory */}
      <div className="mt-12">
        <h2 className="font-display text-2xl font-bold text-[#1C1917] sm:text-3xl">
          সকল শোরুমের ফোন ও ঠিকানা
        </h2>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {showrooms.map((sr) => (
            <div
              key={sr.id}
              className="flex flex-col justify-between rounded-xl border border-[#E7E5E4] bg-white p-5"
            >
              <div>
                <p className="text-xs font-semibold text-[#B91C1C]">{sr.area}</p>
                <h3 className="font-display mt-0.5 text-xl font-bold text-[#1C1917]">
                  {sr.name}
                </h3>
                <p className="mt-2 flex items-start gap-2 text-sm text-[#57534E]">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#78716C]" />
                  <span>{sr.address}</span>
                </p>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#F5F4F0] pt-3 text-xs">
                <span className="text-[#78716C]">{sr.openingHours}</span>
                <a
                  href={`tel:${sr.phone.replace(/\s+/g, '')}`}
                  className="font-mono tabular-nums font-bold text-[#1C1917] hover:text-[#B91C1C]"
                >
                  {sr.phone}
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
