import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, UtensilsCrossed } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { resolveAssetUrl } from '../lib/assets';
import { getProductText } from '../lib/bilingual';
import { formatBdtPrice } from '../lib/utils';
import type { Product } from '../types';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { categories, languageMode } = useStore();
  const [imgError, setImgError] = useState(false);
  const rawImage = product.images?.[0] || product.image || product.imageUrl || '';
  const hasRealImage = Boolean(rawImage);
  const mainImage = hasRealImage ? resolveAssetUrl(rawImage) : '';
  const text = getProductText(product, categories);
  const safePrice = Number.isFinite(Number(product.price)) ? Number(product.price) : 0;

  const showBn = languageMode !== 'en';
  const showEn = languageMode !== 'bn';
  const highlightTag = product.featured ? 'বিশেষ' : product.popular ? 'জনপ্রিয়' : '';

  return (
    <Link
      to={`/product/${product.slug || product.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-[#E7E5E4] bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1C1917]/25 hover:shadow-sm"
    >
      {/* Consistent 4:3 Image Frame */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F5F4F0]">
        {hasRealImage && !imgError ? (
          <img
            src={mainImage}
            alt={`${text.nameBn} - ${text.nameEn}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#F5F4F0] p-3 text-center">
            <UtensilsCrossed className="h-5 w-5 text-[#A8A29E]" />
            <span className="line-clamp-1 text-[11px] font-semibold text-[#57534E]">
              {text.nameBn || text.nameEn}
            </span>
            <span className="text-[10px] text-[#78716C]">ছবি শীঘ্রই আসছে</span>
          </div>
        )}
        {highlightTag && (
          <span className="absolute left-2 top-2 rounded bg-[#1C1917]/85 px-2 py-0.5 text-[10px] font-semibold text-[#FACC15]">
            {highlightTag}
          </span>
        )}
      </div>

      {/* Compact Card Body */}
      <div className="flex flex-1 flex-col p-2.5 sm:p-4">
        <div className="flex items-center gap-1 text-[10px] font-medium text-[#78716C] sm:text-xs">
          <span className="truncate">
            {showBn ? text.categoryNameBn : text.categoryNameEn || text.categoryNameBn}
          </span>
          <span aria-hidden="true">·</span>
          <span
            className={`shrink-0 ${
              product.availability === 'Out of Stock' ? 'text-red-700' : 'text-[#14532D]'
            }`}
          >
            {product.availability === 'In Showroom'
              ? 'শোরুমে'
              : product.availability === 'Pre-Order at Showroom'
              ? 'প্রি-বুকিং'
              : product.availability === 'Seasonal'
              ? 'সিজনাল'
              : 'স্টক শেষ'}
          </span>
        </div>

        {showBn && (
          <h3 className="font-display mt-1 line-clamp-1 text-base font-bold leading-snug text-[#1C1917] sm:text-lg">
            {text.nameBn || text.nameEn}
          </h3>
        )}
        {showEn && (
          <p
            className={`line-clamp-1 font-medium text-[#78716C] ${
              showBn
                ? 'text-[11px]'
                : 'font-display mt-1 text-base font-bold text-[#1C1917] sm:text-lg'
            }`}
          >
            {text.nameEn || text.nameBn}
          </p>
        )}

        <p className="mt-1 hidden line-clamp-1 text-xs text-[#57534E] sm:block">
          {showBn
            ? text.shortDescriptionBn || text.shortDescriptionEn
            : text.shortDescriptionEn || text.shortDescriptionBn}
        </p>

        <div className="mt-auto flex items-baseline justify-between gap-1.5 border-t border-[#F5F4F0] pt-2.5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-1">
            <span className="font-mono tabular-nums text-xs font-bold text-[#1C1917] sm:text-sm">
              {product.price_label || formatBdtPrice(safePrice)}
            </span>
            {text.unit && (
              <span className="text-[10px] font-medium text-[#78716C]">
                / {text.unit}
              </span>
            )}
            {typeof product.old_price === 'number' && product.old_price > safePrice && (
              <span className="font-mono tabular-nums text-[10px] text-[#78716C] line-through sm:text-xs">
                {formatBdtPrice(product.old_price)}
              </span>
            )}
            {product.discount && (
              <span className="text-[10px] font-bold text-[#DC1F26]">{product.discount}</span>
            )}
          </div>
          <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold text-[#B91C1C] transition-transform duration-200 group-hover:translate-x-0.5 sm:text-xs">
            <span className="sm:hidden">দেখুন</span>
            <span className="hidden sm:inline">বিস্তারিত</span>
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
