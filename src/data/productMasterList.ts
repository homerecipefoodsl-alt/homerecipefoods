import { ASSET_KEYS } from '../lib/assets';
import { toSlug } from '../lib/utils';
import type { Category } from '../types';

export interface RawMasterProductRow {
  nameBn: string;
  nameEn: string;
  category: string;
  unit: string;
  price: number;
}

export interface MasterProductEntry {
  id: string;
  slug: string;
  masterKey: string;
  nameBn: string;
  nameEn: string;
  categoryBn: string;
  categorySlug: string;
  categoryNameEn: string;
  unit: string;
  price: number;
  displayOrder: number;
}

export interface MasterCategoryDefinition {
  categoryBn: string;
  slug: string;
  nameEn: string;
  aliasesBn: string[];
  aliasesEn: string[];
}

export const MAHALLABIA_CATEGORY: Category = {
  id: 'cat-mahallabia',
  name: 'মাহাল্লাবিয়া',
  nameEn: 'Mahallabia',
  name_bn: 'মাহাল্লাবিয়া',
  name_en: 'Mahallabia',
  slug: 'mahallabia',
  description: 'ঐতিহ্যবাহী ক্রিমি মাহাল্লাবিয়া ও পুডিং—প্রতিদিন তাজা ও ঠান্ডা পরিবেশনযোগ্য।',
  descriptionEn: 'Traditional creamy Mahallabia and caramel pudding crafted fresh daily.',
  description_bn: 'ঐতিহ্যবাহী ক্রিমি মাহাল্লাবিয়া ও পুডিং—প্রতিদিন তাজা ও ঠান্ডা পরিবেশনযোগ্য।',
  description_en: 'Traditional creamy Mahallabia and caramel pudding crafted fresh daily.',
  image: ASSET_KEYS.catSpecialSweets,
  order: 10,
  visible: true,
  deleted: false,
};

export const MASTER_CATEGORY_DEFINITIONS: MasterCategoryDefinition[] = [
  {
    categoryBn: 'ফাস্ট ফুড',
    slug: 'fast-food',
    nameEn: 'Fast Food',
    aliasesBn: ['ফাস্ট ফুড', 'ফাস্টফুড'],
    aliasesEn: ['fast food', 'fast-food'],
  },
  {
    categoryBn: 'ব্রেড',
    slug: 'bread',
    nameEn: 'Bread',
    aliasesBn: ['ব্রেড'],
    aliasesEn: ['bread'],
  },
  {
    categoryBn: 'পেস্ট্রি',
    slug: 'pastry',
    nameEn: 'Pastry',
    aliasesBn: ['পেস্ট্রি'],
    aliasesEn: ['pastry'],
  },
  {
    categoryBn: 'ফ্রিজ আইটেম',
    slug: 'frozen-items',
    nameEn: 'Frozen Items',
    aliasesBn: ['ফ্রিজ আইটেম', 'ফ্রোজেন আইটেম'],
    aliasesEn: ['frozen items', 'frozen-items'],
  },
  {
    categoryBn: 'মাহাল্লাবিয়া',
    slug: 'mahallabia',
    nameEn: 'Mahallabia',
    aliasesBn: ['মাহাল্লাবিয়া', 'মাহাল্লাবিয়া'],
    aliasesEn: ['mahallabia'],
  },
  {
    categoryBn: 'স্পেশাল মিষ্টি',
    slug: 'special-sweets',
    nameEn: 'Special Sweets',
    aliasesBn: ['স্পেশাল মিষ্টি', 'স্পেশ্যাল মিষ্টি'],
    aliasesEn: ['special sweets', 'special-sweets'],
  },
  {
    categoryBn: 'ড্রাই মিষ্টি',
    slug: 'dry-sweets',
    nameEn: 'Dry Sweets',
    aliasesBn: ['ড্রাই মিষ্টি'],
    aliasesEn: ['dry sweets', 'dry-sweets'],
  },
  {
    categoryBn: 'কুকিজ',
    slug: 'cookies',
    nameEn: 'Cookies',
    aliasesBn: ['কুকিজ'],
    aliasesEn: ['cookies'],
  },
];

