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
  MASTER_CATEGORY_DEFINITIONS,
  PRODUCT_MASTER_LIST,
  buildProductMatchKey,
  normalizeMasterText,
  resolveMasterCategoryDef,
} from '../data/productMasterList';
import { getCatalogStudioPhotos } from '../data/productPhotoMap';
import { resolveProductCategorySlug } from '../lib/bilingual';
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
import { fetchCollectionFromServer, fetchDocFromServer } from '../lib/adminDb';
import {
  DEFAULT_ROLE_PERMISSIONS,
  isSuperAdminRole,
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

async function bootstrapPrimarySuperAdminDocs(
  activeDb: NonNullable<typeof db>,
  currentUser: User
): Promise<AdminRecord | null> {
  const emailLower = (currentUser.email || '').trim().toLowerCase();
  if (!currentUser.emailVerified || emailLower !== PRIMARY_SUPER_ADMIN_EMAIL) {
    return null;
  }

  const now = serverTimestamp();
  const adminRef = doc(activeDb, 'admins', currentUser.uid);
  const rbacRef = doc(activeDb, 'rbac_roles', PRIMARY_SUPER_ADMIN_EMAIL);
  const usernameRef = doc(activeDb, 'admin_usernames', PRIMARY_SUPER_ADMIN_USERNAME);

  try {
    const existingAdmin = await fetchDocFromServer(adminRef);
    if (existingAdmin.exists()) {
      return existingAdmin.data() as AdminRecord;
    }

    await setDoc(adminRef, {
      uid: currentUser.uid,
      email: PRIMARY_SUPER_ADMIN_EMAIL,
      username: PRIMARY_SUPER_ADMIN_USERNAME,
      display_name: currentUser.displayName || 'Mahmud (Primary Super Admin)',
      role: 'primary_super_admin',
      active: true,
      isActive: true,
      status: 'active',
      permissions: DEFAULT_ROLE_PERMISSIONS.primary_super_admin,
      created_by: 'primary-super-admin-bootstrap',
      created_at: now,
      updated_at: now,
      last_login_at: now,
    });

    try {
      const existingRbac = await fetchDocFromServer(rbacRef);
      if (!existingRbac.exists()) {
        await setDoc(rbacRef, {
          email: PRIMARY_SUPER_ADMIN_EMAIL,
          uid: currentUser.uid,
          username: PRIMARY_SUPER_ADMIN_USERNAME,
          displayName: currentUser.displayName || 'Mahmud (Primary Super Admin)',
          role: 'primary_super_admin',
          status: 'active',
          permissions: DEFAULT_ROLE_PERMISSIONS.primary_super_admin,
          addedByEmail: PRIMARY_SUPER_ADMIN_EMAIL,
          createdBy: 'primary-super-admin-bootstrap',
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now,
        });
      }
    } catch {
      // Non-fatal if rbac_roles already exists
    }

    try {
      const existingUsername = await fetchDocFromServer(usernameRef);
      if (!existingUsername.exists()) {
        await setDoc(usernameRef, {
          username: PRIMARY_SUPER_ADMIN_USERNAME,
          email: PRIMARY_SUPER_ADMIN_EMAIL,
          active: true,
          updatedAt: now,
        });
      }
    } catch {
      // Non-fatal if admin_usernames/mahmud already exists
    }

    const createdAdmin = await fetchDocFromServer(adminRef);
    return createdAdmin.exists() ? (createdAdmin.data() as AdminRecord) : null;
  } catch {
    return null;
  }
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
  cmsSyncError: string | null;
  refreshingStoreData: boolean;
  refreshStoreData: () => Promise<void>;

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
  adminDocMissing: boolean;
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
  assignMissingStudioPhotos: () => Promise<{ updatedCount: number; skippedCount: number }>;
  masterImportStats: {
    totalMaster: number;
    syncedCount: number;
    missingCount: number;
    missingImageCount: number;
    unsyncedStudioPhotoCount: number;
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
  const [cmsSyncError, setCmsSyncError] = useState<string | null>(null);
  const [refreshingStoreData, setRefreshingStoreData] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [rbacPermissions, setRbacPermissions] = useState<PermissionKey[] | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminRecord | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('active');
  const [adminCheckLoading, setAdminCheckLoading] = useState(isFirebaseConfigured);
  const [adminDocMissing, setAdminDocMissing] = useState(false);
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
        setAdminDocMissing(false);
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
        setAdminDocMissing(false);
        setEmailVerificationRequired(false);
        setAdminCheckLoading(false);
        return;
      }

      if (!currentUser.emailVerified) {
        setUserRole('customer');
        setRbacPermissions(null);
        setAdminProfile(null);
        setAccountStatus('active');
        setAdminDocMissing(false);
        setEmailVerificationRequired(true);
        setAdminCheckLoading(false);
        return;
      }

      setEmailVerificationRequired(false);
      setAdminCheckLoading(true);
      const emailLower = currentUser.email.trim().toLowerCase();

      const isValidStaffRoleValue = (r: unknown): r is StaffRole =>
        r === 'primary_super_admin' ||
        r === 'super_admin' ||
        r === 'admin' ||
        r === 'manager' ||
        r === 'editor' ||
        r === 'moderator' ||
        r === 'support_agent';

      const evaluateAuthorityDocs = (
        adminDocData: AdminRecord | null,
        rbacDocData: RbacRoleEntry | null,
        userStatusValue: AccountStatus
      ): {
        role: UserRole;
        permissions: PermissionKey[];
        status: AccountStatus;
        docMissing: boolean;
      } => {
        if (userStatusValue === 'disabled' || userStatusValue === 'suspended') {
          return {
            role: 'customer',
            permissions: [],
            status: userStatusValue,
            docMissing: false,
          };
        }

        // Primary Authority: /admins/{uid}
        if (adminDocData) {
          const docEmail =
            typeof adminDocData.email === 'string'
              ? adminDocData.email.trim().toLowerCase()
              : '';
          if (docEmail && docEmail !== emailLower) {
            return {
              role: 'customer',
              permissions: [],
              status: 'disabled',
              docMissing: false,
            };
          }
          const isExplicitlyInactive =
            adminDocData.active === false ||
            adminDocData.isActive === false ||
            adminDocData.status === 'disabled' ||
            adminDocData.status === 'suspended';
          const isExplicitlyActive =
            adminDocData.active === true ||
            adminDocData.isActive === true ||
            adminDocData.status === 'active';
          if (isExplicitlyInactive || !isExplicitlyActive) {
            return {
              role: 'customer',
              permissions: [],
              status: adminDocData.status === 'suspended' ? 'suspended' : 'disabled',
              docMissing: false,
            };
          }
          if (!isValidStaffRoleValue(adminDocData.role)) {
            return {
              role: 'customer',
              permissions: [],
              status: 'disabled',
              docMissing: false,
            };
          }
          return {
            role: adminDocData.role,
            permissions: Array.isArray(adminDocData.permissions)
              ? adminDocData.permissions
              : DEFAULT_ROLE_PERMISSIONS[adminDocData.role] ?? [],
            status: 'active',
            docMissing: false,
          };
        }

        // Fallback Authority: /rbac_roles/{email} ONLY if /admins/{uid} does not exist
        if (rbacDocData) {
          const rbacEmail =
            typeof rbacDocData.email === 'string'
              ? rbacDocData.email.trim().toLowerCase()
              : '';
          if (rbacEmail && rbacEmail !== emailLower) {
            return {
              role: 'customer',
              permissions: [],
              status: 'disabled',
              docMissing: false,
            };
          }
          if (rbacDocData.status !== 'active') {
            return {
              role: 'customer',
              permissions: [],
              status: rbacDocData.status === 'suspended' ? 'suspended' : 'disabled',
              docMissing: false,
            };
          }
          if (!isValidStaffRoleValue(rbacDocData.role)) {
            return {
              role: 'customer',
              permissions: [],
              status: 'disabled',
              docMissing: false,
            };
          }
          return {
            role: rbacDocData.role,
            permissions: Array.isArray(rbacDocData.permissions)
              ? rbacDocData.permissions
              : DEFAULT_ROLE_PERMISSIONS[rbacDocData.role] ?? [],
            status: 'active',
            docMissing: false,
          };
        }

        return {
          role: 'customer',
          permissions: [],
          status: 'active',
          docMissing: true,
        };
      };

      try {
        const rbacRef = doc(activeDb, 'rbac_roles', emailLower);
        const adminRef = doc(activeDb, 'admins', currentUser.uid);
        const userRef = doc(activeDb, 'users', currentUser.uid);
        const now = serverTimestamp();

        let adminSnapDataCache: AdminRecord | null = null;
        let rbacSnapDataCache: RbacRoleEntry | null = null;
        let userStatusCache: AccountStatus = 'active';

        // 1. Read Primary Authority: admins/{uid}
        try {
          const adminSnap = await fetchDocFromServer(adminRef);
          if (adminSnap.exists()) {
            adminSnapDataCache = adminSnap.data() as AdminRecord;
          }
        } catch {
          // Will inspect fallback or fail closed cleanly
        }

        // 2. Fallback read: rbac_roles/{email} only if admins/{uid} does not exist
        if (!adminSnapDataCache) {
          try {
            const activeRbacSnap = await fetchDocFromServer(rbacRef);
            if (activeRbacSnap.exists()) {
              rbacSnapDataCache = activeRbacSnap.data() as RbacRoleEntry;
            }
          } catch {
            // Fails closed cleanly
          }
        }

        // 3. Check user profile status (never promotes role; only tracks account suspension/profile)
        try {
          const userSnap = await fetchDocFromServer(userRef);
          if (userSnap.exists()) {
            const existingUser = userSnap.data() as UserAccount;
            if (existingUser.status === 'disabled' || existingUser.status === 'suspended') {
              userStatusCache = existingUser.status;
            }
          }
        } catch {
          // Non-fatal
        }

        const initialAuth = evaluateAuthorityDocs(
          adminSnapDataCache,
          rbacSnapDataCache,
          userStatusCache
        );

        // Non-elevating user profile metadata sync only when a profile doc doesn't conflict
        try {
          const userSnap = await fetchDocFromServer(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: currentUser.uid,
              email: emailLower,
              displayName: currentUser.displayName || emailLower.split('@')[0],
              photoUrl: currentUser.photoURL || '',
              role: initialAuth.role,
              status: initialAuth.status,
              createdAt: now,
              updatedAt: now,
              lastLoginAt: now,
            });
          } else {
            const existingUser = userSnap.data() as UserAccount;
            await updateDoc(userRef, {
              displayName:
                currentUser.displayName || existingUser.displayName || emailLower,
              photoUrl: currentUser.photoURL || existingUser.photoUrl || '',
              role: initialAuth.role,
              updatedAt: now,
              lastLoginAt: now,
            });
          }
        } catch {
          // Non-blocking profile sync
        }

        setUserRole(initialAuth.role);
        setRbacPermissions(initialAuth.permissions);
        setAdminProfile(adminSnapDataCache);
        setAccountStatus(initialAuth.status);
        setAdminDocMissing(initialAuth.docMissing);

        try {
          const tokenResult = await currentUser.getIdTokenResult();
          if (tokenResult.claims.email_verified !== true) {
            await currentUser.getIdToken(true);
          }
        } catch {
          // Non-blocking token refresh check
        }

        // Server-side session-init: syncs custom claims for active staff or server-bootstraps
        // primary super admin admins/{uid} via Admin SDK if FIREBASE_SERVICE_ACCOUNT_JSON is configured,
        // with a verified client create-only bootstrap fallback when server Admin SDK is unconfigured.
        if (
          (initialAuth.status === 'active' && initialAuth.role !== 'customer') ||
          (initialAuth.docMissing && emailLower === PRIMARY_SUPER_ADMIN_EMAIL)
        ) {
          void (async () => {
            let bootstrapped = false;
            try {
              const idToken = await currentUser.getIdToken();
              const resp = await fetch('/api/auth/session-init', {
                method: 'POST',
                headers: { Authorization: `Bearer ${idToken}` },
              });
              if (resp.ok) {
                const payload = (await resp.json()) as {
                  claimsSynced?: boolean;
                  adminDocCreated?: boolean;
                };
                if (payload.claimsSynced) {
                  await currentUser.getIdToken(true);
                }
                if (payload.adminDocCreated) {
                  bootstrapped = true;
                  setAuthRefreshTick((t) => t + 1);
                }
              }
            } catch {
              // Fall through to verified primary super admin bootstrap if needed
            }

            if (
              !bootstrapped &&
              initialAuth.docMissing &&
              emailLower === PRIMARY_SUPER_ADMIN_EMAIL &&
              currentUser.emailVerified
            ) {
              const createdDoc = await bootstrapPrimarySuperAdminDocs(activeDb, currentUser);
              if (createdDoc) {
                setAuthRefreshTick((t) => t + 1);
              }
            }
          })();
        }

        let liveRbacDoc: RbacRoleEntry | null = rbacSnapDataCache;
        let liveAdminDoc: AdminRecord | null = adminSnapDataCache;
        let liveUserStatus: AccountStatus = userStatusCache;

        const syncEffectiveAuthority = () => {
          const next = evaluateAuthorityDocs(liveAdminDoc, liveRbacDoc, liveUserStatus);
          setUserRole(next.role);
          setRbacPermissions(next.permissions);
          setAccountStatus(next.status);
          setAdminDocMissing(next.docMissing);
        };

        // Live subscriptions so admins/{uid} or rbac_roles/{email} changes apply immediately
        unsubAdminDoc = onSnapshot(
          adminRef,
          (snap) => {
            liveAdminDoc = snap.exists() ? (snap.data() as AdminRecord) : null;
            setAdminProfile(liveAdminDoc);
            syncEffectiveAuthority();
          },
          (err) => {
            console.warn('Admin authority listener warning:', err);
          }
        );

        unsubRbac = onSnapshot(
          rbacRef,
          (snap) => {
            liveRbacDoc = snap.exists() ? (snap.data() as RbacRoleEntry) : null;
            syncEffectiveAuthority();
          },
          (err) => {
            console.warn('RBAC role listener warning:', err);
          }
        );

        unsubUserDoc = onSnapshot(
          userRef,
          (snap) => {
            if (snap.exists()) {
              const u = snap.data() as UserAccount;
              liveUserStatus =
                u.status === 'disabled' || u.status === 'suspended' ? u.status : 'active';
              syncEffectiveAuthority();
            }
          },
          (err) => {
            console.warn('User profile listener warning:', err);
          }
        );
      } catch (err) {
        console.error('Admin verification error:', err);
        setUserRole('customer');
        setRbacPermissions([]);
        setAdminProfile(null);
        setAccountStatus('disabled');
        setAdminDocMissing(false);
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
            id: d.id,
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
            id: d.id,
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
          snap.docs.map((d) => ({
            ...(d.data() as Product),
            id: d.id,
          }))
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
        setDbShowrooms(
          snap.docs.map((d) => ({
            ...(d.data() as Showroom),
            id: d.id,
          }))
        );
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
      (err) => {
        console.warn('Greetings loading warning:', err);
        setCmsSyncError((prev) => prev || 'শুভেচ্ছা ও ব্যানার তথ্য লোড করতে সমস্যা হয়েছে।');
        markSettled('greetings');
      }
    );

    const unsubSettings = onSnapshot(
      doc(activeDb, 'site_settings', 'main'),
      (snap) => {
        setDbSettings(snap.exists() ? (snap.data() as SiteSettings) : null);
        markSettled('site_settings');
      },
      (err) => {
        console.warn('Site settings loading warning:', err);
        setCmsSyncError((prev) => prev || 'সাইট সেটিংস লোড করতে সমস্যা হয়েছে।');
        markSettled('site_settings');
      }
    );

    const unsubHeroBanners = onSnapshot(
      collection(activeDb, 'hero_banners'),
      (snap) => {
        setDbHeroBanners(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HeroSlide, 'id'>) }))
        );
      },
      (err) => {
        console.warn('Hero banners loading warning:', err);
        setCmsSyncError((prev) => prev || 'হিরো ব্যানার লোড করতে সমস্যা হয়েছে।');
      }
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
      (err) => {
        console.warn('Homepage sections loading warning:', err);
        setCmsSyncError((prev) => prev || 'হোমপেজ সেকশন লোড করতে সমস্যা হয়েছে।');
      }
    );

    const unsubSeo = onSnapshot(
      doc(activeDb, 'seo_settings', 'main'),
      (snap) => {
        setDbSeoSettings(snap.exists() ? (snap.data() as SeoSettings) : null);
      },
      (err) => {
        console.warn('SEO settings loading warning:', err);
        setCmsSyncError((prev) => prev || 'SEO সেটিংস লোড করতে সমস্যা হয়েছে।');
      }
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
      (err) => {
        console.warn('AI knowledge loading warning:', err);
        setCmsSyncError((prev) => prev || 'AI Knowledge তথ্য লোড করতে সমস্যা হয়েছে।');
      }
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
      (err) => {
        console.warn('Media library loading warning:', err);
        setCmsSyncError((prev) => prev || 'মিডিয়া লাইব্রেরি লোড করতে সমস্যা হয়েছে।');
      }
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

  const refreshStoreData = useCallback(async () => {
    if (!isFirebaseConfigured || !db) return;
    const activeDb = db;
    setRefreshingStoreData(true);
    setCmsSyncError(null);
    const failedCollections: string[] = [];

    try {
      const results = await Promise.allSettled([
        fetchCollectionFromServer(query(collection(activeDb, 'categories'), orderBy('order', 'asc'))),
        fetchCollectionFromServer(query(collection(activeDb, 'occasions'), orderBy('order', 'asc'))),
        fetchCollectionFromServer(collection(activeDb, 'products')),
        fetchCollectionFromServer(collection(activeDb, 'showrooms')),
        fetchCollectionFromServer(collection(activeDb, 'greetings')),
        fetchDocFromServer(doc(activeDb, 'site_settings', 'main')),
        fetchCollectionFromServer(collection(activeDb, 'hero_banners')),
        fetchCollectionFromServer(collection(activeDb, 'homepage_sections')),
        fetchDocFromServer(doc(activeDb, 'seo_settings', 'main')),
        fetchCollectionFromServer(collection(activeDb, 'ai_knowledge')),
        fetchCollectionFromServer(collection(activeDb, 'media')),
      ]);

      const [
        catsRes,
        occsRes,
        prodsRes,
        showroomsRes,
        greetingsRes,
        settingsRes,
        bannersRes,
        sectionsRes,
        seoRes,
        aiRes,
        mediaRes,
      ] = results;

      if (catsRes.status === 'fulfilled') {
        setError(null);
        setDbCategories(
          catsRes.value.docs.map((d) => ({ ...(d.data() as Category), id: d.id }))
        );
      } else {
        failedCollections.push('categories');
      }

      if (occsRes.status === 'fulfilled') {
        setDbOccasions(
          occsRes.value.docs.map((d) => ({ ...(d.data() as Occasion), id: d.id }))
        );
      } else {
        failedCollections.push('occasions');
      }

      if (prodsRes.status === 'fulfilled') {
        setProductsError(null);
        setDbProducts(
          prodsRes.value.docs.map((d) => ({ ...(d.data() as Product), id: d.id }))
        );
      } else {
        failedCollections.push('products');
      }

      if (showroomsRes.status === 'fulfilled') {
        setShowroomsError(null);
        setDbShowrooms(
          showroomsRes.value.docs.map((d) => ({ ...(d.data() as Showroom), id: d.id }))
        );
      } else {
        failedCollections.push('showrooms');
      }

      if (greetingsRes.status === 'fulfilled') {
        const dailyDoc = greetingsRes.value.docs.find((d) => d.id === 'daily');
        setDbGreeting(dailyDoc ? (dailyDoc.data() as GreetingConfig) : null);
        setDbGreetingItems(
          greetingsRes.value.docs
            .filter((d) => d.id !== 'daily')
            .map((d) => ({ id: d.id, ...(d.data() as Omit<GreetingItem, 'id'>) }))
        );
      } else {
        failedCollections.push('greetings');
      }

      if (settingsRes.status === 'fulfilled') {
        setDbSettings(
          settingsRes.value.exists() ? (settingsRes.value.data() as SiteSettings) : null
        );
      } else {
        failedCollections.push('site_settings');
      }

      if (bannersRes.status === 'fulfilled') {
        setDbHeroBanners(
          bannersRes.value.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HeroSlide, 'id'>) }))
        );
      } else {
        failedCollections.push('hero_banners');
      }

      if (sectionsRes.status === 'fulfilled') {
        setDbHomepageSections(
          sectionsRes.value.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<HomepageSection, 'id'>),
          }))
        );
      } else {
        failedCollections.push('homepage_sections');
      }

      if (seoRes.status === 'fulfilled') {
        setDbSeoSettings(seoRes.value.exists() ? (seoRes.value.data() as SeoSettings) : null);
      } else {
        failedCollections.push('seo_settings');
      }

      if (aiRes.status === 'fulfilled') {
        setDbAiKnowledge(
          aiRes.value.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AiKnowledgeEntry, 'id'>),
          }))
        );
      } else {
        failedCollections.push('ai_knowledge');
      }

      if (mediaRes.status === 'fulfilled') {
        setDbMediaItems(
          mediaRes.value.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<MediaItem, 'id'>),
          }))
        );
      } else {
        failedCollections.push('media');
      }

      if (failedCollections.length > 0) {
        setCmsSyncError(
          `সার্ভার থেকে কিছু ডাটা রিফ্রেশ করা যায়নি (${failedCollections.join(', ')})।`
        );
      }
    } finally {
      setRefreshingStoreData(false);
    }
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
          visible: docItem.visible !== false && docItem.active !== false,
          active: docItem.active !== false && docItem.visible !== false,
          deleted: Boolean(docItem.deleted),
        } as Category;
      })
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }, [dbCategories]);

  const categories = useMemo(
    () =>
      allCategories.filter(
        (c) => c.visible !== false && c.active !== false && !c.deleted
      ),
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
      if (isFirebaseConfigured) return [];
      return SEED_PRODUCTS.map((seed) => {
        const studioPhotos = getCatalogStudioPhotos({
          id: seed.id,
          slug: seed.slug,
          nameEn: seed.nameEn || seed.name_en,
        });
        if (studioPhotos.length === 0) return seed;
        return {
          ...seed,
          image: studioPhotos[0],
          imageUrl: studioPhotos[0],
          images: studioPhotos,
        };
      });
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

        const rawDocImageCandidates = [
          docItem.imageUrl,
          docItem.image,
          ...(Array.isArray(docItem.images) ? docItem.images : []),
        ].filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
        const suppressedByAdmin = docItem.imageKey === 'no-photo';
        const studioFallbackImages =
          !suppressedByAdmin && rawDocImageCandidates.length === 0
            ? getCatalogStudioPhotos({
                id: docItem.id,
                slug: resolvedSlug,
                nameEn: resolvedNameEn,
              })
            : [];
        const seedFallbackImages =
          !suppressedByAdmin &&
          rawDocImageCandidates.length === 0 &&
          studioFallbackImages.length === 0 &&
          Array.isArray(seed?.images)
            ? seed.images
            : [];
        const normalizedImages = Array.from(
          new Set([
            ...rawDocImageCandidates,
            ...studioFallbackImages,
            ...seedFallbackImages,
          ])
        ).filter((u): u is string => typeof u === 'string' && u.trim().length > 0);

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
          image: normalizedImages[0] || '',
          imageUrl: normalizedImages[0] || '',
          imageKey: typeof docItem.imageKey === 'string' ? docItem.imageKey : '',
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
          region: docItem.region || undefined,
          orderLineEn: docItem.orderLineEn || '',
          orderLineBn: docItem.orderLineBn || '',
          images: Array.isArray(docItem.images) ? docItem.images.filter(Boolean) : [],
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
      userRole === 'primary_super_admin' ||
      userRole === 'super_admin' ||
      userRole === 'admin' ||
      userRole === 'manager' ||
      userRole === 'editor' ||
      userRole === 'moderator' ||
      userRole === 'support_agent'
    ) {
      return userRole;
    }
    return null;
  }, [userRole, accountStatus]);

  const permissions: PermissionKey[] = useMemo(() => {
    if (!staffRole || accountStatus !== 'active') return [];
    if (isSuperAdminRole(staffRole)) {
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
      if (isSuperAdminRole(staffRole)) return true;
      return permissions.includes(perm);
    },
    [staffRole, accountStatus, permissions]
  );

  const isSuperAdmin = isSuperAdminRole(staffRole);
  const isPrimarySuperAdmin =
    isSuperAdmin &&
    Boolean(user?.emailVerified) &&
    user?.email?.trim().toLowerCase() === PRIMARY_SUPER_ADMIN_EMAIL;
  const isCatalogAdmin =
    isSuperAdmin ||
    hasPermission('products_view') ||
    hasPermission('categories_manage') ||
    hasPermission('showrooms_manage') ||
    hasPermission('banners_manage');
  const isSupportStaff =
    isSuperAdmin ||
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
            'Firebase Email/Password sign-in is disabled in project homerecipefoods. Enable Email/Password in Firebase Console → Authentication → Sign-in method.',
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
            'Firebase Authentication configuration error for project homerecipefoods.',
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
        'Firebase connection for homerecipefoods is not configured yet.'
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
        const usernameSnap = await fetchDocFromServer(doc(db, 'admin_usernames', cleanId));
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

    // If email is not yet verified, allow MahmudLoginRoute to present the verification screen
    // (onAuthStateChanged keeps staffRole = null until emailVerified === true).
    if (!cred.user.emailVerified) {
      return;
    }

    let adminEntry: AdminRecord | null = null;
    let rbacEntry: RbacRoleEntry | null = null;

    try {
      const adminSnap = await fetchDocFromServer(doc(db, 'admins', cred.user.uid));
      if (adminSnap.exists()) {
        adminEntry = adminSnap.data() as AdminRecord;
      }
    } catch {
      // Non-fatal
    }

    // Attempt server-side bootstrap via Admin SDK if admins/{uid} is missing for verified primary super admin,
    // falling back to verified create-only client bootstrap when Admin SDK secret is not configured.
    if (!adminEntry && emailLower === PRIMARY_SUPER_ADMIN_EMAIL) {
      try {
        const idToken = await cred.user.getIdToken();
        const initResp = await fetch('/api/auth/session-init', {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (initResp.ok) {
          const initJson = (await initResp.json()) as { adminDocCreated?: boolean };
          if (initJson.adminDocCreated) {
            await cred.user.getIdToken(true);
            const recheckSnap = await fetchDocFromServer(doc(db, 'admins', cred.user.uid));
            if (recheckSnap.exists()) {
              adminEntry = recheckSnap.data() as AdminRecord;
            }
          }
        }
      } catch {
        // Fall through to verified client bootstrap
      }

      if (!adminEntry && cred.user.emailVerified) {
        adminEntry = await bootstrapPrimarySuperAdminDocs(db, cred.user);
      }
    }

    if (!adminEntry) {
      try {
        const rbacSnap = await fetchDocFromServer(doc(db, 'rbac_roles', emailLower));
        if (rbacSnap.exists()) {
          rbacEntry = rbacSnap.data() as RbacRoleEntry;
        }
      } catch {
        // Non-fatal
      }
    }

    const adminEmailMatches =
      !adminEntry?.email || adminEntry.email.trim().toLowerCase() === emailLower;
    const isAdminInactive =
      adminEntry !== null &&
      (!adminEmailMatches ||
        adminEntry.active === false ||
        adminEntry.isActive === false ||
        adminEntry.status === 'disabled' ||
        adminEntry.status === 'suspended');
    const isAdminActive =
      adminEntry !== null &&
      adminEmailMatches &&
      (adminEntry.active === true ||
        adminEntry.isActive === true ||
        adminEntry.status === 'active') &&
      !isAdminInactive;

    const isRbacInactive =
      !adminEntry &&
      rbacEntry !== null &&
      (rbacEntry.status === 'disabled' || rbacEntry.status === 'suspended');
    const isRbacActive =
      !adminEntry &&
      rbacEntry !== null &&
      rbacEntry.status === 'active' &&
      (!rbacEntry.email || rbacEntry.email.trim().toLowerCase() === emailLower);

    const isSuspended =
      adminEntry?.status === 'suspended' || (!adminEntry && rbacEntry?.status === 'suspended');

    if (isAdminInactive || isRbacInactive) {
      await signOut(auth);
      throw new Error(
        isSuspended
          ? 'This staff account has been suspended. Contact the Super Admin.'
          : 'This administrator account has been disabled. Contact the Super Admin.'
      );
    }

    if (!isAdminActive && !isRbacActive) {
      await signOut(auth);
      throw new Error(
        `Signed in as ${emailLower}, but no active admins/${cred.user.uid} (or fallback rbac_roles) record was found in Firestore.`
      );
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
        const snap = await fetchDocFromServer(doc(db, 'admin_usernames', clean));
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
      const snap = await fetchDocFromServer(ref);
      if (!snap.exists()) {
        batch.set(ref, { ...cat, visible: true, deleted: false, createdAt: now, updatedAt: now });
        createdCount += 1;
      }
    }

    for (const occ of SEED_OCCASIONS) {
      const ref = doc(db, 'occasions', occ.id);
      const snap = await fetchDocFromServer(ref);
      if (!snap.exists()) {
        batch.set(ref, { ...occ, visible: true, deleted: false, createdAt: now, updatedAt: now });
        createdCount += 1;
      }
    }

    for (const prod of SEED_PRODUCTS) {
      const ref = doc(db, 'products', prod.id);
      const snap = await fetchDocFromServer(ref);
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
      const snap = await fetchDocFromServer(ref);
      if (!snap.exists()) {
        batch.set(ref, { ...sec, updatedAt: now });
        createdCount += 1;
      }
    }

    const greetingRef = doc(db, 'greetings', 'daily');
    if (!(await fetchDocFromServer(greetingRef)).exists()) {
      batch.set(greetingRef, { ...SEED_GREETING, updatedAt: now });
      createdCount += 1;
    }

    const settingsRef = doc(db, 'site_settings', 'main');
    if (!(await fetchDocFromServer(settingsRef)).exists()) {
      batch.set(settingsRef, { ...SEED_SITE_SETTINGS, updatedAt: now });
      createdCount += 1;
    }

    const seoRef = doc(db, 'seo_settings', 'main');
    if (!(await fetchDocFromServer(seoRef)).exists()) {
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
      sourceProducts.some((p) => {
        if (p.id === item.id || p.masterKey === item.masterKey) return true;
        const resolvedCatSlug = resolveProductCategorySlug(p, allCategories) || p.category || '';
        return (
          buildProductMatchKey(
            p.nameBn || p.name_bn || p.name || '',
            p.nameEn || p.name_en || '',
            resolvedCatSlug,
            p.unit || p.priceUnit || ''
          ) === item.masterKey
        );
      })
    ).length;

    const missingImageCount = allProducts.filter(
      (p) =>
        !p.deleted &&
        !p.image &&
        !p.imageUrl &&
        (!p.images || p.images.length === 0)
    ).length;

    const unsyncedStudioPhotoCount = (dbProducts ?? []).filter((p) => {
      if (p.deleted || p.imageKey === 'no-photo') return false;
      const hasDocImage =
        Boolean(typeof p.imageUrl === 'string' && p.imageUrl.trim()) ||
        Boolean(typeof p.image === 'string' && p.image.trim()) ||
        (Array.isArray(p.images) && p.images.some((u) => typeof u === 'string' && u.trim()));
      if (hasDocImage) return false;
      return (
        getCatalogStudioPhotos({
          id: p.id,
          slug: p.slug,
          nameEn: p.nameEn || p.name_en,
        }).length > 0
      );
    }).length;

    return {
      totalMaster: PRODUCT_MASTER_LIST.length,
      syncedCount,
      missingCount: Math.max(0, PRODUCT_MASTER_LIST.length - syncedCount),
      missingImageCount,
      unsyncedStudioPhotoCount,
    };
  }, [dbProducts, allProducts, allCategories]);

  // Duplicate-safe & Idempotent Admin-only Product Master List Import
  const importProductMasterList = useCallback(async (): Promise<MasterImportSummary> => {
    if (!db) throw new Error('Firestore not configured');
    if (!isAdmin || !hasPermission('products_add')) {
      throw new Error('Admin permission required to import product master list.');
    }
    const activeAuthUser = auth?.currentUser;
    if (!activeAuthUser || !activeAuthUser.emailVerified) {
      throw new Error('Verified admin session required to import product master list.');
    }
    await activeAuthUser.getIdToken().catch(() => undefined);

    setMasterImportRunning(true);
    try {
      const firestore = db;
      const now = serverTimestamp();

      // 1. Inspect live categories without overwriting any existing category
      const catSnap = await fetchCollectionFromServer(collection(firestore, 'categories'));
      const existingCategories: Category[] = [];
      const existingCategorySlugs = new Set<string>();
      const existingCategoryByNormName = new Map<string, Category>();
      catSnap.docs.forEach((d) => {
        const c = { ...(d.data() as Category), id: d.id };
        existingCategories.push(c);
        if (c.slug) {
          existingCategorySlugs.add(c.slug);
          existingCategoryByNormName.set(normalizeMasterText(c.slug), c);
        }
        if (c.name) existingCategoryByNormName.set(normalizeMasterText(c.name), c);
        if (c.name_bn) existingCategoryByNormName.set(normalizeMasterText(c.name_bn), c);
        if (c.nameEn) existingCategoryByNormName.set(normalizeMasterText(c.nameEn), c);
        if (c.name_en) existingCategoryByNormName.set(normalizeMasterText(c.name_en), c);
      });

      // Also index known category aliases against any matching live Firestore category
      for (const def of MASTER_CATEGORY_DEFINITIONS) {
        const matchedLive =
          existingCategoryByNormName.get(normalizeMasterText(def.slug)) ||
          def.aliasesBn
            .map((a) => existingCategoryByNormName.get(normalizeMasterText(a)))
            .find(Boolean) ||
          def.aliasesEn
            .map((a) => existingCategoryByNormName.get(normalizeMasterText(a)))
            .find(Boolean);
        if (matchedLive) {
          existingCategoryByNormName.set(normalizeMasterText(def.slug), matchedLive);
          def.aliasesBn.forEach((a) =>
            existingCategoryByNormName.set(normalizeMasterText(a), matchedLive)
          );
          def.aliasesEn.forEach((a) =>
            existingCategoryByNormName.set(normalizeMasterText(a), matchedLive)
          );
        }
      }

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
          const def = resolveMasterCategoryDef(cat.slug);
          const alreadyExists =
            existingCategorySlugs.has(cat.slug) ||
            existingCategoryByNormName.has(normalizeMasterText(cat.name)) ||
            existingCategoryByNormName.has(normalizeMasterText(cat.nameEn)) ||
            def.aliasesBn.some((a) => existingCategoryByNormName.has(normalizeMasterText(a))) ||
            def.aliasesEn.some((a) => existingCategoryByNormName.has(normalizeMasterText(a)));
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
            existingCategories.push(cat);
            existingCategorySlugs.add(cat.slug);
            existingCategoryByNormName.set(normalizeMasterText(cat.slug), cat);
            def.aliasesBn.forEach((a) =>
              existingCategoryByNormName.set(normalizeMasterText(a), cat)
            );
            def.aliasesEn.forEach((a) =>
              existingCategoryByNormName.set(normalizeMasterText(a), cat)
            );
            categoriesCreated += 1;
          }
        }
      }

      // 2. Inspect ALL existing products in Firestore before writing
      const prodSnap = await fetchCollectionFromServer(collection(firestore, 'products'));
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
        const resolvedCatSlug =
          resolveProductCategorySlug(p, existingCategories) || p.category || '';
        const mk = buildProductMatchKey(
          p.nameBn || p.name_bn || p.name || '',
          p.nameEn || p.name_en || '',
          resolvedCatSlug,
          p.unit || p.priceUnit || ''
        );
        existingMatchKeys.add(mk);
      });

      let skippedExistingCount = 0;
      const productWrites: Array<{ id: string; data: Record<string, unknown> }> = [];

      for (const item of PRODUCT_MASTER_LIST) {
        const matchedCategoryObj =
          existingCategoryByNormName.get(normalizeMasterText(item.categorySlug)) ||
          existingCategoryByNormName.get(normalizeMasterText(item.categoryBn)) ||
          existingCategoryByNormName.get(normalizeMasterText(item.categoryNameEn));
        const matchedCatSlug = matchedCategoryObj?.slug || item.categorySlug;

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

        const shortDescBn = `${item.nameBn} — ${item.categoryBn} (${item.unit})`.slice(0, 300);
        const shortDescEn = `${item.nameEn} — ${item.categoryNameEn} (${item.unit})`.slice(0, 300);
        const fullDescBn = `${item.nameBn} (${item.nameEn}) — ${item.categoryBn} বিভাগের পণ্য। একক: ${item.unit}।`.slice(0, 4000);
        const fullDescEn = `${item.nameEn} (${item.nameBn}) — ${item.categoryNameEn} showcase item. Unit: ${item.unit}.`.slice(0, 4000);

        const studioPhotos = getCatalogStudioPhotos({
          id: item.id,
          slug: finalSlug,
          nameEn: item.nameEn,
        });

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
            categorySlug: matchedCatSlug,
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
            image: studioPhotos[0] ?? '',
            imageUrl: studioPhotos[0] ?? '',
            imageKey: '',
            images: studioPhotos,
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
            active: true,
            isActive: true,
            deleted: false,
            status: 'published',
            display_order: item.displayOrder,
            createdBy: activeAuthUser.uid,
            updatedBy: activeAuthUser.uid,
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

  // Non-destructive Admin sync: populates studio photos ONLY on live docs that still have zero images and were not intentionally cleared
  const assignMissingStudioPhotos = useCallback(async (): Promise<{
    updatedCount: number;
    skippedCount: number;
  }> => {
    if (!db) throw new Error('Firestore not configured');
    if (!isAdmin || !hasPermission('products_edit')) {
      throw new Error('Admin permission required to sync studio product photos.');
    }
    const activeAuthUser = auth?.currentUser;
    if (!activeAuthUser || !activeAuthUser.emailVerified) {
      throw new Error('Verified admin session required to sync studio product photos.');
    }
    await activeAuthUser.getIdToken().catch(() => undefined);

    setMasterImportRunning(true);
    try {
      const firestore = db;
      const now = serverTimestamp();
      const prodSnap = await fetchCollectionFromServer(collection(firestore, 'products'));
      const REQUIRED_KEYS = [
        'id', 'name', 'nameEn', 'slug', 'category', 'categoryName', 'productType',
        'price', 'priceUnit', 'shortDescription', 'description', 'images', 'ingredients',
        'sizes', 'weight', 'occasions', 'showrooms', 'availability', 'importantNotes',
        'featured', 'popular', 'createdAt', 'updatedAt',
      ];
      const ALLOWED_KEYS = new Set([
        'id', 'name', 'nameBn', 'nameEn', 'name_bn', 'name_en', 'slug',
        'category', 'categorySlug', 'categoryName', 'categoryNameEn', 'productType',
        'price', 'old_price', 'discount', 'price_label', 'priceUnit', 'unit',
        'shortDescription', 'shortDescriptionEn', 'short_description_bn', 'short_description_en',
        'description', 'descriptionEn', 'description_bn', 'description_en',
        'image', 'imageUrl', 'imageKey', 'images', 'masterKey', 'rating', 'stock', 'sku',
        'ingredients', 'ingredients_bn', 'ingredients_en', 'sizes', 'weight', 'occasions', 'showrooms',
        'availability', 'importantNotes', 'featured', 'popular',
        'visible', 'active', 'isActive', 'deleted', 'status', 'display_order', 'archivedAt',
        'seoTitle', 'seoDescription', 'seoImage', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt',
      ]);

      const updates: Array<{ id: string; photos: string[] }> = [];
      let skippedCount = 0;

      for (const d of prodSnap.docs) {
        const data = d.data() as Record<string, unknown>;
        const existingImages = [
          data.imageUrl,
          data.image,
          ...(Array.isArray(data.images) ? data.images : []),
        ].filter((u): u is string => typeof u === 'string' && u.trim().length > 0);

        if (existingImages.length > 0 || data.imageKey === 'no-photo') {
          skippedCount += 1;
          continue;
        }

        const hasValidCreated = Boolean(
          data.createdAt &&
            typeof data.createdAt === 'object' &&
            'toMillis' in data.createdAt
        );
        const docRuleReady =
          hasValidCreated &&
          typeof data.id === 'string' &&
          data.id === d.id &&
          REQUIRED_KEYS.every((k) => k in data) &&
          Object.keys(data).every((k) => ALLOWED_KEYS.has(k));

        if (!docRuleReady) {
          skippedCount += 1;
          continue;
        }

        const studioPhotos = getCatalogStudioPhotos({
          id: d.id,
          slug: typeof data.slug === 'string' ? data.slug : '',
          nameEn:
            (typeof data.nameEn === 'string' && data.nameEn) ||
            (typeof data.name_en === 'string' && data.name_en) ||
            '',
        });
        if (studioPhotos.length === 0) {
          skippedCount += 1;
          continue;
        }

        updates.push({ id: d.id, photos: studioPhotos });
      }

      const CHUNK = 100;
      for (let i = 0; i < updates.length; i += CHUNK) {
        const chunk = updates.slice(i, i + CHUNK);
        const batch = writeBatch(firestore);
        for (const u of chunk) {
          batch.update(doc(firestore, 'products', u.id), {
            image: u.photos[0],
            imageUrl: u.photos[0],
            imageKey: '',
            images: u.photos,
            updatedBy: activeAuthUser.uid,
            updatedAt: now,
          });
        }
        await batch.commit();
      }

      if (updates.length > 0) {
        await logAdminActivity(
          'studio_photo_sync',
          'products',
          'studio_photo_map',
          'Studio Photo Sync',
          `Assigned studio photos to ${updates.length} products without overwriting existing photos (${skippedCount} skipped).`
        );
      }

      return { updatedCount: updates.length, skippedCount };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'products/studio_photo_sync');
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
      dbProducts.some((p) => {
        if (p.id === item.id || p.masterKey === item.masterKey) return true;
        const resolvedCatSlug = resolveProductCategorySlug(p, allCategories) || p.category || '';
        return (
          buildProductMatchKey(
            p.nameBn || p.name_bn || p.name || '',
            p.nameEn || p.name_en || '',
            resolvedCatSlug,
            p.unit || p.priceUnit || ''
          ) === item.masterKey
        );
      })
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
    allCategories,
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
        cmsSyncError,
        refreshingStoreData,
        refreshStoreData,
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
        adminDocMissing,
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
        assignMissingStudioPhotos,
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
