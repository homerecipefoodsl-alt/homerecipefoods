import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Filter, RotateCcw, Search, UtensilsCrossed, X } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { useStore } from '../context/StoreContext';
import {
  buildProductSearchHaystack,
  getCategoryText,
  getOccasionText,
  matchesProductCategory,
} from '../lib/bilingual';

type PriceBucket = 'all' | 'under-300' | '300-800' | '800-2000' | 'above-2000';

export function ProductsPage() {
  const { categories, occasions, products, productsLoading, productsError } = useStore();
  const { categorySlug, occasionSlug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [queryText, setQueryText] = useState(searchParams.get('q') ?? '');
  const [selectedCategory, setSelectedCategory] = useState(categorySlug ?? 'all');
  const [selectedOccasion, setSelectedOccasion] = useState(occasionSlug ?? 'all');
  const [selectedType, setSelectedType] = useState('all');
  const [priceBucket, setPriceBucket] = useState<PriceBucket>('all');

  useEffect(() => {
    if (categorySlug) {
      setSelectedCategory(categorySlug);
    } else if (!occasionSlug) {
      setSelectedCategory('all');
    }
  }, [categorySlug, occasionSlug]);

  useEffect(() => {
    if (occasionSlug) {
      setSelectedOccasion(occasionSlug);
    } else if (!categorySlug) {
      setSelectedOccasion('all');
    }
  }, [occasionSlug, categorySlug]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) {
      setQueryText(q);
    } else if (categorySlug) {
      setQueryText('');
    }
  }, [searchParams, categorySlug]);

  const activeCategoryObj = categories.find((c) => c.slug === selectedCategory);
  const activeOccasionObj = occasions.find((o) => o.slug === selectedOccasion);
  const activeCatText = activeCategoryObj ? getCategoryText(activeCategoryObj) : null;
  const activeOccText = activeOccasionObj ? getOccasionText(activeOccasionObj) : null;

  useEffect(() => {
    if (activeCatText) {
      document.title = `${activeCatText.nameBn} (${activeCatText.nameEn}) – Home Recipe Foods`;
    } else if (activeOccText) {
      document.title = `${activeOccText.nameBn} (${activeOccText.nameEn}) – Home Recipe Foods`;
    } else {
      document.title = 'All Products & Menu Showcase – Home Recipe Foods';
    }
  }, [activeCatText, activeOccText]);

  const productTypes = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.productType) set.add(p.productType);
    });
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return products.filter((p) => {
      if (
        selectedCategory !== 'all' &&
        !matchesProductCategory(p, selectedCategory, categories)
      ) {
        return false;
      }
      if (
        selectedOccasion !== 'all' &&
        (!Array.isArray(p.occasions) || !p.occasions.includes(selectedOccasion))
      ) {
        return false;
      }
      if (selectedType !== 'all' && p.productType !== selectedType) return false;

      if (priceBucket === 'under-300' && p.price >= 300) return false;
      if (priceBucket === '300-800' && (p.price < 300 || p.price > 800)) return false;
      if (priceBucket === '800-2000' && (p.price <= 800 || p.price > 2000)) return false;
      if (priceBucket === 'above-2000' && p.price <= 2000) return false;

      if (q) {
        const haystack = buildProductSearchHaystack(p, categories);
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [
    products,
    categories,
    queryText,
    selectedCategory,
    selectedOccasion,
    selectedType,
    priceBucket,
  ]);

  const resetFilters = () => {
    setQueryText('');
    setSelectedCategory('all');
    setSelectedOccasion('all');
    setSelectedType('all');
    setPriceBucket('all');
    if (categorySlug) {
      navigate('/products');
      return;
    }
    setSearchParams({});
  };

  const hasActiveFilters = Boolean(
    queryText ||
      selectedCategory !== 'all' ||
      selectedOccasion !== 'all' ||
      selectedType !== 'all' ||
      priceBucket !== 'all'
  );

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-10 lg:px-8">
      {/* Compact Header */}
      <div className="border-b border-[#E7E5E4] pb-4">
        <p className="text-[11px] font-semibold tracking-wider text-[#DC1F26] sm:text-xs">
          প্রোডাক্ট শো-কেস ও মেনু · Product Showcase
        </p>
        <h1 className="font-display mt-1 text-2xl font-bold text-[#1C1917] sm:text-4xl">
          {activeCatText
            ? `${activeCatText.nameBn}`
            : activeOccasionObj && activeOccText
            ? `${activeOccasionObj.icon} ${activeOccText.nameBn}`
            : 'আমাদের সকল পণ্যসমূহ'}
        </h1>
        <p className="mt-0.5 text-xs font-medium text-[#78716C] sm:text-sm">
          {activeCatText
            ? activeCatText.nameEn
            : activeOccText
            ? activeOccText.nameEn
            : 'বাংলা বা ইংরেজিতে পছন্দের খাবার খুঁজুন এবং নিকটস্থ শোরুম থেকে সংগ্রহ করুন।'}
        </p>
      </div>

      {/* Compact Search & Horizontal Filter Toolbar (hidden on category pages) */}
      {!categorySlug && (
        <div className="mt-4 space-y-2.5">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            {/* Slim Search Bar (44px mobile, bounded desktop width) */}
            <div className="mx-auto flex h-[44px] w-full max-w-md items-center rounded-xl border border-[#D6D3D1] bg-white pl-3.5 pr-2 transition-colors focus-within:border-[#DC1F26] lg:mx-0 lg:h-10 lg:max-w-sm">
              <Search className="mr-2 h-4 w-4 shrink-0 text-[#78716C]" aria-hidden="true" />
              <input
                type="search"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="পণ্য খুঁজুন..."
                aria-label="পণ্য খুঁজুন"
                className="min-w-0 flex-1 bg-transparent text-sm text-[#1C1917] placeholder:text-[#78716C] focus:outline-none"
              />
              {queryText && (
                <button
                  type="button"
                  onClick={() => setQueryText('')}
                  aria-label="Clear search"
                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#78716C] hover:bg-[#F5F4F0] hover:text-[#1C1917]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Compact Horizontal Filter Controls (scroll smoothly on mobile, 1 row on desktop) */}
          <div className="no-scrollbar -mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-0.5 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[#78716C]">
              <Filter className="h-3.5 w-3.5" />
            </span>

            <select
              aria-label="Filter by Category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={`h-9 shrink-0 cursor-pointer rounded-lg border px-3 text-xs font-medium transition-colors focus:border-[#DC1F26] focus:outline-none ${
                selectedCategory !== 'all'
                  ? 'border-[#1C1917] bg-[#1C1917] text-white'
                  : 'border-[#D6D3D1] bg-white text-[#1C1917] hover:border-[#1C1917]/40'
              }`}
            >
              <option value="all">Category</option>
              {categories.map((cat) => {
                const ct = getCategoryText(cat);
                return (
                  <option key={cat.id} value={cat.slug} className="bg-white text-[#1C1917]">
                    {ct.nameBn}
                  </option>
                );
              })}
            </select>

            <select
              aria-label="Filter by Occasion"
              value={selectedOccasion}
              onChange={(e) => setSelectedOccasion(e.target.value)}
              className={`h-9 shrink-0 cursor-pointer rounded-lg border px-3 text-xs font-medium transition-colors focus:border-[#DC1F26] focus:outline-none ${
                selectedOccasion !== 'all'
                  ? 'border-[#1C1917] bg-[#1C1917] text-white'
                  : 'border-[#D6D3D1] bg-white text-[#1C1917] hover:border-[#1C1917]/40'
              }`}
            >
              <option value="all">Occasion</option>
              {occasions.map((occ) => {
                const ot = getOccasionText(occ);
                return (
                  <option key={occ.id} value={occ.slug} className="bg-white text-[#1C1917]">
                    {occ.icon} {ot.nameBn}
                  </option>
                );
              })}
            </select>

            <select
              aria-label="Filter by Price Range"
              value={priceBucket}
              onChange={(e) => setPriceBucket(e.target.value as PriceBucket)}
              className={`h-9 shrink-0 cursor-pointer rounded-lg border px-3 text-xs font-medium transition-colors focus:border-[#DC1F26] focus:outline-none ${
                priceBucket !== 'all'
                  ? 'border-[#1C1917] bg-[#1C1917] text-white'
                  : 'border-[#D6D3D1] bg-white text-[#1C1917] hover:border-[#1C1917]/40'
              }`}
            >
              <option value="all">Price</option>
              <option value="under-300" className="bg-white text-[#1C1917]">৳ ৩০০ এর নিচে</option>
              <option value="300-800" className="bg-white text-[#1C1917]">৳ ৩০০ – ৳ ৮০০</option>
              <option value="800-2000" className="bg-white text-[#1C1917]">৳ ৮০০ – ৳ ২,০০০</option>
              <option value="above-2000" className="bg-white text-[#1C1917]">৳ ২,০০০+</option>
            </select>

            <select
              aria-label="Filter by Product Type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className={`h-9 shrink-0 cursor-pointer rounded-lg border px-3 text-xs font-medium transition-colors focus:border-[#DC1F26] focus:outline-none ${
                selectedType !== 'all'
                  ? 'border-[#1C1917] bg-[#1C1917] text-white'
                  : 'border-[#D6D3D1] bg-white text-[#1C1917] hover:border-[#1C1917]/40'
              }`}
            >
              <option value="all">Type</option>
              {productTypes.map((pt) => (
                <option key={pt} value={pt} className="bg-white text-[#1C1917]">
                  {pt}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Slim Result Summary Row */}
        <div className="flex items-center justify-between text-xs text-[#57534E]">
          <span className="font-mono tabular-nums font-medium">
            {filteredProducts.length}টি পণ্য পাওয়া গেছে
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex cursor-pointer items-center gap-1 font-semibold text-[#DC1F26] hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              <span>রিসেট</span>
            </button>
          )}
        </div>
      </div>
      )}

      {/* Results Grid */}
      {productsLoading ? (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-80 animate-pulse rounded-xl border border-[#E7E5E4] bg-[#F5F4F0]"
            />
          ))}
        </div>
      ) : productsError && products.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-red-200 bg-red-50/70 p-10 text-center">
          <UtensilsCrossed className="mx-auto h-10 w-10 text-[#B91C1C]" />
          <h3 className="font-display mt-3 text-xl font-bold text-[#1C1917] sm:text-2xl">
            পণ্যগুলো এখন লোড করা যাচ্ছে না। অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন।
          </h3>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#DC1F26]"
          >
            <RotateCcw className="h-4 w-4" />
            <span>পুনরায় চেষ্টা করুন</span>
          </button>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-[#E7E5E4] bg-white p-12 text-center">
          <UtensilsCrossed className="mx-auto h-10 w-10 text-[#A8A29E]" />
          <h3 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
            কোনো পণ্য খুঁজে পাওয়া যায়নি
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#57534E]">
            আপনার সার্চ শব্দ বা ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন, অথবা সব ফিল্টার রিসেট করুন।
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#DC1F26]"
          >
            <RotateCcw className="h-4 w-4" />
            <span>{categorySlug ? 'সকল পণ্য দেখুন' : 'সব ফিল্টার রিসেট করুন'}</span>
          </button>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-3.5 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
