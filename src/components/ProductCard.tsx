import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, UtensilsCrossed } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { resolveAssetUrl } from '../lib/assets';
import { getProductText, resolveBilingualPair } from '../lib/bilingual';
import { formatBdtPrice } from '../lib/utils';
import type { Product } from '../types';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { categories, languageMode } = useStore();
  const [imgError, setImgError] = useState(false);
  const rawImage = product.imageUrl || product.image || product.images?.[0] || '';
  const hasRealImage = Boolean(rawImage);
  const mainImage = hasRealImage ? resolveAssetUrl(rawImage) : '';
  const text = getProductText(product, categories);
  const safePrice = Number.isFinite(Number(product.price)) ? Number(product.price) : 0;

  const titlePair = resolveBilingualPair(text.nameEn, text.nameBn);
  const catPair = resolveBilingualPair(text.categoryNameEn, text.categoryNameBn);
  const descPair = resolveBilingualPair(text.shortDescriptionEn, text.shortDescriptionBn);

  const showPrimaryEn = languageMode !== 'bn';
  const showSecondaryBn = languageMode !== 'en' && Boolean(titlePair.secondaryBn);

  const availabilityLabel =
    product.availability === 'In Showroom'
      ? 'In Showroom'
      : product.availability === 'Pre-Order at Showroom'
      ? 'Pre-Order'
      : product.availability === 'Seasonal'
      ? 'Seasonal'
      : 'Unavailable';

  return (
    <Link
      to={`/product/${product.slug || product.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-[#E7E5E4] bg-white transition-colors duration-200 hover:border-[#1C1917]/30"
    >
      {/* Clean 4:3 Product Photography Frame — Zero Overlay Badges */}
      <div className="aspect-[4/3] w-full overflow-hidden bg-[#F5F4F0]">
        {hasRealImage && !imgError ? (
          <img
            src={mainImage}
            alt={titlePair.primary}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#F5F4F0] p-4 text-center">
            <UtensilsCrossed className="h-5 w-5 text-[#A8A29E]" aria-hidden="true" />
            <span className="line-clamp-1 text-xs font-medium text-[#57534E]">
              {titlePair.primary}
            </span>
            <span className="text-[11px] text-[#78716C]">Photo coming soon</span>
          </div>
        )}
      </div>

      {/* Editorial Card Body — Strict English Primary -> Bengali Secondary */}
      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-[#78716C]">
          <span className="truncate">{catPair.primary}</span>
          <span
            className={`shrink-0 ${
              product.availability === 'Out of Stock' ? 'text-[#B91C1C]' : 'text-[#166534]'
            }`}
          >
            {availabilityLabel}
          </span>
        </div>

        {showPrimaryEn ? (
          <>
            <h3 className="mt-1.5 line-clamp-1 text-[15px] font-semibold leading-snug tracking-tight text-[#1C1917] sm:text-base">
              {titlePair.primary}
            </h3>
            {showSecondaryBn && (
              <p className="font-bn mt-0.5 line-clamp-1 text-[11px] font-normal leading-snug text-[#57534E] sm:text-xs">
                {titlePair.secondaryBn}
              </p>
            )}
          </>
        ) : (
          <h3 className="font-bn mt-1.5 line-clamp-1 text-[15px] font-semibold leading-snug text-[#1C1917] sm:text-base">
            {text.nameBn || titlePair.primary}
          </h3>
        )}

        {descPair.primary && (
          <p className="mt-1.5 hidden line-clamp-1 text-xs text-[#57534E] sm:block">
            {languageMode === 'bn'
              ? descPair.secondaryBn || descPair.primary
              : descPair.primary}
          </p>
        )}

        <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-[#F5F4F0] pt-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-1">
            <span className="tabular-nums text-[15px] font-semibold text-[#1C1917] sm:text-base">
              {product.price_label || formatBdtPrice(safePrice)}
            </span>
            {text.unit && (
              <span className="text-[11px] font-normal text-[#78716C]">
                / {text.unit}
              </span>
            )}
            {typeof product.old_price === 'number' && product.old_price > safePrice && (
              <span className="tabular-nums text-[11px] text-[#78716C] line-through">
                {formatBdtPrice(product.old_price)}
              </span>
            )}
            {product.discount && (
              <span className="text-[11px] font-semibold text-[#DC1F26]">{product.discount}</span>
            )}
          </div>
          <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs font-semibold text-[#B91C1C] transition-transform duration-200 group-hover:translate-x-0.5">
            <span className="sm:hidden">View</span>
            <span className="hidden sm:inline">Details</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}
