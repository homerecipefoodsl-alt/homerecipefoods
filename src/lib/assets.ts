import heroBakeryImg from '../assets/images/hero_bakery_clean_1794746110066.jpg';
import heroSweetsImg from '../assets/images/hero_festive_sweets_1794746089920.jpg';
import heroSavoryImg from '../assets/images/hero_savory_clean_1794746109871.jpg';
import catFastFoodImg from '../assets/images/cat_fastfood_burger_1794746090995.jpg';
import catBreadImg from '../assets/images/cat_artisan_bread_1794746092184.jpg';
import catPastryImg from '../assets/images/cat_pastry_single_1794746109734.jpg';
import catFrozenImg from '../assets/images/cat_frozen_snacks_1794746091843.jpg';
import catSpecialSweetsImg from '../assets/images/cat_special_sweets_1794746091873.jpg';
import catDrySweetsImg from '../assets/images/cat_dry_sweets_1794746093210.jpg';
import catCookiesImg from '../assets/images/cat_artisan_cookies_1794746093360.jpg';
import catCakeImg from '../assets/images/cat_cake_single_1794746110514.jpg';
import catAkdBoxImg from '../assets/images/cat_akd_box_1794746094244.jpg';

export const ASSET_KEYS = {
  heroBakery: '/src/assets/images/hero_bakery_clean_1794746110066.jpg',
  heroSweets: '/src/assets/images/hero_festive_sweets_1794746089920.jpg',
  heroSavory: '/src/assets/images/hero_savory_clean_1794746109871.jpg',
  catFastFood: '/src/assets/images/cat_fastfood_burger_1794746090995.jpg',
  catBread: '/src/assets/images/cat_artisan_bread_1794746092184.jpg',
  catPastry: '/src/assets/images/cat_pastry_single_1794746109734.jpg',
  catFrozen: '/src/assets/images/cat_frozen_snacks_1794746091843.jpg',
  catSpecialSweets: '/src/assets/images/cat_special_sweets_1794746091873.jpg',
  catDrySweets: '/src/assets/images/cat_dry_sweets_1794746093210.jpg',
  catCookies: '/src/assets/images/cat_artisan_cookies_1794746093360.jpg',
  catCake: '/src/assets/images/cat_cake_single_1794746110514.jpg',
  catAkdBox: '/src/assets/images/cat_akd_box_1794746094244.jpg',
} as const;

const ASSET_MAP: Record<string, string> = {
  [ASSET_KEYS.heroBakery]: heroBakeryImg,
  [ASSET_KEYS.heroSweets]: heroSweetsImg,
  [ASSET_KEYS.heroSavory]: heroSavoryImg,
  [ASSET_KEYS.catFastFood]: catFastFoodImg,
  [ASSET_KEYS.catBread]: catBreadImg,
  [ASSET_KEYS.catPastry]: catPastryImg,
  [ASSET_KEYS.catFrozen]: catFrozenImg,
  [ASSET_KEYS.catSpecialSweets]: catSpecialSweetsImg,
  [ASSET_KEYS.catDrySweets]: catDrySweetsImg,
  [ASSET_KEYS.catCookies]: catCookiesImg,
  [ASSET_KEYS.catCake]: catCakeImg,
  [ASSET_KEYS.catAkdBox]: catAkdBoxImg,
};

export function resolveAssetUrl(src: string | undefined | null): string {
  if (!src) return heroBakeryImg;
  return ASSET_MAP[src] ?? src;
}
