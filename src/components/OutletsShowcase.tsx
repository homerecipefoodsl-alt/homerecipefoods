import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
  PhoneCall,
  Search,
  X,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  CHATTOGRAM_OUTLETS,
  OUTLET_REGION_FILTERS,
  formatPhoneHref,
  getOutletSearchHaystack,
  type OutletItem,
} from '../data/outletsData';

interface OutletsShowcaseProps {
  variant?: 'page' | 'section';
  showHeader?: boolean;
}

function OutletCard({
  outlet,
  languageMode,
}: {
  outlet: OutletItem;
  languageMode: 'bn' | 'en' | 'both';
}) {
  const isEnPrimary = languageMode === 'en';
  const showBothLanguages = languageMode === 'both';

  const primaryTitle = isEnPrimary ? outlet.nameEn : outlet.nameBn;
  const secondaryTitle = isEnPrimary ? outlet.nameBn : outlet.nameEn;

  const primaryAddress = isEnPrimary ? outlet.addressEn : outlet.addressBn;
  const secondaryAddress = isEnPrimary ? outlet.addressBn : outlet.addressEn;

  const counterHoursText = isEnPrimary ? outlet.counterHoursEn : outlet.counterHoursBn;
  const orderLineText = isEnPrimary ? outlet.orderLineEn : outlet.orderLineBn;

  return (
    <article
      data-outlet-id={outlet.id}
      className="flex h-full flex-col justify-between rounded-2xl border border-[#E7E5E4] bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D6D3D1] hover:shadow-md sm:p-6"
    >
      <div>
        {/* Bilingual Outlet Name & Status (NO serial numbers; Office & Outlet ONLY on first outlet) */}
        <div className="flex items-start justify-between gap-3 border-b border-[#F5F4F0] pb-3.5">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-bold leading-snug text-[#1C1917] sm:text-2xl">
              {primaryTitle}
            </h3>
            <p className="mt-0.5 text-xs font-semibold tracking-wide text-[#57534E]">
              {secondaryTitle}
            </p>
            {outlet.type && (
              <p className="mt-1 text-xs font-bold tracking-wide text-[#B91C1C]">
                {outlet.type}
              </p>
            )}
          </div>

          <span className="inline-flex shrink-0 items-center gap-1 pt-1 text-[11px] font-semibold text-[#15803D]">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{isEnPrimary ? 'Open · Active' : 'সক্রিয় · Open'}</span>
          </span>
        </div>

        {/* Bilingual Address */}
        <div className="mt-3.5 flex items-start gap-2.5 text-xs leading-relaxed text-[#44403C]">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium text-[#1C1917]">{primaryAddress}</p>
            <p className="text-[11px] leading-relaxed text-[#78716C]">{secondaryAddress}</p>
          </div>
        </div>

        {/* Counter Hours, Order Line & Direct Phone */}
        <dl className="mt-4 space-y-2 border-t border-[#F5F4F0] pt-3.5 text-xs">
          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#78716C]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <dt className="text-[11px] font-semibold text-[#78716C]">
                {isEnPrimary ? 'Counter Hours' : showBothLanguages ? 'কাউন্টার সময় · Counter Hours' : 'কাউন্টার সময়'}
              </dt>
              <dd className="mt-0.5 font-medium text-[#1C1917]">{counterHoursText}</dd>
              {showBothLanguages && (
                <dd className="text-[11px] text-[#78716C]">{outlet.counterHoursEn}</dd>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <PhoneCall className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#78716C]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <dt className="text-[11px] font-semibold text-[#78716C]">
                {isEnPrimary ? 'Order Line' : showBothLanguages ? 'অর্ডার লাইন · Order Line' : 'অর্ডার লাইন'}
              </dt>
              <dd className="mt-0.5 font-medium text-[#1C1917]">{orderLineText}</dd>
              {showBothLanguages && (
                <dd className="text-[11px] text-[#78716C]">{outlet.orderLineEn}</dd>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 pt-0.5">
            <Phone className="h-3.5 w-3.5 shrink-0 text-[#DC1F26]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <dt className="sr-only">{isEnPrimary ? 'Phone' : 'ফোন'}</dt>
              <dd>
                <a
                  href={formatPhoneHref(outlet.phone)}
                  aria-label={`Call ${outlet.nameEn} at ${outlet.phone}`}
                  className="font-mono text-xs font-bold tabular-nums text-[#1C1917] transition-colors hover:text-[#DC1F26]"
                >
                  {outlet.phone}
                </a>
              </dd>
            </div>
          </div>
        </dl>
      </div>

      {/* Action Buttons Row — Call & Get Directions Only */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#E7E5E4] pt-4">
        <a
          href={formatPhoneHref(outlet.phone)}
          aria-label={`Call ${outlet.nameEn}`}
          className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1C1917] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#DC1F26]"
        >
          <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{isEnPrimary ? 'Call' : 'কল করুন'}</span>
        </a>

        <a
          href={outlet.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Get directions to ${outlet.nameEn}`}
          className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold text-[#1C1917] transition-colors hover:border-[#1C1917]"
        >
          <Navigation className="h-3.5 w-3.5 shrink-0 text-[#DC1F26]" aria-hidden="true" />
          <span>{isEnPrimary ? 'Get Directions' : 'Get Directions'}</span>
          <ExternalLink className="h-3 w-3 shrink-0 text-[#78716C]" aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

export function OutletsShowcase({
  variant = 'page',
  showHeader = true,
}: OutletsShowcaseProps) {
  const { languageMode, setLanguageMode } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');

  const isEnPrimary = languageMode === 'en';
  const showBothLanguages = languageMode === 'both';

  const filteredOutlets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return CHATTOGRAM_OUTLETS.filter((outlet) => {
      if (selectedRegion !== 'all' && outlet.region !== selectedRegion) {
        return false;
      }
      if (!q) return true;
      return getOutletSearchHaystack(outlet).includes(q);
    });
  }, [searchQuery, selectedRegion]);

  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="space-y-4">
          <div className="flex flex-col justify-between gap-4 border-b border-[#E7E5E4] pb-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold tracking-wider text-[#B91C1C]">
                {isEnPrimary
                  ? 'Chattogram Network'
                  : 'চট্টগ্রাম নেটওয়ার্ক · Our Outlets'}
              </p>

              {variant === 'page' ? (
                <h1 className="font-display mt-1 text-3xl font-bold text-[#1C1917] sm:text-5xl">
                  {isEnPrimary ? 'Our Outlets' : 'আমাদের শো-রুম'}
                </h1>
              ) : (
                <h2 className="font-display mt-1 text-2xl font-bold text-[#1C1917] sm:text-3xl">
                  {isEnPrimary ? 'Our Outlets' : 'আমাদের শো-রুম'}
                </h2>
              )}

              {showBothLanguages && (
                <p className="mt-1 text-sm font-semibold text-[#78716C]">Our Outlets</p>
              )}

              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#57534E]">
                {isEnPrimary
                  ? 'Visit any of our outlets in Chattogram to collect your Home Recipe Foods orders.'
                  : 'চট্টগ্রামে আমাদের শো-রুমসমূহ থেকে Home Recipe Foods-এর পণ্য সংগ্রহ করুন।'}
              </p>
              {showBothLanguages && (
                <p className="mt-0.5 max-w-2xl text-xs text-[#78716C]">
                  Visit any of our outlets in Chattogram to collect your Home Recipe Foods orders.
                </p>
              )}
            </div>

            {/* Clean Language Display Toggle */}
            <div
              role="group"
              aria-label="Outlet display language"
              className="inline-flex shrink-0 self-start rounded-lg border border-[#E7E5E4] bg-white p-1 md:self-auto"
            >
              {(
                [
                  { id: 'both', label: 'বাংলা + EN' },
                  { id: 'bn', label: 'বাংলা' },
                  { id: 'en', label: 'English' },
                ] as const
              ).map((opt) => {
                const active = languageMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setLanguageMode(opt.id)}
                    className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-[#1C1917] text-white'
                        : 'text-[#57534E] hover:text-[#1C1917]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Search & Region Filter Controls */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#E7E5E4] bg-[#FAFAF8] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 lg:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716C]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isEnPrimary
                ? 'Search by outlet name, area, or address...'
                : 'আউটলেটের নাম, এলাকা বা ঠিকানা দিয়ে খুঁজুন...'
            }
            aria-label={
              isEnPrimary
                ? 'Search outlets by name, area, or address'
                : 'আউটলেটের নাম, এলাকা বা ঠিকানা দিয়ে খুঁজুন'
            }
            className="h-10 w-full rounded-lg border border-[#D6D3D1] bg-white pl-9 pr-9 text-xs text-[#1C1917] placeholder:text-[#78716C] focus:border-[#1C1917] focus:outline-none sm:text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-[#78716C] hover:text-[#1C1917]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {OUTLET_REGION_FILTERS.map((filter) => {
            const active = selectedRegion === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setSelectedRegion(filter.id)}
                className={`min-h-[34px] cursor-pointer whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'border-[#1C1917] bg-[#1C1917] text-white'
                    : 'border-[#E7E5E4] bg-white text-[#44403C] hover:border-[#1C1917] hover:text-[#1C1917]'
                }`}
              >
                {isEnPrimary ? filter.labelEn : filter.labelBn}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Filter Reset */}
      {(searchQuery || selectedRegion !== 'all') && (
        <div className="flex items-center justify-end text-xs">
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedRegion('all');
            }}
            className="cursor-pointer font-semibold text-[#B91C1C] hover:underline"
          >
            {isEnPrimary ? 'Reset filter' : 'সব দেখুন'}
          </button>
        </div>
      )}

      {/* Outlets Grid */}
      {filteredOutlets.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredOutlets.map((outlet) => (
            <OutletCard key={outlet.id} outlet={outlet} languageMode={languageMode} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#E7E5E4] bg-white p-10 text-center">
          <MapPin className="mx-auto h-7 w-7 text-[#A8A29E]" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-[#1C1917]">
            {isEnPrimary
              ? 'No matching outlets found.'
              : 'আপনার খোঁজা তথ্য অনুযায়ী কোনো শো-রুম পাওয়া যায়নি।'}
          </p>
          <p className="mt-1 text-xs text-[#78716C]">
            {isEnPrimary
              ? 'Try searching for Khulshi, Halishahar, Chawkbazar, Kotwali, or Agrabad.'
              : 'খুলশী, হালিশহর, চকবাজার, কোতোয়ালী বা আগ্রাবাদ লিখে খুঁজে দেখুন।'}
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedRegion('all');
            }}
            className="mt-4 cursor-pointer rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
          >
            {isEnPrimary ? 'Show All Outlets' : 'সব শো-রুম দেখুন'}
          </button>
        </div>
      )}
    </div>
  );
}
