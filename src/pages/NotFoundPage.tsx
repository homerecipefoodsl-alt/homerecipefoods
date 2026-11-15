import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <div className="mb-6 flex justify-center">
        <BrandLogo variant="header" />
      </div>
      <p className="font-mono text-sm font-semibold text-[#DC1F26]">404</p>
      <h1 className="font-display mt-2 text-4xl font-bold text-[#1C1917]">
        পৃষ্ঠাটি খুঁজে পাওয়া যায়নি
      </h1>
      <p className="mt-3 text-sm text-[#57534E]">
        আপনি যে পৃষ্ঠাটি খুঁজছেন তা সরানো হয়েছে অথবা ঠিকানাটি সঠিক নয়।
      </p>
      <div className="mt-7 flex justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-lg bg-[#DC1F26] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#B91C1C]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>হোমপেজে ফিরে যান</span>
        </Link>
        <Link
          to="/products"
          className="inline-flex items-center rounded-lg border border-[#D6D3D1] bg-white px-5 py-2.5 text-sm font-semibold text-[#1C1917] hover:border-[#1C1917]"
        >
          সব পণ্য দেখুন
        </Link>
      </div>
    </div>
  );
}
