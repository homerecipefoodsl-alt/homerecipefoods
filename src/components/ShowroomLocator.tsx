import { useEffect, useState } from 'react';
import { Clock, ExternalLink, MapPin, Navigation, Phone } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { getShowroomText } from '../lib/bilingual';

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
        এই মুহূর্তে কোনো শোরুম তথ্য পাওয়া যায়নি।
      </div>
    );
  }

  const activeText = getShowroomText(activeShowroom);
  const embedUrl = `https://maps.google.com/maps?q=${activeShowroom.lat},${activeShowroom.lng}&z=15&output=embed`;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
      {/* Left: Interactive Showroom List */}
      <div className="flex flex-col gap-3 lg:col-span-5">
        {showrooms.map((sr) => {
          const isSelected = sr.id === activeShowroom.id;
          const st = getShowroomText(sr);
          return (
            <button
              key={sr.id}
              type="button"
              onClick={() => setSelectedId(sr.id)}
              className={`cursor-pointer rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? 'border-[#DC1F26] bg-white shadow-sm'
                  : 'border-[#E7E5E4] bg-[#FAFAF8] hover:border-[#D6D3D1] hover:bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-[#DC1F26]">
                    {st.areaBn}
                    {st.areaEn && st.areaEn !== st.areaBn ? ` · ${st.areaEn}` : ''}{' '}
                    {sr.isMain ? '· Flagship' : ''}
                  </p>
                  {languageMode !== 'en' && (
                    <h3 className="font-display mt-0.5 text-lg font-bold text-[#1C1917]">
                      {st.nameBn}
                    </h3>
                  )}
                  {languageMode !== 'bn' && st.nameEn && (
                    <p
                      className={
                        languageMode === 'en'
                          ? 'font-display mt-0.5 text-lg font-bold text-[#1C1917]'
                          : 'text-xs font-medium text-[#78716C]'
                      }
                    >
                      {st.nameEn}
                    </p>
                  )}
                </div>
                <MapPin
                  className={`mt-1 h-4 w-4 shrink-0 ${
                    isSelected ? 'text-[#DC1F26]' : 'text-[#78716C]'
                  }`}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#57534E]">
                {st.addressBn}
              </p>
              {st.addressEn && st.addressEn !== st.addressBn && (
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#78716C]">
                  {st.addressEn}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#44403C]">
                <span className="font-mono tabular-nums font-medium">{sr.phone}</span>
                <span className="text-[#78716C]">·</span>
                <span>{st.openingHoursBn}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Right: Selected Showroom Details & Interactive Map */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-[#E7E5E4] bg-white lg:col-span-7">
        <div className="relative h-72 w-full bg-[#F5F4F0] sm:h-80 lg:flex-1">
          <iframe
            title={`${activeText.nameEn || activeText.nameBn} Map`}
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
                {activeText.areaBn}
                {activeText.areaEn && activeText.areaEn !== activeText.areaBn
                  ? ` · ${activeText.areaEn}`
                  : ''}
              </p>
              <h3 className="font-display text-2xl font-bold text-[#1C1917]">
                {activeText.nameBn}
              </h3>
              {activeText.nameEn && activeText.nameEn !== activeText.nameBn && (
                <p className="text-xs font-medium text-[#78716C]">{activeText.nameEn}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href={`tel:${activeShowroom.phone.replace(/\s+/g, '')}`}
                className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-[#1C1917] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#DC1F26]"
              >
                <Phone className="h-3.5 w-3.5" />
                <span>কল করুন · Call</span>
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

          {(activeText.descriptionBn || activeText.descriptionEn) && (
            <div className="mt-3 space-y-1 text-xs leading-relaxed text-[#57534E]">
              {activeText.descriptionBn && <p>{activeText.descriptionBn}</p>}
              {activeText.descriptionEn &&
                activeText.descriptionEn !== activeText.descriptionBn && (
                  <p className="text-[#78716C]">{activeText.descriptionEn}</p>
                )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#F5F4F0] pt-4 text-xs text-[#57534E] sm:grid-cols-2 sm:text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p>{activeText.addressBn}</p>
                {activeText.addressEn && activeText.addressEn !== activeText.addressBn && (
                  <p className="mt-0.5 text-xs text-[#78716C]">{activeText.addressEn}</p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
              <div>
                <p>{activeText.openingHoursBn}</p>
                {activeText.openingHoursEn &&
                  activeText.openingHoursEn !== activeText.openingHoursBn && (
                    <p className="mt-0.5 text-xs text-[#78716C]">{activeText.openingHoursEn}</p>
                  )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
