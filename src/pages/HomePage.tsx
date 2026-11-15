import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Lock,
  MessageCircle,
  Phone,
  Search,
} from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { ShowroomLocator } from '../components/ShowroomLocator';
import { useStore } from '../context/StoreContext';
import { resolveAssetUrl } from '../lib/assets';
import {
  getCategoryText,
  getHeroSlideText,
  getOccasionText,
} from '../lib/bilingual';
import type { HomepageSection } from '../types';

interface HomePageProps {
  onOpenChat: (mode?: 'ai' | 'human') => void;
}

export function HomePage({ onOpenChat }: HomePageProps) {
  const {
    categories,
    occasions,
    products,
    heroBanners,
    homepageSections,
    siteSettings,
    seoSettings,
    languageMode,
    loading,
  } = useStore();

  const slides = heroBanners.length > 0 ? heroBanners : siteSettings.heroSlides;
  const [slideIdx, setSlideIdx] = useState(0);
  const [selectedOccasion, setSelectedOccasion] = useState<string>(
    occasions[0]?.slug ?? 'wedding'
  );

  useEffect(() => {
    document.title =
      seoSettings.siteTitle ||
      `${siteSettings.brandName || 'Home Recipe Foods'} – Premium Bakery, Traditional Sweets & Custom Cakes`;
  }, [seoSettings.siteTitle, siteSettings.brandName]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setSlideIdx((prev) => (prev + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const activeSlide = slides[slideIdx % Math.max(slides.length, 1)];
  const heroText = getHeroSlideText(activeSlide);
  const effectiveHeroLang =
    languageMode !== 'both' ? languageMode : heroText.displayLanguage;

  const featuredProducts = useMemo(
    () => products.filter((p) => p.featured).slice(0, 8),
    [products]
  );

  const popularProducts = useMemo(
    () => products.filter((p) => p.popular).slice(0, 8),
    [products]
  );

  const occasionProducts = useMemo(() => {
    return products
      .filter((p) => p.occasions.includes(selectedOccasion))
      .slice(0, 4);
  }, [products, selectedOccasion]);

  const activeOccasionObj = occasions.find((o) => o.slug === selectedOccasion);
  const activeOccText = activeOccasionObj ? getOccasionText(activeOccasionObj) : null;

  const pickSectionText = (sec: HomepageSection) => ({
    title:
      languageMode === 'en'
        ? sec.title_en || sec.title_bn
        : sec.title_bn || sec.title_en,
    subtitle:
      languageMode === 'en'
        ? sec.subtitle_en || sec.subtitle_bn
        : sec.subtitle_bn || sec.subtitle_en,
    ctaText:
      languageMode === 'en'
        ? sec.ctaTextEn || sec.cta_en || sec.ctaTextBn || sec.cta_bn
        : sec.ctaTextBn || sec.cta_bn || sec.ctaTextEn || sec.cta_en,
    ctaLink: sec.ctaLink || sec.cta_link || '',
  });

  const renderSection = (sec: HomepageSection) => {
    const txt = pickSectionText(sec);

    switch (sec.sectionKey) {
      case 'hero':
        return (
          <section
            key={sec.id}
            className="relative h-[540px] w-full overflow-hidden bg-[#1C1917] sm:h-[620px] lg:h-[680px]"
          >
            {slides.map((slide, idx) => (
              <div
                key={slide.id}
                className={`absolute inset-0 transition-opacity duration-1000 ${
                  idx === slideIdx ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
              >
                <img
                  key={`${slide.id}-${idx === slideIdx}`}
                  src={resolveAssetUrl(slide.image)}
                  alt={slide.title_en || slide.title}
                  referrerPolicy="no-referrer"
                  className={`h-full w-full object-cover ${
                    idx === slideIdx ? 'animate-ken-burns' : ''
                  }`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25" />
              </div>
            ))}

            <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold tracking-widest text-[#FACC15] uppercase sm:text-sm">
                  {siteSettings.brandName || 'Home Recipe Foods'} · Bangladesh
                </p>
                {effectiveHeroLang !== 'en' && (
                  <h1
                    className="font-display mt-3 text-4xl font-bold leading-[1.1] text-white sm:text-5xl lg:text-6xl"
                    style={{ textWrap: 'balance' }}
                  >
                    {heroText.titleBn}
                  </h1>
                )}
                {effectiveHeroLang !== 'bn' && heroText.titleEn && (
                  <p
                    className={
                      effectiveHeroLang === 'en'
                        ? 'font-display mt-3 text-4xl font-bold leading-[1.08] text-white sm:text-5xl lg:text-6xl'
                        : 'mt-2 text-base font-medium tracking-wide text-[#FACC15]/95 sm:text-xl'
                    }
                  >
                    {heroText.titleEn}
                  </p>
                )}
                <div className="mt-3 max-w-xl space-y-1 text-sm leading-relaxed text-[#E7E5E4] sm:text-base">
                  {effectiveHeroLang !== 'en' && heroText.subtitleBn && (
                    <p>{heroText.subtitleBn}</p>
                  )}
                  {effectiveHeroLang !== 'bn' &&
                    heroText.subtitleEn &&
                    heroText.subtitleEn !== heroText.subtitleBn && (
                      <p className="text-xs text-[#D6D3D1] sm:text-sm">
                        {heroText.subtitleEn}
                      </p>
                    )}
                </div>

                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <Link
                    to={activeSlide?.ctaLink || '/products'}
                    className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-[#DC1F26] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C]"
                  >
                    <span>{activeSlide?.ctaLabel || 'Explore Products'}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/showrooms"
                    className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-white/40 bg-black/30 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white hover:text-[#1C1917]"
                  >
                    <span>Find a Showroom</span>
                  </Link>
                </div>
              </div>

              {slides.length > 1 && (
                <div className="mt-8 flex items-center justify-between border-t border-white/15 pt-4">
                  <div className="flex items-center gap-2">
                    {slides.map((s, idx) => (
                      <button
                        key={s.id}
                        type="button"
                        aria-label={`Slide ${idx + 1}`}
                        onClick={() => setSlideIdx(idx)}
                        className={`h-1.5 cursor-pointer rounded-full transition-all ${
                          idx === slideIdx ? 'w-8 bg-[#FACC15]' : 'w-3 bg-white/40 hover:bg-white/70'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Previous slide"
                      onClick={() =>
                        setSlideIdx((prev) => (prev - 1 + slides.length) % slides.length)
                      }
                      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/25 bg-black/30 text-white hover:bg-white/20"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next slide"
                      onClick={() => setSlideIdx((prev) => (prev + 1) % slides.length)}
                      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/25 bg-black/30 text-white hover:bg-white/20"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        );

      case 'announcement':
        return (
          <section key={sec.id} className="border-b border-[#E7E5E4] bg-white">
            <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 py-5 sm:flex-row sm:items-center sm:px-6 lg:px-8">
              <div className="text-xs leading-relaxed text-[#44403C] sm:text-sm">
                <span className="font-semibold text-[#1C1917]">{txt.title}</span>{' '}
                <span>{txt.subtitle}</span>
              </div>
              <Link
                to={txt.ctaLink || '/products'}
                className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-4 py-2 text-xs font-semibold text-[#1C1917] transition-colors hover:border-[#B91C1C] hover:text-[#B91C1C]"
              >
                <Search className="h-3.5 w-3.5" />
                <span>{txt.ctaText || 'সব পণ্য খুঁজুন'}</span>
              </Link>
            </div>
          </section>
        );

      case 'categories':
        return (
          <section
            key={sec.id}
            id="categories"
            className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-18 lg:px-8"
          >
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold tracking-wider text-[#B91C1C]">
                  {txt.subtitle || 'পণ্য ক্যাটাগরি · Categories'}
                </p>
                <h2 className="font-display mt-1 text-3xl font-bold text-[#1C1917] sm:text-4xl">
                  {txt.title || 'আমাদের বিশেষ বিভাগ'}
                </h2>
              </div>
              <Link
                to={txt.ctaLink || '/products'}
                className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[#B91C1C] hover:underline"
              >
                <span>{txt.ctaText || 'সম্পূর্ণ মেনু দেখুন · Full Menu'}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((cat) => {
                const count = products.filter((p) => p.category === cat.slug).length;
                const ct = getCategoryText(cat);
                return (
                  <Link
                    key={cat.id}
                    to={`/category/${cat.slug}`}
                    className="group flex flex-col overflow-hidden rounded-xl border border-[#E7E5E4] bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D6D3D1] hover:shadow-md"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-[#F5F4F0]">
                      <img
                        src={resolveAssetUrl(cat.image)}
                        alt={`${ct.nameBn} - ${ct.nameEn}`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-display text-2xl font-bold text-[#1C1917]">
                          {ct.nameBn}
                        </h3>
                        <span className="font-mono tabular-nums text-xs font-medium text-[#78716C]">
                          {count} items
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-[#78716C]">{ct.nameEn}</p>
                      <p className="mt-2.5 line-clamp-2 flex-1 text-sm leading-relaxed text-[#57534E]">
                        {ct.descriptionBn}
                      </p>
                      {ct.descriptionEn && ct.descriptionEn !== ct.descriptionBn && (
                        <p className="mt-1 line-clamp-1 text-xs text-[#78716C]">
                          {ct.descriptionEn}
                        </p>
                      )}
                      <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#B91C1C]">
                        <span>Explore {ct.nameEn}</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );

      case 'featured_products':
        return (
          <section key={sec.id} className="border-y border-[#E7E5E4] bg-white py-14 sm:py-18">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-[#B91C1C]">
                    {txt.subtitle || 'সিগনেচার কালেকশন · Signature Showcase'}
                  </p>
                  <h2 className="font-display mt-1 text-3xl font-bold text-[#1C1917] sm:text-4xl">
                    {txt.title || 'সেরা ও বাছাইকৃত পণ্যসমূহ'}
                  </h2>
                </div>
                <Link
                  to={txt.ctaLink || '/products'}
                  className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[#B91C1C] hover:underline"
                >
                  <span>{txt.ctaText || 'সব পণ্য দেখুন'}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {loading ? (
                <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-80 animate-pulse rounded-xl border border-[#E7E5E4] bg-[#F5F4F0]"
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-8 grid grid-cols-2 gap-3.5 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
                  {featuredProducts.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              )}
            </div>
          </section>
        );

      case 'occasion_explorer':
        return (
          <section
            key={sec.id}
            id="occasions"
            className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-18 lg:px-8"
          >
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-wider text-[#B91C1C]">
                উপলক্ষ অনুযায়ী বাছাই · Discover by Occasion
              </p>
              <h2
                className="font-display mt-1 text-3xl font-bold text-[#1C1917] sm:text-4xl"
                style={{ textWrap: 'balance' }}
              >
                {txt.title || 'আপনার বিশেষ মুহূর্তের জন্য কী খুঁজছেন?'}
              </h2>
              <p className="mt-2 text-sm text-[#57534E]">
                {txt.subtitle ||
                  'যেকোনো একটি উপলক্ষ নির্বাচন করুন এবং উপযোগী খাবারগুলো দেখে নিন—তারপর শোরুমে এসে বা কল করে সংগ্রহ করুন।'}
              </p>
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              {occasions.map((occ) => {
                const active = occ.slug === selectedOccasion;
                const ot = getOccasionText(occ);
                return (
                  <button
                    key={occ.id}
                    type="button"
                    onClick={() => setSelectedOccasion(occ.slug)}
                    className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border px-3.5 py-2 text-xs font-semibold transition-all sm:text-sm ${
                      active
                        ? 'border-[#1C1917] bg-[#1C1917] text-white shadow-sm'
                        : 'border-[#E7E5E4] bg-white text-[#44403C] hover:border-[#B91C1C] hover:text-[#1C1917]'
                    }`}
                  >
                    <span aria-hidden="true">{occ.icon}</span>
                    <span>{ot.nameBn}</span>
                    {ot.nameEn && (
                      <span
                        className={`text-[11px] font-normal ${
                          active ? 'text-[#D6D3D1]' : 'text-[#78716C]'
                        }`}
                      >
                        · {ot.nameEn}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {activeOccasionObj && activeOccText && (
              <div className="mt-6 flex flex-col justify-between gap-3 border-b border-[#E7E5E4] pb-4 sm:flex-row sm:items-center">
                <div className="space-y-0.5">
                  <p className="text-sm text-[#44403C]">
                    <span className="font-semibold text-[#1C1917]">
                      {activeOccasionObj.icon} {activeOccText.nameBn}
                      {activeOccText.nameEn ? ` (${activeOccText.nameEn})` : ''}:
                    </span>{' '}
                    {activeOccText.descriptionBn}
                  </p>
                  {activeOccText.descriptionEn &&
                    activeOccText.descriptionEn !== activeOccText.descriptionBn && (
                      <p className="text-xs text-[#78716C]">{activeOccText.descriptionEn}</p>
                    )}
                </div>
                <Link
                  to={`/occasion/${activeOccasionObj.slug}`}
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#B91C1C] hover:underline"
                >
                  <span>এই উপলক্ষের সব পণ্য দেখুন</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3.5 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
              {occasionProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        );

      case 'popular_products':
        return (
          <section key={sec.id} className="border-t border-[#E7E5E4] bg-white py-14 sm:py-18">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-[#B91C1C]">
                    {txt.subtitle || 'ক্রেতাদের প্রিয়'}
                  </p>
                  <h2 className="font-display mt-1 text-3xl font-bold text-[#1C1917] sm:text-4xl">
                    {txt.title || 'সবচেয়ে জনপ্রিয় আইটেম'}
                  </h2>
                </div>
                <Link
                  to={txt.ctaLink || '/products'}
                  className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[#B91C1C] hover:underline"
                >
                  <span>{txt.ctaText || 'আরও দেখুন'}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-3.5 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
                {popularProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </div>
          </section>
        );

      case 'promotional_banner':
        if (!txt.title) return null;
        return (
          <section key={sec.id} className="border-t border-[#E7E5E4] bg-[#1C1917] py-12 text-white">
            <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
              <div>
                <h2 className="font-display text-2xl font-bold text-[#FACC15] sm:text-3xl">
                  {txt.title}
                </h2>
                {txt.subtitle && (
                  <p className="mt-1.5 max-w-2xl text-sm text-[#E7E5E4]">{txt.subtitle}</p>
                )}
              </div>
              {txt.ctaText && (
                <Link
                  to={txt.ctaLink || '/showrooms'}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#B91C1C]"
                >
                  <span>{txt.ctaText}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </section>
        );

      case 'showrooms':
        return (
          <section
            key={sec.id}
            id="showrooms"
            className="border-t border-[#E7E5E4] bg-[#FAFAF8] py-14 sm:py-18"
          >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-[#B91C1C]">
                    সরাসরি ভিজিট ও ক্রয়
                  </p>
                  <h2 className="font-display mt-1 text-3xl font-bold text-[#1C1917] sm:text-4xl">
                    {txt.title || 'আমাদের শোরুমসমূহ'}
                  </h2>
                  <p className="mt-1.5 text-sm text-[#57534E]">
                    {txt.subtitle ||
                      'আপনার নিকটস্থ শোরুম নির্বাচন করে ঠিকানা, সময়সূচি ও গুগল ম্যাপ লোকেশন দেখুন।'}
                  </p>
                </div>
                <Link
                  to={txt.ctaLink || '/showrooms'}
                  className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[#B91C1C] hover:underline"
                >
                  <span>{txt.ctaText || 'সব শোরুম বিস্তারিত'}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <ShowroomLocator />
            </div>
          </section>
        );

      case 'complaint_and_support':
        return (
          <section key={sec.id} className="border-t border-[#E7E5E4] bg-white py-14">
            <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
              <div className="flex flex-col justify-between rounded-2xl border border-[#E7E5E4] bg-[#FAFAF8] p-6 sm:p-8">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#B91C1C]">
                    <Lock className="h-4 w-4" />
                    <span>১০০% গোপনীয় · সরাসরি ম্যানেজমেন্ট</span>
                  </div>
                  <h3 className="font-display mt-2 text-2xl font-bold text-[#1C1917] sm:text-3xl">
                    অভিযোগ বক্স
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#57534E]">
                    পণ্যের মান, শোরুম সেবা বা মূল্য সংক্রান্ত যেকোনো মতামত ও অভিযোগ সরাসরি আমাদের কাছে জানান। আপনার তথ্য সম্পূর্ণ গোপন থাকবে।
                  </p>
                </div>
                <div className="mt-6">
                  <Link
                    to="/complaint"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#1C1917] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C]"
                  >
                    <span>অভিযোগ জমা দিন</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-2xl border border-[#E7E5E4] bg-[#1C1917] p-6 text-white sm:p-8">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#FACC15]">
                    <MessageCircle className="h-4 w-4" />
                    <span>AI Assistant &amp; সরাসরি প্রতিনিধি</span>
                  </div>
                  <h3 className="font-display mt-2 text-2xl font-bold text-white sm:text-3xl">
                    {txt.title || 'কোনো প্রশ্ন আছে? কথা বলুন আমাদের সাথে'}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#D6D3D1]">
                    {txt.subtitle ||
                      'কেকের ফ্লেভার, মিষ্টির দাম, উপাদান বা শোরুমের সময় জানতে আমাদের AI Assistant-কে জিজ্ঞেস করুন অথবা সরাসরি প্রতিনিধির সাথে লাইভ চ্যাট করুন।'}
                  </p>
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenChat('ai')}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#DC1F26] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C]"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>AI ও লাইভ চ্যাট</span>
                  </button>
                  <a
                    href={`tel:${siteSettings.supportPhone.replace(/\s+/g, '')}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-[#1C1917]"
                  >
                    <Phone className="h-4 w-4" />
                    <span className="font-mono tabular-nums">{siteSettings.supportPhone}</span>
                  </a>
                </div>
              </div>
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  return <div>{homepageSections.map((sec) => renderSection(sec))}</div>;
}
