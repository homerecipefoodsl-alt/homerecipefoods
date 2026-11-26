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
  OUTLET_REGION_FILTERS,
  SHARED_OUTLET_HOURS,
  formatPhoneHref,
  getOutletSearchHaystack,
  isDemoOrDummyShowroom,
  type OutletItem,
  type OutletRegion,
} from '../data/outletsData';
import { resolveAssetUrl } from '../lib/assets';
import { getShowroomText } from '../lib/bilingual';
import type { Showroom } from '../types';

interface OutletsShowcaseProps {
  variant?: 'page' | 'section';
  showHeader?: boolean;
}

interface DynamicOutletCardItem extends OutletItem {
  imageUrl?: string;
}

const VALID_REGIONS: ReadonlySet<OutletRegion> = new Set([
  'khulshi-gec',
  'halishahar-agrabad',
  'chandgaon-chawkbazar',
  'kotwali-oxygen',
]);

function mapShowroomToOutletItem(sr: Showroom): DynamicOutletCardItem {
  const st = getShowroomText(sr);
  const rawType = (st.descriptionEn || st.descriptionBn || '').trim();
  const isOffice =
    sr.isMain ||
    sr.id === 'shah-garibullah-hs' ||
    /office\s*&\s*outlet/i.test(rawType);
  const region: OutletRegion =
    sr.region && VALID_REGIONS.has(sr.region as OutletRegion)
      ? (sr.region as OutletRegion)
      : 'khulshi-gec';

  return {
    id: sr.id,
    nameBn: st.nameBn || st.nameEn || sr.name,
    nameEn: st.nameEn || st.nameBn || sr.name,
    type: isOffice ? 'Office & Outlet' : undefined,
    addressEn: st.addressEn || st.addressBn || sr.address,
    addressBn: st.addressBn || st.addressEn || sr.address,
    counterHoursEn: st.openingHoursEn || SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: st.openingHoursBn || SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: sr.orderLineEn?.trim() || SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: sr.orderLineBn?.trim() || SHARED_OUTLET_HOURS.orderLineBn,
    phone: sr.phone || '',
    mapsUrl: sr.mapUrl || 'https://maps.google.com/?q=Chattogram+Home+Recipe+Foods',
    status: 'active',
    region,
    imageUrl: Array.isArray(sr.images) && sr.images[0] ? sr.images[0] : undefined,
  };
}

function formatOutletTitleEn(raw: string): string {
  const preserveUpper = new Set(['H/S', 'G.E.C', 'CDA', 'CU']);
  return raw
    .split(/\s+/)
    .map((word) => {
      const bare = word.replace(/,$/, '');
      const suffix = word.endsWith(',') ? ',' : '';
      if (preserveUpper.has(bare.toUpperCase())) return `${bare.toUpperCase()}${suffix}`;
      if (bare === 'NO-2') return `No. 2${suffix}`;
      return (
        bare
          .toLowerCase()
          .replace(/(^|\/|-|\.)([a-z])/g, (_, sep, ch) => `${sep}${ch.toUpperCase()}`) + suffix
      );
    })
    .join(' ');
}

