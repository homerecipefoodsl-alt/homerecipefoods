export type OutletRegion =
  | 'khulshi-gec'
  | 'halishahar-agrabad'
  | 'chandgaon-chawkbazar'
  | 'kotwali-oxygen';

export interface OutletItem {
  id: string;
  nameBn: string;
  nameEn: string;
  type?: 'Office & Outlet';
  addressEn: string;
  addressBn: string;
  counterHoursEn: string;
  counterHoursBn: string;
  orderLineEn: string;
  orderLineBn: string;
  phone: string;
  mapsUrl: string;
  status: 'active';
  region: OutletRegion;
}

export const SHARED_OUTLET_HOURS = {
  counterHoursEn: 'Friday – Saturday · 8:00 AM – 10:00 PM',
  counterHoursBn: 'শুক্র–শনিবার · সকাল ৮:০০টা – রাত ১০:০০টা',
  orderLineEn: 'Daily · 8:00 AM – 7:00 PM',
  orderLineBn: 'প্রতিদিন · সকাল ৮:০০টা – সন্ধ্যা ৭:০০টা',
} as const;

export const OUTLET_REGION_FILTERS: Array<{
  id: 'all' | OutletRegion;
  labelBn: string;
  labelEn: string;
}> = [
  { id: 'all', labelBn: 'সবগুলো', labelEn: 'All' },
  { id: 'khulshi-gec', labelBn: 'খুলশী ও জিইসি', labelEn: 'Khulshi & GEC' },
  { id: 'halishahar-agrabad', labelBn: 'হালিশহর ও আগ্রাবাদ', labelEn: 'Halishahar & Agrabad' },
  { id: 'chandgaon-chawkbazar', labelBn: 'চান্দগাঁও ও চকবাজার', labelEn: 'Chandgaon & Chawkbazar' },
  { id: 'kotwali-oxygen', labelBn: 'কোতোয়ালী ও অক্সিজেন', labelEn: 'Kotwali & Oxygen' },
];

