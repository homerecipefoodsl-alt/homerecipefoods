import { useStore } from '../context/StoreContext';
import { resolveAssetUrl } from '../lib/assets';

export const OFFICIAL_LOGO_SRC = '/assets/aistudio/Picsart_26-05-14_22-17-37-331_ba29b4c2.png';

interface BrandLogoProps {
  variant?: 'header' | 'footer' | 'hero' | 'chat' | 'compact';
  className?: string;
}

const VARIANT_SIZE_CLASS: Record<NonNullable<BrandLogoProps['variant']>, string> = {
  header: 'h-9 w-auto sm:h-11 lg:h-12',
  footer: 'h-12 w-auto sm:h-14',
  hero: 'h-16 w-auto sm:h-20',
  chat: 'h-8 w-auto sm:h-9',
  compact: 'h-8 w-auto',
};

export function BrandLogo({ variant = 'header', className = '' }: BrandLogoProps) {
  const { siteSettings } = useStore();
  const logoSrc = siteSettings.logoUrl
    ? resolveAssetUrl(siteSettings.logoUrl)
    : OFFICIAL_LOGO_SRC;
  const brandAlt = `${siteSettings.brandName || 'Home Recipe Foods'} Logo`;

  return (
    <img
      src={logoSrc}
      alt={brandAlt}
      width={3458}
      height={1314}
      draggable={false}
      className={`block shrink-0 select-none object-contain ${VARIANT_SIZE_CLASS[variant]} ${className}`}
    />
  );
}
