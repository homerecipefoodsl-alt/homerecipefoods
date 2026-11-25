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
        Page Not Found
      </h1>
      <p className="font-bn mt-1 text-sm text-[#78716C]">পৃষ্ঠাটি খুঁজে পাওয়া যায়নি</p>
      <p className="mt-3 text-sm text-[#57534E]">
        The page you are looking for may have been moved or the address is unavailable.
      </p>
      <div className="mt-7 flex justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-lg bg-[#DC1F26] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Home</span>
        </Link>
        <Link
          to="/products"
          className="inline-flex items-center rounded-lg border border-[#D6D3D1] bg-white px-5 py-2.5 text-sm font-semibold text-[#1C1917] transition-colors hover:border-[#1C1917]"
        >
          Browse Menu
        </Link>
      </div>
    </div>
  );
}
