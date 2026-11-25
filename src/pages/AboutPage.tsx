import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, HeartHandshake, Leaf } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useStore } from '../context/StoreContext';
import { ASSET_KEYS, resolveAssetUrl } from '../lib/assets';

export function AboutPage() {
  const { siteSettings } = useStore();

  useEffect(() => {
    document.title = `Our Story · About Us – ${siteSettings.brandName || 'Home Recipe Foods'}`;
  }, [siteSettings.brandName]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-6">
          <div className="mb-5">
            <BrandLogo variant="header" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#B91C1C]">
            Our Story &amp; Promise
          </p>
          <p className="font-bn mt-0.5 text-xs text-[#78716C]">আমাদের গল্প ও প্রতিশ্রুতি</p>
          <h1
            className="font-display mt-2 text-3xl font-bold leading-tight text-[#1C1917] sm:text-5xl"
            style={{ textWrap: 'balance' }}
          >
            Crafted with pure ingredients for everyday tables and milestone celebrations.
          </h1>
          <p className="font-bn mt-2 text-sm text-[#57534E]">
            {siteSettings.brandName || 'Home Recipe Foods'} —{' '}
            {siteSettings.tagline || 'খাঁটি স্বাদ, সুন্দর মুহূর্তের বিশ্বস্ত সঙ্গী'}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[#44403C] sm:text-base">
            Home Recipe Foods began with a simple commitment: bringing the warmth of a trusted
            family kitchen together with disciplined artisanal baking and traditional Bangladeshi
            sweetmaking. Whether it is an afternoon tea, a birthday gathering, or an Akd ceremony,
            every item is prepared fresh to honour the occasion.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[#57534E] sm:text-base">
            Inside our dedicated pastry and sweets kitchens across Chattogram, we bake daily breads,
            Belgian chocolate cakes, saffron roshomalai, curated shahi Akd boxes, and savoury
            snacks. We welcome guests in person at our 16 outlets so you can explore every item
            fresh at the counter.
          </p>
          <p className="font-bn mt-3 text-xs leading-relaxed text-[#78716C] sm:text-sm">
            আমাদের নিজস্ব পেস্ট্রি ও সুইটস কিচেনে প্রতিদিন সকালে তৈরি হয় তাজা ব্রেড, বেলজিয়ান চকলেট
            কেক, স্পেশ্যাল জাফরান রসমালাই, শাহী আকদ বক্স ও গরম ফাস্টফুড।
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/products"
              className="inline-flex items-center gap-2 rounded-lg bg-[#DC1F26] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C]"
            >
              <span>Explore Our Menu</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/outlets"
              className="inline-flex items-center gap-2 rounded-lg border border-[#D6D3D1] bg-white px-5 py-3 text-sm font-semibold text-[#1C1917] transition-colors hover:border-[#1C1917]"
            >
              <span>Visit Our Outlets</span>
            </Link>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="overflow-hidden rounded-2xl border border-[#E7E5E4] bg-white">
            <img
              src={resolveAssetUrl(ASSET_KEYS.heroSweets)}
              alt="Home Recipe Foods traditional sweets and Akd gift box"
              referrerPolicy="no-referrer"
              className="aspect-[16/10] w-full object-cover"
            />
          </div>
        </div>
      </div>

      {/* 3 Core Values */}
      <div className="mt-14 grid grid-cols-1 gap-6 border-t border-[#E7E5E4] pt-12 md:grid-cols-3">
        <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
          <Leaf className="h-6 w-6 text-[#DC1F26]" />
          <h3 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
            Pure, Selected Ingredients
          </h3>
          <p className="font-bn mt-0.5 text-xs text-[#78716C]">খাঁটি ও বাছাইকৃত উপাদান</p>
          <p className="mt-2.5 text-sm leading-relaxed text-[#57534E]">
            Every recipe starts with trusted pantry staples — cultured butter, fine cocoa, and
            fresh milk chhana with zero shortcuts.
          </p>
        </div>

        <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
          <Award className="h-6 w-6 text-[#DC1F26]" />
          <h3 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
            Baked &amp; Prepared Fresh Daily
          </h3>
          <p className="font-bn mt-0.5 text-xs text-[#78716C]">প্রতিদিন তাজা প্রস্তুতি</p>
          <p className="mt-2.5 text-sm leading-relaxed text-[#57534E]">
            From early morning loaves to evening pastries and savoury snacks, counters are replenished
            throughout the day for peak freshness.
          </p>
        </div>

        <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
          <HeartHandshake className="h-6 w-6 text-[#DC1F26]" />
          <h3 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
            Warm Counter Hospitality
          </h3>
          <p className="font-bn mt-0.5 text-xs text-[#78716C]">আন্তরিক সেবা ও পরামর্শ</p>
          <p className="mt-2.5 text-sm leading-relaxed text-[#57534E]">
            Planning a wedding Akd box, corporate gift, or custom celebration cake? Our showroom
            teams guide you in person or by phone.
          </p>
        </div>
      </div>
    </div>
  );
}
