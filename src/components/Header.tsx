import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { MapPin, Menu, MessageCircle, Search, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { BrandLogo } from './BrandLogo';
import { DynamicGreetingStrip } from './DynamicGreetingStrip';

interface HeaderProps {
  onOpenChat: (mode?: 'ai' | 'human') => void;
}

const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Products', to: '/products' },
  { label: 'Categories', to: '/#categories' },
  { label: 'Occasions', to: '/#occasions' },
  { label: 'Showrooms', to: '/showrooms' },
  { label: 'Complaint', to: '/complaint' },
];

export function Header({ onOpenChat }: HeaderProps) {
  const { siteSettings, languageMode } = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus({ preventScroll: true });
    }
  }, [searchOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    setSearchOpen(false);
    setMobileMenuOpen(false);
    navigate(q ? `/products?q=${encodeURIComponent(q)}` : '/products');
  };

  const handleAnchorNav = (to: string) => {
    setMobileMenuOpen(false);
    if (to.startsWith('/#')) {
      const id = to.slice(2);
      navigate(
        { pathname: '/', hash: `#${id}` },
        { state: { scrollTarget: id, scrollNonce: Date.now() } }
      );
      return;
    }
    navigate(to);
  };

  const announcementText =
    languageMode === 'en'
      ? siteSettings.announcementEn || siteSettings.announcementBn
      : siteSettings.announcementBn || siteSettings.announcementEn;

  return (
    <div className="sticky top-0 z-40" data-sticky-header="true">
      {siteSettings.announcementEnabled && announcementText && (
        <div className="bg-[#DC1F26] px-4 py-1.5 text-center text-xs font-semibold text-white">
          {siteSettings.announcementLink ? (
            <Link to={siteSettings.announcementLink} className="hover:underline">
              {announcementText}
            </Link>
          ) : (
            <span>{announcementText}</span>
          )}
        </div>
      )}
      <header className="border-b border-[#292524] bg-[#1C1917]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:h-[72px] sm:gap-6 sm:px-6 lg:px-8">
          {/* Official Brand Logo */}
          <Link
            to="/"
            aria-label={`${siteSettings.brandName || 'Home Recipe Foods'} Home`}
            className="inline-flex shrink-0 items-center rounded-md py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FACC15]"
          >
            <BrandLogo variant="header" />
          </Link>

          {/* Desktop Navigation */}
          <nav
            aria-label="Primary Navigation"
            className="hidden items-center gap-5 lg:flex xl:gap-6"
          >
            {NAV_LINKS.map((item) =>
              item.to.startsWith('/#') ? (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => handleAnchorNav(item.to)}
                  className="shrink-0 cursor-pointer whitespace-nowrap text-sm font-medium text-[#E7E5E4] underline-offset-4 transition-colors hover:text-[#FACC15] hover:underline focus-visible:outline-2 focus-visible:outline-[#FACC15]"
                >
                  {item.label}
                </button>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `shrink-0 whitespace-nowrap text-sm font-medium underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-[#FACC15] ${
                      isActive
                        ? 'text-[#FACC15] underline'
                        : 'text-[#E7E5E4] hover:text-[#FACC15] hover:underline'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              )
            )}
            <button
              type="button"
              onClick={() => onOpenChat()}
              className="shrink-0 cursor-pointer whitespace-nowrap text-sm font-medium text-[#E7E5E4] underline-offset-4 transition-colors hover:text-[#FACC15] hover:underline focus-visible:outline-2 focus-visible:outline-[#FACC15]"
            >
              Support
            </button>
          </nav>

          {/* Right Action Controls */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Search products"
              className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-[#44403C] bg-[#292524] text-[#FAFAF8] transition-colors hover:border-[#FACC15] hover:text-[#FACC15] focus-visible:outline-2 focus-visible:outline-[#FACC15]"
            >
              <Search className="h-4 w-4" />
            </button>

            <Link
              to="/showrooms"
              className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B91C1C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FACC15] sm:inline-flex"
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>Find Showroom</span>
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-[#44403C] bg-[#292524] text-[#FAFAF8] hover:border-[#FACC15] lg:hidden"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Expandable Search Bar */}
        {searchOpen && (
          <div className="border-t border-[#292524] bg-[#FAFAF8] px-4 py-3 sm:px-6 lg:px-8">
            <form
              onSubmit={handleSearchSubmit}
              className="mx-auto flex max-w-3xl items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716C]" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="খাবার খুঁজুন / Search: চকলেট কেক, Chocolate Cake, বার্গার..."
                  className="w-full rounded-lg border border-[#D6D3D1] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1C1917] placeholder:text-[#78716C] focus:border-[#DC1F26] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="shrink-0 cursor-pointer whitespace-nowrap rounded-lg bg-[#DC1F26] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C]"
              >
                খুঁজুন
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label="Close search"
                className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#D6D3D1] bg-white text-[#57534E] hover:bg-[#F5F4F0]"
              >
                <X className="h-4 w-4" />
              </button>
            </form>
          </div>
        )}

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-[#292524] bg-[#1C1917] px-4 py-4 lg:hidden">
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((item) => (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => handleAnchorNav(item.to)}
                  className="flex min-h-[44px] w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium text-[#FAFAF8] hover:bg-[#292524] hover:text-[#FACC15]"
                >
                  <span>{item.label}</span>
                </button>
              ))}
              <Link
                to="/about"
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-[44px] w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-[#D6D3D1] hover:bg-[#292524] hover:text-[#FACC15]"
              >
                About
              </Link>
              <Link
                to="/contact"
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-[44px] w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-[#D6D3D1] hover:bg-[#292524] hover:text-[#FACC15]"
              >
                Contact
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenChat();
                }}
                className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#FACC15] hover:bg-[#292524]"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Support &amp; Live Chat</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Dynamic Animated Greeting Immediately Under Logo/Header */}
      <DynamicGreetingStrip />
    </div>
  );
}
