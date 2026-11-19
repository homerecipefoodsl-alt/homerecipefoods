import { Link } from 'react-router-dom';
import { Facebook, Instagram, Mail, MapPin, MessageCircle, Phone, Youtube } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { CHATTOGRAM_OUTLETS, formatPhoneHref } from '../data/outletsData';
import { BrandLogo } from './BrandLogo';

interface FooterProps {
  onOpenChat: (mode?: 'ai' | 'human') => void;
}

export function Footer({ onOpenChat }: FooterProps) {
  const { siteSettings, languageMode } = useStore();
  const featuredFooterOutlets = CHATTOGRAM_OUTLETS.filter((o) =>
    ['shah-garibullah-hs', 'kusumbagh-khulshi', 'gec-more', 'kotwali', 'agrabad'].includes(o.id)
  );

  const footerDesc =
    languageMode === 'en'
      ? siteSettings.footerTextEn || siteSettings.footerTextBn
      : siteSettings.footerTextBn || siteSettings.footerTextEn;

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
            <p className="mt-4 text-sm leading-relaxed text-[#A8A29E]">
              {footerDesc ||
                'খাঁটি উপাদান, ঘরোয়া যত্ন ও আধুনিক বেকিং শিল্পের সমন্বয়ে তৈরি বাংলাদেশের অন্যতম প্রিমিয়াম ফুড ব্র্যান্ড। দেখুন, জানুন এবং সরাসরি আমাদের শোরুম থেকে সংগ্রহ করুন।'}
            </p>
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
                  Our Outlets · আমাদের শো-রুম
                </Link>
              </li>
              <li>
                <Link to="/jobs" className="transition-colors hover:text-[#FACC15]">
                  JobApplications / নিয়োগ
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
                  <span>AI &amp; Live Representative Chat</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Outlets */}
          <div>
            <h4 className="text-sm font-semibold text-white">
              আমাদের শো-রুম <span className="font-normal text-[#A8A29E]">· Our Outlets</span>
            </h4>
            <ul className="mt-4 space-y-3 text-xs text-[#A8A29E]">
              {featuredFooterOutlets.map((outlet) => (
                <li key={outlet.id} className="leading-relaxed">
                  <Link
                    to="/outlets"
                    className="inline-flex items-start gap-1.5 font-medium text-[#E7E5E4] transition-colors hover:text-[#FACC15]"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#DC1F26]" />
                    <span>
                      {outlet.nameBn}
                      <span className="block text-[11px] font-normal text-[#A8A29E]">
                        {outlet.nameEn}
                        {outlet.type ? ` · ${outlet.type}` : ''}
                      </span>
                    </span>
                  </Link>
                  <p className="pl-5 text-[#A8A29E]">
                    <a
                      href={formatPhoneHref(outlet.phone)}
                      className="font-mono tabular-nums hover:text-white"
                    >
                      {outlet.phone}
                    </a>
                  </p>
                </li>
              ))}
              <li className="pt-1">
                <Link
                  to="/outlets"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#FACC15] hover:underline"
                >
                  <span>সব শো-রুম দেখুন · View all outlets →</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[#292524] pt-6 text-xs text-[#78716C] sm:flex-row">
          <p>© {siteSettings.brandName || 'Home Recipe Foods'}. All rights reserved.</p>
          <p>Showroom Purchase &amp; Consultation Only · No Online Ordering</p>
        </div>
      </div>
    </footer>
  );
}
