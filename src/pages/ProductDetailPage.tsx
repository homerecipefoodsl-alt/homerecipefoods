import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Check,
  ExternalLink,
  Info,
  MapPin,
  Navigation,
  Phone,
  Scale,
  Store,
  UtensilsCrossed,
} from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { useStore } from '../context/StoreContext';
import { isDemoOrDummyShowroom } from '../data/outletsData';
import { resolveAssetUrl } from '../lib/assets';
import {
  getOccasionText,
  getProductText,
  getShowroomText,
  matchesProductCategory,
  resolveBilingualPair,
} from '../lib/bilingual';
import { formatBdtPrice } from '../lib/utils';

export function ProductDetailPage() {
  const { slug } = useParams();
  const { products, categories, showrooms, occasions, languageMode, productsLoading } =
    useStore();

  const product = products.find((p) => p.slug === slug || p.id === slug);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [showContactSheet, setShowContactSheet] = useState(false);

  useEffect(() => {
    setActiveImageIdx(0);
    setImgError(false);
    setShowContactSheet(false);
  }, [slug]);

  useEffect(() => {
    setImgError(false);
  }, [activeImageIdx]);

  const text = product ? getProductText(product, categories) : null;

  useEffect(() => {
    if (text && product) {
      const titlePair = resolveBilingualPair(text.nameEn, text.nameBn);
      document.title = product.seoTitle || `${titlePair.primary} – Home Recipe Foods`;
    }
  }, [text, product]);

  if (productsLoading && !product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex min-h-[380px] flex-col items-center justify-center rounded-xl border border-[#E7E5E4] bg-[#F5F4F0]/60 text-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#E7E5E4] border-t-[#DC1F26]" />
          <p className="mt-3 text-sm font-medium text-[#1C1917]">Loading product details...</p>
        </div>
      </div>
    );
  }

  if (!product || !text) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-display text-3xl font-semibold text-[#1C1917]">
          Product Not Found
        </h1>
        <p className="font-bn mt-1 text-xs text-[#78716C]">পণ্যটি খুঁজে পাওয়া যায়নি</p>
        <p className="mt-2 text-sm text-[#57534E]">
          Please browse our complete menu showcase to explore available items.
        </p>
        <Link
          to="/products"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#1C1917] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#DC1F26]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to All Products</span>
        </Link>
      </div>
    );
  }

  const titlePair = resolveBilingualPair(text.nameEn, text.nameBn);
  const catPair = resolveBilingualPair(text.categoryNameEn, text.categoryNameBn);
  const shortDescPair = resolveBilingualPair(text.shortDescriptionEn, text.shortDescriptionBn);
  const fullDescPair = resolveBilingualPair(text.descriptionEn, text.descriptionBn);

  const gallery = Array.from(
    new Set(
      [
        product.imageUrl,
        product.image,
        ...(Array.isArray(product.images) ? product.images : []),
      ].filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    )
  );
  const hasRealImage = gallery.length > 0;
  const currentImg = hasRealImage
    ? resolveAssetUrl(gallery[activeImageIdx] ?? gallery[0])
    : '';

  const productShowroomIds = Array.isArray(product.showrooms) ? product.showrooms : [];
  const productOccasionSlugs = Array.isArray(product.occasions) ? product.occasions : [];
  const productSizes = Array.isArray(product.sizes) ? product.sizes : [];
  const productIngredients = Array.isArray(product.ingredients) ? product.ingredients : [];

  const approvedShowrooms = showrooms.filter((s) => !isDemoOrDummyShowroom(s));
  const productShowrooms = approvedShowrooms.filter((s) =>
    productShowroomIds.includes(s.id)
  );
  const productOccasions = occasions.filter((o) =>
    productOccasionSlugs.includes(o.slug)
  );
  const relatedProducts = products
    .filter(
      (p) =>
        p.id !== product.id &&
        matchesProductCategory(p, product.category, categories)
    )
    .slice(0, 4);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: titlePair.primary,
    description: fullDescPair.primary || shortDescPair.primary,
    category: catPair.primary,
    brand: { '@type': 'Brand', name: 'Home Recipe Foods' },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'BDT',
      price: product.price,
      availability:
        product.availability === 'Out of Stock'
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStoreOnly',
    },
  };

  const showEnPrimary = languageMode !== 'bn';
  const showBnSecondary = languageMode !== 'en';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-xs text-[#78716C]">
        <Link to="/" className="hover:text-[#1C1917]">
          Home
        </Link>
        <span>/</span>
        <Link to={`/category/${product.category}`} className="hover:text-[#1C1917]">
          {catPair.primary}
        </Link>
        <span>/</span>
        <span className="font-medium text-[#1C1917]">{titlePair.primary}</span>
      </nav>

      {/* Main Product Showcase Split */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
        {/* Left: Large Image + Gallery */}
        <div className="lg:col-span-6">
          <div className="overflow-hidden rounded-xl border border-[#E7E5E4] bg-white">
            <div className="aspect-[4/3] w-full bg-[#F5F4F0]">
              {hasRealImage && !imgError ? (
                <img
                  src={currentImg}
                  alt={titlePair.primary}
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#F5F4F0] p-6 text-center">
                  <UtensilsCrossed className="h-9 w-9 text-[#A8A29E]" aria-hidden="true" />
                  <p className="font-display text-lg font-semibold text-[#1C1917]">
                    {titlePair.primary}
                  </p>
                  <p className="text-xs text-[#78716C]">
                    Product photography will be added soon.
                  </p>
                </div>
              )}
            </div>
          </div>

          {gallery.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-3">
              {gallery.map((img, idx) => (
                <button
                  key={`${img}-${idx}`}
                  type="button"
                  onClick={() => setActiveImageIdx(idx)}
                  className={`aspect-[4/3] cursor-pointer overflow-hidden rounded-lg border transition-colors ${
                    idx === activeImageIdx
                      ? 'border-[#DC1F26]'
                      : 'border-[#E7E5E4] opacity-75 hover:opacity-100'
                  }`}
                >
                  <img
                    src={resolveAssetUrl(img)}
                    alt={`${titlePair.primary} view ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Product Information & Showroom Contact Module */}
        <div className="lg:col-span-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#78716C]">
            <Link
              to={`/category/${product.category}`}
              className="text-[#B91C1C] hover:underline"
            >
              {catPair.primary}
            </Link>
            {product.productType && (
              <>
                <span aria-hidden="true">·</span>
                <span>{product.productType}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span
              className={
                product.availability === 'Out of Stock'
                  ? 'text-[#B91C1C]'
                  : 'font-semibold text-[#166534]'
              }
            >
              {product.availability}
            </span>
          </div>

          {showEnPrimary ? (
            <>
              <h1 className="font-display mt-2 text-3xl font-semibold leading-tight text-[#1C1917] sm:text-4xl">
                {titlePair.primary}
              </h1>
              {showBnSecondary && titlePair.secondaryBn && (
                <p className="font-bn mt-1 text-base font-normal text-[#57534E] sm:text-lg">
                  {titlePair.secondaryBn}
                </p>
              )}
            </>
          ) : (
            <h1 className="font-bn mt-2 text-3xl font-semibold leading-tight text-[#1C1917] sm:text-4xl">
              {text.nameBn || titlePair.primary}
            </h1>
          )}

          {/* Price Block */}
          <div className="mt-5 flex flex-wrap items-baseline gap-3 border-y border-[#E7E5E4] py-4">
            <span className="tabular-nums text-3xl font-semibold text-[#1C1917]">
              {product.price_label || formatBdtPrice(product.price)}
            </span>
            {typeof product.old_price === 'number' && product.old_price > product.price && (
              <span className="tabular-nums text-lg text-[#78716C] line-through">
                {formatBdtPrice(product.old_price)}
              </span>
            )}
            {product.discount && (
              <span className="text-xs font-semibold text-[#DC1F26]">{product.discount}</span>
            )}
            {(text.unit || product.priceUnit) && (
              <span className="text-sm text-[#57534E]">
                / {text.unit || product.priceUnit}
              </span>
            )}
          </div>

          {/* English-First Short & Full Description */}
          <div className="mt-5 space-y-3">
            {showEnPrimary && (shortDescPair.primary || fullDescPair.primary) && (
              <div className="space-y-1.5">
                {shortDescPair.primary && (
                  <p className="text-sm font-medium leading-relaxed text-[#1C1917] sm:text-base">
                    {shortDescPair.primary}
                  </p>
                )}
                {fullDescPair.primary && fullDescPair.primary !== shortDescPair.primary && (
                  <p className="text-sm leading-relaxed text-[#44403C]">
                    {fullDescPair.primary}
                  </p>
                )}
              </div>
            )}

            {showBnSecondary && (shortDescPair.secondaryBn || fullDescPair.secondaryBn) && (
              <div
                className={
                  showEnPrimary ? 'border-t border-[#F5F4F0] pt-3 space-y-1' : 'space-y-1.5'
                }
              >
                {shortDescPair.secondaryBn && (
                  <p className="font-bn text-xs font-medium leading-relaxed text-[#57534E] sm:text-[13px]">
                    {shortDescPair.secondaryBn}
                  </p>
                )}
                {fullDescPair.secondaryBn &&
                  fullDescPair.secondaryBn !== shortDescPair.secondaryBn && (
                    <p className="font-bn text-xs leading-relaxed text-[#78716C] sm:text-[13px]">
                      {fullDescPair.secondaryBn}
                    </p>
                  )}
              </div>
            )}
          </div>

          {/* Specs Grid */}
          <div className="mt-6 space-y-4 border-t border-[#E7E5E4] pt-5">
            {product.weight && (
              <div className="flex items-start gap-3 text-sm">
                <Scale className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" aria-hidden="true" />
                <div>
                  <span className="font-semibold text-[#1C1917]">Weight / Portion: </span>
                  <span className="text-[#57534E]">{product.weight}</span>
                </div>
              </div>
            )}

            {productSizes.length > 0 && (
              <div className="text-sm">
                <p className="font-semibold text-[#1C1917]">Available Sizes / Variants</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {productSizes.map((sz) => (
                    <span
                      key={sz}
                      className="rounded-lg border border-[#E7E5E4] bg-white px-3 py-1.5 text-xs font-medium text-[#44403C]"
                    >
                      {sz}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {productIngredients.length > 0 && (
              <div className="text-sm">
                <p className="font-semibold text-[#1C1917]">Key Ingredients</p>
                <ul className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {productIngredients.map((ing) => (
                    <li key={ing} className="flex items-center gap-2 text-xs text-[#57534E] sm:text-sm">
                      <Check className="h-3.5 w-3.5 shrink-0 text-[#DC1F26]" aria-hidden="true" />
                      <span>{ing}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {productOccasions.length > 0 && (
              <div className="text-sm">
                <p className="inline-flex items-center gap-1.5 font-semibold text-[#1C1917]">
                  <Calendar className="h-4 w-4 text-[#DC1F26]" aria-hidden="true" />
                  <span>Ideal Occasions</span>
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {productOccasions.map((occ) => {
                    const ot = getOccasionText(occ);
                    const occPair = resolveBilingualPair(ot.nameEn, ot.nameBn);
                    return (
                      <Link
                        key={occ.id}
                        to={`/occasion/${occ.slug}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF8] px-3 py-1.5 text-xs font-medium text-[#1C1917] transition-colors hover:border-[#DC1F26]"
                      >
                        <span>{occPair.primary}</span>
                        {occPair.secondaryBn && (
                          <span className="font-bn text-[11px] text-[#78716C]">
                            · {occPair.secondaryBn}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {product.importantNotes && (
              <div className="flex items-start gap-2.5 rounded-xl border border-[#E7E5E4] bg-[#F5F4F0] p-4 text-xs leading-relaxed text-[#44403C]">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" aria-hidden="true" />
                <div>
                  <span className="font-semibold text-[#1C1917]">Important Note: </span>
                  {product.importantNotes}
                </div>
              </div>
            )}
          </div>

          {/* Primary Business Rule Actions — Showroom Consultation Only */}
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowContactSheet((v) => !v)}
              className="inline-flex min-h-[46px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#1C1917] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#DC1F26]"
            >
              <Phone className="h-4 w-4" />
              <span>Contact a Showroom</span>
            </button>
            <Link
              to="/outlets"
              className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-lg border border-[#D6D3D1] bg-white px-6 py-3 text-sm font-semibold text-[#1C1917] transition-colors hover:border-[#1C1917]"
            >
              <Store className="h-4 w-4" />
              <span>View All Outlets</span>
            </Link>
          </div>

          {/* Available Showrooms Direct Contact Drawer */}
          {(showContactSheet || productShowrooms.length > 0) && (
            <div className="mt-6 rounded-xl border border-[#E7E5E4] bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#B91C1C]">
                Available Showrooms
              </p>
              <div className="mt-3 space-y-3">
                {(productShowrooms.length > 0 ? productShowrooms : approvedShowrooms).length ===
                0 ? (
                  <p className="text-xs text-[#57534E]">
                    No showroom contacts are currently listed.
                  </p>
                ) : (
                  (productShowrooms.length > 0 ? productShowrooms : approvedShowrooms).map(
                    (sr) => {
                      const st = getShowroomText(sr);
                      const srName = resolveBilingualPair(st.nameEn, st.nameBn);
                      const srAddr = resolveBilingualPair(st.addressEn || st.areaEn, st.addressBn || st.areaBn);
                      const srHours = resolveBilingualPair(st.openingHoursEn, st.openingHoursBn);
                      return (
                        <div
                          key={sr.id}
                          className="flex flex-col justify-between gap-2 border-b border-[#F5F4F0] pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center"
                        >
                          <div>
                            <p className="text-sm font-semibold text-[#1C1917]">
                              {srName.primary}
                              {srName.secondaryBn && (
                                <span className="font-bn ml-1.5 text-xs font-normal text-[#78716C]">
                                  · {srName.secondaryBn}
                                </span>
                              )}
                              {sr.id === 'shah-garibullah-hs' && (
                                <span className="ml-2 text-[11px] font-semibold text-[#B91C1C]">
                                  Office &amp; Outlet
                                </span>
                              )}
                            </p>
                            <p className="flex items-center gap-1 text-xs text-[#57534E]">
                              <MapPin className="h-3 w-3 shrink-0 text-[#DC1F26]" aria-hidden="true" />
                              <span>
                                {srAddr.primary} · {srHours.primary}
                              </span>
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <a
                              href={`tel:${sr.phone.replace(/\s+/g, '')}`}
                              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#F5F4F0] px-3 py-1.5 font-mono tabular-nums text-xs font-semibold text-[#1C1917] transition-colors hover:bg-[#DC1F26] hover:text-white"
                            >
                              <Phone className="h-3 w-3" />
                              <span>{sr.phone}</span>
                            </a>
                            {sr.mapUrl && (
                              <a
                                href={sr.mapUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Get directions to ${srName.primary}`}
                                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[#D6D3D1] px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] transition-colors hover:border-[#1C1917]"
                              >
                                <Navigation className="h-3 w-3 text-[#DC1F26]" />
                                <ExternalLink className="h-2.5 w-2.5 text-[#78716C]" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    }
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <section className="mt-16 border-t border-[#E7E5E4] pt-12">
          <div>
            <h2 className="font-display text-2xl font-semibold text-[#1C1917] sm:text-3xl">
              Related Products
            </h2>
            <p className="font-bn mt-0.5 text-xs text-[#78716C] sm:text-sm">
              একই ক্যাটাগরির আরও পণ্য
            </p>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3.5 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {relatedProducts.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
