import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, HeartHandshake, Leaf } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useStore } from '../context/StoreContext';
import { ASSET_KEYS, resolveAssetUrl } from '../lib/assets';

export function AboutPage() {
  const { showrooms, siteSettings, languageMode } = useStore();
  const activeOutletCount = showrooms.filter(
    (sr) => sr.visible !== false && !sr.deleted
  ).length;

  useEffect(() => {
    document.title = `Our Story · About Us – ${siteSettings.brandName || 'Home Recipe Foods'}`;
  }, [siteSettings.brandName]);

  const showEnglishFirst = languageMode !== 'bn';
  const showBothLanguages = languageMode === 'both';

  const subtitleEn = siteSettings.aboutSubtitleEn || 'Our Story & Promise';
  const subtitleBn = siteSettings.aboutSubtitleBn || 'আমাদের গল্প ও প্রতিশ্রুতি';
  const headingEn =
    siteSettings.aboutHeadingEn ||
    'Crafted with pure ingredients for everyday tables and milestone celebrations.';
  const headingBn =
    siteSettings.aboutHeadingBn || 'খাঁটি উপাদান ও ঘরোয়া যত্নের গল্প';
  const storyEn =
    siteSettings.aboutStoryEn ||
    'Home Recipe Foods began with a simple commitment: bringing the warmth of a trusted family kitchen together with disciplined artisanal baking and traditional Bangladeshi sweetmaking.';
  const storyBn =
    siteSettings.aboutStoryBn ||
    'প্রতিদিন সকালে আমাদের নিজস্ব কিচেনে খাঁটি উপাদান, ঘরোয়া যত্ন ও আধুনিক বেকিং শিল্পের সমন্বয়ে তাজা কেক, পেস্ট্রি, ব্রেড, মিষ্টি ও আকদ বক্স তৈরি করা হয়।';
  const missionEn =
    siteSettings.aboutMissionEn ||
    `Inside our dedicated pastry and sweets kitchens across Chattogram, we bake daily breads, Belgian chocolate cakes, saffron roshomalai, curated shahi Akd boxes, and savoury snacks. We welcome guests in person at our ${activeOutletCount} outlets so you can explore every item fresh at the counter.`;
  const missionBn =
    siteSettings.aboutMissionBn ||
    'চট্টগ্রামের আমাদের প্রতিটি শোরুমে মানসম্মত পণ্য ও আন্তরিক ক্রেতা সেবা নিশ্চিত করাই আমাদের মূল লক্ষ্য।';
  const featureImage = resolveAssetUrl(
    siteSettings.aboutImageUrl || ASSET_KEYS.heroSweets
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-6">
          <div className="mb-5">
            <BrandLogo variant="header" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#B91C1C]">
            {showEnglishFirst ? subtitleEn : subtitleBn}
          </p>
          {showBothLanguages && subtitleBn && subtitleBn !== subtitleEn && (
            <p className="font-bn mt-0.5 text-xs text-[#78716C]">{subtitleBn}</p>
          )}

          <h1
            className={`mt-2 text-3xl font-bold leading-tight text-[#1C1917] sm:text-5xl ${
              showEnglishFirst ? 'font-display' : 'font-bn'
            }`}
            style={{ textWrap: 'balance' }}
          >
            {showEnglishFirst ? headingEn : headingBn}
          </h1>
          {showBothLanguages && headingBn && headingBn !== headingEn && (
            <p className="font-bn mt-1.5 text-sm font-medium text-[#57534E]">
              {headingBn}
            </p>
          )}
          <p className="font-bn mt-2 text-xs text-[#78716C]">
            {siteSettings.brandName || 'Home Recipe Foods'} —{' '}
            {siteSettings.tagline || 'খাঁটি স্বাদ, সুন্দর মুহূর্তের বিশ্বস্ত সঙ্গী'}
          </p>

          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-[#44403C] sm:text-base">
            {showEnglishFirst ? storyEn : storyBn}
          </p>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[#57534E] sm:text-base">
            {showEnglishFirst ? missionEn : missionBn}
          </p>
          {showBothLanguages && storyBn && (
            <p className="font-bn mt-3 whitespace-pre-line text-xs leading-relaxed text-[#78716C] sm:text-sm">
              {storyBn}
            </p>
          )}
          {showBothLanguages && missionBn && missionBn !== storyBn && (
            <p className="font-bn mt-1.5 whitespace-pre-line text-xs leading-relaxed text-[#78716C] sm:text-sm">
              {missionBn}
            </p>
          )}

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
              <span>Visit Our {activeOutletCount} Outlets</span>
            </Link>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="overflow-hidden rounded-2xl border border-[#E7E5E4] bg-white">
            <img
              src={featureImage}
              alt={`${siteSettings.brandName || 'Home Recipe Foods'} showcase`}
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
