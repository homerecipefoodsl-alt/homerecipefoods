import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  CANONICAL_OUTLET_SHOWROOMS,
  CONFIRMED_DEMO_SHOWROOM_IDS,
  isDemoOrDummyShowroom,
} from '../data/outletsData';
import {
  MAHALLABIA_CATEGORY,
  PRODUCT_MASTER_LIST,
  buildProductMatchKey,
  normalizeMasterText,
} from '../data/productMasterList';
import {
  SEED_CATEGORIES,
  SEED_GREETING,
  SEED_HOMEPAGE_SECTIONS,
  SEED_OCCASIONS,
  SEED_PRODUCTS,
  SEED_SEO_SETTINGS,
  SEED_SITE_SETTINGS,
} from '../data/seedData';
import { toSlug } from '../lib/utils';
import {
  OperationType,
  applyAuthPersistence,
  auth,
  db,
  firebaseConnectionStatus,
  handleFirestoreError,
  isFirebaseConfigured,
} from '../lib/firebase';
import {
  DEFAULT_ROLE_PERMISSIONS,
  type AccountStatus,
  type AdminRecord,
  type AdminUsernameMapping,
  type AiKnowledgeEntry,
  type Category,
  type DisplayLanguage,
  type GreetingConfig,
  type GreetingItem,
  type HeroSlide,
  type HomepageSection,
  type MediaItem,
  type Occasion,
  type PermissionKey,
  type Product,
  type RbacRoleEntry,
  type SeoSettings,
  type Showroom,
  type SiteSettings,
  type StaffRole,
  type UserAccount,
  type UserRole,
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
  firestoreShowrooms: Showroom[];
  legacyDemoShowrooms: Showroom[];
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
  productsLoading: boolean;
  showroomsLoading: boolean;
  firestoreEmpty: boolean;
  error: string | null;
  productsError: string | null;
  showroomsError: string | null;

  // Auth & RBAC state
  user: User | null;
  authReady: boolean;
  userRole: UserRole | null;
  staffRole: StaffRole | null;
  permissions: PermissionKey[];
  hasPermission: (perm: PermissionKey) => boolean;
  adminProfile: AdminRecord | null;
  accountStatus: AccountStatus;
  isAdmin: boolean;
  isPrimarySuperAdmin: boolean;
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
  importProductMasterList: () => Promise<MasterImportSummary>;
  masterImportStats: {
    totalMaster: number;
    syncedCount: number;
    missingCount: number;
    missingImageCount: number;
  };
  masterImportRunning: boolean;
  lastMasterImportSummary: MasterImportSummary | null;
}

export interface MasterImportSummary {
  totalMasterCount: number;
  existingProductCount: number;
  newlyAddedCount: number;
  skippedExistingCount: number;
  categoriesCreated: number;
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
  const [productsLoading, setProductsLoading] = useState(isFirebaseConfigured);
  const [showroomsLoading, setShowroomsLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [showroomsError, setShowroomsError] = useState<string | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [rbacPermissions, setRbacPermissions] = useState<PermissionKey[] | null>(null);
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
        setRbacPermissions(null);
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
        setRbacPermissions(null);
        setAdminProfile(null);
        setAccountStatus('active');
        setEmailVerificationRequired(false);
        setAdminCheckLoading(false);
        return;
      }

