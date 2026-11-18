import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  MessageCircle,
  Phone,
  Store,
  UtensilsCrossed,
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

function CategoryThumb({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F5F4F0] text-[#B91C1C]/70 sm:h-14 sm:w-14">
        <UtensilsCrossed className="h-5 w-5" />
      </div>
    );
  }

  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#F5F4F0] sm:h-14 sm:w-14">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
    </div>
  );
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
    error,
  } = useStore();

  const slides = heroBanners.length > 0 ? heroBanners : siteSettings.heroSlides;
  const [slideIdx, setSlideIdx] = useState(0);
  const [heroImgFailed, setHeroImgFailed] = useState<Record<string, boolean>>({});
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

  // Map CMS homepage section toggles cleanly without breaking admin visibility settings
  const sectionMap = useMemo(() => {
    const map = new Map<string, HomepageSection>();
    homepageSections.forEach((sec) => map.set(sec.sectionKey, sec));
    return map;
  }, [homepageSections]);

  // Popular products from existing Firestore `popular` flag with safe fallback
  const popularProducts = useMemo(() => {
    const taggedPopular = products.filter((p) => Boolean(p.popular));
    if (taggedPopular.length > 0) return taggedPopular.slice(0, 10);
    const taggedFeatured = products.filter((p) => Boolean(p.featured));
    if (taggedFeatured.length > 0) return taggedFeatured.slice(0, 10);
    return products.slice(0, 10);
  }, [products]);

  const featuredProducts = useMemo(
    () => products.filter((p) => Boolean(p.featured)).slice(0, 10),
    [products]
  );

  const occasionProducts = useMemo(() => {
    return products
      .filter((p) => p.occasions.includes(selectedOccasion))
      .slice(0, 5);
  }, [products, selectedOccasion]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    });
    return counts;
  }, [products]);

  const activeOccasionObj = occasions.find((o) => o.slug === selectedOccasion);
  const activeOccText = activeOccasionObj ? getOccasionText(activeOccasionObj) : null;

  const pickSectionText = (sec?: HomepageSection) => ({
    title: sec
      ? languageMode === 'en'
        ? sec.title_en || sec.title_bn
        : sec.title_bn || sec.title_en
      : '',
    subtitle: sec
      ? languageMode === 'en'
        ? sec.subtitle_en || sec.subtitle_bn
        : sec.subtitle_bn || sec.subtitle_en
      : '',
    ctaText: sec
      ? languageMode === 'en'
        ? sec.ctaTextEn || sec.cta_en || sec.ctaTextBn || sec.cta_bn
        : sec.ctaTextBn || sec.cta_bn || sec.ctaTextEn || sec.cta_en
      : '',
    ctaLink: sec?.ctaLink || sec?.cta_link || '',
  });

  const heroSection = sectionMap.get('hero');
  const categoriesSection = sectionMap.get('categories');
  const popularSection = sectionMap.get('popular_products');
  const featuredSection = sectionMap.get('featured_products');
  const occasionSection = sectionMap.get('occasion_explorer');
  const promoSection = sectionMap.get('promotional_banner');
  const showroomsSection = sectionMap.get('showrooms');
  const supportSection = sectionMap.get('complaint_and_support');

  const categoriesText = pickSectionText(categoriesSection);
  const popularText = pickSectionText(popularSection);
  const featuredText = pickSectionText(featuredSection);
  const occasionText = pickSectionText(occasionSection);
  const promoText = pickSectionText(promoSection);
  const showroomsText = pickSectionText(showroomsSection);
  const supportText = pickSectionText(supportSection);

  const renderProductStateFallback = (emptyText: string) => {
    if (loading) {
      return (
        <div className="mt-5 space-y-3">
          <p className="text-xs font-medium text-[#78716C]">লোড হচ্ছে...</p>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:gap-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-60 animate-pulse rounded-xl border border-[#E7E5E4] bg-[#F5F4F0]"
              />
            ))}
          </div>
        </div>
      );
    }

    if (error && products.length === 0) {
      return (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50/70 p-6 text-center">
          <p className="text-sm font-medium text-[#B91C1C]">
            পণ্য লোড করা যাচ্ছে না। আবার চেষ্টা করুন।
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 cursor-pointer rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
          >
            পুনরায় লোড করুন
          </button>
        </div>
      );
    }

    return (
      <div className="mt-5 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-8 text-center">
        <UtensilsCrossed className="mx-auto h-7 w-7 text-[#A8A29E]" />
        <p className="mt-2 text-sm font-medium text-[#57534E]">{emptyText}</p>
      </div>
    );
  };

  return (
    <div className="overflow-x-hidden">
      {/* Compact Premium Hero Section */}
      {heroSection && (
        <section className="relative h-[290px] w-full overflow-hidden bg-[#1C1917] sm:h-[380px] lg:h-[440px]">
          {slides.map((slide, idx) => {
            const imgFailed = Boolean(heroImgFailed[slide.id]);
            return (
              <div
                key={slide.id}
                className={`absolute inset-0 transition-opacity duration-500 ${
                  idx === slideIdx ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
              >
                {!imgFailed ? (
                  <img
                    src={resolveAssetUrl(slide.image)}
                    alt={slide.title_en || slide.title || 'Home Recipe Foods'}
                    loading={idx === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    fetchPriority={idx === 0 ? 'high' : 'auto'}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setHeroImgFailed((prev) => ({ ...prev, [slide.id]: true }))
                    }
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-[#292524] via-[#1C1917] to-[#450A0A]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-[#1C1917]/90 via-[#1C1917]/60 to-[#1C1917]/20" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/15" />
              </div>
            );
          })}

          <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end px-4 pb-7 sm:px-6 sm:pb-11 lg:px-8">
            <div className="max-w-xl">
              <p className="text-[11px] font-semibold tracking-wider text-[#FACC15] sm:text-xs">
                {siteSettings.brandName || 'Home Recipe Foods'} · প্রতিদিন তাজা প্রস্তুতি
              </p>

              {effectiveHeroLang !== 'en' && (
                <h1
                  className="font-display mt-1.5 text-3xl font-bold leading-[1.12] text-white sm:text-4xl lg:text-5xl"
                  style={{ textWrap: 'balance' }}
                >
                  {heroText.titleBn || 'স্বাদের সাথে ভালোবাসার ছোঁয়া'}
                </h1>
              )}
              {effectiveHeroLang !== 'bn' && heroText.titleEn && (
                <p
                  className={
                    effectiveHeroLang === 'en'
                      ? 'font-display mt-1.5 text-3xl font-bold leading-[1.1] text-white sm:text-4xl lg:text-5xl'
                      : 'mt-1 text-sm font-medium text-[#FACC15]/90 sm:text-base'
                  }
                >
                  {heroText.titleEn}
                </p>
              )}

              <p className="mt-2 line-clamp-2 max-w-lg text-xs leading-relaxed text-[#E7E5E4] sm:text-sm">
                {effectiveHeroLang === 'en'
                  ? heroText.subtitleEn || heroText.subtitleBn
                  : heroText.subtitleBn ||
                    'Home Recipe Foods-এর সুস্বাদু খাবার, কেক, মিষ্টি ও বিশেষ আয়োজন।'}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2.5 sm:mt-5">
                <Link
                  to={activeSlide?.ctaLink || '/products'}
                  className="inline-flex min-h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#B91C1C] sm:text-sm"
                >
                  <span>{activeSlide?.ctaLabel || 'পণ্য দেখুন'}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/showrooms"
                  className="inline-flex min-h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-white/35 bg-black/30 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-xs transition-colors hover:bg-white hover:text-[#1C1917] sm:text-sm"
                >
                  <span>শোরুম খুঁজুন</span>
                </Link>
              </div>
            </div>

            {slides.length > 1 && (
              <div className="mt-5 flex items-center justify-between border-t border-white/15 pt-3">
                <div className="flex items-center gap-1.5">
                  {slides.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-label={`Slide ${idx + 1}`}
                      onClick={() => setSlideIdx(idx)}
                      className={`h-1.5 cursor-pointer rounded-full transition-all ${
                        idx === slideIdx ? 'w-6 bg-[#FACC15]' : 'w-2 bg-white/40 hover:bg-white/70'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Previous slide"
                    onClick={() =>
                      setSlideIdx((prev) => (prev - 1 + slides.length) % slides.length)
                    }
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/25 bg-black/30 text-white hover:bg-white/20"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next slide"
                    onClick={() => setSlideIdx((prev) => (prev + 1) % slides.length)}
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/25 bg-black/30 text-white hover:bg-white/20"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Non-blocking Firestore Warning if error occurred while fallback loaded */}
      {error && products.length > 0 && (
        <div className="mx-auto max-w-7xl px-3 pt-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-900">
            <span>পণ্য লোড করা যাচ্ছে না। আবার চেষ্টা করুন।</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="shrink-0 cursor-pointer font-semibold text-[#B91C1C] hover:underline"
            >
              রিফ্রেশ
            </button>
          </div>
        </div>
      )}

      {/* 2. Compact Categories Section */}
      {categoriesSection && categories.length > 0 && (
        <section
          id="categories"
          className="mx-auto max-w-7xl scroll-mt-28 px-3 py-8 sm:scroll-mt-32 sm:px-6 sm:py-10 lg:px-8"
        >
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-[#1C1917] sm:text-3xl">
                {categoriesText.title || 'ক্যাটাগরি অনুযায়ী দেখুন'}
              </h2>
              <p className="mt-0.5 text-xs text-[#78716C] sm:text-sm">
                {categoriesText.subtitle || 'পছন্দের খাবারের বিভাগ বেছে নিন'}
              </p>
            </div>
            <Link
              to={categoriesText.ctaLink || '/products'}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#B91C1C] hover:underline sm:text-sm"
            >
              <span>সব মেনু</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Mobile: Smooth horizontal compact cards | Desktop: 1-row clean grid */}
          <div className="no-scrollbar -mx-3 mt-4 flex snap-x gap-2.5 overflow-x-auto px-3 pb-1.5 sm:mx-0 sm:grid sm:grid-cols-5 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-9">
            {categories.map((cat) => {
              const count = categoryCounts.get(cat.slug) ?? 0;
              const ct = getCategoryText(cat);
              return (
                <Link
                  key={cat.id}
                  to={`/category/${cat.slug}`}
                  className="group flex w-[84px] shrink-0 snap-start flex-col items-center rounded-xl border border-[#E7E5E4] bg-white p-2 text-center shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#DC1F26]/40 hover:shadow-sm sm:w-auto sm:p-2.5"
                >
                  <CategoryThumb
                    src={resolveAssetUrl(cat.image)}
                    alt={`${ct.nameBn} - ${ct.nameEn}`}
                  />
                  <span className="mt-1.5 line-clamp-1 w-full text-[11px] font-semibold text-[#1C1917] sm:mt-2 sm:text-xs">
                    {languageMode === 'en' ? ct.nameEn || ct.nameBn : ct.nameBn}
                  </span>
                  <span className="font-mono tabular-nums text-[10px] text-[#78716C]">
                    {count}টি পণ্য
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Popular Products ("জনপ্রিয় পণ্য") */}
      {popularSection && (
        <section className="border-t border-[#E7E5E4] bg-white py-9 sm:py-12">
          <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-wider text-[#B91C1C]">
                  {popularText.subtitle || 'ক্রেতাদের সেরা পছন্দ'}
                </p>
                <h2 className="font-display mt-0.5 text-2xl font-bold text-[#1C1917] sm:text-3xl">
                  {popularText.title || 'জনপ্রিয় পণ্য'}
                </h2>
              </div>
              <Link
                to={popularText.ctaLink || '/products'}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#B91C1C] hover:underline sm:text-sm"
              >
                <span>{popularText.ctaText || 'আরও দেখুন'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {popularProducts.length > 0 ? (
              <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:gap-5">
                {popularProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              renderProductStateFallback('কোনো পণ্য পাওয়া যায়নি')
            )}
          </div>
        </section>
      )}

      {/* 4. Featured / Special Products ("বিশেষ পণ্য") — shown only when existing featured products exist */}
      {featuredSection && featuredProducts.length > 0 && (
        <section className="border-t border-[#E7E5E4] bg-[#FAFAF8] py-9 sm:py-12">
          <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-wider text-[#B91C1C]">
                  {featuredText.subtitle || 'সিগনেচার কালেকশন'}
                </p>
                <h2 className="font-display mt-0.5 text-2xl font-bold text-[#1C1917] sm:text-3xl">
                  {featuredText.title || 'বিশেষ পণ্য ও আজকের আয়োজন'}
                </h2>
              </div>
              <Link
                to={featuredText.ctaLink || '/products'}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#B91C1C] hover:underline sm:text-sm"
              >
                <span>{featuredText.ctaText || 'সব পণ্য দেখুন'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:gap-5">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 5. Compact Occasion Explorer */}
      {occasionSection && occasions.length > 0 && (
        <section
          id="occasions"
          className="scroll-mt-28 border-t border-[#E7E5E4] bg-white py-9 sm:scroll-mt-32 sm:py-12"
        >
          <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold tracking-wider text-[#B91C1C]">
                  উপলক্ষ অনুযায়ী বাছাই · Occasions
                </p>
                <h2
                  className="font-display mt-0.5 text-2xl font-bold text-[#1C1917] sm:text-3xl"
                  style={{ textWrap: 'balance' }}
                >
                  {occasionText.title || 'আপনার বিশেষ মুহূর্তের জন্য'}
                </h2>
              </div>
              {activeOccasionObj && (
                <Link
                  to={`/occasion/${activeOccasionObj.slug}`}
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#B91C1C] hover:underline sm:text-sm"
                >
                  <span>এই উপলক্ষের সব পণ্য</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            <div className="-mx-3 mt-4 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
              {occasions.map((occ) => {
                const active = occ.slug === selectedOccasion;
                const ot = getOccasionText(occ);
                return (
                  <button
                    key={occ.id}
                    type="button"
                    onClick={() => setSelectedOccasion(occ.slug)}
                    className={`inline-flex min-h-[38px] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
                      active
                        ? 'border-[#1C1917] bg-[#1C1917] text-white'
                        : 'border-[#E7E5E4] bg-[#FAFAF8] text-[#44403C] hover:border-[#B91C1C] hover:text-[#1C1917]'
                    }`}
                  >
                    <span aria-hidden="true">{occ.icon}</span>
                    <span>{languageMode === 'en' ? ot.nameEn || ot.nameBn : ot.nameBn}</span>
                  </button>
                );
              })}
            </div>

            {activeOccasionObj && activeOccText && (
              <p className="mt-3 text-xs text-[#57534E] sm:text-sm">
                <span className="font-semibold text-[#1C1917]">
                  {activeOccText.nameBn}:
                </span>{' '}
                {activeOccText.descriptionBn}
              </p>
            )}

            {occasionProducts.length > 0 ? (
              <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:gap-5">
                {occasionProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <p className="mt-4 text-xs text-[#78716C]">কোনো পণ্য পাওয়া যায়নি</p>
            )}
          </div>
        </section>
      )}

      {/* Optional CMS Promotional Banner */}
      {promoSection && promoText.title && (
        <section className="border-t border-[#E7E5E4] bg-[#1C1917] py-10 text-white">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
            <div>
              <h2 className="font-display text-2xl font-bold text-[#FACC15] sm:text-3xl">
                {promoText.title}
              </h2>
              {promoText.subtitle && (
                <p className="mt-1 max-w-2xl text-xs text-[#E7E5E4] sm:text-sm">
                  {promoText.subtitle}
                </p>
              )}
            </div>
            {promoText.ctaText && (
              <Link
                to={promoText.ctaLink || '/showrooms'}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#B91C1C]"
              >
                <span>{promoText.ctaText}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </section>
      )}

      {/* 6. Brand & Service Highlight + Showrooms + Customer Support */}
      <section className="border-t border-[#E7E5E4] bg-[#FAFAF8] py-9 sm:py-12">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 divide-y divide-[#E7E5E4] rounded-2xl border border-[#E7E5E4] bg-white md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="flex items-start gap-3.5 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FAFAF8] text-[#DC1F26]">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#1C1917]">খাঁটি ও প্রিমিয়াম উপাদান</h3>
                <p className="mt-1 text-xs leading-relaxed text-[#57534E]">
                  নিউজিল্যান্ড বাটার, বেলজিয়ান চকলেট ও খাঁটি দুধের ছানায় তৈরি প্রতিটি আইটেম।
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FAFAF8] text-[#DC1F26]">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#1C1917]">প্রতিদিন সকালে তাজা প্রস্তুতি</h3>
                <p className="mt-1 text-xs leading-relaxed text-[#57534E]">
                  নিজস্ব কিচেনে প্রতিদিন তাজা বেকড কেক, পেস্ট্রি, ব্রেড ও ঐতিহ্যবাহী মিষ্টি।
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FAFAF8] text-[#DC1F26]">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#1C1917]">সরাসরি শোরুমে পরামর্শ ও সংগ্রহ</h3>
                <p className="mt-1 text-xs leading-relaxed text-[#57534E]">
                  বিয়ে, আকদ ও জন্মদিনের কাস্টম অর্ডারের জন্য নিকটস্থ শোরুমে সরাসরি কথা বলুন।
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showroomsSection && (
        <section
          id="showrooms"
          className="scroll-mt-28 border-t border-[#E7E5E4] bg-white py-9 sm:scroll-mt-32 sm:py-12"
        >
          <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
            <div className="mb-6 flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-wider text-[#B91C1C]">
                  সরাসরি ভিজিট ও ক্রয়
                </p>
                <h2 className="font-display mt-0.5 text-2xl font-bold text-[#1C1917] sm:text-3xl">
                  {showroomsText.title || 'আমাদের শোরুমসমূহ'}
                </h2>
              </div>
              <Link
                to={showroomsText.ctaLink || '/showrooms'}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#B91C1C] hover:underline sm:text-sm"
              >
                <span>{showroomsText.ctaText || 'সব শোরুম'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <ShowroomLocator />
          </div>
        </section>
      )}

      {supportSection && (
        <section className="border-t border-[#E7E5E4] bg-[#FAFAF8] py-9 sm:py-12">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-3 sm:px-6 lg:grid-cols-2 lg:gap-6 lg:px-8">
            <div className="flex flex-col justify-between rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#B91C1C]">
                  <Lock className="h-4 w-4" />
                  <span>১০০% গোপনীয় · সরাসরি ম্যানেজমেন্ট</span>
                </div>
                <h3 className="font-display mt-2 text-2xl font-bold text-[#1C1917]">
                  অভিযোগ ও মতামত বক্স
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#57534E] sm:text-sm">
                  পণ্যের মান, শোরুম সেবা বা মূল্য সংক্রান্ত যেকোনো মতামত সরাসরি আমাদের জানান। আপনার তথ্য সম্পূর্ণ গোপন থাকবে।
                </p>
              </div>
              <div className="mt-5">
                <Link
                  to="/complaint"
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#1C1917] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#B91C1C] sm:text-sm"
                >
                  <span>অভিযোগ জমা দিন</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-2xl border border-[#292524] bg-[#1C1917] p-5 text-white sm:p-7">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#FACC15]">
                  <MessageCircle className="h-4 w-4" />
                  <span>AI Assistant ও সরাসরি প্রতিনিধি</span>
                </div>
                <h3 className="font-display mt-2 text-2xl font-bold text-white">
                  {supportText.title || 'কোনো প্রশ্ন আছে? কথা বলুন আমাদের সাথে'}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#D6D3D1] sm:text-sm">
                  {supportText.subtitle ||
                    'কেকের ফ্লেভার, মিষ্টির দাম, উপাদান বা শোরুমের সময় জানতে আমাদের AI Assistant বা প্রতিনিধির সাথে চ্যাট করুন।'}
                </p>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onOpenChat('ai')}
                  className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-lg bg-[#DC1F26] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#B91C1C] sm:text-sm"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>AI ও লাইভ চ্যাট</span>
                </button>
                <a
                  href={`tel:${siteSettings.supportPhone.replace(/\s+/g, '')}`}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-white/30 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white hover:text-[#1C1917] sm:text-sm"
                >
                  <Phone className="h-4 w-4" />
                  <span className="font-mono tabular-nums">{siteSettings.supportPhone}</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
