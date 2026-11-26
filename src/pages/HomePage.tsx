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
import { OutletsShowcase } from '../components/OutletsShowcase';
import { ProductCard } from '../components/ProductCard';
import { useStore } from '../context/StoreContext';
import { resolveAssetUrl } from '../lib/assets';
import {
  getCategoryText,
  getHeroSlideText,
  getOccasionText,
  resolveProductCategorySlug,
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
    showrooms,
    heroBanners,
    homepageSections,
    siteSettings,
    seoSettings,
    languageMode,
    productsLoading,
    productsError,
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

  // Popular products first, supplemented by other active products so new Firestore items never stay hidden
  const popularProducts = useMemo(() => {
    const taggedPopular = products.filter((p) => Boolean(p.popular));
    if (taggedPopular.length >= 10) return taggedPopular.slice(0, 10);
    if (taggedPopular.length > 0) {
      const seen = new Set(taggedPopular.map((p) => p.id));
      const rest = products.filter((p) => !seen.has(p.id));
      return [...taggedPopular, ...rest].slice(0, 10);
    }
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
      .filter(
        (p) =>
          Array.isArray(p.occasions) && p.occasions.includes(selectedOccasion)
      )
      .slice(0, 5);
  }, [products, selectedOccasion]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => {
      const resolvedSlug = resolveProductCategorySlug(p, categories);
      counts.set(resolvedSlug, (counts.get(resolvedSlug) ?? 0) + 1);
    });
    return counts;
  }, [products, categories]);

  const activeOccasionObj = occasions.find((o) => o.slug === selectedOccasion);
  const activeOccText = activeOccasionObj ? getOccasionText(activeOccasionObj) : null;

  const pickSectionText = (sec?: HomepageSection) => ({
    title: sec
      ? languageMode === 'bn'
        ? sec.title_bn || sec.title_en
        : sec.title_en || sec.title_bn
      : '',
    titleSecondaryBn:
      sec && languageMode === 'both' && sec.title_bn && sec.title_bn !== sec.title_en
        ? sec.title_bn
        : '',
    subtitle: sec
      ? languageMode === 'bn'
        ? sec.subtitle_bn || sec.subtitle_en
        : sec.subtitle_en || sec.subtitle_bn
      : '',
    ctaText: sec
      ? languageMode === 'bn'
        ? sec.ctaTextBn || sec.cta_bn || sec.ctaTextEn || sec.cta_en
        : sec.ctaTextEn || sec.cta_en || sec.ctaTextBn || sec.cta_bn
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
  const supportText = pickSectionText(supportSection);

  const renderProductStateFallback = (emptyTextEn: string, emptyTextBn: string) => {
    if (productsLoading) {
      return (
        <div className="mt-5 space-y-3">
          <p className="text-xs font-medium text-[#78716C]">Loading collection...</p>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:gap-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-60 rounded-xl border border-[#E7E5E4] bg-[#F5F4F0]/60"
              />
            ))}
          </div>
        </div>
      );
    }

    if (productsError && products.length === 0) {
      return (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50/70 p-6 text-center">
          <p className="text-sm font-medium text-[#B91C1C]">
            Unable to load products right now. Please try again shortly.
          </p>
          <p className="font-bn mt-1 text-xs text-[#78716C]">
            পণ্যগুলো এখন লোড করা যাচ্ছে না। অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন।
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 cursor-pointer rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return (
      <div className="mt-5 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-8 text-center">
        <UtensilsCrossed className="mx-auto h-7 w-7 text-[#A8A29E]" />
        <p className="mt-2 text-sm font-medium text-[#1C1917]">{emptyTextEn}</p>
        <p className="font-bn mt-0.5 text-xs text-[#78716C]">{emptyTextBn}</p>
      </div>
    );
  };

  return (
    <div className="overflow-x-hidden">
      {/* Compact Editorial Hero Section */}
      {heroSection && (
        <section className="relative h-[300px] w-full overflow-hidden bg-[#1C1917] sm:h-[390px] lg:h-[450px]">
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
                  <div className="h-full w-full bg-[#292524]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-[#1C1917]/92 via-[#1C1917]/65 to-[#1C1917]/20" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/15" />
              </div>
            );
          })}

          <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end px-4 pb-7 sm:px-6 sm:pb-11 lg:px-8">
            <div className="max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#FACC15] sm:text-xs">
                {siteSettings.brandName || 'Home Recipe Foods'} · Freshly Crafted Daily
              </p>

              {effectiveHeroLang !== 'bn' ? (
                <>
                  <h1
                    className="font-display mt-1.5 text-3xl font-semibold leading-[1.1] text-white sm:text-4xl lg:text-5xl"
                    style={{ textWrap: 'balance' }}
                  >
                    {heroText.titleEn || heroText.titleBn || 'Freshly Baked, Made With Love'}
                  </h1>
                  {effectiveHeroLang === 'both' &&
                    heroText.titleBn &&
                    heroText.titleBn !== heroText.titleEn && (
                      <p className="font-bn mt-1.5 text-sm font-normal text-[#FDE047] sm:text-base">
                        {heroText.titleBn}
                      </p>
                    )}
                </>
              ) : (
                <h1
                  className="font-bn mt-1.5 text-3xl font-semibold leading-[1.15] text-white sm:text-4xl lg:text-5xl"
                  style={{ textWrap: 'balance' }}
                >
                  {heroText.titleBn || heroText.titleEn}
                </h1>
              )}

              <p className="mt-2 line-clamp-2 max-w-lg text-xs leading-relaxed text-[#E7E5E4] sm:text-sm">
                {effectiveHeroLang === 'bn'
                  ? heroText.subtitleBn || heroText.subtitleEn
                  : heroText.subtitleEn || heroText.subtitleBn}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2.5 sm:mt-5">
                <Link
                  to={activeSlide?.ctaLink || '/products'}
                  className="inline-flex min-h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#B91C1C] sm:text-sm"
                >
                  <span>{activeSlide?.ctaLabel || 'Explore Menu'}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/outlets"
                  className="inline-flex min-h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-white/40 bg-[#1C1917]/80 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white hover:text-[#1C1917] sm:text-sm"
                >
                  <span>Our Outlets</span>
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
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/25 bg-[#1C1917]/60 text-white hover:bg-white/20"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next slide"
                    onClick={() => setSlideIdx((prev) => (prev + 1) % slides.length)}
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/25 bg-[#1C1917]/60 text-white hover:bg-white/20"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Non-blocking Warning */}
      {productsError && products.length > 0 && (
        <div className="mx-auto max-w-7xl px-3 pt-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-900">
            <span>Live updates could not load. Showing cached showcase products.</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="shrink-0 cursor-pointer font-semibold text-[#B91C1C] hover:underline"
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* 2. Categories Section */}
      {categoriesSection && categories.length > 0 && (
        <section
          id="categories"
          className="mx-auto max-w-7xl scroll-mt-28 px-3 py-8 sm:scroll-mt-32 sm:px-6 sm:py-11 lg:px-8"
        >
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-semibold text-[#1C1917] sm:text-3xl">
                {categoriesText.title || 'Browse by Category'}
              </h2>
              {categoriesText.titleSecondaryBn ? (
                <p className="font-bn mt-0.5 text-xs text-[#57534E] sm:text-sm">
                  {categoriesText.titleSecondaryBn}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-[#78716C] sm:text-sm">
                  {categoriesText.subtitle || 'Explore our complete artisanal showcase'}
                </p>
              )}
            </div>
            <Link
              to={categoriesText.ctaLink || '/products'}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#B91C1C] hover:underline sm:text-sm"
            >
              <span>Full Menu</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="no-scrollbar -mx-3 mt-4 flex snap-x gap-2.5 overflow-x-auto px-3 pb-1.5 sm:mx-0 sm:grid sm:grid-cols-5 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-9">
            {categories.map((cat) => {
              const count = categoryCounts.get(cat.slug) ?? 0;
              const ct = getCategoryText(cat);
              const primaryName =
                languageMode === 'bn' ? ct.nameBn : ct.nameEn || ct.nameBn;
              const secondaryBn =
                languageMode === 'both' && ct.nameBn && ct.nameBn !== primaryName
                  ? ct.nameBn
                  : '';
              return (
                <Link
                  key={cat.id}
                  to={`/category/${cat.slug}`}
                  className="group flex w-[90px] shrink-0 snap-start flex-col items-center rounded-xl border border-[#E7E5E4] bg-white p-2 text-center transition-colors duration-200 hover:border-[#1C1917]/30 sm:w-auto sm:p-2.5"
                >
                  <CategoryThumb
                    src={resolveAssetUrl(cat.image)}
                    alt={primaryName}
                  />
                  <span className="mt-1.5 line-clamp-1 w-full text-[11px] font-semibold text-[#1C1917] sm:mt-2 sm:text-xs">
                    {primaryName}
                  </span>
                  {secondaryBn && (
                    <span className="font-bn line-clamp-1 w-full text-[10px] text-[#78716C]">
                      {secondaryBn}
                    </span>
                  )}
                  <span className="tabular-nums mt-0.5 text-[10px] text-[#78716C]">
                    {count} items
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Popular Products */}
      {popularSection && (
        <section className="border-t border-[#E7E5E4] bg-white py-9 sm:py-12">
          <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#B91C1C]">
                  {popularText.subtitle || 'Customer Favorites'}
                </p>
                <h2 className="font-display mt-0.5 text-2xl font-semibold text-[#1C1917] sm:text-3xl">
                  {popularText.title || 'Most Popular Items'}
                </h2>
                {popularText.titleSecondaryBn && (
                  <p className="font-bn mt-0.5 text-xs text-[#57534E] sm:text-sm">
                    {popularText.titleSecondaryBn}
                  </p>
                )}
              </div>
              <Link
                to={popularText.ctaLink || '/products'}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#B91C1C] hover:underline sm:text-sm"
              >
                <span>{popularText.ctaText || 'Explore More'}</span>
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
              renderProductStateFallback('No products found.', 'কোনো পণ্য পাওয়া যায়নি')
            )}
          </div>
        </section>
      )}

      {/* 4. Featured / Signature Products */}
      {featuredSection && featuredProducts.length > 0 && (
        <section className="border-t border-[#E7E5E4] bg-[#FAFAF8] py-9 sm:py-12">
          <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#B91C1C]">
                  {featuredText.subtitle || 'Signature Showcase'}
                </p>
                <h2 className="font-display mt-0.5 text-2xl font-semibold text-[#1C1917] sm:text-3xl">
                  {featuredText.title || 'Featured & Signature Products'}
                </h2>
                {featuredText.titleSecondaryBn && (
                  <p className="font-bn mt-0.5 text-xs text-[#57534E] sm:text-sm">
                    {featuredText.titleSecondaryBn}
                  </p>
                )}
              </div>
              <Link
                to={featuredText.ctaLink || '/products'}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#B91C1C] hover:underline sm:text-sm"
              >
                <span>{featuredText.ctaText || 'View All Products'}</span>
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

      {/* 5. Occasion Explorer */}
      {occasionSection && occasions.length > 0 && (
        <section
          id="occasions"
          className="scroll-mt-28 border-t border-[#E7E5E4] bg-white py-9 sm:scroll-mt-32 sm:py-12"
        >
          <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#B91C1C]">
                  Discover by Occasion
                </p>
                <h2
                  className="font-display mt-0.5 text-2xl font-semibold text-[#1C1917] sm:text-3xl"
                  style={{ textWrap: 'balance' }}
                >
                  {occasionText.title || 'What Are You Celebrating Today?'}
                </h2>
                {occasionText.titleSecondaryBn && (
                  <p className="font-bn mt-0.5 text-xs text-[#57534E] sm:text-sm">
                    {occasionText.titleSecondaryBn}
                  </p>
                )}
              </div>
              {activeOccasionObj && (
                <Link
                  to={`/occasion/${activeOccasionObj.slug}`}
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#B91C1C] hover:underline sm:text-sm"
                >
                  <span>View all in {activeOccText?.nameEn || activeOccText?.nameBn}</span>
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
                    className={`inline-flex min-h-[38px] shrink-0 cursor-pointer items-center whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
                      active
                        ? 'border-[#1C1917] bg-[#1C1917] text-white'
                        : 'border-[#E7E5E4] bg-[#FAFAF8] text-[#44403C] hover:border-[#B91C1C] hover:text-[#1C1917]'
                    }`}
                  >
                    <span>{languageMode === 'bn' ? ot.nameBn : ot.nameEn || ot.nameBn}</span>
                  </button>
                );
              })}
            </div>

            {activeOccasionObj && activeOccText && (
              <div className="mt-3 space-y-0.5">
                <p className="text-xs text-[#57534E] sm:text-sm">
                  <span className="font-semibold text-[#1C1917]">
                    {activeOccText.nameEn || activeOccText.nameBn}:
                  </span>{' '}
                  {activeOccText.descriptionEn || activeOccText.descriptionBn}
                </p>
                {languageMode === 'both' && activeOccText.descriptionBn && (
                  <p className="font-bn text-xs text-[#78716C]">
                    {activeOccText.descriptionBn}
                  </p>
                )}
              </div>
            )}

            {occasionProducts.length > 0 ? (
              <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:gap-5">
                {occasionProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <p className="mt-4 text-xs text-[#78716C]">No matching products found for this occasion.</p>
            )}
          </div>
        </section>
      )}

      {/* Optional CMS Promotional Banner */}
      {promoSection && promoText.title && (
        <section className="border-t border-[#E7E5E4] bg-[#1C1917] py-10 text-white">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
            <div>
              <h2 className="font-display text-2xl font-semibold text-[#FACC15] sm:text-3xl">
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
                to={promoText.ctaLink || '/outlets'}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#B91C1C]"
              >
                <span>{promoText.ctaText}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </section>
      )}

      {/* 6. Brand Craftsmanship & Showroom Promise */}
      <section className="border-t border-[#E7E5E4] bg-[#FAFAF8] py-9 sm:py-12">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 divide-y divide-[#E7E5E4] rounded-xl border border-[#E7E5E4] bg-white md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="flex items-start gap-3.5 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FAFAF8] text-[#DC1F26]">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#1C1917]">Pure &amp; Selected Ingredients</h3>
                <p className="font-bn text-[11px] text-[#78716C]">খাঁটি ও প্রিমিয়াম উপাদান</p>
                <p className="mt-1 text-xs leading-relaxed text-[#57534E]">
                  Crafted with dairy butter, Belgian chocolate, and fresh pure milk chhana.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FAFAF8] text-[#DC1F26]">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#1C1917]">Baked Fresh Every Morning</h3>
                <p className="font-bn text-[11px] text-[#78716C]">প্রতিদিন সকালে তাজা প্রস্তুতি</p>
                <p className="mt-1 text-xs leading-relaxed text-[#57534E]">
                  Freshly prepared cakes, pastries, artisanal loaves, and traditional sweets from our kitchens.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FAFAF8] text-[#DC1F26]">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#1C1917]">In-Showroom Consultation</h3>
                <p className="font-bn text-[11px] text-[#78716C]">সরাসরি শোরুমে পরামর্শ ও সংগ্রহ</p>
                <p className="mt-1 text-xs leading-relaxed text-[#57534E]">
                  Visit or call any Chattogram outlet for custom wedding cakes, Akd boxes, and celebrations.
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
            <div className="mb-4 flex items-center justify-end">
              <Link
                to="/outlets"
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#B91C1C] hover:underline sm:text-sm"
              >
                <span>View All {showrooms.length} Outlets</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <OutletsShowcase variant="section" showHeader />
          </div>
        </section>
      )}

      {supportSection && (
        <section className="border-t border-[#E7E5E4] bg-[#FAFAF8] py-9 sm:py-12">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-3 sm:px-6 lg:grid-cols-2 lg:gap-6 lg:px-8">
            <div className="flex flex-col justify-between rounded-xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#B91C1C]">
                  <Lock className="h-4 w-4" />
                  <span>100% Confidential · Direct Management</span>
                </div>
                <h3 className="font-display mt-2 text-2xl font-semibold text-[#1C1917]">
                  Feedback &amp; Complaint Box
                </h3>
                <p className="font-bn mt-0.5 text-xs text-[#78716C]">অভিযোগ ও মতামত বক্স</p>
                <p className="mt-2 text-xs leading-relaxed text-[#57534E] sm:text-sm">
                  Share private feedback on product quality, showroom service, or pricing directly with management.
                </p>
              </div>
              <div className="mt-5">
                <Link
                  to="/complaint"
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#1C1917] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#B91C1C] sm:text-sm"
                >
                  <span>Submit Feedback</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-[#292524] bg-[#1C1917] p-5 text-white sm:p-7">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#FACC15]">
                  <MessageCircle className="h-4 w-4" />
                  <span>Live Concierge &amp; Representative Support</span>
                </div>
                <h3 className="font-display mt-2 text-2xl font-semibold text-white">
                  {supportText.title || 'Questions About Cakes, Sweets or Outlets?'}
                </h3>
                {supportText.titleSecondaryBn && (
                  <p className="font-bn mt-0.5 text-xs text-[#A8A29E]">
                    {supportText.titleSecondaryBn}
                  </p>
                )}
                <p className="mt-2 text-xs leading-relaxed text-[#D6D3D1] sm:text-sm">
                  {supportText.subtitle ||
                    'Chat with our concierge or call our support line for cake flavors, gift boxes, and outlet hours.'}
                </p>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onOpenChat('ai')}
                  className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-lg bg-[#DC1F26] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#B91C1C] sm:text-sm"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>Live Support Chat</span>
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
