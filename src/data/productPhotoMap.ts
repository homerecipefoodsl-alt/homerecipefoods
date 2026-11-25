function normalizeLookupKey(value: string | undefined | null): string {
  return (value ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const STUDIO_PHOTOS_BY_NAME_EN: Record<string, string[]> = {
  // Fast Food
  'chicken burger': ['/assets/aistudio/Chicken_Burger_4a482001.jpg'],
  'chicken hot': ['/assets/aistudio/Chicken_Hot_95598dd1.jpg'],
  'chicken sandwich': ['/assets/aistudio/Chicken_Sendwich_428bb755.jpg'],
  'chicken pizza': ['/assets/aistudio/Chicken_Pizza_5e9d6eec.jpg'],
  'chicken bun': ['/assets/aistudio/Chicken_Bun_8dc178d4.jpg'],
  'chicken samosa': ['/assets/aistudio/Chicken_Samusa_5cb287a9.jpg'],
  'chicken fried burger': ['/assets/aistudio/Chicken_Fried_Burger_da00b8c8.jpg'],
  'chicken naan': ['/assets/aistudio/Chicken_Nan_e050dcfb.jpg'],
  'chicken marin sandwich': ['/assets/aistudio/Chicken_Merin_Sandwich_5e8e1ec3.jpg'],
  'chicken salad sandwich': ['/assets/aistudio/Chicken_Salad_Sandwich_1d1aeb8d.jpg'],
  'hawaiian cheese burger': ['/assets/aistudio/Beef_Hawaiian_Cheese_Burger_b6a82269.jpg'],
  'meat loaf': ['/assets/aistudio/Beef_Meat_Loaf_03dc85b5.jpg'],
  'beef tanubar': ['/assets/aistudio/Beef_Tanubar_b6c2b07a.jpg'],
  'chocolate donut': [
    '/assets/aistudio/Chocolate_Donut_Black_1_2e4bf99a.jpg',
    '/assets/aistudio/Chocolate_Donut_Black_8b93dbef.jpg',
  ],
  'family pizza': ['/assets/aistudio/Family_Pizza_f3feb685.jpg'],
  'chicken margin': ['/assets/aistudio/Chicken_Marzin_f544ceca.jpg'],
  'vegetable puff': ['/assets/aistudio/Vegetable_Puff_84573a12.jpg'],
  'chicken cheese roll': ['/assets/aistudio/Chicken_Cheese_Roll_3449915c.jpg'],

  // Bread
  'chicken paratha': ['/assets/aistudio/Chicken_Paratha_3de1beb9.jpg'],
  'sandwich bread': ['/assets/aistudio/Sandwich_Bread_3bd6f6c7.jpg'],
  'white bread': ['/assets/aistudio/White_Bread_f376d633.jpg'],
  'custard bread': ['/assets/aistudio/Custard_Bread_a41f808a.jpg'],
  'potato bread': ['/assets/aistudio/Poteto_Bread_260f8917.jpg'],
  'cream bun': ['/assets/aistudio/Cream_Bun_90692caa.jpg'],
  'plain bun': ['/assets/aistudio/Plain_Bun_c6329e20.jpg'],
  'chocolate cream bun': ['/assets/aistudio/Chocolate_Bun_a539ee2a.jpg'],
  'plain cake': ['/assets/aistudio/Plain_Cake_f60cf917.jpg'],
  'fruit cake': ['/assets/aistudio/Fuit_Cake_1a8f3b88.jpg'],
  'chocolate cake': ['/assets/aistudio/Chocolate_Cake_a17ba6a2.jpg'],
  'potato pizza': ['/assets/aistudio/Potato_Pizza_528a1603.jpg'],
  'burger bun': ['/assets/aistudio/Burgar_Ban_e66c6785.jpg'],

  // Pastry & Cakes
  'chocolate truffle cake': ['/assets/aistudio/Chocolate_Truffle_Cake_d828e51b.jpg'],
  'chocolate pastry – large': ['/assets/aistudio/Chocolate_pastry_d6c84e84.jpg'],
  'chocolate pastry': ['/assets/aistudio/Chocolate_pastry_d6c84e84.jpg'],
  'mousse cake cup': [
    '/assets/aistudio/Chocolate_Mousse_Cup_0ddfa7d5.jpg',
    '/assets/aistudio/Chocolate_Mus_Cake_b52f9156.jpg',
  ],
  'black forest pastry': ['/assets/aistudio/Black_forest_pastry_2efb5b8f.jpg'],
  'red velvet pastry': ['/assets/aistudio/Red_velbet_pastry_cec0b283.jpg'],
  'red velvet – small': ['/assets/aistudio/Red_Velvet_Cake_8191bb5f.jpg'],
  'red velvet – medium': ['/assets/aistudio/Red_Velvet_Cake_8191bb5f.jpg'],
  'red velvet cake': ['/assets/aistudio/Red_Velvet_Cake_8191bb5f.jpg'],
  'mud pastry': ['/assets/aistudio/CHOCOLATE_MUD_PASTRY_f2fa129a.jpg'],
  'chocolate jar': ['/assets/aistudio/Chocolate_Jar_Cake_86ffd029.jpg'],
  'vanilla pastry': ['/assets/aistudio/vanilla_pastry_5bb18cee.jpg'],
  'strawberry mousse': ['/assets/aistudio/strawberry_mousse_cake_bab7fae9.jpg'],
  'muffin cake': ['/assets/aistudio/Chocolate_Muffins_Cake_4dcefe30.jpg'],
  'mango jar': ['/assets/aistudio/Mango_Jar_Cake_1aef4160.jpg'],
  'triple biscoff': ['/assets/aistudio/Trifle_Biscoff_4a90b8e3.jpg'],

  // Frozen / Dairy / Sweets
  'special doi cup': ['/assets/aistudio/Special_Misty_Doi_Cup_ce5d6c43.jpg'],
  'special doi': ['/assets/aistudio/Special_mishti_dahi_handi_4ab8c329.jpg'],
  'chanar malai': ['/assets/aistudio/Chanar_Malai_00413354.jpg'],
  rasmalai: ['/assets/aistudio/Rasmalai_e3f2173d.jpg'],
  'rasmalai (half kg)': ['/assets/aistudio/Rasmalai_e3f2173d.jpg'],
  'special rasmalai': ['/assets/aistudio/Rasmalai_e3f2173d.jpg'],
  'mishti doi': ['/assets/aistudio/Misty_Doi_a9246764.jpg'],
  'mishti doi (half kg)': ['/assets/aistudio/Misty_Doi_a9246764.jpg'],
  'malai roll': ['/assets/aistudio/Malai_Roll_b07f9394.jpg'],
  'tok doi': ['/assets/aistudio/Tok_Doi_2cbd613a.jpg'],
  sponge: ['/assets/aistudio/Sponge_Rasgulla_7cd07094.jpg'],

  // Mahallabia & Pudding
  pudding: ['/assets/aistudio/Egg_Pudding_2a03e0ba.jpg'],
  'mahallabia cup': ['/assets/aistudio/Mahallabia_cup_a88b5529.jpg'],
  'mahallabia half-kg': ['/assets/aistudio/Mahallabia_half_kg_bb296570.jpg'],
  'mahallabia kg': ['/assets/aistudio/Mahallabia_1kg_1_bb296570.jpg'],

  // Special Sweets
  'adi rosogolla': ['/assets/aistudio/Rosogolla_73bb742c.jpg'],
  'sada mistry': [
    '/assets/aistudio/Sada_Misti_0586b4af.jpg',
    '/assets/aistudio/Sada_Misty_c588d731.jpg',
  ],
  'lal/kalo jam': ['/assets/aistudio/Lalmohon_Kalo_jam_25e2917a.jpg'],
  'premium kalo jam': ['/assets/aistudio/Lalmohon_Kalo_jam_25e2917a.jpg'],
  'chanar manjuri': ['/assets/aistudio/Ros_Munjuri_7b6ef8d2.jpg'],
  'baby chomchom': ['/assets/aistudio/Mini_Chamcham_a7fa54b7.jpg'],
  's.p. chomchom': ['/assets/aistudio/special_chamcham_52d4c515.jpg'],
  sandesh: ['/assets/aistudio/Sandesh_2_c060c90d.jpg'],
  'sada chomchom': ['/assets/aistudio/Sada_Chamcham_28f3cf94.jpg'],
  'cream jam': ['/assets/aistudio/Creem_Jam_09a36b65.jpg'],

  // Dry Sweets & Savories
  'kashmiri laddu': ['/assets/aistudio/Kashmiri_Laddu_530827f4.jpg'],
  'moti laddu': ['/assets/aistudio/Moti_Laddu_ce7ee092.jpg'],
  'dry laddu': ['/assets/aistudio/Moti_Laddu_ce7ee092.jpg'],
  'mawa laddu': ['/assets/aistudio/Mawa_Laddu_b7ed51ff.jpg'],
  'mumbai laddu': ['/assets/aistudio/Mumbai_Laddu_3e412f57.jpg'],
  balushai: ['/assets/aistudio/Balushai_caccd2c0.jpg'],
  'maskut halwa': ['/assets/aistudio/Muscoth_Halwa_a65a1739.jpg'],
  'danadar barfi': ['/assets/aistudio/Danedar_Barfi_32cb117b.jpg'],
  'kheer peda': ['/assets/aistudio/kheer_peda_7cbfcc21.jpg'],
  'dry pera': ['/assets/aistudio/kheer_peda_7cbfcc21.jpg'],
  'chocolate toffee': ['/assets/aistudio/Chocolate_Trophy_8a5e3822.jpg'],
  'hafsi halwa': ['/assets/aistudio/Habshi_Halwa_933f07a6.jpg'],
  'normal nimki': ['/assets/aistudio/Nimki_0c2cf1cd.jpg'],
  's nimki': ['/assets/aistudio/Nimki_0c2cf1cd.jpg'],
  'jhal nimki': ['/assets/aistudio/Spicy_Nimki_6a96d270.jpg'],
  'potato chanachur': ['/assets/aistudio/Potato_Chanachur_35843775.jpg'],

  // Cookies, Toasts & Packaged Cakes
  bela: ['/assets/aistudio/Bela_0a0a7e92.png'],
  'butter toast': ['/assets/aistudio/Butter_Toast_d3ccc4ae.png'],
  'plain toast': ['/assets/aistudio/Plain_Toast_8ae10b4d.png'],
  'jhal toast': ['/assets/aistudio/Spicy_Toast_05a4bfc1.jpg'],
  'gi sugar toast': ['/assets/aistudio/Gee_Sugar_Toast_57dc547d.jpg'],
  'rose toast': ['/assets/aistudio/Roast_Toast_4339fd9d.jpg'],
  'milk cookies': ['/assets/aistudio/Milk_Cookies_027623aa.jpg'],
  'milk salt': ['/assets/aistudio/Milk_Solt_Cookies_285b1b9d.jpg'],
  'til cookies': ['/assets/aistudio/sesame_cookies_4eee0260.jpg'],
  'vanilla chocolate': ['/assets/aistudio/Vanila_Chocolate_Cookies_c63caa7f.jpg'],
  'coconut cookies': ['/assets/aistudio/Coconut_Cookies_d917a562.jpg'],
  'nimki cookies': ['/assets/aistudio/Nimki_Cookies_8c2f7b4b.jpg'],
  'cup cake': ['/assets/aistudio/Cup_Cake_6039bb8a.jpg'],
  'chocolate lava cake': ['/assets/aistudio/Lava_Cake_950b4706.jpg'],
  'chocolate chips': ['/assets/aistudio/Chocolate_Chips_7559e861.jpg'],
  'chocolate cookies': ['/assets/aistudio/Chocolate_Chips_7559e861.jpg'],
  'dry cake': ['/assets/aistudio/Dry_Cake_ef147f27.jpg'],
};

const STUDIO_PHOTOS_BY_SLUG_OR_ID: Record<string, string[]> = {
  'pm-chicken-burger-piece': ['/assets/aistudio/Chicken_Burger_4a482001.jpg'],
  'chicken-burger-piece': ['/assets/aistudio/Chicken_Burger_4a482001.jpg'],
  'prod-chicken-burger': ['/assets/aistudio/Chicken_Burger_4a482001.jpg'],
  'pm-chicken-pizza-piece': ['/assets/aistudio/Chicken_Pizza_5e9d6eec.jpg'],
  'chicken-pizza-piece': ['/assets/aistudio/Chicken_Pizza_5e9d6eec.jpg'],
  'prod-chicken-pizza': ['/assets/aistudio/Chicken_Pizza_5e9d6eec.jpg'],
  'pm-sandwich-bread-piece': ['/assets/aistudio/Sandwich_Bread_3bd6f6c7.jpg'],
  'sandwich-bread-piece': ['/assets/aistudio/Sandwich_Bread_3bd6f6c7.jpg'],
  'prod-sandwich-bread': ['/assets/aistudio/Sandwich_Bread_3bd6f6c7.jpg'],
  'pm-chocolate-cake-piece': ['/assets/aistudio/Chocolate_Cake_a17ba6a2.jpg'],
  'chocolate-cake-piece': ['/assets/aistudio/Chocolate_Cake_a17ba6a2.jpg'],
  'pm-vanilla-pastry-piece': ['/assets/aistudio/vanilla_pastry_5bb18cee.jpg'],
  'vanilla-pastry-piece': ['/assets/aistudio/vanilla_pastry_5bb18cee.jpg'],
  'prod-vanilla-pastry': ['/assets/aistudio/vanilla_pastry_5bb18cee.jpg'],
  'pm-chocolate-pastry-large': ['/assets/aistudio/Chocolate_pastry_d6c84e84.jpg'],
  'chocolate-pastry-large': ['/assets/aistudio/Chocolate_pastry_d6c84e84.jpg'],
  'prod-chocolate-pastry': ['/assets/aistudio/Chocolate_pastry_d6c84e84.jpg'],
};

export function getCatalogStudioPhotos(params: {
  id?: string | null;
  slug?: string | null;
  nameEn?: string | null;
}): string[] {
  const idKey = normalizeLookupKey(params.id);
  if (idKey && STUDIO_PHOTOS_BY_SLUG_OR_ID[idKey]) {
    return [...STUDIO_PHOTOS_BY_SLUG_OR_ID[idKey]];
  }

  const slugKey = normalizeLookupKey(params.slug);
  if (slugKey && STUDIO_PHOTOS_BY_SLUG_OR_ID[slugKey]) {
    return [...STUDIO_PHOTOS_BY_SLUG_OR_ID[slugKey]];
  }

  const nameKey = normalizeLookupKey(params.nameEn);
  if (nameKey && STUDIO_PHOTOS_BY_NAME_EN[nameKey]) {
    return [...STUDIO_PHOTOS_BY_NAME_EN[nameKey]];
  }

  return [];
}
