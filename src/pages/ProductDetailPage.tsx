import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Info,
  MapPin,
  Phone,
  Scale,
  Sparkles,
  Store,
} from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { useStore } from '../context/StoreContext';
import { resolveAssetUrl } from '../lib/assets';
import {
  getOccasionText,
  getProductText,
  getShowroomText,
} from '../lib/bilingual';
import { formatBdtPrice } from '../lib/utils';

export function ProductDetailPage() {
  const { slug } = useParams();
  const { products, categories, showrooms, occasions, languageMode, loading } =
    useStore();

  const product = products.find((p) => p.slug === slug);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [showContactSheet, setShowContactSheet] = useState(false);

  useEffect(() => {
    setActiveImageIdx(0);
    setShowContactSheet(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [slug]);

  const text = product ? getProductText(product, categories) : null;

  useEffect(() => {
    if (text && product) {
      document.title =
        product.seoTitle || `${text.nameEn} (${text.nameBn}) – Home Recipe Foods`;
    }
  }, [text, product]);

  if (loading && !product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="h-[480px] animate-pulse rounded-2xl bg-[#F5F4F0]" />
      </div>
    );
  }

  if (!product || !text) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-[#1C1917]">
          পণ্যটি খুঁজে পাওয়া যায়নি
        </h1>
        <p className="mt-2 text-sm text-[#57534E]">
          অনুগ্রহ করে আমাদের সম্পূর্ণ প্রোডাক্ট শো-কেস থেকে আপনার পছন্দের খাবারটি খুঁজে দেখুন।
        </p>
        <Link
          to="/products"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#1C1917] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#DC1F26]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>সব পণ্যে ফিরে যান</span>
        </Link>
      </div>
    );
  }

  const gallery =
    product.images && product.images.length > 0
      ? product.images
      : ['/src/assets/images/hero_bakery_clean_1794746110066.jpg'];
  const currentImg = resolveAssetUrl(gallery[activeImageIdx] ?? gallery[0]);

  const productShowrooms = showrooms.filter((s) =>
    product.showrooms.includes(s.id)
  );
  const productOccasions = occasions.filter((o) =>
    product.occasions.includes(o.slug)
  );
  const relatedProducts = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${text.nameEn} (${text.nameBn})`,
    description: text.descriptionEn || text.descriptionBn,
    category: text.categoryNameEn || text.categoryNameBn,
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

  const showBn = languageMode !== 'en';
  const showEn = languageMode !== 'bn';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Breadcrumb */}
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-xs text-[#78716C]">
        <Link to="/" className="hover:text-[#1C1917]">
          Home
        </Link>
        <span>/</span>
        <Link to={`/category/${product.category}`} className="hover:text-[#1C1917]">
          {text.categoryNameBn}
          {text.categoryNameEn ? ` · ${text.categoryNameEn}` : ''}
        </Link>
        <span>/</span>
        <span className="font-medium text-[#1C1917]">{text.nameBn}</span>
      </nav>

      {/* Main Product Showcase Split */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
        {/* Left: Large Image + Gallery */}
        <div className="lg:col-span-6">
          <div className="overflow-hidden rounded-2xl border border-[#E7E5E4] bg-white">
            <div className="aspect-[4/3] w-full bg-[#F5F4F0]">
              <img
                src={currentImg}
                alt={`${text.nameBn} - ${text.nameEn}`}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          {gallery.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-3">
              {gallery.map((img, idx) => (
                <button
                  key={`${img}-${idx}`}
                  type="button"
                  onClick={() => setActiveImageIdx(idx)}
                  className={`aspect-[4/3] cursor-pointer overflow-hidden rounded-xl border transition-all ${
                    idx === activeImageIdx
                      ? 'border-[#DC1F26] ring-2 ring-[#DC1F26]/20'
                      : 'border-[#E7E5E4] opacity-75 hover:opacity-100'
                  }`}
                >
                  <img
                    src={resolveAssetUrl(img)}
                    alt={`${text.nameEn} view ${idx + 1}`}
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
              className="text-[#DC1F26] hover:underline"
            >
              {text.categoryNameBn}
              {text.categoryNameEn ? ` (${text.categoryNameEn})` : ''}
            </Link>
            <span aria-hidden="true">·</span>
            <span>{product.productType}</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                product.availability === 'Out of Stock'
                  ? 'text-red-700'
                  : 'font-semibold text-[#14532D]'
              }
            >
              {product.availability}
            </span>
          </div>

          {showBn && (
            <h1 className="font-display mt-2 text-3xl font-bold leading-tight text-[#1C1917] sm:text-4xl">
              {text.nameBn}
            </h1>
          )}
          {showEn && (
            <p
              className={
                showBn
                  ? 'mt-1 text-base font-medium text-[#78716C]'
                  : 'font-display mt-2 text-3xl font-bold leading-tight text-[#1C1917] sm:text-4xl'
              }
            >
              {text.nameEn}
            </p>
          )}

          {/* Price Block */}
          <div className="mt-5 flex flex-wrap items-baseline gap-3 border-y border-[#E7E5E4] py-4">
            <span className="font-mono tabular-nums text-3xl font-bold text-[#1C1917]">
              {product.price_label || formatBdtPrice(product.price)}
            </span>
            {typeof product.old_price === 'number' && product.old_price > product.price && (
              <span className="font-mono tabular-nums text-lg text-[#78716C] line-through">
                {formatBdtPrice(product.old_price)}
              </span>
            )}
            {product.discount && (
              <span className="rounded bg-red-50 px-2.5 py-0.5 text-xs font-bold text-[#DC1F26]">
                {product.discount}
              </span>
            )}
            <span className="text-sm text-[#57534E]">{product.priceUnit}</span>
          </div>

          {/* Bilingual Short & Full Description */}
          <div className="mt-5 space-y-3">
            {showBn && (
              <>
                <p className="text-sm font-medium leading-relaxed text-[#1C1917] sm:text-base">
                  {text.shortDescriptionBn}
                </p>
                <p className="text-sm leading-relaxed text-[#57534E]">
                  {text.descriptionBn}
                </p>
              </>
            )}
            {showEn &&
              (text.shortDescriptionEn || text.descriptionEn) && (
                <div className={showBn ? 'border-t border-[#F5F4F0] pt-3' : ''}>
                  {text.shortDescriptionEn &&
                    text.shortDescriptionEn !== text.shortDescriptionBn && (
                      <p className="text-xs font-medium leading-relaxed text-[#44403C] sm:text-sm">
                        {text.shortDescriptionEn}
                      </p>
                    )}
                  {text.descriptionEn &&
                    text.descriptionEn !== text.descriptionBn && (
                      <p className="mt-1.5 text-xs leading-relaxed text-[#78716C] sm:text-sm">
                        {text.descriptionEn}
                      </p>
                    )}
                </div>
              )}
          </div>

          {/* Specs Grid */}
          <div className="mt-6 space-y-4 border-t border-[#E7E5E4] pt-5">
            {product.weight && (
              <div className="flex items-start gap-3 text-sm">
                <Scale className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
                <div>
                  <span className="font-semibold text-[#1C1917]">ওজন / পরিমাণ: </span>
                  <span className="text-[#57534E]">{product.weight}</span>
                </div>
              </div>
            )}

            {product.sizes.length > 0 && (
              <div className="text-sm">
                <p className="font-semibold text-[#1C1917]">উপলব্ধ সাইজ / ভ্যারিয়েন্ট:</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {product.sizes.map((sz) => (
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

            {product.ingredients.length > 0 && (
              <div className="text-sm">
                <p className="font-semibold text-[#1C1917]">প্রধান উপাদানসমূহ:</p>
                <ul className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {product.ingredients.map((ing) => (
                    <li key={ing} className="flex items-center gap-2 text-xs text-[#57534E] sm:text-sm">
                      <Check className="h-3.5 w-3.5 shrink-0 text-[#DC1F26]" />
                      <span>{ing}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {productOccasions.length > 0 && (
              <div className="text-sm">
                <p className="inline-flex items-center gap-1.5 font-semibold text-[#1C1917]">
                  <Sparkles className="h-4 w-4 text-[#DC1F26]" />
                  <span>কোন উপলক্ষের জন্য উপযোগী:</span>
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {productOccasions.map((occ) => {
                    const ot = getOccasionText(occ);
                    return (
                      <Link
                        key={occ.id}
                        to={`/occasion/${occ.slug}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E4] bg-[#FAFAF8] px-3 py-1.5 text-xs font-medium text-[#1C1917] transition-colors hover:border-[#DC1F26]"
                      >
                        <span>{occ.icon}</span>
                        <span>{ot.nameBn}</span>
                        {ot.nameEn && (
                          <span className="text-[11px] text-[#78716C]">· {ot.nameEn}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {product.importantNotes && (
              <div className="flex items-start gap-2.5 rounded-xl border border-[#E7E5E4] bg-[#F5F4F0] p-4 text-xs leading-relaxed text-[#44403C]">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
                <div>
                  <span className="font-semibold text-[#1C1917]">গুরুত্বপূর্ণ তথ্য: </span>
                  {product.importantNotes}
                </div>
              </div>
            )}
          </div>

          {/* Primary Business Rule Actions — NO Cart / NO Buy Now */}
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowContactSheet((v) => !v)}
              className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#1C1917] px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#DC1F26]"
            >
              <Phone className="h-4 w-4" />
              <span>শোরুমে যোগাযোগ করুন</span>
            </button>
            <Link
              to="/showrooms"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#D6D3D1] bg-white px-6 py-3.5 text-sm font-semibold text-[#1C1917] transition-colors hover:border-[#1C1917]"
            >
              <Store className="h-4 w-4" />
              <span>শোরুমের তথ্য দেখুন</span>
            </Link>
          </div>

          {/* Available Showrooms Direct Contact Drawer */}
          {(showContactSheet || productShowrooms.length > 0) && (
            <div className="mt-6 rounded-xl border border-[#E7E5E4] bg-white p-5">
              <p className="text-xs font-semibold text-[#DC1F26]">
                যে সকল শোরুমে পাওয়া যাচ্ছে · Available Showrooms
              </p>
              <div className="mt-3 space-y-3">
                {(productShowrooms.length > 0 ? productShowrooms : showrooms).map(
                  (sr) => {
                    const st = getShowroomText(sr);
                    return (
                      <div
                        key={sr.id}
                        className="flex flex-col justify-between gap-2 border-b border-[#F5F4F0] pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[#1C1917]">
                            {st.nameBn}
                            {st.nameEn && st.nameEn !== st.nameBn && (
                              <span className="ml-1.5 text-xs font-normal text-[#78716C]">
                                · {st.nameEn}
                              </span>
                            )}
                          </p>
                          <p className="flex items-center gap-1 text-xs text-[#57534E]">
                            <MapPin className="h-3 w-3 text-[#DC1F26]" />
                            <span>{st.areaBn} · {st.openingHoursBn}</span>
                          </p>
                        </div>
                        <a
                          href={`tel:${sr.phone.replace(/\s+/g, '')}`}
                          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#F5F4F0] px-3 py-1.5 font-mono tabular-nums text-xs font-semibold text-[#1C1917] transition-colors hover:bg-[#DC1F26] hover:text-white"
                        >
                          <Phone className="h-3 w-3" />
                          <span>{sr.phone}</span>
                        </a>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <section className="mt-16 border-t border-[#E7E5E4] pt-12">
          <h2 className="font-display text-2xl font-bold text-[#1C1917] sm:text-3xl">
            একই ক্যাটাগরির আরও পণ্য · Related Products
          </h2>
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