const EXISTING_SEED_SLUGS = new Set<string>([
  'chicken-burger',
  'chicken-pizza',
  'french-fries',
  'milk-bread',
  'sandwich-bread',
  'chocolate-pastry',
  'vanilla-pastry',
  'frozen-samosa',
  'frozen-spring-roll',
  'special-rasmalai',
  'premium-kalo-jam',
  'dry-laddu',
  'dry-pera',
  'chocolate-cookies',
  'butter-cookies',
  'chocolate-cake',
  'red-velvet-cake',
  'birthday-custom-cake',
  'premium-akd-box',
  'luxury-akd-box',
]);

export function normalizeMasterText(value: string | undefined | null): string {
  return (value ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function resolveMasterCategoryDef(categoryInput: string): MasterCategoryDefinition {
  const norm = normalizeMasterText(categoryInput);
  const found = MASTER_CATEGORY_DEFINITIONS.find(
    (def) =>
      def.slug === norm ||
      def.aliasesBn.some((a) => normalizeMasterText(a) === norm) ||
      def.aliasesEn.some((a) => normalizeMasterText(a) === norm)
  );
  return (
    found ?? {
      categoryBn: categoryInput.trim(),
      slug: toSlug(categoryInput),
      nameEn: categoryInput.trim(),
      aliasesBn: [categoryInput.trim()],
      aliasesEn: [categoryInput.trim().toLowerCase()],
    }
  );
}

export function buildProductMatchKey(
  nameBn: string,
  nameEn: string,
  categorySlug: string,
  unit: string
): string {
  return [
    normalizeMasterText(nameBn),
    normalizeMasterText(nameEn),
    normalizeMasterText(categorySlug),
    normalizeMasterText(unit),
  ].join('|');
}

const RAW_PRODUCT_MASTER_ROWS: RawMasterProductRow[] = [
  // ফাস্ট ফুড (21)
  { nameBn: 'চিকেন বার্গার', nameEn: 'Chicken Burger', category: 'ফাস্ট ফুড', unit: 'Piece', price: 50 },
  { nameBn: 'চিকেন হট', nameEn: 'Chicken Hot', category: 'ফাস্ট ফুড', unit: 'Piece', price: 40 },
  { nameBn: 'চিকেন স্যান্ডউইচ', nameEn: 'Chicken Sandwich', category: 'ফাস্ট ফুড', unit: 'Piece', price: 45 },
  { nameBn: 'চিকেন পিজ্জা', nameEn: 'Chicken Pizza', category: 'ফাস্ট ফুড', unit: 'Piece', price: 55 },
  { nameBn: 'চিকেন বান', nameEn: 'Chicken Bun', category: 'ফাস্ট ফুড', unit: 'Piece', price: 55 },
  { nameBn: 'চিকেন সমুচা', nameEn: 'Chicken Samosa', category: 'ফাস্ট ফুড', unit: 'Piece', price: 20 },
  { nameBn: 'চিকেন ফ্রাইড বার্গার', nameEn: 'Chicken Fried Burger', category: 'ফাস্ট ফুড', unit: 'Piece', price: 70 },
  { nameBn: 'চিকেন নান', nameEn: 'Chicken Naan', category: 'ফাস্ট ফুড', unit: 'Piece', price: 55 },
  { nameBn: 'চিকেন মেরিন স্যান্ডউইচ', nameEn: 'Chicken Marin Sandwich', category: 'ফাস্ট ফুড', unit: 'Piece', price: 55 },
  { nameBn: 'চিকেন সালাদ স্যান্ডউইচ', nameEn: 'Chicken Salad Sandwich', category: 'ফাস্ট ফুড', unit: 'Piece', price: 55 },
  { nameBn: 'চিকেন সালাদ বার্গার', nameEn: 'Chicken Salad Burger', category: 'ফাস্ট ফুড', unit: 'Piece', price: 0 },
  { nameBn: 'চিকেন বল কাবাব', nameEn: 'Chicken Ball Kebab', category: 'ফাস্ট ফুড', unit: 'Piece', price: 0 },
  { nameBn: 'হাওয়াই চিজ বার্গার', nameEn: 'Hawaiian Cheese Burger', category: 'ফাস্ট ফুড', unit: 'Piece', price: 40 },
  { nameBn: 'মিট লোফ', nameEn: 'Meat Loaf', category: 'ফাস্ট ফুড', unit: 'Piece', price: 65 },
  { nameBn: 'বিফ টানুবার', nameEn: 'Beef Tanubar', category: 'ফাস্ট ফুড', unit: 'Piece', price: 45 },
  { nameBn: 'চকোলেট ডোনাট', nameEn: 'Chocolate Donut', category: 'ফাস্ট ফুড', unit: 'Piece', price: 35 },
  { nameBn: 'ক্লাব স্যান্ডউইচ', nameEn: 'Club Sandwich', category: 'ফাস্ট ফুড', unit: 'Piece', price: 80 },
  { nameBn: 'ফ্যামিলি পিজ্জা', nameEn: 'Family Pizza', category: 'ফাস্ট ফুড', unit: 'Piece', price: 85 },
  { nameBn: 'চিকেন মার্জিন', nameEn: 'Chicken Margin', category: 'ফাস্ট ফুড', unit: 'Piece', price: 25 },
  { nameBn: 'ভেজিটেবল পাফ', nameEn: 'Vegetable Puff', category: 'ফাস্ট ফুড', unit: 'Piece', price: 20 },
  { nameBn: 'চিকেন চিজ রোল', nameEn: 'Chicken Cheese Roll', category: 'ফাস্ট ফুড', unit: 'Piece', price: 20 },

  // ব্রেড (15)
  { nameBn: 'চিকেন পরোটা', nameEn: 'Chicken Paratha', category: 'ব্রেড', unit: 'Piece', price: 70 },
  { nameBn: 'স্যান্ডউইচ ব্রেড', nameEn: 'Sandwich Bread', category: 'ব্রেড', unit: 'Piece', price: 75 },
  { nameBn: 'হোয়াইট ব্রেড', nameEn: 'White Bread', category: 'ব্রেড', unit: 'Piece', price: 50 },
  { nameBn: 'কাস্টার্ড ব্রেড', nameEn: 'Custard Bread', category: 'ব্রেড', unit: 'Piece', price: 75 },
  { nameBn: 'ফ্রুট মাসালা ব্রেড', nameEn: 'Fruit Masala Bread', category: 'ব্রেড', unit: 'Piece', price: 80 },
  { nameBn: 'পটেটো ব্রেড', nameEn: 'Potato Bread', category: 'ব্রেড', unit: 'Piece', price: 60 },
  { nameBn: 'ক্রিম বান', nameEn: 'Cream Bun', category: 'ব্রেড', unit: 'Piece', price: 25 },
  { nameBn: 'প্লেইন বান', nameEn: 'Plain Bun', category: 'ব্রেড', unit: 'Piece', price: 20 },
  { nameBn: 'চকোলেট ক্রিম বান', nameEn: 'Chocolate Cream Bun', category: 'ব্রেড', unit: 'Piece', price: 30 },
  { nameBn: 'প্লেইন কেক', nameEn: 'Plain Cake', category: 'ব্রেড', unit: 'Piece', price: 250 },
  { nameBn: 'ফ্রুট কেক', nameEn: 'Fruit Cake', category: 'ব্রেড', unit: 'Piece', price: 260 },
  { nameBn: 'চকোলেট কেক', nameEn: 'Chocolate Cake', category: 'ব্রেড', unit: 'Piece', price: 260 },
  { nameBn: 'পটেটো পিজ্জা', nameEn: 'Potato Pizza', category: 'ব্রেড', unit: 'Piece', price: 60 },
  { nameBn: 'বার্গার বান', nameEn: 'Burger Bun', category: 'ব্রেড', unit: 'Packets', price: 65 },
  { nameBn: 'হট বন', nameEn: 'Hot Bun', category: 'ব্রেড', unit: 'Packets', price: 65 },

  // পেস্ট্রি (21)
  { nameBn: 'চকলেট ট্রাফল কেক', nameEn: 'Chocolate Truffle Cake', category: 'পেস্ট্রি', unit: 'Piece', price: 130 },
  { nameBn: 'চকলেট পেস্ট্রি – বড়', nameEn: 'Chocolate Pastry – Large', category: 'পেস্ট্রি', unit: 'Piece', price: 60 },
  { nameBn: 'রেড কেক – ছোট', nameEn: 'Ready Cake – Small', category: 'পেস্ট্রি', unit: '1 Pound', price: 580 },
  { nameBn: 'রেড কেক – মাঝারি', nameEn: 'Ready Cake – Medium', category: 'পেস্ট্রি', unit: '1.5 Pound', price: 880 },
  { nameBn: 'রেডি কেক – বড়', nameEn: 'Ready Cake – Large', category: 'পেস্ট্রি', unit: '2 Pound', price: 1160 },
  { nameBn: 'মুস কেক কাপ', nameEn: 'Mousse Cake Cup', category: 'পেস্ট্রি', unit: 'Cup', price: 45 },
  { nameBn: 'ব্ল্যাক ফরেস্ট পেস্ট্রি', nameEn: 'Black Forest Pastry', category: 'পেস্ট্রি', unit: 'Piece', price: 60 },
  { nameBn: 'রেড ভেলভেট পেস্ট্রি', nameEn: 'Red Velvet Pastry', category: 'পেস্ট্রি', unit: 'Piece', price: 75 },
  { nameBn: 'রেড ভেলভেট – ছোট', nameEn: 'Red Velvet – Small', category: 'পেস্ট্রি', unit: '1 Pounds', price: 720 },
  { nameBn: 'রেড ভেলভেট – মাঝারি', nameEn: 'Red Velvet – Medium', category: 'পেস্ট্রি', unit: '1.5 Pounds', price: 1080 },
  { nameBn: 'চকলেট ব্রাউনি', nameEn: 'Chocolate Brownie', category: 'পেস্ট্রি', unit: 'Piece', price: 50 },
  { nameBn: 'মাড পেস্ট্রি', nameEn: 'Mud Pastry', category: 'পেস্ট্রি', unit: 'Piece', price: 75 },
  { nameBn: 'মাড কেক – ছোট', nameEn: 'Mud Cake – Small', category: 'পেস্ট্রি', unit: 'Pounds', price: 720 },
  { nameBn: 'চকলেট জার', nameEn: 'Chocolate Jar', category: 'পেস্ট্রি', unit: 'Jar', price: 100 },
  { nameBn: 'রেইনবো জার', nameEn: 'Rainbow Jar', category: 'পেস্ট্রি', unit: 'Jar', price: 120 },
  { nameBn: 'ভ্যানিলা পেস্ট্রি', nameEn: 'Vanilla Pastry', category: 'পেস্ট্রি', unit: 'Piece', price: 60 },
  { nameBn: 'স্ট্রবেরি মুস', nameEn: 'Strawberry Mousse', category: 'পেস্ট্রি', unit: 'Cup', price: 40 },
  { nameBn: 'চকলেট টার্ট', nameEn: 'Chocolate Tart', category: 'পেস্ট্রি', unit: 'Piece', price: 50 },
  { nameBn: 'মাফিন কেক', nameEn: 'Muffin Cake', category: 'পেস্ট্রি', unit: 'Piece', price: 35 },
  { nameBn: 'ম্যাংগো জার', nameEn: 'Mango Jar', category: 'পেস্ট্রি', unit: 'Jar', price: 110 },
  { nameBn: 'ট্রিপল বিসকফ', nameEn: 'Triple Biscoff', category: 'পেস্ট্রি', unit: 'Piece', price: 80 },

  // ফ্রিজ আইটেম (14)
  { nameBn: 'স্পেশাল দই কাপ', nameEn: 'Special Doi Cup', category: 'ফ্রিজ আইটেম', unit: 'Cup', price: 45 },
  { nameBn: 'ক্ষীর মোহন কাপ', nameEn: 'Kheer Mohon Cup', category: 'ফ্রিজ আইটেম', unit: 'Cup', price: 50 },
  { nameBn: 'স্পেশাল দই', nameEn: 'Special Doi', category: 'ফ্রিজ আইটেম', unit: 'Kg', price: 350 },
  { nameBn: 'ছানার মালাই', nameEn: 'Chanar Malai', category: 'ফ্রিজ আইটেম', unit: 'Kg', price: 500 },
  { nameBn: 'রসমালাই', nameEn: 'Rasmalai', category: 'ফ্রিজ আইটেম', unit: 'Kg', price: 460 },
  { nameBn: 'রসমালাই (হাফ কেজি)', nameEn: 'Rasmalai (Half Kg)', category: 'ফ্রিজ আইটেম', unit: 'Half Kg', price: 230 },
  { nameBn: 'মিষ্টি দই', nameEn: 'Mishti Doi', category: 'ফ্রিজ আইটেম', unit: 'Kg', price: 330 },
  { nameBn: 'মিষ্টি দই (হাফ কেজি)', nameEn: 'Mishti Doi (Half Kg)', category: 'ফ্রিজ আইটেম', unit: 'Half Kg', price: 165 },
  { nameBn: 'মালাই রোল', nameEn: 'Malai Roll', category: 'ফ্রিজ আইটেম', unit: 'Kg', price: 470 },
  { nameBn: 'টক দই', nameEn: 'Tok Doi', category: 'ফ্রিজ আইটেম', unit: 'Kg', price: 120 },
  { nameBn: 'স্পঞ্জ', nameEn: 'Sponge', category: 'ফ্রিজ আইটেম', unit: 'Kg', price: 360 },
  { nameBn: 'গাজর হালুয়া (কাপ)', nameEn: 'Gajar Halwa (Cup)', category: 'ফ্রিজ আইটেম', unit: 'Cup', price: 40 },
  { nameBn: 'গাজর হালুয়া (হাফ কেজি)', nameEn: 'Gajar Halwa (Half Kg)', category: 'ফ্রিজ আইটেম', unit: 'Half Kg', price: 210 },
  { nameBn: 'গাজর হালুয়া (কেজি)', nameEn: 'Gajar Halwa (Kg)', category: 'ফ্রিজ আইটেম', unit: 'Kg', price: 420 },

  // মাহাল্লাবিয়া (4)
  { nameBn: 'পুডিং', nameEn: 'Pudding', category: 'মাহাল্লাবিয়া', unit: 'Piece', price: 180 },
  { nameBn: 'মাহাল্লাবিয়া (কাপ)', nameEn: 'Mahallabia (Cup)', category: 'মাহাল্লাবিয়া', unit: 'Cup', price: 40 },
  { nameBn: 'মাহাল্লাবিয়া (হাফ কেজি)', nameEn: 'Mahallabia (Half Kg)', category: 'মাহাল্লাবিয়া', unit: 'Half Kg', price: 230 },
  { nameBn: 'মাহাল্লাবিয়া (১ কেজি)', nameEn: 'Mahallabia (1 Kg)', category: 'মাহাল্লাবিয়া', unit: 'Kg', price: 450 },

  // স্পেশাল মিষ্টি (15)
  { nameBn: 'আদি রস গোল্লা', nameEn: 'Adi Rosh Golla', category: 'স্পেশাল মিষ্টি', unit: 'Kg', price: 420 },
  { nameBn: 'সাদা মিষ্টি', nameEn: 'Sada Mistry', category: 'স্পেশাল মিষ্টি', unit: 'Kg', price: 350 },
  { nameBn: 'লাল/কালো জাম', nameEn: 'Lal/Kalo Jam', category: 'স্পেশাল মিষ্টি', unit: 'Kg', price: 350 },
  { nameBn: 'ছানার মঞ্জুরী', nameEn: 'Chanar Monjuri', category: 'স্পেশাল মিষ্টি', unit: 'Kg', price: 460 },
  { nameBn: 'বেবি চমচম', nameEn: 'Baby Chomchom', category: 'স্পেশাল মিষ্টি', unit: 'Kg', price: 430 },
  { nameBn: 'S.P. চমচম', nameEn: 'S.P. Chomchom', category: 'স্পেশাল মিষ্টি', unit: 'Kg', price: 410 },
  { nameBn: 'সন্দেশ', nameEn: 'Sandesh', category: 'স্পেশাল মিষ্টি', unit: 'Kg', price: 570 },
  { nameBn: 'কাঁচা গোল্লা', nameEn: 'Kacha Golla', category: 'স্পেশাল মিষ্টি', unit: 'Kg', price: 580 },
  { nameBn: 'সাদা চমচম', nameEn: 'Sada Chomchom', category: 'স্পেশাল মিষ্টি', unit: 'Kg', price: 460 },
  { nameBn: 'ক্ষীর মোহন', nameEn: 'Kheer Mohon', category: 'স্পেশাল মিষ্টি', unit: 'Kg', price: 720 },
  { nameBn: 'S. ক্ষীর বালুশাই', nameEn: 'S. Kheer Balushai', category: 'স্পেশাল মিষ্টি', unit: 'Kg', price: 670 },
  { nameBn: 'ক্রিম জাম', nameEn: 'Cream Jam', category: 'স্পেশাল মিষ্টি', unit: 'Kg', price: 400 },
  { nameBn: 'চকলেট সুইটস পেস্ট্রি', nameEn: 'Chocolate Sweets Pastry', category: 'স্পেশাল মিষ্টি', unit: 'Kg', price: 720 },
  { nameBn: 'জাফরান ভোগ', nameEn: 'Jafran Bhog', category: 'স্পেশাল মিষ্টি', unit: 'Kg', price: 660 },
  { nameBn: 'কাশ্মীরি সুইটস', nameEn: 'Kashmiri Sweets', category: 'স্পেশাল মিষ্টি', unit: 'Kg', price: 400 },

  // ড্রাই মিষ্টি (19)
  { nameBn: 'কাশ্মীরি লাড্ডু', nameEn: 'Kashmiri Laddu', category: 'ড্রাই মিষ্টি', unit: 'Kg', price: 340 },
  { nameBn: 'মতি লাড্ডু', nameEn: 'Moti Laddu', category: 'ড্রাই মিষ্টি', unit: 'Kg', price: 320 },
  { nameBn: 'মাওয়া লাড্ডু', nameEn: 'Mawa Laddu', category: 'ড্রাই মিষ্টি', unit: 'Kg', price: 340 },
  { nameBn: 'মুম্বাই লাড্ডু', nameEn: 'Mumbai Laddu', category: 'ড্রাই মিষ্টি', unit: 'Kg', price: 360 },
  { nameBn: 'বালুশাই', nameEn: 'Balushai', category: 'ড্রাই মিষ্টি', unit: 'Kg', price: 330 },
  { nameBn: 'মাসকাট হালুয়া', nameEn: 'Maskut Halwa', category: 'ড্রাই মিষ্টি', unit: 'Kg', price: 350 },
  { nameBn: 'দানাদার বরফি', nameEn: 'Danadar Barfi', category: 'ড্রাই মিষ্টি', unit: 'Kg', price: 350 },
  { nameBn: 'ক্ষীর পেড়া', nameEn: 'Kheer Pera', category: 'ড্রাই মিষ্টি', unit: 'Kg', price: 520 },
  { nameBn: 'চেরি স্যান্ডউইচ', nameEn: 'Cherry Sendwich', category: 'ড্রাই মিষ্টি', unit: 'Kg', price: 460 },
  { nameBn: 'ক্রিম লাড্ডু', nameEn: 'Cream Laddu', category: 'ড্রাই মিষ্টি', unit: 'Kg', price: 390 },
  { nameBn: 'চকলেট টফি', nameEn: 'Chocolate Toffee', category: 'ড্রাই মিষ্টি', unit: 'Kg', price: 460 },
  { nameBn: 'হাফসি হালুয়া', nameEn: 'Hafsi Halwa', category: 'ড্রাই মিষ্টি', unit: 'Kg', price: 450 },
  { nameBn: 'হাজারী জিলাপি', nameEn: 'Hazari Jilapi', category: 'ড্রাই মিষ্টি', unit: 'Kg', price: 350 },
  { nameBn: 'নরমাল নিমকি', nameEn: 'Normal Nimki', category: 'ড্রাই মিষ্টি', unit: 'Packet', price: 120 },
  { nameBn: 'S নিমকি', nameEn: 'S Nimki', category: 'ড্রাই মিষ্টি', unit: 'Packet', price: 100 },
  { nameBn: 'ঝাল নিমকি', nameEn: 'Jhal Nimki', category: 'ড্রাই মিষ্টি', unit: 'Packet', price: 100 },
  { nameBn: 'ঝাল সিপস্', nameEn: 'Jhal Chips', category: 'ড্রাই মিষ্টি', unit: 'Packet', price: 50 },
  { nameBn: 'পটেটো চানাচুর', nameEn: 'Potato Chanachur', category: 'ড্রাই মিষ্টি', unit: 'Packet', price: 120 },
  { nameBn: 'মুড়ালি', nameEn: 'Murali', category: 'ড্রাই মিষ্টি', unit: 'Packet', price: 120 },

  // কুকিজ (27)
  { nameBn: 'বেলা', nameEn: 'Bella', category: 'কুকিজ', unit: 'Box', price: 100 },
  { nameBn: 'বাটার টোস্ট', nameEn: 'Butter Toast', category: 'কুকিজ', unit: 'Packet', price: 70 },
  { nameBn: 'প্লেইন টোস্ট', nameEn: 'Plain Toast', category: 'কুকিজ', unit: 'Packet', price: 65 },
  { nameBn: 'ঝাল টোস্ট', nameEn: 'Jhal Toast', category: 'কুকিজ', unit: 'Packet', price: 65 },
  { nameBn: 'ঘি সুগার টোস্ট', nameEn: 'Gi Sugar Toast', category: 'কুকিজ', unit: 'Packet', price: 70 },
  { nameBn: 'রোজ টোস্ট', nameEn: 'Rose Toast', category: 'কুকিজ', unit: 'Packet', price: 90 },
  { nameBn: 'মিল্ক কুকিজ', nameEn: 'Milk Cookies', category: 'কুকিজ', unit: 'Box', price: 135 },
  { nameBn: 'মিল্ক সল্ট', nameEn: 'Milk Salt', category: 'কুকিজ', unit: 'Box', price: 130 },
  { nameBn: 'তিল কুকিজ', nameEn: 'Til Cookies', category: 'কুকিজ', unit: 'Box', price: 135 },
  { nameBn: 'ভ্যানিলা কুকিজ', nameEn: 'Vanilla Cookies', category: 'কুকিজ', unit: 'Box', price: 130 },
  { nameBn: 'ভ্যানিলা চকলেট', nameEn: 'Vanilla Chocolate', category: 'কুকিজ', unit: 'Box', price: 130 },
  { nameBn: 'কোকোনাট কুকিজ', nameEn: 'Coconut Cookies', category: 'কুকিজ', unit: 'Box', price: 130 },
  { nameBn: 'নিমকি কুকিজ', nameEn: 'Nimki Cookies', category: 'কুকিজ', unit: 'Box', price: 130 },
  { nameBn: 'সুগার ফ্রি কুকিজ', nameEn: 'Sugar Free Cookies', category: 'কুকিজ', unit: 'Box', price: 175 },
  { nameBn: 'কাপ কেক', nameEn: 'Cup Cake', category: 'কুকিজ', unit: 'Piece', price: 15 },
  { nameBn: 'চকলেট লাভা কেক', nameEn: 'Chocolate Lava Cake', category: 'কুকিজ', unit: 'Per Cup', price: 40 },
  { nameBn: 'মিল্ক কুকিজ', nameEn: 'Milk Cookies', category: 'কুকিজ', unit: 'Special Box', price: 170 },
  { nameBn: 'মিল্ক সল্ট', nameEn: 'Milk Salt', category: 'কুকিজ', unit: 'Special Box', price: 165 },
  { nameBn: 'তিল কুকিজ', nameEn: 'Til Cookies', category: 'কুকিজ', unit: 'Special Box', price: 175 },
  { nameBn: 'ভ্যানিলা কুকিজ', nameEn: 'Vanilla Cookies', category: 'কুকিজ', unit: 'Special Box', price: 175 },
  { nameBn: 'ভ্যানিলা চকোলেট', nameEn: 'Vanilla Chocolate', category: 'কুকিজ', unit: 'Special Box', price: 175 },
  { nameBn: 'কোকোনাট কুকিজ', nameEn: 'Coconut Cookies', category: 'কুকিজ', unit: 'Special Box', price: 170 },
  { nameBn: 'চকোলেট চিপস', nameEn: 'Chocolate Chips', category: 'কুকিজ', unit: 'Special Box', price: 185 },
  { nameBn: 'চকোলেট সিসাম', nameEn: 'Chocolate Sesame', category: 'কুকিজ', unit: 'Special Box', price: 185 },
  { nameBn: 'নিমকি কুকিজ', nameEn: 'Nimki Cookies', category: 'কুকিজ', unit: 'Special Box', price: 170 },
  { nameBn: 'ড্রাই কেক', nameEn: 'Dry Cake', category: 'কুকিজ', unit: 'Special Box', price: 190 },
  { nameBn: 'চকোলেট ড্রাই কেক', nameEn: 'Chocolate Dry Cake', category: 'কুকিজ', unit: 'Special Box', price: 195 },
];

const usedSlugs = new Set<string>(EXISTING_SEED_SLUGS);
const usedIds = new Set<string>();

export const PRODUCT_MASTER_LIST: MasterProductEntry[] = RAW_PRODUCT_MASTER_ROWS.map(
  (row, index) => {
    const catDef = resolveMasterCategoryDef(row.category);
    const baseSlug = toSlug(row.nameEn);
    const unitSlug = toSlug(row.unit);

    let candidateSlug = `${baseSlug}-${unitSlug}`;
    if (!usedSlugs.has(baseSlug)) {
      candidateSlug = baseSlug;
    } else if (usedSlugs.has(candidateSlug)) {
      let counter = 2;
      while (usedSlugs.has(`${candidateSlug}-${counter}`)) {
        counter += 1;
      }
      candidateSlug = `${candidateSlug}-${counter}`;
    }
    usedSlugs.add(candidateSlug);

    let candidateId = `pm-${candidateSlug}`.slice(0, 128);
    if (usedIds.has(candidateId)) {
      candidateId = `pm-${index + 1}-${candidateSlug}`.slice(0, 128);
    }
    usedIds.add(candidateId);

    const masterKey = buildProductMatchKey(row.nameBn, row.nameEn, catDef.slug, row.unit);

    return {
      id: candidateId,
      slug: candidateSlug,
      masterKey,
      nameBn: row.nameBn,
      nameEn: row.nameEn,
      categoryBn: row.category,
      categorySlug: catDef.slug,
      categoryNameEn: catDef.nameEn,
      unit: row.unit,
      price: row.price,
      displayOrder: 100 + index + 1,
    };
  }
);
