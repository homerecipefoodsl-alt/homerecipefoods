import { useEffect, useState } from 'react';
import { Clock, ExternalLink, MapPin, Navigation, Phone } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { getShowroomText, resolveBilingualPair } from '../lib/bilingual';

export function ShowroomLocator() {
  const { showrooms, languageMode } = useStore();
  const [selectedId, setSelectedId] = useState<string>(showrooms[0]?.id ?? '');

  useEffect(() => {
    if (showrooms.length > 0 && !showrooms.some((s) => s.id === selectedId)) {
      setSelectedId(showrooms[0].id);
    }
  }, [showrooms, selectedId]);

  const activeShowroom = showrooms.find((s) => s.id === selectedId) ?? showrooms[0];

  if (!activeShowroom) {
    return (
      <div className="rounded-xl border border-[#E7E5E4] bg-white p-8 text-center text-sm text-[#57534E]">
        No showroom locations are available right now.
      </div>
    );
  }

  const activeText = getShowroomText(activeShowroom);
  const activeNamePair = resolveBilingualPair(activeText.nameEn, activeText.nameBn);
  const activeAreaPair = resolveBilingualPair(activeText.areaEn, activeText.areaBn);
  const activeAddrPair = resolveBilingualPair(activeText.addressEn, activeText.addressBn);
  const activeDescPair = resolveBilingualPair(
    activeText.descriptionEn,
    activeText.descriptionBn
  );
  const activeHoursPair = resolveBilingualPair(
    activeText.openingHoursEn,
    activeText.openingHoursBn
  );

  const hasRealCoords =
    Number.isFinite(activeShowroom.lat) &&
    Number.isFinite(activeShowroom.lng) &&
    (activeShowroom.lat !== 0 || activeShowroom.lng !== 0);
  const mapQuery = hasRealCoords
    ? `${activeShowroom.lat},${activeShowroom.lng}`
    : activeAddrPair.primary || activeNamePair.primary;
  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=15&output=embed`;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
      {/* Left: Interactive Showroom List */}
      <div className="flex flex-col gap-3 lg:col-span-5">
        {showrooms.map((sr) => {
          const isSelected = sr.id === activeShowroom.id;
          const st = getShowroomText(sr);
          const namePair = resolveBilingualPair(st.nameEn, st.nameBn);
          const areaPair = resolveBilingualPair(st.areaEn, st.areaBn);
          const addrPair = resolveBilingualPair(st.addressEn, st.addressBn);
          const hoursPair = resolveBilingualPair(st.openingHoursEn, st.openingHoursBn);

          return (
            <button
              key={sr.id}
              type="button"
              onClick={() => setSelectedId(sr.id)}
              className={`cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                isSelected
                  ? 'border-[#DC1F26] bg-white'
                  : 'border-[#E7E5E4] bg-[#FAFAF8] hover:border-[#D6D3D1] hover:bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-[#DC1F26]">
                    {areaPair.primary}
                    {sr.id === 'shah-garibullah-hs' ? ' · Office & Outlet' : ''}
                  </p>
                  {languageMode !== 'bn' ? (
                    <>
                      <h3 className="font-display mt-0.5 text-lg font-semibold text-[#1C1917]">
                        {namePair.primary}
                      </h3>
                      {languageMode === 'both' && namePair.secondaryBn && (
                        <p className="font-bn text-xs text-[#57534E]">
                          {namePair.secondaryBn}
                        </p>
                      )}
                    </>
                  ) : (
                    <h3 className="font-bn mt-0.5 text-lg font-semibold text-[#1C1917]">
                      {st.nameBn || namePair.primary}
                    </h3>
                  )}
                </div>
                <MapPin
                  className={`mt-1 h-4 w-4 shrink-0 ${
                    isSelected ? 'text-[#DC1F26]' : 'text-[#78716C]'
                  }`}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#57534E]">
                {languageMode === 'bn' ? st.addressBn || addrPair.primary : addrPair.primary}
              </p>
              {languageMode === 'both' && addrPair.secondaryBn && (
                <p className="font-bn mt-0.5 text-[11px] leading-relaxed text-[#78716C]">
                  {addrPair.secondaryBn}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#44403C]">
                <span className="font-mono tabular-nums font-medium">{sr.phone}</span>
                <span className="text-[#78716C]">·</span>
                <span>{languageMode === 'bn' ? st.openingHoursBn : hoursPair.primary}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Right: Selected Showroom Details & Interactive Map */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-[#E7E5E4] bg-white lg:col-span-7">
        <div className="relative h-72 w-full bg-[#F5F4F0] sm:h-80 lg:flex-1">
          <iframe
            title={`${activeNamePair.primary} Map`}
            src={embedUrl}
            loading="lazy"
            className="h-full w-full border-0"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        <div className="border-t border-[#E7E5E4] p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-medium text-[#DC1F26]">
                {activeAreaPair.primary}
                {activeAreaPair.secondaryBn && (
                  <span className="font-bn ml-1.5 text-[#78716C]">
                    · {activeAreaPair.secondaryBn}
                  </span>
                )}
              </p>
              <h3 className="font-display text-2xl font-semibold text-[#1C1917]">
                {activeNamePair.primary}
              </h3>
              {activeNamePair.secondaryBn && (
                <p className="font-bn text-xs text-[#57534E]">{activeNamePair.secondaryBn}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href={`tel:${activeShowroom.phone.replace(/\s+/g, '')}`}
                className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-[#1C1917] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#DC1F26]"
              >
                <Phone className="h-3.5 w-3.5" />
                <span>Call Showroom</span>
              </a>
              <a
                href={activeShowroom.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-[#D6D3D1] bg-white px-4 py-2.5 text-xs font-semibold text-[#1C1917] transition-colors hover:border-[#1C1917]"
              >
                <Navigation className="h-3.5 w-3.5" />
                <span>Directions</span>
                <ExternalLink className="h-3 w-3 text-[#78716C]" />
              </a>
            </div>
          </div>

          {activeDescPair.primary && (
            <div className="mt-3 space-y-1 text-xs leading-relaxed text-[#57534E]">
              <p>{activeDescPair.primary}</p>
              {activeDescPair.secondaryBn && (
                <p className="font-bn text-[#78716C]">{activeDescPair.secondaryBn}</p>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#F5F4F0] pt-4 text-xs text-[#57534E] sm:grid-cols-2 sm:text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p className="text-[#1C1917]">{activeAddrPair.primary}</p>
                {activeAddrPair.secondaryBn && (
                  <p className="font-bn mt-0.5 text-xs text-[#78716C]">
                    {activeAddrPair.secondaryBn}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p className="text-[#1C1917]">{activeHoursPair.primary}</p>
                {activeHoursPair.secondaryBn && (
                  <p className="font-bn mt-0.5 text-xs text-[#78716C]">
                    {activeHoursPair.secondaryBn}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
