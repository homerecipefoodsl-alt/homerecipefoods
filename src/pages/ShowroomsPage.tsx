import { useEffect } from 'react';
import { ShowroomLocator } from '../components/ShowroomLocator';

export function ShowroomsPage() {
  useEffect(() => {
    document.title = 'আমাদের শোরুমসমূহ · Showrooms – Home Recipe Foods';
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="border-b border-[#E7E5E4] pb-6">
        <p className="text-xs font-semibold tracking-wider text-[#B91C1C]">
          সরাসরি ভিজিট করুন · Visit Our Showrooms
        </p>
        <h1 className="font-display mt-1 text-3xl font-bold text-[#1C1917] sm:text-5xl">
          আমাদের শোরুমসমূহ
        </h1>
        <p className="mt-1 text-sm font-medium text-[#78716C]">Our Showrooms &amp; Outlets</p>
        <p className="mt-2 max-w-2xl text-sm text-[#57534E]">
          আমাদের প্রতিটি শোরুমে তাজা বেকারি, মিষ্টি, কেক ও আকদ বক্স সরাসরি দেখে এবং স্বাদ যাচাই করে সংগ্রহ করতে পারবেন। যেকোনো কাস্টম কেকের পরামর্শের জন্য শোরুমে সরাসরি কল করুন।
        </p>
      </div>

      <div className="mt-8">
        <ShowroomLocator />
      </div>
    </div>
  );
}