export const CHATTOGRAM_OUTLETS: readonly OutletItem[] = [
  {
    id: 'shah-garibullah-hs',
    nameBn: 'শাহ গরিবুল্লাহ H/S',
    nameEn: 'Shah Garibullah H/S',
    type: 'Office & Outlet',
    addressEn: '15/149 Shah Garibullah H/S Rd No: 01, Chattogram, Bangladesh',
    addressBn: '১৫/১৪৯ শাহ গরিবুল্লাহ H/S রোড নং-০১, চট্টগ্রাম, বাংলাদেশ',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801743890178',
    mapsUrl: 'https://maps.app.goo.gl/xxfq9EqgS86e9fLV9',
    status: 'active',
    region: 'khulshi-gec',
  },
  {
    id: 'kusumbagh-khulshi',
    nameBn: 'কুসুমবাগ, খুলশী',
    nameEn: 'KUSUMBAGH, KHULSHI',
    addressEn: 'Kusumbagh A/A, Road No. 01 Khulshi, Chittagong',
    addressBn: 'কুসুমবাগ A/A, রোড নং-০১, খুলশী, চট্টগ্রাম',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801329729252',
    mapsUrl: 'https://maps.app.goo.gl/XPWidcUc2NYRzmmC6',
    status: 'active',
    region: 'khulshi-gec',
  },
  {
    id: 'chandgoan-abasik',
    nameBn: 'চান্দগাঁও আবাসিক',
    nameEn: 'CHANDGOAN ABASIK',
    addressEn:
      'House-282, Chandgoan Abasik, Chandgaon Residential Area, Road-12, Block-B, Chandgoan, House-466 Rd No. 13, Chattogram 4212',
    addressBn:
      'হাউস-২৮২, চান্দগাঁও আবাসিক, চান্দগাঁও রেসিডেনশিয়াল এরিয়া, রোড-১২, ব্লক-B, চান্দগাঁও, হাউস-৪৬৬, রোড নং-১৩, চট্টগ্রাম ৪২১২',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801329729253',
    mapsUrl: 'https://maps.app.goo.gl/QNqRjMni9jSfDbdY7',
    status: 'active',
    region: 'chandgaon-chawkbazar',
  },
  {
    id: 'halishahar-boropol',
    nameBn: 'হালিশহর, বড়পোল',
    nameEn: 'HALISHAHAR, BOROPOL',
    addressEn: 'Halishahar Boropol, L Block, Gate No. 4, Halishahar, Chittagong',
    addressBn: 'হালিশহর বড়পোল, L ব্লক, গেট নং-৪, হালিশহর, চট্টগ্রাম',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801329729254',
    mapsUrl: 'https://maps.app.goo.gl/WFoUwcBB5de1264L9',
    status: 'active',
    region: 'halishahar-agrabad',
  },
  {
    id: 'halishahar-karnaphuli',
    nameBn: 'হালিশহর',
    nameEn: 'HALISHAHAR',
    addressEn: 'Karnaphuli A/A Block: K, Road No: 01, Halishahar, Chittagong',
    addressBn: 'কর্ণফুলী A/A, ব্লক-K, রোড নং-০১, হালিশহর, চট্টগ্রাম',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801329729255',
    mapsUrl: 'https://maps.app.goo.gl/BXvRGo8Zt1qKAEny8',
    status: 'active',
    region: 'halishahar-agrabad',
  },
  {
    id: 'south-khulshi',
    nameBn: 'সাউথ খুলশী',
    nameEn: 'South Khulshi',
    addressEn:
      'NR Garden, Road-1, Block: B, South Khulshi, Beside Mosjid, Khulshi, Chattogram 4000',
    addressBn:
      'NR Garden, রোড-১, ব্লক-B, সাউথ খুলশী, মসজিদের পাশে, খুলশী, চট্টগ্রাম ৪০০০',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801329729256',
    mapsUrl: 'https://maps.app.goo.gl/ewKoqQ9xi6nPRMUw8',
    status: 'active',
    region: 'khulshi-gec',
  },
  {
    id: 'mirzapool-sugandha',
    nameBn: 'মির্জাপুল, সুগন্ধা',
    nameEn: 'MIRZAPOOL, SUGANDHA',
    addressEn:
      'Al Arabia Hossain Tower, Opposite Ekushey Hospital, Mirzapur, Sugandha, Chittagong.',
    addressBn:
      'আল আরাবিয়া হোসাইন টাওয়ার, একুশে হাসপাতালের বিপরীতে, মির্জাপুর, সুগন্ধা, চট্টগ্রাম।',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801329729257',
    mapsUrl: 'https://maps.app.goo.gl/6zUzwkZn75id6Hhp6',
    status: 'active',
    region: 'khulshi-gec',
  },
  {
    id: 'gec-more',
    nameBn: 'জিইসি মোড়',
    nameEn: 'GEC MORE',
    addressEn: 'O.R. Nizam Road, Beside Well Food, G.E.C. More, Chittagong',
    addressBn: 'O.R. নিজাম রোড, Well Food-এর পাশে, G.E.C. মোড়, চট্টগ্রাম',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801329729258',
    mapsUrl: 'https://maps.app.goo.gl/NVMYdN2FQpfygdxw8',
    status: 'active',
    region: 'khulshi-gec',
  },
  {
    id: 'chawkbazar',
    nameBn: 'চকবাজার',
    nameEn: 'CHAWKBAZAR',
    addressEn: 'SMS Complex, College Road, Gulzar More, Chawkbazar, Chittagong',
    addressBn: 'SMS Complex, কলেজ রোড, গুলজার মোড়, চকবাজার, চট্টগ্রাম',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801329729259',
    mapsUrl: 'https://maps.app.goo.gl/R8tA1fM92SnJ5fs58',
    status: 'active',
    region: 'chandgaon-chawkbazar',
  },
  {
    id: 'cheragi-pahar-kotwali',
    nameBn: 'চেরাগী পাহাড়, কোতোয়ালী',
    nameEn: 'CHERAGI PAHAR, KOTWALI',
    addressEn:
      'Shah Anis Mosque Market Ground Floor 92, Momin Road, Cheragi Pahar, Kotwali, Chittagong',
    addressBn:
      'শাহ আনিস মসজিদ মার্কেট, গ্রাউন্ড ফ্লোর, ৯২, মোমিন রোড, চেরাগী পাহাড়, কোতোয়ালী, চট্টগ্রাম',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801329729260',
    mapsUrl: 'https://maps.app.goo.gl/2MovWjrCFxXyVP3x6',
    status: 'active',
    region: 'kotwali-oxygen',
  },
  {
    id: 'oxygen-more',
    nameBn: 'অক্সিজেন মোড়',
    nameEn: 'OXYGEN MORE',
    addressEn:
      'Bangabandhu Avenue, Sekander Center, Ground Floor of Prime Bank, Oxygen More, Chittagong',
    addressBn:
      'বঙ্গবন্ধু এভিনিউ, সেকান্দার সেন্টার, Prime Bank-এর গ্রাউন্ড ফ্লোর, অক্সিজেন মোড়, চট্টগ্রাম',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801329729261',
    mapsUrl: 'https://maps.app.goo.gl/xSyQquneEzY4Duqd6',
    status: 'active',
    region: 'kotwali-oxygen',
  },
  {
    id: 'kaptai-rastar-matha',
    nameBn: 'কাপ্তাই রাস্তার মাথা',
    nameEn: 'KAPTAI RASTAR MATHA',
    addressEn:
      'Azehar Chowdhury Center, Kaptai Rastar Matha, Mohra, Chandgaon, Chittagong',
    addressBn:
      'আজেহার চৌধুরী সেন্টার, কাপ্তাই রাস্তার মাথা, মোহরা, চান্দগাঁও, চট্টগ্রাম',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801332540092',
    mapsUrl: 'https://maps.app.goo.gl/FLVQXaFaBEhjSBiU6',
    status: 'active',
    region: 'chandgaon-chawkbazar',
  },
  {
    id: 'terry-bazar',
    nameBn: 'টেরি বাজার',
    nameEn: 'TERRY BAZAR',
    addressEn:
      'Opposite Mall 24, next to UCB Bank booth, Terry Bazar, Chittagong',
    addressBn: 'Mall 24-এর বিপরীতে, UCB Bank বুথের পাশে, টেরি বাজার, চট্টগ্রাম',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801332509505',
    mapsUrl: 'https://maps.app.goo.gl/SUJp9368yeLncJnQ6',
    status: 'active',
    region: 'kotwali-oxygen',
  },
  {
    id: 'kotwali',
    nameBn: 'কোতোয়ালী',
    nameEn: 'KOTWALI',
    addressEn:
      'No. 17, Shaheed Suhrawardy Road, Opposite Bangladesh Bank, Kotwali, Chittagong',
    addressBn:
      'নং-১৭, শহীদ সোহরাওয়ার্দী রোড, বাংলাদেশ ব্যাংকের বিপরীতে, কোতোয়ালী, চট্টগ্রাম',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801332540093',
    mapsUrl: 'https://maps.app.goo.gl/HEBciXhviM2oaSXg9',
    status: 'active',
    region: 'kotwali-oxygen',
  },
  {
    id: 'agrabad',
    nameBn: 'আগ্রাবাদ',
    nameEn: 'AGRABAD',
    addressEn:
      'Lucky Plaza Ground Floor, Next to Rupali Bank, Agrabad, Chittagong',
    addressBn:
      'Lucky Plaza, গ্রাউন্ড ফ্লোর, Rupali Bank-এর পাশে, আগ্রাবাদ, চট্টগ্রাম',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801332540094',
    mapsUrl: 'https://maps.app.goo.gl/P5cmxCq3aVQbpAwRA',
    status: 'active',
    region: 'halishahar-agrabad',
  },
  {
    id: 'halishahar-sajib-plaza',
    nameBn: 'হালিশহর',
    nameEn: 'HALISHAHAR',
    addressEn: '12/A. Sajib Plaza, Block #G, P.C Road Halishahar, Chittagong',
    addressBn: '১২/A, সাজিব প্লাজা, ব্লক-G, P.C রোড, হালিশহর, চট্টগ্রাম',
    counterHoursEn: SHARED_OUTLET_HOURS.counterHoursEn,
    counterHoursBn: SHARED_OUTLET_HOURS.counterHoursBn,
    orderLineEn: SHARED_OUTLET_HOURS.orderLineEn,
    orderLineBn: SHARED_OUTLET_HOURS.orderLineBn,
    phone: '+8801332540095',
    mapsUrl: 'https://maps.app.goo.gl/GdSDLqHJxCKsy4ng9',
    status: 'active',
    region: 'halishahar-agrabad',
  },
];

