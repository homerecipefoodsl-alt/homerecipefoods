export type StaffRole = 'super_admin' | 'admin' | 'support_agent';
export type UserRole = StaffRole | 'customer';
export type AccountStatus = 'active' | 'disabled';
export type PublishStatus = 'draft' | 'published' | 'archived';

export interface RbacRoleEntry {
  email: string;
  uid: string;
  username?: string;
  displayName: string;
  role: StaffRole;
  status: AccountStatus;
  addedByEmail: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminRecord {
  uid: string;
  email: string;
  username: string;
  display_name: string;
  role: StaffRole;
  active: boolean;
  created_at?: unknown;
  updated_at?: unknown;
  last_login_at?: unknown;
}

export interface AdminUsernameMapping {
  username: string;
  email: string;
  active: boolean;
  updatedAt?: unknown;
}

export interface UserAccount {
  uid: string;
  email: string;
  displayName: string;
  photoUrl: string;
  role: UserRole;
  status: AccountStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastLoginAt?: unknown;
}

export type ProductAvailability =
  | 'In Showroom'
  | 'Pre-Order at Showroom'
  | 'Seasonal'
  | 'Out of Stock';

export type ComplaintCategory =
  | 'পণ্যের মান'
  | 'সেবার মান'
  | 'কর্মচারীর আচরণ'
  | 'মূল্য সংক্রান্ত'
  | 'শোরুম সংক্রান্ত'
  | 'অন্যান্য'
  | string;

export type ComplaintStatus =
  | 'New'
  | 'Reviewing'
  | 'In Progress'
  | 'Resolved'
  | 'Rejected'
  | 'Closed';

export type ComplaintPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

export type DisplayLanguage = 'both' | 'bn' | 'en';

export interface HeroSlide {
  id: string;
  title: string;
  title_bn?: string;
  title_en?: string;
  subtitle: string;
  subtitle_bn?: string;
  subtitle_en?: string;
  displayLanguage?: DisplayLanguage;
  ctaLabel: string;
  ctaLink: string;
  image: string;
  mobileImage?: string;
  order?: number;
  active?: boolean;
  visible?: boolean;
  deleted?: boolean;
  startDate?: string;
  endDate?: string;
  overlayOpacity?: number;
  status?: PublishStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type HomepageSectionKey =
  | 'hero'
  | 'announcement'
  | 'categories'
  | 'featured_products'
  | 'occasion_explorer'
  | 'popular_products'
  | 'promotional_banner'
  | 'showrooms'
  | 'complaint_and_support';

export interface HomepageSection {
  id: string;
  sectionKey: HomepageSectionKey;
  enabled: boolean;
  visible: boolean;
  display_order: number;
  title_bn: string;
  title_en: string;
  subtitle_bn: string;
  subtitle_en: string;
  content_bn?: string;
  content_en?: string;
  ctaTextBn?: string;
  ctaTextEn?: string;
  ctaLink?: string;
  cta_bn?: string;
  cta_en?: string;
  cta_link?: string;
  backgroundImage?: string;
  status?: PublishStatus;
  updatedAt?: unknown;
}

export interface Category {
  id: string;
  name: string;
  nameEn: string;
  name_bn?: string;
  name_en?: string;
  slug: string;
  icon?: string;
  description: string;
  descriptionEn?: string;
  description_bn?: string;
  description_en?: string;
  image: string;
  order: number;
  visible?: boolean;
  deleted?: boolean;
  archivedAt?: unknown;
  seoTitle?: string;
  seoDescription?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Occasion {
  id: string;
  name: string;
  nameEn: string;
  name_bn?: string;
  name_en?: string;
  slug: string;
  icon: string;
  description: string;
  descriptionEn?: string;
  description_bn?: string;
  description_en?: string;
  order: number;
  visible?: boolean;
  deleted?: boolean;
  archivedAt?: unknown;
  seoTitle?: string;
  seoDescription?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Product {
  id: string;
  name: string;
  nameEn: string;
  name_bn?: string;
  name_en?: string;
  slug: string;
  category: string;
  categoryName: string;
  categoryNameEn?: string;
  productType: string;
  price: number;
  old_price?: number;
  discount?: string;
  price_label?: string;
  priceUnit: string;
  shortDescription: string;
  shortDescriptionEn?: string;
  short_description_bn?: string;
  short_description_en?: string;
  description: string;
  descriptionEn?: string;
  description_bn?: string;
  description_en?: string;
  images: string[];
  ingredients: string[];
  ingredients_bn?: string;
  ingredients_en?: string;
  sizes: string[];
  weight: string;
  occasions: string[];
  showrooms: string[];
  availability: ProductAvailability;
  importantNotes: string;
  featured: boolean;
  popular: boolean;
  visible?: boolean;
  deleted?: boolean;
  status?: PublishStatus;
  display_order?: number;
  archivedAt?: unknown;
  seoTitle?: string;
  seoDescription?: string;
  seoImage?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Showroom {
  id: string;
  name: string;
  nameEn?: string;
  name_bn?: string;
  name_en?: string;
  area: string;
  areaEn?: string;
  address: string;
  addressEn?: string;
  address_bn?: string;
  address_en?: string;
  description?: string;
  descriptionEn?: string;
  description_bn?: string;
  description_en?: string;
  phone: string;
  alternate_phone?: string;
  email?: string;
  openingHours: string;
  openingHoursEn?: string;
  opening_time?: string;
  closing_time?: string;
  weekly_holiday?: string;
  mapUrl: string;
  lat: number;
  lng: number;
  images?: string[];
  available_categories?: string[];
  available_products?: string[];
  isMain: boolean;
  visible?: boolean;
  deleted?: boolean;
  display_order?: number;
  archivedAt?: unknown;
  seoTitle?: string;
  seoDescription?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Complaint {
  id: string;
  referenceCode: string;
  submittedByUid?: string;
  customerName: string;
  phone: string;
  email: string;
  category: ComplaintCategory;
  showroomId: string;
  showroomName: string;
  message: string;
  attachmentImage: string;
  status: ComplaintStatus;
  priority?: ComplaintPriority;
  adminNote: string;
  deleted?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GreetingConfig {
  useDynamicDate: boolean;
  customDateText: string;
  customDateTextEn?: string;
  greetingText: string;
  greetingTextEn?: string;
  greeting_bn?: string;
  greeting_en?: string;
  dailyMessage: string;
  dailyMessageEn?: string;
  message_bn?: string;
  message_en?: string;
  specialMessage: string;
  specialMessageEn?: string;
  special_message_bn?: string;
  special_message_en?: string;
  announcement: string;
  announcementEn?: string;
  announcement_bn?: string;
  announcement_en?: string;
  updatedAt?: unknown;
}

export interface GreetingItem {
  id: string;
  text_bn: string;
  text_en: string;
  type: 'greeting' | 'welcome' | 'announcement' | 'rotating';
  active: boolean;
  visible: boolean;
  display_order: number;
  startDate?: string;
  endDate?: string;
  durationMs?: number;
  deleted?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SiteSettings {
  brandName: string;
  brandNameBn?: string;
  brandNameEn?: string;
  logoUrl?: string;
  faviconUrl?: string;
  tagline: string;
  taglineBn?: string;
  taglineEn?: string;
  shortDescriptionBn?: string;
  shortDescriptionEn?: string;
  longDescriptionBn?: string;
  longDescriptionEn?: string;
  supportOnline: boolean;
  supportPhone: string;
  brandEmail?: string;
  brandAddressBn?: string;
  brandAddressEn?: string;
  messengerUrl: string;
  facebookUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
  whatsappUrl?: string;
  footerTextBn?: string;
  footerTextEn?: string;
  announcementEnabled?: boolean;
  announcementBn?: string;
  announcementEn?: string;
  announcementLink?: string;
  primaryColor?: string;
  accentColor?: string;
  heroSlides: HeroSlide[];
  defaultLanguage?: DisplayLanguage;
  aiSupportEnabled?: boolean;
  aiAssistantName?: string;
  aiFallbackMessage?: string;
  aiCustomInstructions?: string;
  chatSupportHours?: string;
  chatOfflineMessage?: string;
  chatWelcomeMessage?: string;
  chatCategories?: string[];
  complaintCategories?: string[];
  complaintRefPrefix?: string;
  complaintTemplates?: string[];
  updatedAt?: unknown;
}

export interface SeoSettings {
  siteTitle: string;
  siteTitleBn?: string;
  metaDescription: string;
  metaKeywords: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterCard?: 'summary' | 'summary_large_image';
  homepageTitle?: string;
  homepageDescription?: string;
  updatedAt?: unknown;
}

export type MediaFolder =
  | 'Products'
  | 'Categories'
  | 'Hero'
  | 'Showrooms'
  | 'General'
  | 'Branding';

export interface MediaItem {
  id: string;
  name: string;
  folder: MediaFolder;
  url: string;
  storagePath?: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByEmail?: string;
  uploadedBy?: string;
  deleted?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AiKnowledgeEntry {
  id: string;
  title: string;
  category: string;
  question_bn?: string;
  question_en?: string;
  answer_bn?: string;
  answer_en?: string;
  content_bn?: string;
  content_en?: string;
  active: boolean;
  visible: boolean;
  deleted?: boolean;
  order: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ActivityLog {
  id: string;
  admin_uid: string;
  admin_email: string;
  action: string;
  module: string;
  record_id: string;
  record_label?: string;
  summary?: string;
  timestamp?: unknown;
}

export interface ChatSession {
  id: string;
  customerUid?: string;
  customerName: string;
  customerPhone: string;
  category?: string;
  status: 'waiting' | 'active' | 'closed';
  assignedAdminEmail: string;
  assignedAdminName: string;
  lastMessage: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  customerUid?: string;
  senderRole: 'customer' | 'admin' | 'system';
  senderName: string;
  text: string;
  createdAt?: unknown;
}

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  role: StaffRole;
  isOnline: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}
