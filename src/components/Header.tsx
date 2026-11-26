import { useState } from 'react';
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
  { label: 'Our Outlets', to: '/outlets' },
  { label: 'Careers', to: '/jobs' },
  { label: 'Complaint', to: '/complaint' },
];

export function Header({ onOpenChat }: HeaderProps) {
  const { siteSettings, languageMode } = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
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
    languageMode === 'bn'
      ? siteSettings.announcementBn || siteSettings.announcementEn
      : siteSettings.announcementEn || siteSettings.announcementBn;

  return (
    <div className="sticky top-0 z-40" data-sticky-header="true">
      {siteSettings.announcementEnabled && announcementText && (
        <div className="bg-[#DC1F26] px-3 py-1 text-center text-[11px] font-medium text-white sm:text-xs">
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
        <div className="mx-auto flex h-13 max-w-7xl items-center justify-between gap-3 px-3 sm:h-14 sm:px-6 lg:gap-6 lg:px-8">
          {/* Official Brand Logo */}
          <Link
            to="/"
            aria-label={`${siteSettings.brandName || 'Home Recipe Foods'} Home`}
            className="inline-flex shrink-0 items-center rounded-md py-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FACC15]"
          >
            <BrandLogo variant="header" className="h-7 w-auto sm:h-9 lg:h-10" />
          </Link>

          {/* Desktop Navigation */}
          <nav
            aria-label="Primary Navigation"
            className="hidden items-center gap-4 lg:flex xl:gap-5"
          >
            {NAV_LINKS.map((item) =>
              item.to.startsWith('/#') ? (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => handleAnchorNav(item.to)}
                  className="shrink-0 cursor-pointer whitespace-nowrap text-[13px] font-medium text-[#E7E5E4] underline-offset-4 transition-colors hover:text-[#FACC15] hover:underline focus-visible:outline-2 focus-visible:outline-[#FACC15]"
                >
                  {item.label}
                </button>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `shrink-0 whitespace-nowrap text-[13px] font-medium underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-[#FACC15] ${
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
              className="shrink-0 cursor-pointer whitespace-nowrap text-[13px] font-medium text-[#E7E5E4] underline-offset-4 transition-colors hover:text-[#FACC15] hover:underline focus-visible:outline-2 focus-visible:outline-[#FACC15]"
            >
              Support
            </button>
          </nav>

          {/* Compact Desktop Search + Action Controls */}
          <div className="flex items-center justify-end gap-2 sm:gap-2.5">
            <form
              onSubmit={handleSearchSubmit}
              role="search"
              className="hidden h-9 w-48 items-center rounded-lg border border-[#44403C] bg-[#292524] pl-3 pr-1.5 transition-colors focus-within:border-[#FACC15] md:flex lg:w-52 xl:w-60"
            >
              <Search className="mr-1.5 h-3.5 w-3.5 shrink-0 text-[#A8A29E]" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cakes, sweets..."
                aria-label="Search products"
                className="min-w-0 flex-1 bg-transparent text-xs text-[#FAFAF8] placeholder:text-[#A8A29E] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#A8A29E] hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </form>

            <Link
              to="/products"
              aria-label="Search products"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#44403C] bg-[#292524] text-[#FAFAF8] transition-colors hover:border-[#FACC15] md:hidden"
            >
              <Search className="h-4 w-4" />
            </Link>

            <Link
              to="/outlets"
              className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-[#DC1F26] px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#B91C1C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FACC15] sm:gap-1.5 sm:px-3.5 sm:text-xs"
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>Our Outlets</span>
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#44403C] bg-[#292524] text-[#FAFAF8] hover:border-[#FACC15] lg:hidden"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-[#292524] bg-[#1C1917] px-4 py-3 lg:hidden">
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

      {/* Compact Dynamic Greeting Strip */}
      <DynamicGreetingStrip />
    </div>
  );
}
