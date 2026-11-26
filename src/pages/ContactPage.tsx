import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Mail, MapPin, MessageCircle, Navigation, Phone, ShieldAlert } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useStore } from '../context/StoreContext';
import { isDemoOrDummyShowroom } from '../data/outletsData';
import { getShowroomText, resolveBilingualPair } from '../lib/bilingual';

interface ContactPageProps {
  onOpenChat: (mode?: 'ai' | 'human') => void;
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

export function ContactPage({ onOpenChat }: ContactPageProps) {
  const { showrooms, siteSettings, languageMode } = useStore();
  const approvedShowrooms = showrooms.filter(
    (sr) => sr.visible !== false && !sr.deleted && !isDemoOrDummyShowroom(sr)
  );
  const showEnglishFirst = languageMode !== 'bn';
  const showBothLanguages = languageMode === 'both';

  useEffect(() => {
    document.title = `Contact Us · Customer Care & Outlets – ${siteSettings.brandName || 'Home Recipe Foods'}`;
  }, [siteSettings.brandName]);

  const headingEn = siteSettings.contactHeadingEn || 'Get in Touch With Home Recipe Foods';
  const headingBn = siteSettings.contactHeadingBn || 'আমাদের সাথে সরাসরি যোগাযোগ করুন';
  const subtitleEn =
    siteSettings.contactSubtitleEn ||
    'For product enquiries, custom celebration cakes, or direct showroom assistance, reach our customer hotline, open live concierge chat, or visit any Chattogram outlet.';
  const subtitleBn =
    siteSettings.contactSubtitleBn ||
    'শোরুম তথ্য, কাস্টম অর্ডার পরামর্শ কিংবা সেবার যেকোনো প্রয়োজনে কথা বলুন।';
  const supportHoursEn = siteSettings.supportHoursEn || 'Daily · 8:00 AM – 10:00 PM';
  const supportHoursBn = siteSettings.supportHoursBn || '';
  const officeAddressEn =
    siteSettings.brandAddressEn || '15/149 Shah Garibullah H/S Rd No: 01, Chattogram, Bangladesh';
  const officeAddressBn = siteSettings.brandAddressBn || '';

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="flex flex-col justify-between gap-4 border-b border-[#E7E5E4] pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#B91C1C]">
            Support &amp; Enquiries
          </p>
          <h1
            className={`mt-1 text-3xl font-bold text-[#1C1917] sm:text-5xl ${
              showEnglishFirst ? 'font-display' : 'font-bn'
            }`}
            style={{ textWrap: 'balance' }}
          >
            {showEnglishFirst ? headingEn : headingBn}
          </h1>
          {showBothLanguages && headingBn && headingBn !== headingEn && (
            <p className="font-bn mt-0.5 text-sm text-[#78716C]">{headingBn}</p>
          )}
          <p className="mt-2 max-w-2xl text-sm text-[#57534E]">
            {showEnglishFirst ? subtitleEn : subtitleBn}
          </p>
          {showBothLanguages && subtitleBn && (
            <p className="font-bn mt-0.5 max-w-2xl text-xs text-[#78716C]">
              {subtitleBn}
            </p>
          )}
        </div>
        <div className="shrink-0">
          <BrandLogo variant="compact" />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
          <Phone className="h-6 w-6 text-[#DC1F26]" />
          <h3 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
            Customer Hotline
          </h3>
          <p className="font-bn mt-0.5 text-xs text-[#78716C]">কাস্টমার হটলাইন</p>
          <p className="mt-2 text-sm text-[#57534E]">
            {showEnglishFirst ? supportHoursEn : supportHoursBn || supportHoursEn}
          </p>
          {showBothLanguages && supportHoursBn && (
            <p className="font-bn mt-0.5 text-xs text-[#78716C]">{supportHoursBn}</p>
          )}
          <div className="mt-4 flex flex-col gap-1.5">
            <a
              href={`tel:${siteSettings.supportPhone.replace(/\s+/g, '')}`}
              className="inline-block font-mono tabular-nums text-base font-bold text-[#B91C1C] hover:underline"
            >
              {siteSettings.supportPhone}
            </a>
            {siteSettings.secondaryPhone && (
              <a
                href={`tel:${siteSettings.secondaryPhone.replace(/\s+/g, '')}`}
                className="inline-block font-mono tabular-nums text-sm font-semibold text-[#1C1917] hover:text-[#B91C1C]"
              >
                {siteSettings.secondaryPhone}
              </a>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
          <MessageCircle className="h-6 w-6 text-[#DC1F26]" />
          <h3 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
            Live Concierge &amp; Chat
          </h3>
          <p className="font-bn mt-0.5 text-xs text-[#78716C]">তাৎক্ষণিক সহায়তা ও চ্যাট</p>
          <p className="mt-2 text-sm text-[#57534E]">
            Get instant menu details and pricing or connect directly with a store representative.
          </p>
          <button
            type="button"
            onClick={() => onOpenChat()}
            className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B91C1C]"
          >
            <span>Open Live Chat</span>
          </button>
        </div>

        <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
          <ShieldAlert className="h-6 w-6 text-[#DC1F26]" />
          <h3 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
            Confidential Complaint Box
          </h3>
          <p className="font-bn mt-0.5 text-xs text-[#78716C]">গোপনীয় অভিযোগ বক্স</p>
          <p className="mt-2 text-sm text-[#57534E]">
            Share product quality or service feedback privately with senior management.
          </p>
          <Link
            to="/complaint"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#1C1917] transition-colors hover:border-[#DC1F26] hover:text-[#B91C1C]"
          >
            <span>Submit Feedback</span>
          </Link>
        </div>
      </div>

      {/* Head Office & Enquiries Strip */}
      <div className="mt-6 flex flex-col justify-between gap-4 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#B91C1C]">
            Head Office · Chattogram
          </p>
          <p className="text-sm font-semibold text-[#1C1917]">
            {showEnglishFirst ? officeAddressEn : officeAddressBn || officeAddressEn}
          </p>
          {showBothLanguages && officeAddressBn && officeAddressBn !== officeAddressEn && (
            <p className="font-bn text-xs text-[#78716C]">{officeAddressBn}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {siteSettings.brandEmail && (
            <a
              href={`mailto:${siteSettings.brandEmail}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3.5 py-2 text-xs font-semibold text-[#1C1917] transition-colors hover:border-[#1C1917]"
            >
              <Mail className="h-3.5 w-3.5 text-[#DC1F26]" />
              <span>{siteSettings.brandEmail}</span>
            </a>
          )}
          {siteSettings.officeMapUrl && (
            <a
              href={siteSettings.officeMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1C1917] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#DC1F26]"
            >
              <Navigation className="h-3.5 w-3.5" />
              <span>Head Office Map</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Showroom Directory */}
      <div className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#1C1917] sm:text-3xl">
              Our Outlets ({approvedShowrooms.length})
            </h2>
            <p className="font-bn text-xs text-[#78716C]">আমাদের শো-রুমসমূহ</p>
          </div>
          <Link
            to="/outlets"
            className="text-xs font-semibold text-[#B91C1C] hover:underline sm:text-sm"
          >
            View all {approvedShowrooms.length} outlets &rarr;
          </Link>
        </div>

        {approvedShowrooms.length === 0 ? (
          <div className="mt-5 rounded-xl border border-[#E7E5E4] bg-white p-8 text-center text-sm text-[#57534E]">
            No active showroom locations are listed right now.
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {approvedShowrooms.map((sr) => {
              const st = getShowroomText(sr);
              const isPrimaryOffice = sr.id === 'shah-garibullah-hs';
              const titlePair = resolveBilingualPair(formatOutletTitleEn(st.nameEn), st.nameBn);
              const addressPrimary = st.addressEn || st.addressBn;
              const addressSecondaryBn =
                st.addressBn && st.addressBn !== addressPrimary ? st.addressBn : '';
              return (
                <div
                  key={sr.id}
                  className="flex flex-col justify-between rounded-xl border border-[#E7E5E4] bg-white p-5"
                >
                  <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-display text-xl font-bold text-[#1C1917]">
                        {titlePair.primary}
                      </h3>
                      {isPrimaryOffice && (
                        <span className="text-xs font-bold uppercase tracking-wide text-[#B91C1C]">
                          Office &amp; Outlet
                        </span>
                      )}
                    </div>
                    {titlePair.secondaryBn && (
                      <p className="font-bn text-xs font-medium text-[#78716C]">
                        {titlePair.secondaryBn}
                      </p>
                    )}
                    <div className="mt-2 flex items-start gap-2 text-sm text-[#57534E]">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
                      <div>
                        <p>{addressPrimary}</p>
                        {addressSecondaryBn && (
                          <p className="font-bn mt-0.5 text-xs text-[#78716C]">
                            {addressSecondaryBn}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#F5F4F0] pt-3 text-xs">
                    <span className="text-[#78716C]">
                      {st.openingHoursEn || st.openingHoursBn}
                    </span>
                    <div className="flex items-center gap-2">
                      <a
                        href={`tel:${sr.phone.replace(/\s+/g, '')}`}
                        className="inline-flex items-center gap-1 rounded-md bg-[#1C1917] px-2.5 py-1.5 font-mono tabular-nums font-bold text-white transition-colors hover:bg-[#DC1F26]"
                      >
                        <Phone className="h-3 w-3" />
                        <span>{sr.phone}</span>
                      </a>
                      {sr.mapUrl && (
                        <a
                          href={sr.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-[#D6D3D1] px-2.5 py-1.5 font-semibold text-[#1C1917] transition-colors hover:border-[#1C1917]"
                        >
                          <Navigation className="h-3 w-3 text-[#DC1F26]" />
                          <span>Directions</span>
                          <ExternalLink className="h-2.5 w-2.5 text-[#78716C]" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
