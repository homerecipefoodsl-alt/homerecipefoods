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
  const mainImage = resolveAssetUrl(product.images?.[0]);
  const text = getProductText(product, categories);

  const showBn = languageMode !== 'en';
  const showEn = languageMode !== 'bn';

  return (
    <Link
      to={`/product/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-[#E7E5E4] bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D6D3D1] hover:shadow-md"
    >
      {/* 4:3 Image Frame */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F5F4F0]">
        {!imgError ? (
          <img
            src={mainImage}
            alt={`${text.nameBn} - ${text.nameEn}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#F5F4F0] to-[#E7E5E4] p-4 text-center">
            <UtensilsCrossed className="h-7 w-7 text-[#B91C1C]/60" />
            <span className="text-xs font-medium text-[#57534E]">{text.nameBn}</span>
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="flex flex-1 flex-col p-3.5 sm:p-5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#78716C] sm:text-xs">
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
              ? 'শোরুমে আছে'
              : product.availability === 'Pre-Order at Showroom'
              ? 'প্রি-বুকিং'
              : product.availability === 'Seasonal'
              ? 'সিজনাল'
              : 'স্টক শেষ'}
          </span>
        </div>

        {showBn && (
          <h3 className="font-display mt-1.5 line-clamp-1 text-lg font-bold leading-snug text-[#1C1917] sm:text-xl">
            {text.nameBn}
          </h3>
        )}
        {showEn && (
          <p
            className={`line-clamp-1 font-medium text-[#78716C] ${
              showBn
                ? 'mt-0.5 text-xs'
                : 'font-display mt-1.5 text-lg font-bold text-[#1C1917] sm:text-xl'
            }`}
          >
            {text.nameEn}
          </p>
        )}

        <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-[#57534E] sm:text-sm">
          {showBn
            ? text.shortDescriptionBn || text.shortDescriptionEn
            : text.shortDescriptionEn || text.shortDescriptionBn}
        </p>

        <div className="mt-4 flex items-baseline justify-between gap-2 border-t border-[#F5F4F0] pt-3">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="font-mono tabular-nums text-sm font-semibold text-[#1C1917] sm:text-base">
              {product.price_label || formatBdtPrice(product.price)}
            </span>
            {typeof product.old_price === 'number' && product.old_price > product.price && (
              <span className="font-mono tabular-nums text-xs text-[#78716C] line-through">
                {formatBdtPrice(product.old_price)}
              </span>
            )}
            {product.discount && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-[#DC1F26]">
                {product.discount}
              </span>
            )}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#B91C1C] transition-transform duration-200 group-hover:translate-x-0.5">
            <span>বিস্তারিত দেখুন</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
