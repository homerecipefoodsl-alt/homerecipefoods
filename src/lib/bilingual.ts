import { getDynamicBengaliDate } from './utils';
import type {
  Category,
  DisplayLanguage,
  GreetingConfig,
  HeroSlide,
  Occasion,
  Product,
  Showroom,
} from '../types';

export function getDynamicEnglishDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Enforces English-first display hierarchy:
 * - primary: English text (falls back to Bengali only if English is absent)
 * - secondaryBn: Bengali text only when present and distinct from primary
 */
export function resolveBilingualPair(
  en?: string | null,
  bn?: string | null
): { primary: string; secondaryBn: string } {
  const cleanEn = (en ?? '').trim();
  const cleanBn = (bn ?? '').trim();
  const primary = cleanEn || cleanBn;
  const secondaryBn =
    cleanBn && cleanBn.toLowerCase() !== primary.toLowerCase() ? cleanBn : '';
  return { primary, secondaryBn };
}

export function getCategoryText(cat: Category) {
  const nameBn = (cat.name_bn || cat.name || '').trim();
  const nameEn = (cat.name_en || cat.nameEn || '').trim();
  const descriptionBn = (cat.description_bn || cat.description || '').trim();
  const descriptionEn = (cat.description_en || cat.descriptionEn || '').trim();
  return { nameBn, nameEn, descriptionBn, descriptionEn };
}

export function getOccasionText(occ: Occasion) {
  const nameBn = (occ.name_bn || occ.name || '').trim();
  const nameEn = (occ.name_en || occ.nameEn || '').trim();
  const descriptionBn = (occ.description_bn || occ.description || '').trim();
  const descriptionEn = (occ.description_en || occ.descriptionEn || '').trim();
  return { nameBn, nameEn, descriptionBn, descriptionEn };
}

const CATEGORY_ALIAS_MAP: Record<string, string> = {
  cake: 'custom-cake',
  cakes: 'custom-cake',
  'custom cake': 'custom-cake',
  'custom-cake': 'custom-cake',
  'customized cake': 'custom-cake',
  'customized cakes': 'custom-cake',
  'কাস্টম কেক': 'custom-cake',
  'কাস্টমাইজ কেক': 'custom-cake',
  কেক: 'custom-cake',
  'fast food': 'fast-food',
  'fast-food': 'fast-food',
  'ফাস্ট ফুড': 'fast-food',
  ফাস্টফুড: 'fast-food',
  bread: 'bread',
  ব্রেড: 'bread',
  pastry: 'pastry',
  পেস্ট্রি: 'pastry',
  frozen: 'frozen-items',
  'frozen item': 'frozen-items',
  'frozen items': 'frozen-items',
  'frozen-items': 'frozen-items',
  'ফ্রিজ আইটেম': 'frozen-items',
  'ফ্রোজেন আইটেম': 'frozen-items',
  mahallabia: 'mahallabia',
  মাহাল্লাবিয়া: 'mahallabia',
  মাহাল্লাবিয়া: 'mahallabia',
  'special sweet': 'special-sweets',
  'special sweets': 'special-sweets',
  'special-sweets': 'special-sweets',
  'স্পেশাল মিষ্টি': 'special-sweets',
  'স্পেশ্যাল মিষ্টি': 'special-sweets',
  'dry sweet': 'dry-sweets',
  'dry sweets': 'dry-sweets',
  'dry-sweets': 'dry-sweets',
  'ড্রাই মিষ্টি': 'dry-sweets',
  cookie: 'cookies',
  cookies: 'cookies',
  কুকিজ: 'cookies',
  akd: 'akd-box',
  'akd box': 'akd-box',
  'akd boxes': 'akd-box',
  'akd-box': 'akd-box',
  'আকদ বক্স': 'akd-box',
};