import type { Showroom } from '../types';

export function formatPhoneHref(phone: string): string {
  return `tel:${phone.replace(/\s+/g, '')}`;
}

export function getOutletSearchHaystack(outlet: OutletItem): string {
  return [
    outlet.nameBn,
    outlet.nameEn,
    outlet.type || '',
    outlet.addressBn,
    outlet.addressEn,
    outlet.phone,
  ]
    .join(' ')
    .toLowerCase();
}

export const CONFIRMED_DEMO_SHOWROOM_IDS: ReadonlySet<string> = new Set([
  'showroom-dhanmondi',
  'showroom-banani',
  'showroom-uttara',
  'showroom-chattogram',
]);

const DEMO_PHONE_SET: ReadonlySet<string> = new Set([
  '+8801711004411',
  '+8801711004422',
  '+8801711004433',
  '+8801711004444',
  '+8801700000000',
]);

export function isDemoOrDummyShowroom(sr: Partial<Showroom> | null | undefined): boolean {
  if (!sr) return true;
  const rawId = String(sr.id || '').trim().toLowerCase();
  if (rawId && CONFIRMED_DEMO_SHOWROOM_IDS.has(rawId)) return true;
  if (rawId && /^(demo|dummy|sample|test|placeholder)[-_]/.test(rawId)) return true;
  if (rawId && /[-_](demo|dummy|sample|test|placeholder)$/.test(rawId)) return true;

  const cleanPhone = String(sr.phone || '').replace(/[\s\-()]/g, '');
  if (cleanPhone && DEMO_PHONE_SET.has(cleanPhone)) return true;

  const combinedText = [
    sr.name,
    sr.nameEn,
    sr.name_bn,
    sr.name_en,
    sr.area,
    sr.areaEn,
    sr.address,
    sr.addressEn,
    sr.address_bn,
    sr.address_en,
  ]
    .filter(Boolean)
    .join(' ');

  if (
    /\b(demo\s+showroom|demo\s+outlet|dummy\s+showroom|dummy\s+outlet|sample\s+showroom|sample\s+outlet|test\s+showroom|test\s+outlet|placeholder\s+showroom)\b/i.test(
      combinedText
    )
  ) {
    return true;
  }

  if (
    /ধানমন্ডি শোরুম|বনানী শোরুম|উত্তরা সেক্টর ৭ শোরুম|নাসিরাবাদ শোরুম \(চট্টগ্রাম\)|Dhanmondi Showroom \(Flagship\)|Banani Showroom|Uttara Sector 7 Showroom|Nasirabad Showroom \(Chattogram\)|Satmasjid Road, Dhanmondi|Plot 68, Road 11, Block F, Banani|Gareeb-e-Newaz Avenue, Sector 7, Uttara|GEC Circle Plaza, CDA Avenue, Nasirabad/i.test(
      combinedText
    )
  ) {
    return true;
  }

  return false;
}

export function outletItemToShowroom(outlet: OutletItem, displayOrder: number): Showroom {
  const typeLabel = outlet.type || '';
  return {
    id: outlet.id,
    name: outlet.nameBn,
    nameEn: outlet.nameEn,
    name_bn: outlet.nameBn,
    name_en: outlet.nameEn,
    area: outlet.nameBn,
    areaEn: outlet.nameEn,
    address: outlet.addressBn,
    addressEn: outlet.addressEn,
    address_bn: outlet.addressBn,
    address_en: outlet.addressEn,
    description: typeLabel,
    descriptionEn: typeLabel,
    description_bn: typeLabel,
    description_en: typeLabel,
    phone: outlet.phone,
    openingHours: outlet.counterHoursBn,
    openingHoursEn: outlet.counterHoursEn,
    mapUrl: outlet.mapsUrl,
    lat: 0,
    lng: 0,
    isMain: outlet.id === 'shah-garibullah-hs',
    visible: outlet.status === 'active',
    deleted: false,
    display_order: displayOrder,
  };
}

export const CANONICAL_OUTLET_SHOWROOMS: Showroom[] = CHATTOGRAM_OUTLETS.map((outlet, idx) =>
  outletItemToShowroom(outlet, idx + 1)
);

