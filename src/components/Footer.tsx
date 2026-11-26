import { Link } from 'react-router-dom';
import { Facebook, Instagram, Mail, MapPin, MessageCircle, Phone, Youtube } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatPhoneHref, isDemoOrDummyShowroom } from '../data/outletsData';
import { getShowroomText } from '../lib/bilingual';
import { BrandLogo } from './BrandLogo';

interface FooterProps {
  onOpenChat: (mode?: 'ai' | 'human') => void;
}

const FEATURED_OUTLET_IDS = [
  'shah-garibullah-hs',
  'kusumbagh-khulshi',
  'gec-more',
  'kotwali',
  'agrabad',
];

export function Footer({ onOpenChat }: FooterProps) {
  const { showrooms, siteSettings, languageMode } = useStore();
  const activeShowrooms = showrooms.filter(
    (sr) => sr.visible !== false && !sr.deleted && !isDemoOrDummyShowroom(sr)
  );
  const preferred = FEATURED_OUTLET_IDS.map((id) =>
    activeShowrooms.find((sr) => sr.id === id)
  ).filter((sr): sr is NonNullable<typeof sr> => Boolean(sr));
  const preferredIds = new Set(preferred.map((sr) => sr.id));
  const featuredFooterOutlets = [
    ...preferred,
    ...activeShowrooms.filter((sr) => !preferredIds.has(sr.id)),
  ].slice(0, 5);

  const footerDescEn =
    siteSettings.footerTextEn ||
    siteSettings.shortDescriptionEn ||
    'Artisanal cakes, pastries, breads, traditional sweets, and luxury Akd gift boxes crafted fresh daily across our Chattogram showrooms.';
  const footerDescBn = siteSettings.footerTextBn || siteSettings.shortDescriptionBn;

  return (
    <footer className="border-t border-[#292524] bg-[#1C1917] pb-[calc(4.75rem+env(safe-area-inset-bottom))] text-[#E7E5E4] md:pb-0">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand Column */}
          <div>
            <Link
              to="/"
              aria-label={`${siteSettings.brandName || 'Home Recipe Foods'} Home`}
              className="inline-block rounded-md focus-visible:outline-2 focus-visible:outline-[#FACC15]"
            >
              <BrandLogo variant="footer" />
            </Link>
            {languageMode !== 'bn' && (
              <p className="mt-4 text-sm leading-relaxed text-[#D6D3D1]">
                {footerDescEn}
              </p>
            )}
            {languageMode !== 'en' && footerDescBn && (
              <p className="font-bn mt-2 text-xs leading-relaxed text-[#A8A29E]">
                {footerDescBn}
              </p>
            )}
            <div className="mt-5 flex items-center gap-3">
              {siteSettings.facebookUrl && (
                <a
                  href={siteSettings.facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#44403C] text-[#D6D3D1] transition-colors hover:border-[#FACC15] hover:text-[#FACC15]"
                >
                  <Facebook className="h-4 w-4" />
                </a>
              )}
              {siteSettings.instagramUrl && (
                <a
                  href={siteSettings.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#44403C] text-[#D6D3D1] transition-colors hover:border-[#FACC15] hover:text-[#FACC15]"
                >
                  <Instagram className="h-4 w-4" />
                </a>
              )}
              {siteSettings.youtubeUrl && (
                <a
                  href={siteSettings.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="YouTube"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#44403C] text-[#D6D3D1] transition-colors hover:border-[#FACC15] hover:text-[#FACC15]"
                >
                  <Youtube className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-white">Quick Links</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-[#A8A29E]">
              <li>
                <Link to="/" className="transition-colors hover:text-[#FACC15]">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/products" className="transition-colors hover:text-[#FACC15]">
                  Products
                </Link>
              </li>
              <li>
                <Link to="/category/custom-cake" className="transition-colors hover:text-[#FACC15]">
                  Categories
                </Link>
              </li>
              <li>
                <Link to="/occasion/wedding" className="transition-colors hover:text-[#FACC15]">
                  Occasions
                </Link>
              </li>
              <li>
                <Link to="/outlets" className="transition-colors hover:text-[#FACC15]">
                  Our Outlets
                </Link>
              </li>
              <li>
                <Link to="/jobs" className="transition-colors hover:text-[#FACC15]">
                  Careers
                </Link>
              </li>
              <li>
                <Link to="/application-status" className="transition-colors hover:text-[#FACC15]">
                  Application Status
                </Link>
              </li>
              <li>
                <Link to="/complaint" className="transition-colors hover:text-[#FACC15]">
                  Complaint Box
                </Link>
              </li>
              <li>
                <Link to="/about" className="transition-colors hover:text-[#FACC15]">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/contact" className="transition-colors hover:text-[#FACC15]">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Customer Support */}
          <div>
            <h4 className="text-sm font-semibold text-white">Customer Support</h4>
            <ul className="mt-4 space-y-3 text-sm text-[#A8A29E]">
              <li>
                <a
                  href={`tel:${siteSettings.supportPhone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-2 transition-colors hover:text-white"
                >
                  <Phone className="h-4 w-4 text-[#FACC15]" />
                  <span className="font-mono tabular-nums">{siteSettings.supportPhone}</span>
                </a>
                {siteSettings.supportHoursEn && (
                  <p className="mt-0.5 pl-6 text-[11px] text-[#A8A29E]">
                    {siteSettings.supportHoursEn}
                  </p>
                )}
              </li>
              {siteSettings.brandEmail && (
                <li>
                  <a
                    href={`mailto:${siteSettings.brandEmail}`}
                    className="inline-flex items-center gap-2 transition-colors hover:text-white"
                  >
                    <Mail className="h-4 w-4 text-[#FACC15]" />
                    <span className="text-xs">{siteSettings.brandEmail}</span>
                  </a>
                </li>
              )}
              {siteSettings.messengerUrl && (
                <li>
                  <a
                    href={siteSettings.messengerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 transition-colors hover:text-white"
                  >
                    <MessageCircle className="h-4 w-4 text-[#FACC15]" />
                    <span>Facebook Messenger</span>
                  </a>
                </li>
              )}
              {siteSettings.whatsappUrl && (
                <li>
                  <a
                    href={siteSettings.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 transition-colors hover:text-white"
                  >
                    <MessageCircle className="h-4 w-4 text-emerald-400" />
                    <span>WhatsApp Support</span>
                  </a>
                </li>
              )}
              <li>
                <button
                  type="button"
                  onClick={() => onOpenChat()}
                  className="inline-flex cursor-pointer items-center gap-2 transition-colors hover:text-white"
                >
                  <MessageCircle className="h-4 w-4 text-[#DC1F26]" />
                  <span>Live Concierge Chat</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Outlets */}
          <div>
            <h4 className="text-sm font-semibold text-white">
              Our Outlets
              <span className="font-bn ml-2 text-xs font-normal text-[#A8A29E]">
                আমাদের শো-রুম
              </span>
            </h4>
            <ul className="mt-4 space-y-3 text-xs text-[#A8A29E]">
              {featuredFooterOutlets.map((outlet) => {
                const st = getShowroomText(outlet);
                const nameEn = st.nameEn || st.nameBn || outlet.name;
                const nameBn = st.nameBn && st.nameBn !== nameEn ? st.nameBn : '';
                const isMainOffice =
                  outlet.isMain ||
                  outlet.id === 'shah-garibullah-hs' ||
                  /office\s*&\s*outlet/i.test(st.descriptionEn || '');
                return (
                  <li key={outlet.id} className="leading-relaxed">
                    <Link
                      to="/outlets"
                      className="inline-flex items-start gap-1.5 font-medium text-[#E7E5E4] transition-colors hover:text-[#FACC15]"
                    >
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#DC1F26]" />
                      <span>
                        {nameEn}
                        {isMainOffice ? ' · Office & Outlet' : ''}
                        {nameBn && (
                          <span className="font-bn block text-[11px] font-normal text-[#A8A29E]">
                            {nameBn}
                          </span>
                        )}
                      </span>
                    </Link>
                    {outlet.phone && (
                      <p className="pl-5 text-[#A8A29E]">
                        <a
                          href={formatPhoneHref(outlet.phone)}
                          className="font-mono tabular-nums hover:text-white"
                        >
                          {outlet.phone}
                        </a>
                      </p>
                    )}
                  </li>
                );
              })}
              <li className="pt-1">
                <Link
                  to="/outlets"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#FACC15] hover:underline"
                >
                  <span>View all {activeShowrooms.length} outlets →</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[#292524] pt-6 text-xs text-[#78716C] sm:flex-row">
          <p>© {siteSettings.brandName || 'Home Recipe Foods'}. All rights reserved.</p>
          <p>Showroom Purchase &amp; Consultation Only</p>
        </div>
      </div>
    </footer>
  );
}