      if (!currentUser.emailVerified) {
        setUserRole('customer');
        setRbacPermissions(null);
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
        let resolvedPermissions: PermissionKey[] | null = isPrimarySuperAdminEmail
          ? DEFAULT_ROLE_PERMISSIONS.super_admin
          : null;
        let resolvedAdminRecord: AdminRecord | null = null;
        let rbacSnapDataCache: RbacRoleEntry | null = null;

        try {
          const activeRbacSnap = await getDoc(rbacRef);
          if (activeRbacSnap.exists()) {
            const rbacData = activeRbacSnap.data() as RbacRoleEntry;
            rbacSnapDataCache = rbacData;
            if (rbacData.status === 'active') {
              resolvedRole = rbacData.role;
              resolvedPermissions = Array.isArray(rbacData.permissions)
                ? rbacData.permissions
                : DEFAULT_ROLE_PERMISSIONS[rbacData.role] ?? [];
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
              resolvedStatus = rbacData.status === 'suspended' ? 'suspended' : 'disabled';
              resolvedPermissions = [];
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
            const adminNonActive =
              !aData.active || aData.status === 'disabled' || aData.status === 'suspended';
            if (!adminNonActive && resolvedStatus === 'active' && !rbacSnapDataCache) {
              resolvedRole = aData.role;
              if (!resolvedPermissions) {
                resolvedPermissions = Array.isArray(aData.permissions)
                  ? aData.permissions
                  : DEFAULT_ROLE_PERMISSIONS[aData.role] ?? [];
              }
            }
            if (!adminNonActive && resolvedStatus === 'active' && !isPrimarySuperAdminEmail) {
              try {
                await updateDoc(adminRef, {
                  last_login_at: now,
                  updated_at: now,
                });
              } catch {
                // Ignore if disallowed
              }
            } else if (adminNonActive && !isPrimarySuperAdminEmail) {
              resolvedRole = 'customer';
              resolvedStatus = aData.status === 'suspended' ? 'suspended' : 'disabled';
              resolvedPermissions = [];
            }
          } else if (
            !isPrimarySuperAdminEmail &&
            resolvedStatus === 'active' &&
            (resolvedRole === 'super_admin' ||
              resolvedRole === 'admin' ||
              resolvedRole === 'manager' ||
              resolvedRole === 'support_agent')
          ) {
            try {
              const staffUsername =
                rbacSnapDataCache?.username || emailLower.split('@')[0];
              const newAdminDoc: AdminRecord = {
                uid: currentUser.uid,
                email: emailLower,
                username: staffUsername,
                display_name:
                  currentUser.displayName ||
                  rbacSnapDataCache?.displayName ||
                  emailLower.split('@')[0],
                ...(rbacSnapDataCache?.phone ? { phone: rbacSnapDataCache.phone } : {}),
                ...(rbacSnapDataCache?.managerId
                  ? { manager_id: rbacSnapDataCache.managerId }
                  : {}),
                ...(rbacSnapDataCache?.managerTitle
                  ? { manager_title: rbacSnapDataCache.managerTitle }
                  : {}),
                permissions:
                  resolvedPermissions ?? DEFAULT_ROLE_PERMISSIONS[resolvedRole] ?? [],
                role: resolvedRole,
                active: true,
                status: 'active',
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
                status: resolvedStatus,
                createdAt: now,
                updatedAt: now,
                lastLoginAt: now,
              });
            } else {
              const existingUser = userSnap.data() as UserAccount;
              if (
                (existingUser.status === 'disabled' ||
                  existingUser.status === 'suspended') &&
                !isPrimarySuperAdminEmail
              ) {
                resolvedStatus = existingUser.status;
                resolvedRole = 'customer';
                resolvedPermissions = [];
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
        setRbacPermissions(resolvedPermissions);
        setAdminProfile(resolvedAdminRecord);
        setAccountStatus(resolvedStatus);

        if (
          currentUser.emailVerified &&
          resolvedStatus === 'active' &&
          resolvedRole !== 'customer'
        ) {
          void (async () => {
            try {
              const idToken = await currentUser.getIdToken();
              const resp = await fetch('/api/auth/session-init', {
                method: 'POST',
                headers: { Authorization: `Bearer ${idToken}` },
              });
              if (resp.ok) {
                const payload = (await resp.json()) as { claimsSynced?: boolean };
                if (payload.claimsSynced) {
                  await currentUser.getIdToken(true);
                }
              }
            } catch {
              // Non-blocking claims sync
            }
          })();
        }

        let latestRbacStatus: AccountStatus = resolvedStatus;
        let hasLiveRbacDoc = Boolean(rbacSnapDataCache);

        // Live subscriptions so role/status/permission changes apply immediately
        unsubRbac = onSnapshot(
          rbacRef,
          (snap) => {
            hasLiveRbacDoc = snap.exists();
            if (!snap.exists()) {
              if (!isPrimarySuperAdminEmail) {
                latestRbacStatus = 'disabled';
                setUserRole('customer');
                setRbacPermissions([]);
                setAccountStatus('disabled');
              }
              return;
            }
            const r = snap.data() as RbacRoleEntry;
            latestRbacStatus = r.status;
            if (r.status === 'active') {
              setUserRole(r.role);
              setRbacPermissions(
                Array.isArray(r.permissions)
                  ? r.permissions
                  : DEFAULT_ROLE_PERMISSIONS[r.role] ?? []
              );
              setAccountStatus('active');
            } else {
              setUserRole('customer');
              setRbacPermissions([]);
              setAccountStatus(r.status === 'suspended' ? 'suspended' : 'disabled');
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
              const adminNonActive =
                !a.active || a.status === 'disabled' || a.status === 'suspended';
              if (adminNonActive && !isPrimarySuperAdminEmail) {
                setUserRole('customer');
                setRbacPermissions([]);
                setAccountStatus(a.status === 'suspended' ? 'suspended' : 'disabled');
              } else if (latestRbacStatus === 'active' && !hasLiveRbacDoc) {
                setUserRole(a.role);
                if (Array.isArray(a.permissions)) {
                  setRbacPermissions(a.permissions);
                }
                setAccountStatus('active');
              }
            }
          },
          () => {}
        );

        unsubUserDoc = onSnapshot(
          userRef,
          (snap) => {
            if (snap.exists() && !isPrimarySuperAdminEmail) {
              const u = snap.data() as UserAccount;
              if (u.status === 'disabled' || u.status === 'suspended') {
                setUserRole('customer');
                setRbacPermissions([]);
                setAccountStatus(u.status);
              }
            }
          },
          () => {}
        );
      } catch (err) {
        console.error('Admin verification error:', err);
        setUserRole('customer');
        setRbacPermissions(null);
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
    const settledKeys = new Set<string>();
    const markSettled = (key: string) => {
      settledKeys.add(key);
      if (settledKeys.size >= 6) setLoading(false);
    };

    const unsubCats = onSnapshot(
      query(collection(activeDb, 'categories'), orderBy('order', 'asc')),
      (snap) => {
        setDbCategories(
          snap.docs.map((d) => ({
            ...(d.data() as Category),
            id: (d.data().id as string) || d.id,
          }))
        );
        markSettled('categories');
      },
      (err) => {
        console.error('Categories loading failed:', err);
        setError('ক্যাটালগ লোড করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
        markSettled('categories');
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
        setDbOccasions(
          snap.docs.map((d) => ({
            ...(d.data() as Occasion),
            id: (d.data().id as string) || d.id,
          }))
        );
        markSettled('occasions');
      },
      (err) => {
        console.warn('Occasions loading warning:', err);
        markSettled('occasions');
      }
    );

    const unsubProds = onSnapshot(
      collection(activeDb, 'products'),
      (snap) => {
        setProductsError(null);
        setDbProducts(
          snap.docs.map((d) => {
            const raw = d.data() as Product;
            return {
              ...raw,
              id: raw.id || d.id,
            };
          })
        );
        setProductsLoading(false);
        markSettled('products');
      },
      (err) => {
        console.error('Products loading failed:', err);
        setProductsError(
          'পণ্যগুলো এখন লোড করা যাচ্ছে না। অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন।'
        );
        setProductsLoading(false);
        markSettled('products');
        try {
          handleFirestoreError(err, OperationType.LIST, 'products');
        } catch {
          // Logged above
        }
      }
    );

    const unsubShowrooms = onSnapshot(
      collection(activeDb, 'showrooms'),
      (snap) => {
        setShowroomsError(null);
        setDbShowrooms(snap.docs.map((d) => d.data() as Showroom));
        setShowroomsLoading(false);
        markSettled('showrooms');
      },
      (err) => {
        console.warn('Showrooms loading warning:', err);
        setShowroomsError('শোরুম তালিকা ডাটাবেস থেকে লোড করা যায়নি; অনুমোদিত শোরুম তালিকা দেখানো হচ্ছে।');
        setShowroomsLoading(false);
        markSettled('showrooms');
      }
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
        markSettled('greetings');
      },
      () => markSettled('greetings')
    );

    const unsubSettings = onSnapshot(
      doc(activeDb, 'site_settings', 'main'),
      (snap) => {
        setDbSettings(snap.exists() ? (snap.data() as SiteSettings) : null);
        markSettled('site_settings');
      },
      () => markSettled('site_settings')
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
  const [masterImportRunning, setMasterImportRunning] = useState(false);
  const [lastMasterImportSummary, setLastMasterImportSummary] =
    useState<MasterImportSummary | null>(null);

  const allCategories = useMemo(() => {
    const seedList = [...SEED_CATEGORIES, MAHALLABIA_CATEGORY];
    if (!dbCategories || dbCategories.length === 0) return seedList;
    return dbCategories
      .map((docItem) => {
        const seed = seedList.find(
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
    const safeStr = (val: unknown): string =>
      typeof val === 'string' ? val.trim() : val != null ? String(val).trim() : '';

    if (productsError && !dbProducts) return [];
    if (!dbProducts || dbProducts.length === 0) {
      return isFirebaseConfigured ? [] : SEED_PRODUCTS;
    }
    return dbProducts
      .map((docItem) => {
        const docCategory = safeStr(docItem.category || docItem.categorySlug);
        const seed = SEED_PRODUCTS.find(
          (s) => s.id === docItem.id || (docItem.slug && s.slug === docItem.slug)
        );
        const cat = allCategories.find(
          (c) =>
            c.slug === docCategory ||
            c.name === safeStr(docItem.categoryName)
        );
        const docImageCandidates = [
          ...(Array.isArray(docItem.images) ? docItem.images : []),
          docItem.image,
          docItem.imageUrl,
          ...(Array.isArray(seed?.images) ? seed.images : []),
        ].filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
        const normalizedImages = Array.from(new Set(docImageCandidates));

        const resolvedNameBn =
          safeStr(docItem.nameBn) ||
          safeStr(docItem.name_bn) ||
          safeStr(docItem.name) ||
          seed?.name_bn ||
          safeStr(docItem.nameEn) ||
          safeStr(docItem.name_en) ||
          'পণ্য';
        const resolvedNameEn =
          safeStr(docItem.nameEn) ||
          safeStr(docItem.name_en) ||
          safeStr(docItem.name) ||
          seed?.nameEn ||
          resolvedNameBn;
        const resolvedSlug =
          safeStr(docItem.slug) || toSlug(resolvedNameEn || resolvedNameBn) || docItem.id;
        const resolvedUnit =
          safeStr(docItem.unit) || safeStr(docItem.priceUnit) || seed?.priceUnit || 'Piece';
        const parsedPrice = Number(docItem.price);
        const resolvedPrice = Number.isFinite(parsedPrice)
          ? parsedPrice
          : seed?.price ?? 0;
        const resolvedCategory = (
          docCategory ||
          cat?.slug ||
          seed?.category ||
          ''
        ).trim();

        return {
          ...seed,
          ...docItem,
          id: docItem.id,
          name: docItem.name || resolvedNameBn,
          nameBn: resolvedNameBn,
          nameEn: resolvedNameEn,
          name_bn: docItem.name_bn || resolvedNameBn,
          name_en: docItem.name_en || resolvedNameEn,
          slug: resolvedSlug,
          category: resolvedCategory,
          categoryName:
            docItem.categoryName || cat?.name || seed?.categoryName || resolvedCategory,
          categoryNameEn:
            docItem.categoryNameEn || cat?.name_en || cat?.nameEn || seed?.categoryNameEn || '',
          productType: docItem.productType || seed?.productType || 'Daily Item',
          price: resolvedPrice,
          unit: resolvedUnit,
          priceUnit: docItem.priceUnit || resolvedUnit || 'Piece',
          shortDescription:
            docItem.shortDescription || docItem.short_description_bn || seed?.shortDescription || '',
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
          description:
            docItem.description || docItem.description_bn || seed?.description || '',
          descriptionEn:
            docItem.descriptionEn || docItem.description_en || seed?.descriptionEn || '',
          description_bn:
            docItem.description_bn || docItem.description || seed?.description_bn || '',
          description_en:
            docItem.description_en || docItem.descriptionEn || seed?.description_en || '',
          image: docItem.image || docItem.imageUrl || normalizedImages[0] || '',
          images: normalizedImages,
          ingredients: Array.isArray(docItem.ingredients)
            ? docItem.ingredients
            : seed?.ingredients ?? [],
          sizes: Array.isArray(docItem.sizes) ? docItem.sizes : seed?.sizes ?? [],
          weight: docItem.weight || seed?.weight || '',
          occasions: Array.isArray(docItem.occasions)
            ? docItem.occasions
            : seed?.occasions ?? [],
          showrooms: Array.isArray(docItem.showrooms)
            ? docItem.showrooms.filter(
                (sid): sid is string =>
                  typeof sid === 'string' && !CONFIRMED_DEMO_SHOWROOM_IDS.has(sid)
              )
            : [],
          availability: docItem.availability || seed?.availability || 'In Showroom',
          importantNotes: docItem.importantNotes || seed?.importantNotes || '',
          featured: Boolean(docItem.featured),
          popular: Boolean(docItem.popular),
          visible: docItem.visible !== false,
          active: docItem.active !== false,
          isActive: docItem.isActive !== false,
          deleted: Boolean(docItem.deleted),
        } as Product;
      })
      .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
  }, [dbProducts, productsError, allCategories]);

  const products = useMemo(
    () =>
      allProducts.filter(
        (p) =>
          p.visible !== false &&
          !p.deleted &&
          p.status !== 'archived' &&
          p.active !== false &&
          p.isActive !== false
      ),
    [allProducts]
  );

  const legacyDemoShowrooms = useMemo(() => {
    if (!dbShowrooms || dbShowrooms.length === 0) return [];
    return dbShowrooms.filter((docItem) => isDemoOrDummyShowroom(docItem));
  }, [dbShowrooms]);

  const firestoreShowrooms = useMemo(() => {
    if (!dbShowrooms || dbShowrooms.length === 0) return [];
    return dbShowrooms
      .filter((docItem) => !isDemoOrDummyShowroom(docItem))
      .map((docItem) => {
        return {
          ...docItem,
          nameEn: docItem.nameEn || docItem.name_en || docItem.name,
          name_bn: docItem.name_bn || docItem.name || '',
          name_en: docItem.name_en || docItem.nameEn || '',
          areaEn: docItem.areaEn || docItem.area || '',
          addressEn: docItem.addressEn || docItem.address_en || '',
          address_bn: docItem.address_bn || docItem.address || '',
          address_en: docItem.address_en || docItem.addressEn || '',
          description: docItem.description || docItem.description_bn || '',
          descriptionEn: docItem.descriptionEn || docItem.description_en || '',
          description_bn: docItem.description_bn || docItem.description || '',
          description_en: docItem.description_en || docItem.descriptionEn || '',
          openingHoursEn: docItem.openingHoursEn || '',
          visible: docItem.visible !== false,
          deleted: Boolean(docItem.deleted),
        } as Showroom;
      })
      .sort((a, b) => (a.display_order ?? 99) - (b.display_order ?? 99));
  }, [dbShowrooms]);

  const allShowrooms = useMemo(() => {
    const mergedMap = new Map<string, Showroom>();
    CANONICAL_OUTLET_SHOWROOMS.forEach((outlet) => mergedMap.set(outlet.id, outlet));
    firestoreShowrooms.forEach((fsSr) => {
      const base = mergedMap.get(fsSr.id);
      mergedMap.set(fsSr.id, base ? { ...base, ...fsSr } : fsSr);
    });
    return Array.from(mergedMap.values()).sort(
      (a, b) => (a.display_order ?? 99) - (b.display_order ?? 99)
    );
  }, [firestoreShowrooms]);

  const showrooms = useMemo(
    () =>
      allShowrooms.filter(
        (s) => s.visible !== false && !s.deleted && !isDemoOrDummyShowroom(s)
      ),
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
    if (accountStatus !== 'active') return null;
    if (
      userRole === 'super_admin' ||
      userRole === 'admin' ||
      userRole === 'manager' ||
      userRole === 'support_agent'
    ) {
      return userRole;
    }
    return null;
  }, [userRole, accountStatus]);

  const permissions: PermissionKey[] = useMemo(() => {
    if (!staffRole || accountStatus !== 'active') return [];
    if (staffRole === 'super_admin') {
      return DEFAULT_ROLE_PERMISSIONS.super_admin;
    }
    if (rbacPermissions !== null) {
      return rbacPermissions;
    }
    return DEFAULT_ROLE_PERMISSIONS[staffRole] ?? [];
  }, [staffRole, accountStatus, rbacPermissions]);

  const hasPermission = useCallback(
    (perm: PermissionKey): boolean => {
      if (!staffRole || accountStatus !== 'active') return false;
      if (staffRole === 'super_admin') return true;
      return permissions.includes(perm);
    },
    [staffRole, accountStatus, permissions]
  );

  const isSuperAdmin = staffRole === 'super_admin';
  const isPrimarySuperAdmin =
    isSuperAdmin &&
    Boolean(user?.emailVerified) &&
    user?.email?.trim().toLowerCase() === PRIMARY_SUPER_ADMIN_EMAIL;
  const isCatalogAdmin =
    staffRole === 'super_admin' ||
    hasPermission('products_view') ||
    hasPermission('categories_manage') ||
    hasPermission('showrooms_manage') ||
    hasPermission('banners_manage');
  const isSupportStaff =
    staffRole === 'super_admin' ||
    hasPermission('complaints_manage') ||
    hasPermission('chat_manage');
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

    const isSuspended =
      rbacEntry?.status === 'suspended' || adminEntry?.status === 'suspended';
    const isDisabled =
      rbacEntry?.status === 'disabled' ||
      rbacEntry?.status === 'suspended' ||
      adminEntry?.active === false ||
      adminEntry?.status === 'disabled' ||
      adminEntry?.status === 'suspended';
    const hasActiveRbac = rbacEntry?.status === 'active';
    const hasActiveAdmin = adminEntry?.active === true && adminEntry?.status !== 'suspended';

    if (!isBootstrapSuperAdmin) {
      if (isDisabled) {
        await signOut(auth);
        throw new Error(
          isSuspended
            ? 'This staff account has been suspended. Contact the Super Admin.'
            : 'This administrator account has been disabled. Contact the Super Admin.'
        );
      }
      if (!hasActiveRbac && !hasActiveAdmin) {
        await signOut(auth);
        throw new Error(
          `Signed in as ${emailLower}, but this account is not registered as an active Admin, Manager, or Support Agent.`
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

  const masterImportStats = useMemo(() => {
    const sourceProducts = isFirebaseConfigured ? dbProducts ?? [] : allProducts;
    const syncedCount = PRODUCT_MASTER_LIST.filter((item) =>
      sourceProducts.some(
        (p) =>
          p.id === item.id ||
          p.masterKey === item.masterKey ||
          buildProductMatchKey(
            p.nameBn || p.name_bn || p.name || '',
            p.nameEn || p.name_en || '',
            p.category || '',
            p.unit || p.priceUnit || ''
          ) === item.masterKey
      )
    ).length;

    const missingImageCount = allProducts.filter(
      (p) =>
        !p.deleted &&
        !p.image &&
        !p.imageUrl &&
        (!p.images || p.images.length === 0)
    ).length;

    return {
      totalMaster: PRODUCT_MASTER_LIST.length,
      syncedCount,
      missingCount: Math.max(0, PRODUCT_MASTER_LIST.length - syncedCount),
      missingImageCount,
    };
  }, [dbProducts, allProducts]);

  // Duplicate-safe & Idempotent Admin-only Product Master List Import
  const importProductMasterList = useCallback(async (): Promise<MasterImportSummary> => {
    if (!db) throw new Error('Firestore not configured');
    if (!isAdmin || !hasPermission('products_add')) {
      throw new Error('Admin permission required to import product master list.');
    }

    setMasterImportRunning(true);
    try {
      const firestore = db;
      const now = serverTimestamp();

      // 1. Inspect live categories without overwriting any existing category
      const catSnap = await getDocs(collection(firestore, 'categories'));
      const existingCategorySlugs = new Set<string>();
      const existingCategoryByNormName = new Map<string, string>();
      catSnap.docs.forEach((d) => {
        const c = d.data() as Category;
        if (c.slug) existingCategorySlugs.add(c.slug);
        if (c.name) existingCategoryByNormName.set(normalizeMasterText(c.name), c.slug);
        if (c.name_bn) existingCategoryByNormName.set(normalizeMasterText(c.name_bn), c.slug);
        if (c.nameEn) existingCategoryByNormName.set(normalizeMasterText(c.nameEn), c.slug);
        if (c.name_en) existingCategoryByNormName.set(normalizeMasterText(c.name_en), c.slug);
      });

      const requiredCategories: Category[] = [
        ...SEED_CATEGORIES.filter((c) =>
          ['fast-food', 'bread', 'pastry', 'frozen-items', 'special-sweets', 'dry-sweets', 'cookies'].includes(c.slug)
        ),
        MAHALLABIA_CATEGORY,
      ];

      let categoriesCreated = 0;
      const categoryWrites: Array<{ id: string; data: Record<string, unknown> }> = [];
      if (hasPermission('categories_manage')) {
        for (const cat of requiredCategories) {
          const alreadyExists =
            existingCategorySlugs.has(cat.slug) ||
            existingCategoryByNormName.has(normalizeMasterText(cat.name)) ||
            existingCategoryByNormName.has(normalizeMasterText(cat.nameEn));
          if (!alreadyExists) {
            categoryWrites.push({
              id: cat.id,
              data: {
                ...cat,
                visible: true,
                deleted: false,
                createdAt: now,
                updatedAt: now,
              },
            });
            existingCategorySlugs.add(cat.slug);
            categoriesCreated += 1;
          }
        }
      }

      // 2. Inspect ALL existing products in Firestore before writing
      const prodSnap = await getDocs(collection(firestore, 'products'));
      const existingProductCount = prodSnap.size;
      const existingIds = new Set<string>();
      const existingSlugs = new Set<string>();
      const existingMasterKeys = new Set<string>();
      const existingMatchKeys = new Set<string>();

      prodSnap.docs.forEach((d) => {
        const p = d.data() as Product;
        existingIds.add(d.id);
        if (p.id) existingIds.add(p.id);
        if (p.slug) existingSlugs.add(p.slug);
        if (p.masterKey) existingMasterKeys.add(p.masterKey);
        const mk = buildProductMatchKey(
          p.nameBn || p.name_bn || p.name || '',
          p.nameEn || p.name_en || '',
          p.category || '',
          p.unit || p.priceUnit || ''
        );
        existingMatchKeys.add(mk);
      });

      let skippedExistingCount = 0;
      const productWrites: Array<{ id: string; data: Record<string, unknown> }> = [];

      for (const item of PRODUCT_MASTER_LIST) {
        const matchedCatSlug =
          existingCategoryByNormName.get(normalizeMasterText(item.categoryBn)) ||
          existingCategoryByNormName.get(normalizeMasterText(item.categoryNameEn)) ||
          item.categorySlug;

        const liveMatchKey = buildProductMatchKey(
          item.nameBn,
          item.nameEn,
          matchedCatSlug,
          item.unit
        );

        if (
          existingIds.has(item.id) ||
          existingMasterKeys.has(item.masterKey) ||
          existingMatchKeys.has(item.masterKey) ||
          existingMatchKeys.has(liveMatchKey)
        ) {
          skippedExistingCount += 1;
          continue;
        }

        let finalSlug = item.slug;
        if (existingSlugs.has(finalSlug)) {
          const withUnit = `${toSlug(item.nameEn)}-${toSlug(item.unit)}`;
          finalSlug = withUnit;
          let suffix = 2;
          while (existingSlugs.has(finalSlug)) {
            finalSlug = `${withUnit}-${suffix}`;
            suffix += 1;
          }
        }
        existingSlugs.add(finalSlug);
        existingIds.add(item.id);
        existingMasterKeys.add(item.masterKey);
        existingMatchKeys.add(item.masterKey);
        existingMatchKeys.add(liveMatchKey);

        const shortDescBn = `${item.nameBn} — ${item.categoryBn} (${item.unit})`;
        const shortDescEn = `${item.nameEn} — ${item.categoryNameEn} (${item.unit})`;
        const fullDescBn = `${item.nameBn} (${item.nameEn}) — ${item.categoryBn} বিভাগের পণ্য। একক: ${item.unit}।`;
        const fullDescEn = `${item.nameEn} (${item.nameBn}) — ${item.categoryNameEn} showcase item. Unit: ${item.unit}.`;

        productWrites.push({
          id: item.id,
          data: {
            id: item.id,
            name: item.nameBn,
            nameBn: item.nameBn,
            nameEn: item.nameEn,
            name_bn: item.nameBn,
            name_en: item.nameEn,
            slug: finalSlug,
            category: matchedCatSlug,
            categoryName: item.categoryBn,
            categoryNameEn: item.categoryNameEn,
            productType: item.categoryNameEn,
            price: item.price,
            priceUnit: item.unit,
            unit: item.unit,
            shortDescription: shortDescBn,
            shortDescriptionEn: shortDescEn,
            short_description_bn: shortDescBn,
            short_description_en: shortDescEn,
            description: fullDescBn,
            descriptionEn: fullDescEn,
            description_bn: fullDescBn,
            description_en: fullDescEn,
            image: '',
            images: [],
            masterKey: item.masterKey,
            ingredients: [],
            sizes: [item.unit],
            weight: item.unit,
            occasions: [],
            showrooms: [],
            availability: 'In Showroom',
            importantNotes: '',
            featured: false,
            popular: false,
            visible: true,
            deleted: false,
            status: 'published',
            display_order: item.displayOrder,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      // 3. Commit missing categories + missing products in safe chunked batches
      const BATCH_CHUNK_SIZE = 100;
      const allOps: Array<{ col: 'categories' | 'products'; id: string; data: Record<string, unknown> }> = [
        ...categoryWrites.map((w) => ({ col: 'categories' as const, ...w })),
        ...productWrites.map((w) => ({ col: 'products' as const, ...w })),
      ];

      for (let i = 0; i < allOps.length; i += BATCH_CHUNK_SIZE) {
        const chunk = allOps.slice(i, i + BATCH_CHUNK_SIZE);
        const batch = writeBatch(firestore);
        for (const op of chunk) {
          batch.set(doc(firestore, op.col, op.id), op.data);
        }
        await batch.commit();
      }

      const summary: MasterImportSummary = {
        totalMasterCount: PRODUCT_MASTER_LIST.length,
        existingProductCount,
        newlyAddedCount: productWrites.length,
        skippedExistingCount,
        categoriesCreated,
      };
      setLastMasterImportSummary(summary);

      if (productWrites.length > 0 || categoriesCreated > 0) {
        await logAdminActivity(
          'master_import',
          'products',
          'product_master_list',
          'Product Master List Sync',
          `Added ${productWrites.length} products and ${categoriesCreated} categories; skipped ${skippedExistingCount} existing.`
        );
      }

      return summary;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'products/master_import');
      throw err;
    } finally {
      setMasterImportRunning(false);
    }
  }, [hasPermission, isAdmin, logAdminActivity]);

  // Safe one-time Admin auto-import: runs ONLY once per Admin session when 0 master items exist in Firestore
  const autoMasterImportAttemptedRef = useRef(false);
  useEffect(() => {
    if (autoMasterImportAttemptedRef.current) return;
    if (
      !isFirebaseConfigured ||
      !db ||
      !authReady ||
      adminCheckLoading ||
      !isAdmin ||
      !hasPermission('products_add') ||
      dbCategories === null ||
      dbProducts === null
    ) {
      return;
    }

    autoMasterImportAttemptedRef.current = true;
    const syncedCount = PRODUCT_MASTER_LIST.filter((item) =>
      dbProducts.some(
        (p) =>
          p.id === item.id ||
          p.masterKey === item.masterKey ||
          buildProductMatchKey(
            p.nameBn || p.name_bn || p.name || '',
            p.nameEn || p.name_en || '',
            p.category || '',
            p.unit || p.priceUnit || ''
          ) === item.masterKey
      )
    ).length;

    if (syncedCount === 0) {
      void importProductMasterList().catch((err) => {
        console.warn('Auto master product import skipped/failed:', err);
      });
    }
  }, [
    authReady,
    adminCheckLoading,
    isAdmin,
    hasPermission,
    dbCategories,
    dbProducts,
    importProductMasterList,
  ]);

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
        firestoreShowrooms,
        legacyDemoShowrooms,
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
        productsLoading,
        showroomsLoading,
        firestoreEmpty,
        error,
        productsError,
        showroomsError,
        user,
        authReady,
        userRole,
        staffRole,
        permissions,
        hasPermission,
        adminProfile,
        accountStatus,
        isAdmin,
        isPrimarySuperAdmin,
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
        importProductMasterList,
        masterImportStats,
        masterImportRunning,
        lastMasterImportSummary,
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
