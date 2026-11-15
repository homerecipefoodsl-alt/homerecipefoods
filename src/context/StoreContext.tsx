import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  SEED_CATEGORIES,
  SEED_GREETING,
  SEED_HOMEPAGE_SECTIONS,
  SEED_OCCASIONS,
  SEED_PRODUCTS,
  SEED_SEO_SETTINGS,
  SEED_SHOWROOMS,
  SEED_SITE_SETTINGS,
} from '../data/seedData';
import {
  OperationType,
  applyAuthPersistence,
  auth,
  db,
  firebaseConnectionStatus,
  handleFirestoreError,
  isFirebaseConfigured,
} from '../lib/firebase';
import type {
  AccountStatus,
  AdminRecord,
  AdminUsernameMapping,
  AiKnowledgeEntry,
  Category,
  DisplayLanguage,
  GreetingConfig,
  GreetingItem,
  HeroSlide,
  HomepageSection,
  MediaItem,
  Occasion,
  Product,
  RbacRoleEntry,
  SeoSettings,
  Showroom,
  SiteSettings,
  StaffRole,
  UserAccount,
  UserRole,
} from '../types';

export const PRIMARY_SUPER_ADMIN_EMAIL = 'mdmahmudulhashan0@gmail.com';
export const PRIMARY_SUPER_ADMIN_USERNAME = 'mahmud';

const LOGIN_GUARD_STORAGE_KEY = 'hrf_admin_login_guard_v1';
const MAX_LOGIN_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 30_000;

interface LoginGuardState {
  attempts: number;
  lockedUntil: number;
}