function normalizeCategoryToken(value: string | undefined | null): string {
  return (value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function resolveProductCategorySlug(
  prod: Pick<Product, 'category' | 'categorySlug' | 'categoryName' | 'categoryNameEn'>,
  categories: Category[] = []
): string {
  const candidates = [
    prod.category,
    prod.categorySlug,
    prod.categoryName,
    prod.categoryNameEn,
  ]
    .map((v) => (v ?? '').trim())
    .filter(Boolean);

  for (const raw of candidates) {
    const norm = normalizeCategoryToken(raw);
    const byCat = categories.find((c) => {
      const tokens = [c.slug, c.name, c.name_bn, c.nameEn, c.name_en].map(
        normalizeCategoryToken
      );
      return tokens.includes(norm);
    });
    if (byCat) return byCat.slug;

    const aliasSlug = CATEGORY_ALIAS_MAP[norm];
    if (aliasSlug) {
      const catMatch = categories.find((c) => c.slug === aliasSlug);
      return catMatch ? catMatch.slug : aliasSlug;
    }
  }

  const primary = candidates[0] ?? '';
  return normalizeCategoryToken(primary);
}

export function matchesProductCategory(
  prod: Pick<Product, 'category' | 'categorySlug' | 'categoryName' | 'categoryNameEn'>,
  selectedCategory: string,
  categories: Category[] = []
): boolean {
  if (!selectedCategory || selectedCategory === 'all') return true;
  const targetNorm = normalizeCategoryToken(selectedCategory);
  const resolvedTarget = CATEGORY_ALIAS_MAP[targetNorm] || targetNorm;
  const resolvedProduct = resolveProductCategorySlug(prod, categories);
  return (
    resolvedProduct === resolvedTarget ||
    normalizeCategoryToken(prod.category) === targetNorm ||
    normalizeCategoryToken(prod.categoryName) === targetNorm ||
    normalizeCategoryToken(prod.categoryNameEn) === targetNorm
  );
}

export function getProductText(prod: Product, categories?: Category[]) {
  const nameBn = (prod.nameBn || prod.name_bn || prod.name || '').trim();
  const nameEn = (prod.name_en || prod.nameEn || '').trim();
  const unit = (prod.unit || prod.priceUnit || '').trim();
  const shortDescriptionBn = (
    prod.short_description_bn ||
    prod.shortDescription ||
    ''
  ).trim();
  const shortDescriptionEn = (
    prod.short_description_en ||
    prod.shortDescriptionEn ||
    ''
  ).trim();
  const descriptionBn = (
    prod.description_bn ||
    prod.description ||
    shortDescriptionBn
  ).trim();
  const descriptionEn = (
    prod.description_en ||
    prod.descriptionEn ||
    shortDescriptionEn
  ).trim();

  const resolvedSlug = resolveProductCategorySlug(prod, categories ?? []);
  const matchedCat = categories?.find(
    (c) =>
      c.slug === resolvedSlug ||
      c.slug === prod.category ||
      c.name === prod.categoryName
  );
  const categoryNameBn = (
    prod.categoryName ||
    matchedCat?.name_bn ||
    matchedCat?.name ||
    prod.category ||
    ''
  ).trim();
  const categoryNameEn = (
    prod.categoryNameEn ||
    matchedCat?.name_en ||
    matchedCat?.nameEn ||
    ''
  ).trim();

  return {
    nameBn,
    nameEn,
    unit,
    shortDescriptionBn,
    shortDescriptionEn,
    descriptionBn,
    descriptionEn,
    categoryNameBn,
    categoryNameEn,
  };
}

export function getShowroomText(sr: Showroom) {
  const nameBn = (sr.name_bn || sr.name || '').trim();
  const nameEn = (sr.name_en || sr.nameEn || '').trim();
  const areaBn = (sr.area || '').trim();
  const areaEn = (sr.areaEn || '').trim();
  const addressBn = (sr.address_bn || sr.address || '').trim();
  const addressEn = (sr.address_en || sr.addressEn || '').trim();
  const descriptionBn = (sr.description_bn || sr.description || '').trim();
  const descriptionEn = (sr.description_en || sr.descriptionEn || '').trim();
  const openingHoursBn = (sr.openingHours || '').trim();
  const openingHoursEn = (sr.openingHoursEn || '').trim();

  return {
    nameBn,
    nameEn,
    areaBn,
    areaEn,
    addressBn,
    addressEn,
    descriptionBn,
    descriptionEn,
    openingHoursBn,
    openingHoursEn,
  };
}

export function getHeroSlideText(slide?: HeroSlide | null) {
  if (!slide) {
    return {
      titleBn: 'ভালোবাসায় তৈরি প্রতিটি স্বাদ',
      titleEn: 'Freshly Baked, Made With Love',
      subtitleBn:
        'প্রতিদিন খাঁটি উপাদানে তৈরি আর্টিজানাল কেক, পেস্ট্রি, মিষ্টি ও আকদ বক্স। সরাসরি আমাদের শোরুমে আসুন বা কল করুন।',
      subtitleEn:
        'Artisanal cakes, pastries, traditional sweets & luxury Akd boxes crafted fresh every morning.',
      displayLanguage: 'both' as DisplayLanguage,
    };
  }

  const titleBn = (slide.title_bn || '').trim();
  const titleEn = (slide.title_en || slide.title || '').trim();
  const subtitleBn = (slide.subtitle_bn || slide.subtitle || '').trim();
  const subtitleEn = (slide.subtitle_en || '').trim();
  const displayLanguage: DisplayLanguage = slide.displayLanguage || 'both';

  return {
    titleBn: titleBn || titleEn,
    titleEn: titleEn || titleBn,
    subtitleBn: subtitleBn || subtitleEn,
    subtitleEn: subtitleEn || subtitleBn,
    displayLanguage,
  };
}

export interface BilingualGreetingItem {
  bn: string;
  en: string;
}

export function getGreetingItems(
  greeting: GreetingConfig,
  languageMode: DisplayLanguage = 'both'
): BilingualGreetingItem[] {
  const dateBn = greeting.useDynamicDate
    ? getDynamicBengaliDate()
    : greeting.customDateText || getDynamicBengaliDate();
  const dateEn = greeting.useDynamicDate
    ? getDynamicEnglishDate()
    : greeting.customDateTextEn || getDynamicEnglishDate();

  const greetingBn = (greeting.greeting_bn || greeting.greetingText || '').trim();
  const greetingEn = (greeting.greeting_en || greeting.greetingTextEn || '').trim();
  const msgBn = (greeting.message_bn || greeting.dailyMessage || '').trim();
  const msgEn = (greeting.message_en || greeting.dailyMessageEn || '').trim();
  const specialBn = (
    greeting.special_message_bn ||
    greeting.specialMessage ||
    ''
  ).trim();
  const specialEn = (
    greeting.special_message_en ||
    greeting.specialMessageEn ||
    ''
  ).trim();
  const annBn = (greeting.announcement_bn || greeting.announcement || '').trim();
  const annEn = (greeting.announcement_en || greeting.announcementEn || '').trim();

  const raw: BilingualGreetingItem[] = [
    { bn: dateBn, en: dateEn },
    { bn: greetingBn, en: greetingEn },
    { bn: msgBn, en: msgEn },
    { bn: specialBn, en: specialEn },
    { bn: annBn, en: annEn },
  ];

  const items = raw
    .map((item) => {
      if (languageMode === 'bn') return { bn: item.bn || item.en, en: '' };
      if (languageMode === 'en') return { bn: '', en: item.en || item.bn };
      return item;
    })
    .filter((item) => item.bn.length > 0 || item.en.length > 0);

  return items.length > 0
    ? items
    : [
        { bn: dateBn, en: dateEn },
        { bn: 'আসসালামু আলাইকুম স্যার', en: 'Assalamu Alaikum, Sir' },
        { bn: 'আপনার দিনটা শুভ হোক', en: 'Wishing You a Wonderful Day' },
      ];
}

export function buildProductSearchHaystack(
  product: Product,
  categories: Category[] = []
): string {
  const t = getProductText(product, categories);
  return [
    product.name,
    product.nameBn,
    product.nameEn,
    product.name_bn,
    product.name_en,
    t.nameBn,
    t.nameEn,
    product.unit,
    product.priceUnit,
    product.shortDescription,
    product.shortDescriptionEn,
    product.short_description_bn,
    product.short_description_en,
    t.shortDescriptionBn,
    t.shortDescriptionEn,
    product.description,
    product.descriptionEn,
    product.description_bn,
    product.description_en,
    t.descriptionBn,
    t.descriptionEn,
    product.category,
    product.categoryName,
    product.categoryNameEn,
    t.categoryNameBn,
    t.categoryNameEn,
    product.productType,
    product.slug,
    ...(product.ingredients || []),
    ...(product.sizes || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