function OutletCard({
  outlet,
  languageMode,
}: {
  outlet: DynamicOutletCardItem;
  languageMode: 'bn' | 'en' | 'both';
}) {
  const showEnglishFirst = languageMode !== 'bn';
  const showBothLanguages = languageMode === 'both';

  const displayNameEn = formatOutletTitleEn(outlet.nameEn);
  const primaryTitle = showEnglishFirst ? displayNameEn : outlet.nameBn;
  const secondaryTitle = showEnglishFirst ? outlet.nameBn : displayNameEn;

  const primaryAddress = showEnglishFirst ? outlet.addressEn : outlet.addressBn;
  const secondaryAddress = showEnglishFirst ? outlet.addressBn : outlet.addressEn;

  const counterHoursText = showEnglishFirst ? outlet.counterHoursEn : outlet.counterHoursBn;
  const orderLineText = showEnglishFirst ? outlet.orderLineEn : outlet.orderLineBn;

  return (
    <article
      data-outlet-id={outlet.id}
      className="flex h-full flex-col justify-between overflow-hidden rounded-xl border border-[#E7E5E4] bg-white transition-colors duration-200 hover:border-[#1C1917]/30"
    >
      <div>
        {outlet.imageUrl && (
          <div className="aspect-[16/9] w-full overflow-hidden border-b border-[#F5F4F0] bg-[#FAFAF8]">
            <img
              src={resolveAssetUrl(outlet.imageUrl)}
              alt={`${displayNameEn} showroom`}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="p-5 pb-0 sm:p-6 sm:pb-0">
          {/* Outlet Name & Status */}
          <div className="flex items-start justify-between gap-3 border-b border-[#F5F4F0] pb-3.5">
            <div className="min-w-0">
              <h3
                className={`text-lg font-semibold leading-snug text-[#1C1917] sm:text-xl ${
                  showEnglishFirst ? 'font-display' : 'font-bn'
                }`}
              >
                {primaryTitle}
              </h3>
              {showBothLanguages && secondaryTitle && secondaryTitle !== primaryTitle && (
                <p
                  className={`mt-0.5 text-xs font-normal text-[#57534E] ${
                    showEnglishFirst ? 'font-bn' : ''
                  }`}
                >
                  {secondaryTitle}
                </p>
              )}
              {outlet.type && (
                <p className="mt-1 text-[11px] font-semibold tracking-wide text-[#B91C1C]">
                  {outlet.type}
                </p>
              )}
            </div>

            <span className="inline-flex shrink-0 items-center gap-1 pt-1 text-[11px] font-medium text-[#166534]">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{showEnglishFirst ? 'Active' : 'সক্রিয়'}</span>
            </span>
          </div>

          {/* Address */}
          <div className="mt-3.5 flex items-start gap-2.5 text-xs leading-relaxed text-[#44403C]">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium text-[#1C1917]">{primaryAddress}</p>
              {showBothLanguages && secondaryAddress && secondaryAddress !== primaryAddress && (
                <p className="font-bn text-[11px] leading-relaxed text-[#78716C]">
                  {secondaryAddress}
                </p>
              )}
            </div>
          </div>

          {/* Counter Hours, Order Line & Direct Phone */}
          <dl className="mt-4 space-y-2 border-t border-[#F5F4F0] pt-3.5 text-xs">
            <div className="flex items-start gap-2.5">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#78716C]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <dt className="text-[11px] font-medium text-[#78716C]">
                  {showEnglishFirst ? 'Counter Hours' : 'কাউন্টার সময়'}
                </dt>
                <dd className="mt-0.5 font-medium text-[#1C1917]">{counterHoursText}</dd>
                {showBothLanguages && outlet.counterHoursBn && (
                  <dd className="font-bn text-[11px] text-[#78716C]">
                    {outlet.counterHoursBn}
                  </dd>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <PhoneCall className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#78716C]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <dt className="text-[11px] font-medium text-[#78716C]">
                  {showEnglishFirst ? 'Order Line' : 'অর্ডার লাইন'}
                </dt>
                <dd className="mt-0.5 font-medium text-[#1C1917]">{orderLineText}</dd>
                {showBothLanguages && outlet.orderLineBn && (
                  <dd className="font-bn text-[11px] text-[#78716C]">
                    {outlet.orderLineBn}
                  </dd>
                )}
              </div>
            </div>

            {outlet.phone && (
              <div className="flex items-center gap-2.5 pt-0.5">
                <Phone className="h-3.5 w-3.5 shrink-0 text-[#DC1F26]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <dt className="sr-only">{showEnglishFirst ? 'Phone' : 'ফোন'}</dt>
                  <dd>
                    <a
                      href={formatPhoneHref(outlet.phone)}
                      aria-label={`Call ${displayNameEn} at ${outlet.phone}`}
                      className="font-mono text-xs font-semibold tabular-nums text-[#1C1917] transition-colors hover:text-[#DC1F26]"
                    >
                      {outlet.phone}
                    </a>
                  </dd>
                </div>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Action Buttons Row */}
      <div className="mx-5 mb-5 mt-5 flex flex-wrap items-center gap-2 border-t border-[#E7E5E4] pt-4 sm:mx-6 sm:mb-6">
        {outlet.phone && (
          <a
            href={formatPhoneHref(outlet.phone)}
            aria-label={`Call ${displayNameEn}`}
            className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1C1917] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#DC1F26]"
          >
            <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{showEnglishFirst ? 'Call' : 'কল করুন'}</span>
          </a>
        )}

        <a
          href={outlet.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Get directions to ${displayNameEn}`}
          className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold text-[#1C1917] transition-colors hover:border-[#1C1917]"
        >
          <Navigation className="h-3.5 w-3.5 shrink-0 text-[#DC1F26]" aria-hidden="true" />
          <span>Get Directions</span>
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
  const { showrooms, languageMode, setLanguageMode } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');

  const showEnglishFirst = languageMode !== 'bn';
  const showBothLanguages = languageMode === 'both';

  const activeOutlets = useMemo(
    () =>
      showrooms
        .filter((sr) => sr.visible !== false && !sr.deleted && !isDemoOrDummyShowroom(sr))
        .map(mapShowroomToOutletItem),
    [showrooms]
  );

  const filteredOutlets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeOutlets.filter((outlet) => {
      if (selectedRegion !== 'all' && outlet.region !== selectedRegion) {
        return false;
      }
      if (!q) return true;
      return getOutletSearchHaystack(outlet).includes(q);
    });
  }, [activeOutlets, searchQuery, selectedRegion]);

  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="space-y-4">
          <div className="flex flex-col justify-between gap-4 border-b border-[#E7E5E4] pb-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold tracking-wider text-[#B91C1C]">
                {showEnglishFirst
                  ? 'Chattogram Showroom Network'
                  : 'চট্টগ্রাম নেটওয়ার্ক'}
              </p>

              {variant === 'page' ? (
                <h1 className="font-display mt-1 text-3xl font-semibold text-[#1C1917] sm:text-5xl">
                  {showEnglishFirst ? 'Our Outlets' : 'আমাদের শো-রুম'}
                </h1>
              ) : (
                <h2 className="font-display mt-1 text-2xl font-semibold text-[#1C1917] sm:text-3xl">
                  {showEnglishFirst ? 'Our Outlets' : 'আমাদের শো-রুম'}
                </h2>
              )}

              {showBothLanguages && (
                <p className="font-bn mt-0.5 text-sm font-normal text-[#57534E]">
                  আমাদের শো-রুমসমূহ
                </p>
              )}

              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#57534E]">
                {showEnglishFirst
                  ? `Visit any of our ${activeOutlets.length} outlets across Chattogram for freshly prepared bakery items, sweets, and custom orders.`
                  : `চট্টগ্রামে আমাদের ${activeOutlets.length}টি শো-রুম থেকে Home Recipe Foods-এর পণ্য সংগ্রহ করুন।`}
              </p>
              {showBothLanguages && (
                <p className="font-bn mt-0.5 max-w-2xl text-xs text-[#78716C]">
                  চট্টগ্রামে আমাদের {activeOutlets.length}টি শো-রুম থেকে সরাসরি Home Recipe Foods-এর পণ্য সংগ্রহ করুন।
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
                  { id: 'both', label: 'EN + বাংলা' },
                  { id: 'en', label: 'English' },
                  { id: 'bn', label: 'বাংলা' },
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
      <div className="flex flex-col gap-3 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4 lg:flex-row lg:items-center lg:justify-between">
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
              showEnglishFirst
                ? 'Search by outlet name, area, or address...'
                : 'আউটলেটের নাম, এলাকা বা ঠিকানা দিয়ে খুঁজুন...'
            }
            aria-label={
              showEnglishFirst
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
                className={`min-h-[34px] cursor-pointer whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-[#1C1917] bg-[#1C1917] text-white'
                    : 'border-[#E7E5E4] bg-white text-[#44403C] hover:border-[#1C1917] hover:text-[#1C1917]'
                }`}
              >
                {showEnglishFirst ? filter.labelEn : filter.labelBn}
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
            {showEnglishFirst ? 'Reset filter' : 'সব দেখুন'}
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
        <div className="rounded-xl border border-[#E7E5E4] bg-white p-10 text-center">
          <MapPin className="mx-auto h-7 w-7 text-[#A8A29E]" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-[#1C1917]">
            {showEnglishFirst
              ? 'No matching outlets found.'
              : 'আপনার খোঁজা তথ্য অনুযায়ী কোনো শো-রুম পাওয়া যায়নি।'}
          </p>
          <p className="mt-1 text-xs text-[#78716C]">
            {showEnglishFirst
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
            {showEnglishFirst ? 'Show All Outlets' : 'সব শো-রুম দেখুন'}
          </button>
        </div>
      )}
    </div>
  );
}
