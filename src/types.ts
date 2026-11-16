export type StaffRole = 'super_admin' | 'admin' | 'manager' | 'support_agent';
export type UserRole = StaffRole | 'customer';
export type AccountStatus = 'active' | 'disabled' | 'suspended';
export type PublishStatus = 'draft' | 'published' | 'archived';

export type PermissionKey =
  | 'dashboard_view'
  | 'products_view'
  | 'products_add'
  | 'products_edit'
  | 'products_delete'
  | 'categories_manage'
  | 'showrooms_manage'
  | 'banners_manage'
  | 'complaints_manage'
  | 'chat_manage'
  | 'reports_view'
  | 'seo_manage'
  | 'settings_view'
  | 'admin_manage'
  | 'manager_manage';

export const ALL_PERMISSION_DEFINITIONS: ReadonlyArray<{
  key: PermissionKey;
  label: string;
  labelBn: string;
  group: 'Catalog' | 'CMS' | 'Support' | 'Governance';
}> = [
  { key: 'dashboard_view', label: 'Dashboard View', labelBn: 'ড্যাশবোর্ড দেখা', group: 'Governance' },
  { key: 'products_view', label: 'Products View', labelBn: 'পণ্য দেখা', group: 'Catalog' },
  { key: 'products_add', label: 'Products Add', labelBn: 'পণ্য যোগ', group: 'Catalog' },
  { key: 'products_edit', label: 'Products Edit', labelBn: 'পণ্য এডিট', group: 'Catalog' },
  { key: 'products_delete', label: 'Products Delete', labelBn: 'পণ্য স্থায়ী ডিলিট', group: 'Catalog' },
  { key: 'categories_manage', label: 'Categories & Occasions', labelBn: 'ক্যাটাগরি ও উপলক্ষ', group: 'Catalog' },
  { key: 'showrooms_manage', label: 'Showrooms Manage', labelBn: 'শোরুম ব্যবস্থাপনা', group: 'Catalog' },
  { key: 'banners_manage', label: 'Banners, Sections & Greetings', labelBn: 'ব্যানার ও সেকশন', group: 'CMS' },
  { key: 'complaints_manage', label: 'Complaints Manage', labelBn: 'অভিযোগ ব্যবস্থাপনা', group: 'Support' },
  { key: 'chat_manage', label: 'Live Chat & AI Support', labelBn: 'লাইভ চ্যাট ও AI', group: 'Support' },
  { key: 'reports_view', label: 'Reports & Activity Logs', labelBn: 'রিপোর্ট ও লগ', group: 'Governance' },
  { key: 'seo_manage', label: 'SEO & OpenGraph', labelBn: 'এসইও সেটিংস', group: 'CMS' },
  { key: 'settings_view', label: 'Website & System Settings', labelBn: 'সাইট সেটিংস', group: 'Governance' },
  { key: 'manager_manage', label: 'Manager Management', labelBn: 'ম্যানেজার তৈরি ও নিয়ন্ত্রণ', group: 'Governance' },
  { key: 'admin_manage', label: 'Admin Management', labelBn: 'অ্যাডমিন নিয়ন্ত্রণ', group: 'Governance' },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<StaffRole, PermissionKey[]> = {
  super_admin: ALL_PERMISSION_DEFINITIONS.map((p) => p.key),
  admin: [
    'dashboard_view',
    'products_view',
    'products_add',
    'products_edit',
    'products_delete',
    'categories_manage',
    'showrooms_manage',
    'banners_manage',
    'reports_view',
  ],
  manager: [
    'dashboard_view',
    'products_view',
    'products_add',
    'products_edit',
    'categories_manage',
    'showrooms_manage',
    'complaints_manage',
    'reports_view',
  ],
  support_agent: [
    'dashboard_view',
    'complaints_manage',
    'chat_manage',
  ],
};

export interface RbacRoleEntry {
  email: string;
  uid: string;
  username?: string;
  name?: string;
  displayName: string;
  phone?: string;
  managerId?: string;
  managerTitle?: string;
  permissions?: PermissionKey[];
  role: StaffRole;
  status: AccountStatus;
  addedByEmail: string;
  createdBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastLoginAt?: unknown;
}

export interface AdminRecord {
  uid: string;
  email: string;
  username: string;
  name?: string;
  display_name: string;
  phone?: string;
  manager_id?: string;
  manager_title?: string;
  permissions?: PermissionKey[];
  role: StaffRole;
  active: boolean;
  status?: AccountStatus;
  created_by?: string;
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
  name?: string;
  displayName: string;
  photoUrl: string;
  phone?: string;
  managerId?: string;
  permissions?: PermissionKey[];
  role: UserRole;
  status: AccountStatus;
  createdBy?: string;
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