function readLoginGuard(): LoginGuardState {
  try {
    const raw = sessionStorage.getItem(LOGIN_GUARD_STORAGE_KEY);
    if (!raw) return { attempts: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<LoginGuardState>;
    return {
      attempts: typeof parsed.attempts === 'number' ? parsed.attempts : 0,
      lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : 0,
    };
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}

function writeLoginGuard(state: LoginGuardState): void {
  try {
    sessionStorage.setItem(LOGIN_GUARD_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

function isWithinScheduleWindow(startDate?: string, endDate?: string): boolean {
  const now = Date.now();
  if (startDate) {
    const startMs = Date.parse(startDate);
    if (!Number.isNaN(startMs) && now < startMs) return false;
  }
  if (endDate) {
    const endMs = Date.parse(endDate);
    if (!Number.isNaN(endMs) && now > endMs + 86_400_000) return false;
  }
  return true;
}

function upsertMetaTag(attr: 'name' | 'property', key: string, content: string): void {
  if (!content || typeof document === 'undefined') return;
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

interface StoreContextValue {
  // Public storefront collections (filtered visible & non-deleted)
  categories: Category[];
  occasions: Occasion[];
  products: Product[];
  showrooms: Showroom[];
  heroBanners: HeroSlide[];
  homepageSections: HomepageSection[];
  greeting: GreetingConfig;
  greetingItems: GreetingItem[];
  aiKnowledge: AiKnowledgeEntry[];

  // Full unfiltered CMS collections (for Admin Panel incl. hidden & archived)
  allCategories: Category[];
  allOccasions: Occasion[];
  allProducts: Product[];
  allShowrooms: Showroom[];
  allHeroBanners: HeroSlide[];
  allHomepageSections: HomepageSection[];
  allGreetingItems: GreetingItem[];
  allAiKnowledge: AiKnowledgeEntry[];
  mediaItems: MediaItem[];

  siteSettings: SiteSettings;
  seoSettings: SeoSettings;
  languageMode: DisplayLanguage;
  setLanguageMode: (lang: DisplayLanguage) => void;
  loading: boolean;
  firestoreEmpty: boolean;
  error: string | null;

  // Auth & RBAC state
  user: User | null;
  authReady: boolean;
  userRole: UserRole | null;
  staffRole: StaffRole | null;
  adminProfile: AdminRecord | null;
  accountStatus: AccountStatus;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isCatalogAdmin: boolean;
  isSupportStaff: boolean;
  adminCheckLoading: boolean;
  emailVerificationRequired: boolean;
  loginLockoutRemainingSec: number;

  signInAdminWithCredentials: (
    identifier: string,
    password: string,
    rememberSession: boolean
  ) => Promise<void>;
  sendAdminPasswordReset: (identifierOrEmail: string) => Promise<void>;
  resendAdminVerificationEmail: () => Promise<void>;
  refreshAdminSession: () => Promise<void>;
  signOutAdmin: () => Promise<void>;
  logAdminActivity: (
    action: string,
    module: string,
    recordId: string,
    recordLabel?: string,
    summary?: string
  ) => Promise<void>;
  seedDemoCatalog: () => Promise<{ createdCount: number }>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [dbCategories, setDbCategories] = useState<Category[] | null>(null);
  const [dbOccasions, setDbOccasions] = useState<Occasion[] | null>(null);
  const [dbProducts, setDbProducts] = useState<Product[] | null>(null);
  const [dbShowrooms, setDbShowrooms] = useState<Showroom[] | null>(null);
  const [dbHeroBanners, setDbHeroBanners] = useState<HeroSlide[] | null>(null);
  const [dbHomepageSections, setDbHomepageSections] = useState<HomepageSection[] | null>(null);
  const [dbGreeting, setDbGreeting] = useState<GreetingConfig | null>(null);
  const [dbGreetingItems, setDbGreetingItems] = useState<GreetingItem[]>([]);
  const [dbSettings, setDbSettings] = useState<SiteSettings | null>(null);
  const [dbSeoSettings, setDbSeoSettings] = useState<SeoSettings | null>(null);
  const [dbAiKnowledge, setDbAiKnowledge] = useState<AiKnowledgeEntry[]>([]);
  const [dbMediaItems, setDbMediaItems] = useState<MediaItem[]>([]);

  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminRecord | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('active');
  const [adminCheckLoading, setAdminCheckLoading] = useState(isFirebaseConfigured);
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const [authRefreshTick, setAuthRefreshTick] = useState(0);
  const [loginLockoutUntil, setLoginLockoutUntil] = useState<number>(
    () => readLoginGuard().lockedUntil
  );
  const [loginLockoutRemainingSec, setLoginLockoutRemainingSec] = useState<number>(0);

  useEffect(() => {
    const updateCountdown = () => {
      const diff = Math.max(0, Math.ceil((loginLockoutUntil - Date.now()) / 1000));
      setLoginLockoutRemainingSec(diff);
    };
    updateCountdown();
    if (loginLockoutUntil <= Date.now()) return;
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [loginLockoutUntil]);

  const writeActivityLogInternal = useCallback(
    async (
      uid: string,
      email: string,
      action: string,
      module: string,
      recordId: string,
      recordLabel = '',
      summary = ''
    ) => {
      if (!db || !uid || !email) return;
      const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        await setDoc(doc(db, 'activity_logs', logId), {
          id: logId,
          admin_uid: uid,
          admin_email: email.toLowerCase(),
          action: action.slice(0, 80),
          module: module.slice(0, 80),
          record_id: recordId.slice(0, 128),
          record_label: recordLabel.slice(0, 160),
          summary: summary.slice(0, 400),
          timestamp: serverTimestamp(),
        });
      } catch {
        // Non-blocking audit log write
      }
    },
    []
  );

  // Firebase Auth & RBAC verification listener
  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !db) {
      setAuthReady(true);
      setAdminCheckLoading(false);
      setUser(null);
      setUserRole(null);
      setAdminProfile(null);
      return;
    }

    const activeAuth = auth;
    const activeDb = db;
    let unsubRbac: (() => void) | null = null;
    let unsubAdminDoc: (() => void) | null = null;
    let unsubUserDoc: (() => void) | null = null;

    const cleanupRoleSubs = () => {
      if (unsubRbac) {
        unsubRbac();
        unsubRbac = null;
      }
      if (unsubAdminDoc) {
        unsubAdminDoc();
        unsubAdminDoc = null;
      }
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
    };

    const unsubAuth = onAuthStateChanged(activeAuth, async (currentUser) => {
      cleanupRoleSubs();
      setUser(currentUser);
      setAuthReady(true);

      if (!currentUser || !currentUser.email) {
        setUserRole(currentUser ? 'customer' : null);
        setAdminProfile(null);
        setAccountStatus('active');
        setEmailVerificationRequired(false);
        setAdminCheckLoading(false);
        return;
      }

      // Enforce Password-Provider Only rule for Admin Panel (/mahmud)
      // Google Auth or any social login MUST NOT enter the Admin Panel.
      const hasPasswordProvider = currentUser.providerData.some(
        (p) => p.providerId === 'password'
      );
      if (!hasPasswordProvider) {
        setUserRole('customer');
        setAdminProfile(null);
        setAccountStatus('active');
        setEmailVerificationRequired(false);
        setAdminCheckLoading(false);
        return;
      }

      if (!currentUser.emailVerified) {
        setUserRole('customer');
        setAdminProfile(null);
        setAccountStatus('active');
        setEmailVerificationRequired(true);
        setAdminCheckLoading(false);
        return;
      }

      setEmailVerificationRequired(false);
      setAdminCheckLoading(true);
      const emailLower = currentUser.email.trim().toLowerCase();

      try {
        const rbacRef = doc(activeDb, 'rbac_roles', emailLower);
        const adminRef = doc(activeDb, 'admins', currentUser.uid);
        const userRef = doc(activeDb, 'users', currentUser.uid);
        const now = serverTimestamp();

        const isPrimarySuperAdminEmail =
          emailLower === PRIMARY_SUPER_ADMIN_EMAIL && currentUser.emailVerified;

        // Ensure primary Super Admin RBAC & Admin records exist on first verified password login
        if (isPrimarySuperAdminEmail) {
          try {
            const rbacSnap = await getDoc(rbacRef);
            if (!rbacSnap.exists()) {
              await setDoc(rbacRef, {
                email: emailLower,
                uid: currentUser.uid,
                username: PRIMARY_SUPER_ADMIN_USERNAME,
                displayName: currentUser.displayName || 'Mahmud (Super Admin)',
                role: 'super_admin',
                status: 'active',
                addedByEmail: 'system-bootstrap',
                createdAt: now,
                updatedAt: now,
              });
            } else {
              const rbacData = rbacSnap.data() as RbacRoleEntry;
              if (!rbacData.uid || !rbacData.username) {
                await updateDoc(rbacRef, {
                  uid: currentUser.uid,
                  username: rbacData.username || PRIMARY_SUPER_ADMIN_USERNAME,
                  displayName:
                    currentUser.displayName || rbacData.displayName || 'Super Admin',
                  updatedAt: now,
                });
              }
            }
          } catch (bootstrapErr) {
            console.warn('Super Admin RBAC bootstrap sync warning:', bootstrapErr);
          }

          try {
            const adminSnap = await getDoc(adminRef);
            if (!adminSnap.exists()) {
              await setDoc(adminRef, {
                uid: currentUser.uid,
                email: emailLower,
                username: PRIMARY_SUPER_ADMIN_USERNAME,
                display_name: currentUser.displayName || 'Mahmud (Super Admin)',
                role: 'super_admin',
                active: true,
                created_at: now,
                updated_at: now,
                last_login_at: now,
              });
            } else {
              await updateDoc(adminRef, {
                last_login_at: now,
                updated_at: now,
              });
            }
          } catch (adminSyncErr) {
            console.warn('Super Admin profile sync warning:', adminSyncErr);
          }

          try {
            const usernameRef = doc(
              activeDb,
              'admin_usernames',
              PRIMARY_SUPER_ADMIN_USERNAME
            );
            const usernameSnap = await getDoc(usernameRef);
            if (!usernameSnap.exists()) {
              await setDoc(usernameRef, {
                username: PRIMARY_SUPER_ADMIN_USERNAME,
                email: emailLower,
                active: true,
                updatedAt: now,
              });
            }
          } catch (usernameSyncErr) {
            console.warn('Super Admin username sync warning:', usernameSyncErr);
          }
        }

        // Read authoritative RBAC + admin profile
        let resolvedRole: UserRole = isPrimarySuperAdminEmail ? 'super_admin' : 'customer';
        let resolvedStatus: AccountStatus = 'active';
        let resolvedAdminRecord: AdminRecord | null = null;

        try {
          const activeRbacSnap = await getDoc(rbacRef);
          if (activeRbacSnap.exists()) {
            const rbacData = activeRbacSnap.data() as RbacRoleEntry;
            if (rbacData.status === 'active') {
              resolvedRole = rbacData.role;
              if (!rbacData.uid) {
                try {
                  await updateDoc(rbacRef, {
                    uid: currentUser.uid,
                    displayName:
                      currentUser.displayName || rbacData.displayName || emailLower,
                    updatedAt: now,
                  });
                } catch {
                  // Ignore if disallowed
                }
              }
            } else {
              resolvedRole = 'customer';
              resolvedStatus = 'disabled';
            }
          }
        } catch {
          // If unverified email prevents rbac read, inspect admins/{uid}
        }

        try {
          const adminSnap = await getDoc(adminRef);
          if (adminSnap.exists()) {
            const aData = adminSnap.data() as AdminRecord;
            resolvedAdminRecord = aData;
            if (aData.active && resolvedStatus !== 'disabled') {
              resolvedRole = aData.role;
              if (!isPrimarySuperAdminEmail) {
                try {
                  await updateDoc(adminRef, {
                    last_login_at: now,
                    updated_at: now,
                  });
                } catch {
                  // Ignore if disallowed
                }
              }
            } else if (!aData.active) {
              resolvedRole = 'customer';
              resolvedStatus = 'disabled';
            }
          } else if (
            !isPrimarySuperAdminEmail &&
            resolvedStatus === 'active' &&
            (resolvedRole === 'admin' || resolvedRole === 'support_agent')
          ) {
            try {
              const rbacSnapData = (await getDoc(rbacRef)).data() as
                | RbacRoleEntry
                | undefined;
              const staffUsername =
                rbacSnapData?.username || emailLower.split('@')[0];
              const newAdminDoc: AdminRecord = {
                uid: currentUser.uid,
                email: emailLower,
                username: staffUsername,
                display_name:
                  currentUser.displayName ||
                  rbacSnapData?.displayName ||
                  emailLower.split('@')[0],
                role: resolvedRole,
                active: true,
                created_at: now,
                updated_at: now,
                last_login_at: now,
              };
              await setDoc(adminRef, newAdminDoc);
              resolvedAdminRecord = newAdminDoc;
            } catch {
              // Non-blocking sync
            }
          }
        } catch {
          // Not an admin doc
        }

        // Sync user profile if email verified
        if (currentUser.emailVerified) {
          try {
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists()) {
              await setDoc(userRef, {
                uid: currentUser.uid,
                email: emailLower,
                displayName: currentUser.displayName || emailLower.split('@')[0],
                photoUrl: currentUser.photoURL || '',
                role: resolvedRole,
                status: 'active',
                createdAt: now,
                updatedAt: now,
                lastLoginAt: now,
              });
            } else {
              const existingUser = userSnap.data() as UserAccount;
              if (existingUser.status === 'disabled') {
                resolvedStatus = 'disabled';
              }
              await updateDoc(userRef, {
                displayName:
                  currentUser.displayName || existingUser.displayName || emailLower,
                photoUrl: currentUser.photoURL || existingUser.photoUrl || '',
                role: resolvedRole,
                updatedAt: now,
                lastLoginAt: now,
              });
            }
          } catch {
            // Safe fallback
          }
        }

        setUserRole(resolvedRole);
        setAdminProfile(resolvedAdminRecord);
        setAccountStatus(resolvedStatus);

        // Live subscriptions so role/status changes apply immediately
        unsubRbac = onSnapshot(
          rbacRef,
          (snap) => {
            if (!snap.exists()) return;
            const r = snap.data() as RbacRoleEntry;
            if (r.status === 'active') {
              setUserRole(r.role);
              setAccountStatus('active');
            } else {
              setUserRole('customer');
              setAccountStatus('disabled');
            }
          },
          () => {}
        );

        unsubAdminDoc = onSnapshot(
          adminRef,
          (snap) => {
            if (snap.exists()) {
              const a = snap.data() as AdminRecord;
              setAdminProfile(a);
              if (!a.active) {
                setUserRole('customer');
                setAccountStatus('disabled');
              } else {
                setUserRole(a.role);
                setAccountStatus('active');
              }
            }
          },
          () => {}
        );

        unsubUserDoc = onSnapshot(
          userRef,
          (snap) => {
            if (snap.exists()) {
              const u = snap.data() as UserAccount;
              if (u.status === 'disabled') {
                setAccountStatus('disabled');
              }
            }
          },
          () => {}
        );
      } catch (err) {
        console.error('Admin verification error:', err);
        setUserRole('customer');
        setAdminProfile(null);
        setAccountStatus('active');
      } finally {
        setAdminCheckLoading(false);
      }
    });

    return () => {
      cleanupRoleSubs();
      unsubAuth();
    };
  }, [authRefreshTick]);

  // Firestore Storefront Subscriptions
  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      setLoading(false);
      return;
    }

    const activeDb = db;
    let settledCount = 0;
    const markSettled = () => {
      settledCount += 1;
      if (settledCount >= 6) setLoading(false);
    };

    const unsubCats = onSnapshot(
      query(collection(activeDb, 'categories'), orderBy('order', 'asc')),
      (snap) => {
        setDbCategories(snap.docs.map((d) => d.data() as Category));
        markSettled();
      },
      (err) => {
        setError('ক্যাটালগ লোড করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
        markSettled();
        try {
          handleFirestoreError(err, OperationType.LIST, 'categories');
        } catch {
          // Logged
        }
      }
    );

    const unsubOccs = onSnapshot(
      query(collection(activeDb, 'occasions'), orderBy('order', 'asc')),
      (snap) => {
        setDbOccasions(snap.docs.map((d) => d.data() as Occasion));
        markSettled();
      },
      () => markSettled()
    );

    const unsubProds = onSnapshot(
      collection(activeDb, 'products'),
      (snap) => {
        setDbProducts(snap.docs.map((d) => d.data() as Product));
        markSettled();
      },
      () => markSettled()
    );

    const unsubShowrooms = onSnapshot(
      collection(activeDb, 'showrooms'),
      (snap) => {
        setDbShowrooms(snap.docs.map((d) => d.data() as Showroom));
        markSettled();
      },
      () => markSettled()
    );

    const unsubGreetings = onSnapshot(
      collection(activeDb, 'greetings'),
      (snap) => {
        const dailyDoc = snap.docs.find((d) => d.id === 'daily');
        setDbGreeting(dailyDoc ? (dailyDoc.data() as GreetingConfig) : null);
        const multiItems = snap.docs
          .filter((d) => d.id !== 'daily')
          .map((d) => ({ id: d.id, ...(d.data() as Omit<GreetingItem, 'id'>) }));
        setDbGreetingItems(multiItems);
        markSettled();
      },
      () => markSettled()
    );

    const unsubSettings = onSnapshot(
      doc(activeDb, 'site_settings', 'main'),
      (snap) => {
        setDbSettings(snap.exists() ? (snap.data() as SiteSettings) : null);
        markSettled();
      },
      () => markSettled()
    );

    const unsubHeroBanners = onSnapshot(
      collection(activeDb, 'hero_banners'),
      (snap) => {
        setDbHeroBanners(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HeroSlide, 'id'>) }))
        );
      },
      () => {}
    );

    const unsubSections = onSnapshot(
      collection(activeDb, 'homepage_sections'),
      (snap) => {
        setDbHomepageSections(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<HomepageSection, 'id'>),
          }))
        );
      },
      () => {}
    );

    const unsubSeo = onSnapshot(
      doc(activeDb, 'seo_settings', 'main'),
      (snap) => {
        setDbSeoSettings(snap.exists() ? (snap.data() as SeoSettings) : null);
      },
      () => {}
    );

    const unsubAiKnowledge = onSnapshot(
      collection(activeDb, 'ai_knowledge'),
      (snap) => {
        setDbAiKnowledge(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AiKnowledgeEntry, 'id'>),
          }))
        );
      },
      () => {}
    );

    const unsubMedia = onSnapshot(
      collection(activeDb, 'media'),
      (snap) => {
        setDbMediaItems(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<MediaItem, 'id'>),
          }))
        );
      },
      () => {}
    );

    return () => {
      unsubCats();
      unsubOccs();
      unsubProds();
      unsubShowrooms();
      unsubGreetings();
      unsubSettings();
      unsubHeroBanners();
      unsubSections();
      unsubSeo();
      unsubAiKnowledge();
      unsubMedia();
    };
  }, []);

  const firestoreEmpty = useMemo(() => {
    return (
      isFirebaseConfigured &&
      dbCategories !== null &&
      dbProducts !== null &&
      dbCategories.length === 0 &&
      dbProducts.length === 0
    );
  }, [dbCategories, dbProducts]);

  const [languageOverride, setLanguageOverride] = useState<DisplayLanguage | null>(null);

  const allCategories = useMemo(() => {
    if (!dbCategories || dbCategories.length === 0) return SEED_CATEGORIES;
    return dbCategories
      .map((docItem) => {
        const seed = SEED_CATEGORIES.find(
          (s) => s.id === docItem.id || s.slug === docItem.slug
        );
        return {
          ...seed,
          ...docItem,
          name_bn: docItem.name_bn || docItem.name || seed?.name_bn || '',
          name_en: docItem.name_en || docItem.nameEn || seed?.name_en || '',
          descriptionEn:
            docItem.descriptionEn || docItem.description_en || seed?.descriptionEn || '',
          description_bn:
            docItem.description_bn || docItem.description || seed?.description_bn || '',
          description_en:
            docItem.description_en || docItem.descriptionEn || seed?.description_en || '',
          visible: docItem.visible !== false,
          deleted: Boolean(docItem.deleted),
        } as Category;
      })
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }, [dbCategories]);

  const categories = useMemo(
    () => allCategories.filter((c) => c.visible !== false && !c.deleted),
    [allCategories]
  );

  const allOccasions = useMemo(() => {
    if (!dbOccasions || dbOccasions.length === 0) return SEED_OCCASIONS;
    return dbOccasions
      .map((docItem) => {
        const seed = SEED_OCCASIONS.find(
          (s) => s.id === docItem.id || s.slug === docItem.slug
        );
        return {
          ...seed,
          ...docItem,
          name_bn: docItem.name_bn || docItem.name || seed?.name_bn || '',
          name_en: docItem.name_en || docItem.nameEn || seed?.name_en || '',
          descriptionEn:
            docItem.descriptionEn || docItem.description_en || seed?.descriptionEn || '',
          description_bn:
            docItem.description_bn || docItem.description || seed?.description_bn || '',
          description_en:
            docItem.description_en || docItem.descriptionEn || seed?.description_en || '',
          visible: docItem.visible !== false,
          deleted: Boolean(docItem.deleted),
        } as Occasion;
      })
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }, [dbOccasions]);

  const occasions = useMemo(
    () => allOccasions.filter((o) => o.visible !== false && !o.deleted),
    [allOccasions]
  );

  const allProducts = useMemo(() => {
    if (!dbProducts || dbProducts.length === 0) return SEED_PRODUCTS;
    return dbProducts
      .map((docItem) => {
        const seed = SEED_PRODUCTS.find(
          (s) => s.id === docItem.id || s.slug === docItem.slug
        );
        const cat = allCategories.find((c) => c.slug === docItem.category);
        return {
          ...seed,
          ...docItem,
          name_bn: docItem.name_bn || docItem.name || seed?.name_bn || '',
          name_en: docItem.name_en || docItem.nameEn || seed?.name_en || '',
          categoryNameEn:
            docItem.categoryNameEn || cat?.name_en || cat?.nameEn || seed?.categoryNameEn || '',
          shortDescriptionEn:
            docItem.shortDescriptionEn ||
            docItem.short_description_en ||
            seed?.shortDescriptionEn ||
            '',
          short_description_bn:
            docItem.short_description_bn ||
            docItem.shortDescription ||
            seed?.short_description_bn ||
            '',
          short_description_en:
            docItem.short_description_en ||
            docItem.shortDescriptionEn ||
            seed?.short_description_en ||
            '',
          descriptionEn:
            docItem.descriptionEn || docItem.description_en || seed?.descriptionEn || '',
          description_bn:
            docItem.description_bn || docItem.description || seed?.description_bn || '',
          description_en:
            docItem.description_en || docItem.descriptionEn || seed?.description_en || '',
          visible: docItem.visible !== false,
          deleted: Boolean(docItem.deleted),
        } as Product;
      })
      .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
  }, [dbProducts, allCategories]);

  const products = useMemo(
    () =>
      allProducts.filter(
        (p) => p.visible !== false && !p.deleted && p.status !== 'archived'
      ),
    [allProducts]
  );

  const allShowrooms = useMemo(() => {
    if (!dbShowrooms || dbShowrooms.length === 0) return SEED_SHOWROOMS;
    return dbShowrooms
      .map((docItem) => {
        const seed = SEED_SHOWROOMS.find((s) => s.id === docItem.id);
        return {
          ...seed,
          ...docItem,
          nameEn: docItem.nameEn || docItem.name_en || seed?.nameEn || docItem.name,
          name_bn: docItem.name_bn || docItem.name || seed?.name_bn || '',
          name_en: docItem.name_en || docItem.nameEn || seed?.name_en || '',
          areaEn: docItem.areaEn || seed?.areaEn || docItem.area,
          addressEn: docItem.addressEn || docItem.address_en || seed?.addressEn || '',
          address_bn: docItem.address_bn || docItem.address || seed?.address_bn || '',
          address_en: docItem.address_en || docItem.addressEn || seed?.address_en || '',
          description: docItem.description || docItem.description_bn || seed?.description || '',
          descriptionEn:
            docItem.descriptionEn || docItem.description_en || seed?.descriptionEn || '',
          description_bn:
            docItem.description_bn || docItem.description || seed?.description_bn || '',
          description_en:
            docItem.description_en || docItem.descriptionEn || seed?.description_en || '',
          openingHoursEn: docItem.openingHoursEn || seed?.openingHoursEn || '',
          visible: docItem.visible !== false,
          deleted: Boolean(docItem.deleted),
        } as Showroom;
      })
      .sort((a, b) => (a.display_order ?? 99) - (b.display_order ?? 99));
  }, [dbShowrooms]);

  const showrooms = useMemo(
    () => allShowrooms.filter((s) => s.visible !== false && !s.deleted),
    [allShowrooms]
  );

  const greeting = useMemo<GreetingConfig>(() => {
    if (!dbGreeting) return SEED_GREETING;
    return {
      ...SEED_GREETING,
      ...dbGreeting,
      greetingTextEn:
        dbGreeting.greetingTextEn || dbGreeting.greeting_en || SEED_GREETING.greetingTextEn,
      greeting_bn:
        dbGreeting.greeting_bn || dbGreeting.greetingText || SEED_GREETING.greeting_bn,
      greeting_en:
        dbGreeting.greeting_en || dbGreeting.greetingTextEn || SEED_GREETING.greeting_en,
      dailyMessageEn:
        dbGreeting.dailyMessageEn || dbGreeting.message_en || SEED_GREETING.dailyMessageEn,
      message_bn:
        dbGreeting.message_bn || dbGreeting.dailyMessage || SEED_GREETING.message_bn,
      message_en:
        dbGreeting.message_en || dbGreeting.dailyMessageEn || SEED_GREETING.message_en,
      specialMessageEn:
        dbGreeting.specialMessageEn ||
        dbGreeting.special_message_en ||
        SEED_GREETING.specialMessageEn,
      announcementEn:
        dbGreeting.announcementEn ||
        dbGreeting.announcement_en ||
        SEED_GREETING.announcementEn,
    };
  }, [dbGreeting]);

  const allGreetingItems = useMemo(() => {
    return [...dbGreetingItems].sort(
      (a, b) => (a.display_order ?? 99) - (b.display_order ?? 99)
    );
  }, [dbGreetingItems]);

  const greetingItems = useMemo(() => {
    return allGreetingItems.filter(
      (g) =>
        !g.deleted &&
        g.active !== false &&
        g.visible !== false &&
        isWithinScheduleWindow(g.startDate, g.endDate)
    );
  }, [allGreetingItems]);

  const siteSettings = useMemo(() => {
    const merged = { ...SEED_SITE_SETTINGS, ...(dbSettings ?? {}) };
    merged.heroSlides = (merged.heroSlides || SEED_SITE_SETTINGS.heroSlides).map(
      (slide, idx) => {
        const seedSlide =
          SEED_SITE_SETTINGS.heroSlides.find((s) => s.id === slide.id) ||
          SEED_SITE_SETTINGS.heroSlides[idx];
        return {
          ...seedSlide,
          ...slide,
          displayLanguage: slide.displayLanguage || 'both',
        };
      }
    );
    return merged;
  }, [dbSettings]);

  const allHeroBanners = useMemo(() => {
    const source =
      dbHeroBanners && dbHeroBanners.length > 0
        ? dbHeroBanners
        : siteSettings.heroSlides;
    return [...source].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }, [dbHeroBanners, siteSettings.heroSlides]);

  const heroBanners = useMemo(() => {
    const active = allHeroBanners.filter(
      (b) =>
        !b.deleted &&
        b.active !== false &&
        b.visible !== false &&
        b.status !== 'archived' &&
        isWithinScheduleWindow(b.startDate, b.endDate)
    );
    return active.length > 0 ? active : siteSettings.heroSlides;
  }, [allHeroBanners, siteSettings.heroSlides]);

  const allHomepageSections = useMemo(() => {
    if (!dbHomepageSections || dbHomepageSections.length === 0) {
      return SEED_HOMEPAGE_SECTIONS;
    }
    const mergedMap = new Map<string, HomepageSection>();
    SEED_HOMEPAGE_SECTIONS.forEach((sec) => mergedMap.set(sec.sectionKey, sec));
    dbHomepageSections.forEach((sec) => mergedMap.set(sec.sectionKey, sec));
    return Array.from(mergedMap.values()).sort(
      (a, b) => (a.display_order ?? 99) - (b.display_order ?? 99)
    );
  }, [dbHomepageSections]);

  const homepageSections = useMemo(
    () => allHomepageSections.filter((s) => s.enabled !== false && s.visible !== false),
    [allHomepageSections]
  );

  const seoSettings = useMemo<SeoSettings>(() => {
    return { ...SEED_SEO_SETTINGS, ...(dbSeoSettings ?? {}) };
  }, [dbSeoSettings]);

  const allAiKnowledge = useMemo(() => {
    return [...dbAiKnowledge].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }, [dbAiKnowledge]);

  const aiKnowledge = useMemo(
    () => allAiKnowledge.filter((k) => !k.deleted && k.active !== false && k.visible !== false),
    [allAiKnowledge]
  );

  const mediaItems = useMemo(
    () => dbMediaItems.filter((m) => !m.deleted),
    [dbMediaItems]
  );

  // Sync global SEO & Favicon dynamically from Firestore
  useEffect(() => {
    if (typeof document === 'undefined') return;
    upsertMetaTag('name', 'description', seoSettings.metaDescription);
    upsertMetaTag('name', 'keywords', seoSettings.metaKeywords);
    upsertMetaTag('property', 'og:title', seoSettings.ogTitle);
    upsertMetaTag('property', 'og:description', seoSettings.ogDescription);
    upsertMetaTag('property', 'og:image', seoSettings.ogImage);
    upsertMetaTag('name', 'twitter:title', seoSettings.ogTitle);
    upsertMetaTag('name', 'twitter:description', seoSettings.ogDescription);
    upsertMetaTag('name', 'twitter:image', seoSettings.ogImage);

    if (siteSettings.faviconUrl) {
      const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
      if (link && link.href !== siteSettings.faviconUrl) {
        link.href = siteSettings.faviconUrl;
      }
    }
  }, [seoSettings, siteSettings.faviconUrl]);

  const languageMode: DisplayLanguage =
    languageOverride || siteSettings.defaultLanguage || 'both';
  const setLanguageMode = (lang: DisplayLanguage) => setLanguageOverride(lang);

  const staffRole: StaffRole | null = useMemo(() => {
    if (accountStatus === 'disabled') return null;
    if (
      userRole === 'super_admin' ||
      userRole === 'admin' ||
      userRole === 'support_agent'
    ) {
      return userRole;
    }
    return null;
  }, [userRole, accountStatus]);

  const isSuperAdmin = staffRole === 'super_admin';
  const isCatalogAdmin = staffRole === 'super_admin' || staffRole === 'admin';
  const isSupportStaff = staffRole === 'super_admin' || staffRole === 'support_agent';
  const isAdmin = staffRole !== null;

  const logAdminActivity = useCallback(
    async (
      action: string,
      module: string,
      recordId: string,
      recordLabel = '',
      summary = ''
    ) => {
      if (!user?.uid || !user?.email) return;
      await writeActivityLogInternal(
        user.uid,
        user.email,
        action,
        module,
        recordId,
        recordLabel,
        summary
      );
    },
    [user, writeActivityLogInternal]
  );

  const mapFirebaseAuthError = (
    err: unknown
  ): { message: string; countAsFailedAttempt: boolean } => {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : '';

    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return {
          message: 'Username/email or password is incorrect.',
          countAsFailedAttempt: true,
        };
      case 'auth/invalid-email':
        return {
          message: 'Please enter a valid email address or admin username.',
          countAsFailedAttempt: false,
        };
      case 'auth/operation-not-allowed':
        return {
          message:
            'Firebase Email/Password sign-in is disabled in project ai-studio-applet-webapp-e4b0f. Enable Email/Password in Firebase Console → Authentication → Sign-in method.',
          countAsFailedAttempt: false,
        };
      case 'auth/user-disabled':
        return {
          message: 'This administrator account has been disabled in Firebase Authentication.',
          countAsFailedAttempt: false,
        };
      case 'auth/too-many-requests':
        return {
          message:
            'Too many login attempts in Firebase Authentication. Please wait a few minutes or use Forgot Password.',
          countAsFailedAttempt: false,
        };
      case 'auth/unauthorized-domain':
        return {
          message:
            'This domain is not authorized in Firebase Authentication. Add it under Firebase Console → Authentication → Settings → Authorized domains.',
          countAsFailedAttempt: false,
        };
      case 'auth/network-request-failed':
        return {
          message:
            'Network error connecting to Firebase Authentication. Please check your internet connection and try again.',
          countAsFailedAttempt: false,
        };
      case 'auth/invalid-api-key':
      case 'auth/app-not-authorized':
      case 'auth/configuration-not-found':
        return {
          message:
            'Firebase Authentication configuration error for project ai-studio-applet-webapp-e4b0f.',
          countAsFailedAttempt: false,
        };
      default:
        return {
          message:
            err instanceof Error && err.message
              ? err.message
              : 'Unable to sign in with Firebase Authentication.',
          countAsFailedAttempt: false,
        };
    }
  };

  const recordFailedAttempt = (currentAttempts: number) => {
    const nextAttempts = currentAttempts + 1;
    const nextLock =
      nextAttempts >= MAX_LOGIN_ATTEMPTS
        ? Date.now() + BASE_LOCKOUT_MS * Math.pow(2, nextAttempts - MAX_LOGIN_ATTEMPTS)
        : 0;
    writeLoginGuard({ attempts: nextAttempts, lockedUntil: nextLock });
    if (nextLock) setLoginLockoutUntil(nextLock);
  };

  // Email/Password + Username Login ONLY (NO Google Login!)
  const signInAdminWithCredentials = async (
    identifier: string,
    password: string,
    rememberSession: boolean
  ): Promise<void> => {
    const genericError = new Error('Username/email or password is incorrect.');

    if (!isFirebaseConfigured || !auth || !db) {
      throw new Error(
        'Firebase connection for ai-studio-applet-webapp-e4b0f is not configured yet.'
      );
    }

    const guard = readLoginGuard();
    if (guard.lockedUntil > Date.now()) {
      setLoginLockoutUntil(guard.lockedUntil);
      throw new Error(
        'Too many failed login attempts. Please wait before trying again.'
      );
    }

    const cleanId = identifier.trim().toLowerCase();
    if (!cleanId || !password) {
      throw genericError;
    }

    let resolvedEmail = cleanId;
    if (!cleanId.includes('@')) {
      try {
        const usernameSnap = await getDoc(doc(db, 'admin_usernames', cleanId));
        if (usernameSnap.exists()) {
          const mapping = usernameSnap.data() as AdminUsernameMapping;
          if (!mapping.active || !mapping.email) {
            recordFailedAttempt(guard.attempts);
            throw genericError;
          }
          resolvedEmail = mapping.email.trim().toLowerCase();
        } else if (cleanId === PRIMARY_SUPER_ADMIN_USERNAME) {
          resolvedEmail = PRIMARY_SUPER_ADMIN_EMAIL;
        } else {
          recordFailedAttempt(guard.attempts);
          throw genericError;
        }
      } catch (err) {
        if (err === genericError) throw genericError;
        const fsCode =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code?: unknown }).code || '')
            : '';
        if (fsCode === 'unavailable' || fsCode === 'network-request-failed') {
          throw new Error(
            'Unable to reach Firebase Firestore to look up username. You may also sign in directly with your admin email address.'
          );
        }
        if (cleanId === PRIMARY_SUPER_ADMIN_USERNAME) {
          resolvedEmail = PRIMARY_SUPER_ADMIN_EMAIL;
        } else {
          recordFailedAttempt(guard.attempts);
          throw genericError;
        }
      }
    }

    await applyAuthPersistence(rememberSession);

    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, resolvedEmail, password);
    } catch (authErr) {
      const mapped = mapFirebaseAuthError(authErr);
      if (mapped.countAsFailedAttempt) {
        recordFailedAttempt(guard.attempts);
      }
      throw new Error(mapped.message);
    }

    // Password authentication succeeded; verify provider, token, and RBAC authorization
    const isPasswordAuth = cred.user.providerData.some(
      (p) => p.providerId === 'password'
    );
    if (!isPasswordAuth) {
      await signOut(auth);
      throw new Error('Email/password authentication is required for Admin access.');
    }

    try {
      await cred.user.getIdToken(true);
    } catch {
      // Proceed with active credential token
    }

    // Reset failed-attempt lockout since Firebase Auth password succeeded
    writeLoginGuard({ attempts: 0, lockedUntil: 0 });
    setLoginLockoutUntil(0);

    const emailLower = (cred.user.email || resolvedEmail).trim().toLowerCase();
    const isBootstrapSuperAdmin = emailLower === PRIMARY_SUPER_ADMIN_EMAIL;

    // If email is not yet verified, allow MahmudLoginRoute to present the verification screen
    // (onAuthStateChanged keeps staffRole = null until emailVerified === true).
    if (!cred.user.emailVerified) {
      return;
    }

    let rbacEntry: RbacRoleEntry | null = null;
    let adminEntry: AdminRecord | null = null;

    try {
      const rbacSnap = await getDoc(doc(db, 'rbac_roles', emailLower));
      if (rbacSnap.exists()) {
        rbacEntry = rbacSnap.data() as RbacRoleEntry;
      }
    } catch {
      // Non-fatal: inspect admins/{uid} fallback
    }

    try {
      const adminSnap = await getDoc(doc(db, 'admins', cred.user.uid));
      if (adminSnap.exists()) {
        adminEntry = adminSnap.data() as AdminRecord;
      }
    } catch {
      // Non-fatal
    }

    const isDisabled =
      rbacEntry?.status === 'disabled' || adminEntry?.active === false;
    const hasActiveRbac = rbacEntry?.status === 'active';
    const hasActiveAdmin = adminEntry?.active === true;

    if (!isBootstrapSuperAdmin) {
      if (isDisabled) {
        await signOut(auth);
        throw new Error(
          'This administrator account has been disabled. Contact the Super Admin.'
        );
      }
      if (!hasActiveRbac && !hasActiveAdmin) {
        await signOut(auth);
        throw new Error(
          `Signed in as ${emailLower}, but this account is not registered as an active Admin or Support Agent.`
        );
      }
    }

    await writeActivityLogInternal(
      cred.user.uid,
      emailLower,
      'login',
      'auth',
      cred.user.uid,
      emailLower,
      'Admin portal email/password login'
    );
  };

  const resendAdminVerificationEmail = async (): Promise<void> => {
    if (!auth?.currentUser) return;
    await sendEmailVerification(auth.currentUser);
  };

  const refreshAdminSession = async (): Promise<void> => {
    if (!auth?.currentUser) return;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    setAuthRefreshTick((t) => t + 1);
  };

  const sendAdminPasswordReset = async (identifierOrEmail: string): Promise<void> => {
    if (!isFirebaseConfigured || !auth || !db) {
      throw new Error('Firebase is not configured.');
    }
    const clean = identifierOrEmail.trim().toLowerCase();
    if (!clean) return;

    let emailToReset = clean;
    if (!clean.includes('@')) {
      try {
        const snap = await getDoc(doc(db, 'admin_usernames', clean));
        if (snap.exists()) {
          const data = snap.data() as AdminUsernameMapping;
          emailToReset = data.email.trim().toLowerCase();
        } else if (clean === PRIMARY_SUPER_ADMIN_USERNAME) {
          emailToReset = PRIMARY_SUPER_ADMIN_EMAIL;
        } else {
          // Do not reveal if username exists
          return;
        }
      } catch {
        return;
      }
    }

    try {
      await sendPasswordResetEmail(auth, emailToReset);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (
        code === 'auth/operation-not-allowed' ||
        code === 'auth/unauthorized-domain' ||
        code === 'auth/network-request-failed'
      ) {
        throw new Error(mapFirebaseAuthError(err).message);
      }
      // Do not disclose account existence for auth/user-not-found
    }
  };

  const signOutAdmin = async (): Promise<void> => {
    if (!auth) return;
    if (user?.uid && user?.email) {
      await writeActivityLogInternal(
        user.uid,
        user.email,
        'logout',
        'auth',
        user.uid,
        user.email,
        'Admin portal logout'
      );
    }
    await signOut(auth);
    setUserRole(null);
    setAdminProfile(null);
  };

  // Non-destructive Safe Seed: ONLY creates missing documents, NEVER overwrites existing data
  const seedDemoCatalog = async (): Promise<{ createdCount: number }> => {
    if (!db) throw new Error('Firestore not configured');
    const batch = writeBatch(db);
    const now = serverTimestamp();
    let createdCount = 0;

    for (const cat of SEED_CATEGORIES) {
      const ref = doc(db, 'categories', cat.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        batch.set(ref, { ...cat, visible: true, deleted: false, createdAt: now, updatedAt: now });
        createdCount += 1;
      }
    }

    for (const occ of SEED_OCCASIONS) {
      const ref = doc(db, 'occasions', occ.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        batch.set(ref, { ...occ, visible: true, deleted: false, createdAt: now, updatedAt: now });
        createdCount += 1;
      }
    }

    for (const sr of SEED_SHOWROOMS) {
      const ref = doc(db, 'showrooms', sr.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        batch.set(ref, { ...sr, visible: true, deleted: false, createdAt: now, updatedAt: now });
        createdCount += 1;
      }
    }

    for (const prod of SEED_PRODUCTS) {
      const ref = doc(db, 'products', prod.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        batch.set(ref, {
          ...prod,
          visible: true,
          deleted: false,
          status: 'published',
          createdAt: now,
          updatedAt: now,
        });
        createdCount += 1;
      }
    }

    for (const sec of SEED_HOMEPAGE_SECTIONS) {
      const ref = doc(db, 'homepage_sections', sec.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        batch.set(ref, { ...sec, updatedAt: now });
        createdCount += 1;
      }
    }

    const greetingRef = doc(db, 'greetings', 'daily');
    if (!(await getDoc(greetingRef)).exists()) {
      batch.set(greetingRef, { ...SEED_GREETING, updatedAt: now });
      createdCount += 1;
    }

    const settingsRef = doc(db, 'site_settings', 'main');
    if (!(await getDoc(settingsRef)).exists()) {
      batch.set(settingsRef, { ...SEED_SITE_SETTINGS, updatedAt: now });
      createdCount += 1;
    }

    const seoRef = doc(db, 'seo_settings', 'main');
    if (!(await getDoc(seoRef)).exists()) {
      batch.set(seoRef, { ...SEED_SEO_SETTINGS, updatedAt: now });
      createdCount += 1;
    }

    if (createdCount > 0) {
      try {
        await batch.commit();
        await logAdminActivity(
          'safe_seed',
          'system',
          'seed_demo_catalog',
          'Initial Demo Data',
          `Safely added ${createdCount} missing documents without overwriting existing data.`
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'seed_demo_catalog');
      }
    }
    return { createdCount };
  };

  return (
    <StoreContext.Provider
      value={{
        categories,
        occasions,
        products,
        showrooms,
        heroBanners,
        homepageSections,
        greeting,
        greetingItems,
        aiKnowledge,
        allCategories,
        allOccasions,
        allProducts,
        allShowrooms,
        allHeroBanners,
        allHomepageSections,
        allGreetingItems,
        allAiKnowledge,
        mediaItems,
        siteSettings,
        seoSettings,
        languageMode,
        setLanguageMode,
        loading,
        firestoreEmpty,
        error,
        user,
        authReady,
        userRole,
        staffRole,
        adminProfile,
        accountStatus,
        isAdmin,
        isSuperAdmin,
        isCatalogAdmin,
        isSupportStaff,
        adminCheckLoading,
        emailVerificationRequired,
        loginLockoutRemainingSec,
        signInAdminWithCredentials,
        sendAdminPasswordReset,
        resendAdminVerificationEmail,
        refreshAdminSession,
        signOutAdmin,
        logAdminActivity,
        seedDemoCatalog,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore must be used inside StoreProvider');
  }
  return ctx;
}

export { firebaseConnectionStatus };
