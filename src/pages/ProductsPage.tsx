import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Filter, RotateCcw, Search, UtensilsCrossed } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { useStore } from '../context/StoreContext';
import {
  buildProductSearchHaystack,
  getCategoryText,
  getOccasionText,
} from '../lib/bilingual';

type PriceBucket = 'all' | 'under-300' | '300-800' | '800-2000' | 'above-2000';

export function ProductsPage() {
  const { categories, occasions, products, loading } = useStore();
  const { categorySlug, occasionSlug } = useParams();
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
    if (q !== null) setQueryText(q);
  }, [searchParams]);

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
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (selectedOccasion !== 'all' && !p.occasions.includes(selectedOccasion)) return false;
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
    setSearchParams({});
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      {/* Header */}
      <div className="border-b border-[#E7E5E4] pb-6">
        <p className="text-xs font-semibold tracking-wider text-[#DC1F26]">
          প্রোডাক্ট শো-কেস ও মেনু · Product Showcase
        </p>
        <h1 className="font-display mt-1 text-3xl font-bold text-[#1C1917] sm:text-5xl">
          {activeCatText
            ? `${activeCatText.nameBn}`
            : activeOccasionObj && activeOccText
            ? `${activeOccasionObj.icon} ${activeOccText.nameBn}`
            : 'আমাদের সকল পণ্যসমূহ'}
        </h1>
        <p className="mt-1 text-sm font-medium text-[#78716C]">
          {activeCatText
            ? activeCatText.nameEn
            : activeOccText
            ? activeOccText.nameEn
            : 'All Products & Handcrafted Menu'}
        </p>
        <p className="mt-2 max-w-2xl text-sm text-[#57534E]">
          {activeCatText
            ? activeCatText.descriptionBn
            : activeOccText
            ? activeOccText.descriptionBn
            : 'বাংলা বা ইংরেজি যেকোনো নামে পছন্দের খাবার খুঁজুন এবং নিকটস্থ শোরুম থেকে সংগ্রহ করুন।'}
        </p>
        {((activeCatText?.descriptionEn && activeCatText.descriptionEn !== activeCatText.descriptionBn) ||
          (activeOccText?.descriptionEn && activeOccText.descriptionEn !== activeOccText.descriptionBn)) && (
          <p className="mt-1 max-w-2xl text-xs text-[#78716C]">
            {activeCatText ? activeCatText.descriptionEn : activeOccText?.descriptionEn}
          </p>
        )}
      </div>

      {/* Search & Filter Panel */}
      <div className="mt-6 rounded-2xl border border-[#E7E5E4] bg-white p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Search Input */}
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716C]" />
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="খুঁজুন / Search: চকলেট কেক, Chocolate Cake, বার্গার..."
              className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] py-2.5 pl-10 pr-4 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              aria-label="Filter by Category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:outline-none"
            >
              <option value="all">সব ক্যাটাগরি · All Categories</option>
              {categories.map((cat) => {
                const ct = getCategoryText(cat);
                return (
                  <option key={cat.id} value={cat.slug}>
                    {ct.nameBn} ({ct.nameEn})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Occasion Filter */}
          <div>
            <select
              aria-label="Filter by Occasion"
              value={selectedOccasion}
              onChange={(e) => setSelectedOccasion(e.target.value)}
              className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:outline-none"
            >
              <option value="all">সব উপলক্ষ · All Occasions</option>
              {occasions.map((occ) => {
                const ot = getOccasionText(occ);
                return (
                  <option key={occ.id} value={occ.slug}>
                    {occ.icon} {ot.nameBn} ({ot.nameEn})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Price Range Filter */}
          <div>
            <select
              aria-label="Filter by Price Range"
              value={priceBucket}
              onChange={(e) => setPriceBucket(e.target.value as PriceBucket)}
              className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:outline-none"
            >
              <option value="all">যেকোনো মূল্য · Any Price</option>
              <option value="under-300">৳ ৩০০ এর নিচে</option>
              <option value="300-800">৳ ৩০০ – ৳ ৮০০</option>
              <option value="800-2000">৳ ৮০০ – ৳ ২,০০০</option>
              <option value="above-2000">৳ ২,০০০ এর উপরে</option>
            </select>
          </div>
        </div>

        {/* Secondary Row: Product Type & Result Count */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#F5F4F0] pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#78716C]">
              <Filter className="h-3.5 w-3.5" />
              <span>ধরন:</span>
            </span>
            <select
              aria-label="Filter by Product Type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="rounded-md border border-[#E7E5E4] bg-[#FAFAF8] px-2.5 py-1 text-xs font-medium text-[#1C1917] focus:border-[#DC1F26] focus:outline-none"
            >
              <option value="all">সব ধরন</option>
              {productTypes.map((pt) => (
                <option key={pt} value={pt}>
                  {pt}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <span className="font-mono tabular-nums text-xs font-medium text-[#57534E]">
              {filteredProducts.length}টি পণ্য পাওয়া গেছে
            </span>
            {(queryText ||
              selectedCategory !== 'all' ||
              selectedOccasion !== 'all' ||
              selectedType !== 'all' ||
              priceBucket !== 'all') && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#DC1F26] hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>রিসেট করুন</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Grid */}
      {loading ? (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-80 animate-pulse rounded-xl border border-[#E7E5E4] bg-[#F5F4F0]"
            />
          ))}
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
            <span>সব ফিল্টার রিসেট করুন</span>
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
