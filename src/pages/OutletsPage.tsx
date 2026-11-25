import { useEffect } from 'react';
import { OutletsShowcase } from '../components/OutletsShowcase';
import { useStore } from '../context/StoreContext';

const OUTLETS_PAGE_TITLE = 'Home Recipe Foods – Our Outlets | Chattogram';
const OUTLETS_META_DESC =
  'Explore Home Recipe Foods showroom addresses, counter hours, direct phone numbers, and Google Maps directions across Chattogram.';

export function OutletsPage() {
  const { seoSettings } = useStore();

  useEffect(() => {
    const prevTitle = document.title;
    const metaDescEl = document.querySelector('meta[name="description"]');
    const prevDesc = metaDescEl?.getAttribute('content') || '';

    document.title = OUTLETS_PAGE_TITLE;
    if (metaDescEl) {
      metaDescEl.setAttribute('content', OUTLETS_META_DESC);
    }

    return () => {
      document.title = seoSettings.siteTitle || prevTitle;
      if (metaDescEl && prevDesc) {
        metaDescEl.setAttribute('content', prevDesc);
      }
    };
  }, [seoSettings.siteTitle]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <OutletsShowcase variant="page" showHeader />
    </div>
  );
}
