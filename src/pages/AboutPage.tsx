import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, HeartHandshake, Leaf } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useStore } from '../context/StoreContext';
import { ASSET_KEYS, resolveAssetUrl } from '../lib/assets';

export function AboutPage() {
  const { siteSettings } = useStore();

  useEffect(() => {
    document.title = `আমাদের গল্প · About Us – ${siteSettings.brandName || 'Home Recipe Foods'}`;
  }, [siteSettings.brandName]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-6">
          <div className="mb-5">
            <BrandLogo variant="header" />
          </div>
          <p className="text-xs font-semibold tracking-wider text-[#B91C1C]">
            আমাদের গল্প ও প্রতিশ্রুতি
          </p>
          <h1
            className="font-display mt-2 text-4xl font-bold leading-tight text-[#1C1917] sm:text-5xl"
            style={{ textWrap: 'balance' }}
          >
            {siteSettings.brandName || 'Home Recipe Foods'} — {siteSettings.tagline || 'খাঁটি স্বাদ, সুন্দর মুহূর্তের বিশ্বস্ত সঙ্গী'}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[#57534E] sm:text-base">
            প্রতিটি ঘরোয়া উৎসব, জন্মদিন, বিয়ে কিংবা দৈনন্দিন চায়ের আড্ডাকে স্মরণীয় করে তুলতেই Home Recipe Foods-এর যাত্রা। আমরা বিশ্বাস করি, ভালো খাবারের মূল রহস্য হলো সতেজ উপাদান, পরিচ্ছন্ন রান্নাঘর এবং আন্তরিক যত্ন।
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[#57534E] sm:text-base">
            আমাদের নিজস্ব পেস্ট্রি ও সুইটস কিচেনে প্রতিদিন সকালে তৈরি হয় তাজা ব্রেড, বেলজিয়ান চকলেট কেক, স্পেশ্যাল জাফরান রসমালাই, শাহী আকদ বক্স এবং গরম ফাস্টফুড। আমরা সরাসরি শোরুমে অতিথিদের স্বাগত জানাই যাতে আপনি নিজের চোখে দেখে সেরা পণ্যটি বেছে নিতে পারেন।
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/products"
              className="inline-flex items-center gap-2 rounded-lg bg-[#DC1F26] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C]"
            >
              <span>আমাদের পণ্য দেখুন</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/showrooms"
              className="inline-flex items-center gap-2 rounded-lg border border-[#D6D3D1] bg-white px-5 py-3 text-sm font-semibold text-[#1C1917] hover:border-[#1C1917]"
            >
              <span>শোরুমে আসুন</span>
            </Link>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="overflow-hidden rounded-2xl border border-[#E7E5E4] bg-white">
            <img
              src={resolveAssetUrl(ASSET_KEYS.heroSweets)}
              alt="Home Recipe Foods traditional sweets and Akd box"
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
            খাঁটি ও বাছাইকৃত উপাদান
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[#57534E]">
            নিউজিল্যান্ড বাটার, বেলজিয়ান চকলেট এবং খাঁটি দুধের ছানা ব্যবহার করে প্রতিটি পদ প্রস্তুত করা হয়।
          </p>
        </div>

        <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
          <Award className="h-6 w-6 text-[#DC1F26]" />
          <h3 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
            প্রতিদিন তাজা প্রস্তুতি
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[#57534E]">
            সকাল থেকে রাত পর্যন্ত নিয়মিত বিরতিতে ওভেন থেকে ফ্রেশ ব্রেড, পেস্ট্রি ও স্ন্যাকস শোরুমে পরিবেশন করা হয়।
          </p>
        </div>

        <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
          <HeartHandshake className="h-6 w-6 text-[#DC1F26]" />
          <h3 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
            ব্যক্তিগত পরামর্শ ও আতিথেয়তা
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[#57534E]">
            বিয়ে, আকদ ও জন্মদিনের বিশেষ আয়োজনের জন্য আমাদের শোরুম প্রতিনিধি আপনাকে সঠিক গাইডলাইন দেবেন।
          </p>
        </div>
      </div>
    </div>
  );
}
