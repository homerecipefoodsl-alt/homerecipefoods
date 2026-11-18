import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Briefcase,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  FileImage,
  Grid,
  Image,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Package,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  UserCog,
  Users,
} from 'lucide-react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { useStore } from '../context/StoreContext';
import {
  OperationType,
  db,
  firebaseConnectionStatus,
  firebaseMissingFields,
  firebasePublicInfo,
  handleFirestoreError,
  isFirebaseConfigured,
} from '../lib/firebase';
import type {
  ActivityLog,
  ChatSession,
  Complaint,
  RbacRoleEntry,
  StaffRole,
  UserAccount,
} from '../types';

const AdminProductsPanel = lazy(() =>
  import('../components/admin/AdminCatalogPanels').then((m) => ({
    default: m.AdminProductsPanel,
  }))
);
const AdminCategoriesPanel = lazy(() =>
  import('../components/admin/AdminCatalogPanels').then((m) => ({
    default: m.AdminCategoriesPanel,
  }))
);
const AdminOccasionsPanel = lazy(() =>
  import('../components/admin/AdminCatalogPanels').then((m) => ({
    default: m.AdminOccasionsPanel,
  }))
);
const AdminShowroomsPanel = lazy(() =>
  import('../components/admin/AdminCatalogPanels').then((m) => ({
    default: m.AdminShowroomsPanel,
  }))
);
const AdminHomepageSectionsPanel = lazy(() =>
  import('../components/admin/AdminCmsPanels').then((m) => ({
    default: m.AdminHomepageSectionsPanel,
  }))
);
const AdminMediaLibraryPanel = lazy(() =>
  import('../components/admin/AdminCmsPanels').then((m) => ({
    default: m.AdminMediaLibraryPanel,
  }))
);
const AdminSeoPanel = lazy(() =>
  import('../components/admin/AdminCmsPanels').then((m) => ({
    default: m.AdminSeoPanel,
  }))
);
const AdminActivityLogsPanel = lazy(() =>
  import('../components/admin/AdminCmsPanels').then((m) => ({
    default: m.AdminActivityLogsPanel,
  }))
);
const AdminSystemSettingsPanel = lazy(() =>
  import('../components/admin/AdminCmsPanels').then((m) => ({
    default: m.AdminSystemSettingsPanel,
  }))
);
const AdminBannersPanel = lazy(() =>
  import('../components/admin/AdminEngagementPanels').then((m) => ({
    default: m.AdminBannersPanel,
  }))
);
const AdminGreetingPanel = lazy(() =>
  import('../components/admin/AdminEngagementPanels').then((m) => ({
    default: m.AdminGreetingPanel,
  }))
);
const AdminComplaintsPanel = lazy(() =>
  import('../components/admin/AdminEngagementPanels').then((m) => ({
    default: m.AdminComplaintsPanel,
  }))
);
const AdminLiveChatPanel = lazy(() =>
  import('../components/admin/AdminEngagementPanels').then((m) => ({
    default: m.AdminLiveChatPanel,
  }))
);
const AdminSettingsPanel = lazy(() =>
  import('../components/admin/AdminEngagementPanels').then((m) => ({
    default: m.AdminSettingsPanel,
  }))
);
const AdminRoleManagementPanel = lazy(() =>
  import('../components/admin/AdminRoleUserPanels').then((m) => ({
    default: m.AdminRoleManagementPanel,
  }))
);
const AdminUserManagementPanel = lazy(() =>
  import('../components/admin/AdminRoleUserPanels').then((m) => ({
    default: m.AdminUserManagementPanel,
  }))
);
const AdminSecurityConfigPanel = lazy(() =>
  import('../components/admin/AdminRoleUserPanels').then((m) => ({
    default: m.AdminSecurityConfigPanel,
  }))
);
const AdminReportsPanel = lazy(() =>
  import('../components/admin/AdminReportsPanel').then((m) => ({
    default: m.AdminReportsPanel,
  }))
);
const AdminRecruitmentPanel = lazy(() =>
  import('../components/admin/AdminRecruitmentPanel').then((m) => ({
    default: m.AdminRecruitmentPanel,
  }))
);

export type AdminTab =
  | 'dashboard'
  | 'products'
  | 'categories'
  | 'occasions'
  | 'showrooms'
  | 'homepage'
  | 'banners'
  | 'greetings'
  | 'complaints'
  | 'chat'
  | 'recruitment'
  | 'media'
  | 'reports'
  | 'seo'
  | 'settings'
  | 'admins'
  | 'users'
  | 'logs'
  | 'system'
  | 'security';

const ROLE_DISPLAY: Record<
  StaffRole,
  { label: string; scope: string; badgeClass: string }
> = {
  super_admin: {
    label: 'Super Admin',
    scope: 'Full Administrative Access · All Modules, CMS, Roles & Security',
    badgeClass: 'bg-[#DC1F26] text-white',
  },
  admin: {
    label: 'Admin',
    scope: 'Catalog & CMS Access · Products, Categories, Occasions, Showrooms, Banners & Reports',
    badgeClass: 'bg-[#FACC15] text-[#1C1917]',
  },
  manager: {
    label: 'Manager',
    scope: 'Delegated Operations Access · Assigned Modules & Unique Manager ID',
    badgeClass: 'bg-[#FEFCE8] text-[#9A3412]',
  },
  support_agent: {
    label: 'Support Agent',
    scope: 'Support Access · Customer Live Chat & Complaints',
    badgeClass: 'bg-emerald-600 text-white',
  },
};

function PanelFallback() {
  return (
    <div className="flex items-center justify-center rounded-xl border border-[#E7E5E4] bg-white py-16">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#E7E5E4] border-t-[#DC1F26]" />
    </div>
  );
}

class AdminPanelErrorBoundary extends React.Component<
  { children: React.ReactNode; activeTab: string },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode; activeTab: string }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected admin panel rendering error.',
    };
  }

  componentDidUpdate(prevProps: { activeTab: string }) {
    if (prevProps.activeTab !== this.props.activeTab && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  componentDidCatch(error: Error) {
    console.error('Admin panel error:', error?.message || error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-200 bg-white p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#DC1F26]" />
            <div>
              <h3 className="font-display text-lg font-bold text-[#1C1917]">
                এই অ্যাডমিন প্যানেলটি লোড করতে সমস্যা হয়েছে
              </h3>
              <p className="mt-1 text-xs text-[#57534E]">
                {this.state.errorMessage || 'অনুগ্রহ করে পুনরায় চেষ্টা করুন অথবা পৃষ্ঠা রিলোড করুন।'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => this.setState({ hasError: false, errorMessage: '' })}
                  className="cursor-pointer rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
                >
                  Retry Panel
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#1C1917]"
                >
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function MahmudLoginScreen() {
  const {
    signInAdminWithCredentials,
    sendAdminPasswordReset,
    loginLockoutRemainingSec,
  } = useStore();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [forgotMode, setForgotMode] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginLockoutRemainingSec > 0) return;

    setAuthError(null);
    setSubmitting(true);
    try {
      await signInAdminWithCredentials(identifier, password, rememberSession);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Username/email or password is incorrect.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetIdentifier.trim()) return;
    setResetSending(true);
    setResetMessage(null);
    setResetError(null);
    try {
      await sendAdminPasswordReset(resetIdentifier);
      setResetMessage(
        'If an active administrator account matches that username or email, a password reset link has been sent.'
      );
    } catch (err) {
      setResetError(
        err instanceof Error
          ? err.message
          : 'Unable to send reset email right now. Verify Firebase Auth settings for ai-studio-applet-webapp-e4b0f.'
      );
    } finally {
      setResetSending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAFAF8] px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#E7E5E4] bg-white shadow-lg">
        {/* Official Brand Header */}
        <div className="flex flex-col items-center justify-center border-b border-white/10 bg-[#1C1917] px-6 py-7 text-center">
          <BrandLogo variant="header" />
          <p className="mt-3 font-mono text-[11px] font-semibold tracking-widest text-[#FACC15] uppercase">
            Secure Management Portal
          </p>
        </div>

        <div className="p-6 sm:p-8">
          <div className="text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-[#DC1F26]">
              <Lock className="h-5 w-5" />
            </div>
            <h1 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
              Home Recipe Foods
            </h1>
            <p className="mt-0.5 text-sm font-semibold text-[#57534E]">
              Admin &amp; Manager Login
            </p>
          </div>

          {!isFirebaseConfigured && (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-left text-xs text-amber-950">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  <p className="font-bold">
                    Firebase Project Not Connected ({firebaseConnectionStatus})
                  </p>
                  <p className="mt-1 leading-relaxed">
                    Configure public <code className="font-mono">VITE_FIREBASE_*</code> environment variables for existing project{' '}
                    <code className="font-mono font-bold">ai-studio-applet-webapp-e4b0f</code> before signing in.
                  </p>
                  {firebaseMissingFields.length > 0 && (
                    <p className="mt-1 font-mono text-[10px] text-amber-900">
                      Missing: {firebaseMissingFields.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {forgotMode ? (
            <form onSubmit={handleResetSubmit} className="mt-6 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-[#1C1917]">Reset Password</h2>
                <p className="mt-1 text-xs text-[#57534E]">
                  Enter your administrator username or email address to receive a Firebase password reset email.
                </p>
              </div>

              {resetMessage && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-900">
                  {resetMessage}
                </div>
              )}

              {resetError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-[#B91C1C]">
                  {resetError}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Username or Email
                </label>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={resetIdentifier}
                  onChange={(e) => setResetIdentifier(e.target.value)}
                  placeholder="username or admin@email.com"
                  className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={resetSending || !isFirebaseConfigured}
                className="w-full cursor-pointer rounded-lg bg-[#1C1917] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#DC1F26] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resetSending ? 'Sending Reset Link...' : 'Send Password Reset Email'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setForgotMode(false);
                  setResetMessage(null);
                  setResetError(null);
                }}
                className="w-full cursor-pointer text-center text-xs font-semibold text-[#57534E] hover:text-[#1C1917]"
              >
                Back to Login
              </button>
            </form>
          ) : (
            <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
              {authError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-[#B91C1C]">
                  {authError}
                </div>
              )}

              {loginLockoutRemainingSec > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900">
                  Too many failed attempts. Please wait{' '}
                  <span className="font-mono font-bold">{loginLockoutRemainingSec}s</span> before retrying.
                </div>
              )}

              <div>
                <label
                  htmlFor="mahmud-identifier"
                  className="mb-1.5 block text-xs font-semibold text-[#1C1917]"
                >
                  Username or Email
                </label>
                <input
                  id="mahmud-identifier"
                  type="text"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter username or email"
                  className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="mahmud-password"
                  className="mb-1.5 block text-xs font-semibold text-[#1C1917]"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="mahmud-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] py-2.5 pr-10 pl-3.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3 text-[#78716C] hover:text-[#1C1917]"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-[#44403C]">
                  <input
                    type="checkbox"
                    checked={rememberSession}
                    onChange={(e) => setRememberSession(e.target.checked)}
                    className="rounded border-[#D6D3D1] text-[#DC1F26] focus:ring-[#DC1F26]"
                  />
                  <span>Remember Session</span>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setResetIdentifier(identifier);
                    setForgotMode(true);
                  }}
                  className="cursor-pointer font-semibold text-[#DC1F26] hover:underline"
                >
                  Forgot Password?
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting || loginLockoutRemainingSec > 0 || !isFirebaseConfigured}
                className="mt-2 w-full cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Authenticating...' : 'Login'}
              </button>
            </form>
          )}

          <div className="mt-6 border-t border-[#F5F4F0] pt-4 text-center">
            <Link
              to="/"
              className="text-xs font-medium text-[#78716C] transition-colors hover:text-[#1C1917]"
            >
              ← Return to Home Recipe Foods Storefront
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminPage() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();

  const {
    allProducts,
    allCategories,
    allShowrooms,
    user,
    authReady,
    staffRole,
    permissions,
    hasPermission,
    adminProfile,
    accountStatus,
    isSuperAdmin,
    adminCheckLoading,
    firestoreEmpty,
    signOutAdmin,
    seedDemoCatalog,
  } = useStore();

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [staffRoles, setStaffRoles] = useState<RbacRoleEntry[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<UserAccount[]>([]);
  const [recentActivities, setRecentActivities] = useState<ActivityLog[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [seedDone, setSeedDone] = useState(false);

  useEffect(() => {
    document.title = 'Admin Console – Home Recipe Foods';
  }, []);

  const canComplaints = hasPermission('complaints_manage');
  const canChat = hasPermission('chat_manage');
  const canRecruitment =
    isSuperAdmin || hasPermission('recruitment_manage') || staffRole === 'admin';
  const canStaffDirectory = isSuperAdmin || hasPermission('manager_manage');
  const canLogs = isSuperAdmin || hasPermission('dashboard_view') || hasPermission('reports_view');

  // Granular Firestore subscriptions strictly aligned with user permissions
  useEffect(() => {
    if (!authReady || !staffRole || accountStatus !== 'active' || !db) {
      setComplaints([]);
      setChatSessions([]);
      setStaffRoles([]);
      setRegisteredUsers([]);
      setRecentActivities([]);
      return;
    }

    const activeDb = db;
    const unsubs: Array<() => void> = [];

    if (canComplaints) {
      unsubs.push(
        onSnapshot(
          query(collection(activeDb, 'complaints'), orderBy('createdAt', 'desc')),
          (snap) => setComplaints(snap.docs.map((d) => d.data() as Complaint)),
          (err) => {
            try {
              handleFirestoreError(err, OperationType.LIST, 'complaints');
            } catch {
              // Handled cleanly
            }
          }
        )
      );
    }

    if (canChat) {
      unsubs.push(
        onSnapshot(
          query(collection(activeDb, 'chat_sessions'), orderBy('updatedAt', 'desc')),
          (snap) => setChatSessions(snap.docs.map((d) => d.data() as ChatSession)),
          (err) => {
            try {
              handleFirestoreError(err, OperationType.LIST, 'chat_sessions');
            } catch {
              // Handled cleanly
            }
          }
        )
      );
    }

    if (canStaffDirectory) {
      unsubs.push(
        onSnapshot(
          collection(activeDb, 'rbac_roles'),
          (snap) => setStaffRoles(snap.docs.map((d) => d.data() as RbacRoleEntry)),
          () => {}
        )
      );
    }

    if (isSuperAdmin) {
      unsubs.push(
        onSnapshot(
          collection(activeDb, 'users'),
          (snap) => setRegisteredUsers(snap.docs.map((d) => d.data() as UserAccount)),
          () => {}
        )
      );
    }

    if (canLogs) {
      unsubs.push(
        onSnapshot(
          query(collection(activeDb, 'activity_logs'), orderBy('timestamp', 'desc'), limit(8)),
          (snap) => setRecentActivities(snap.docs.map((d) => d.data() as ActivityLog)),
          () => {}
        )
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [
    authReady,
    staffRole,
    accountStatus,
    canComplaints,
    canChat,
    canStaffDirectory,
    isSuperAdmin,
    canLogs,
  ]);

  const openComplaints = complaints.filter(
    (c) => c.status === 'New' || c.status === 'Reviewing' || c.status === 'In Progress'
  ).length;
  const resolvedComplaints = complaints.filter(
    (c) => c.status === 'Resolved' || c.status === 'Closed'
  ).length;
  const activeChats = chatSessions.filter((s) => s.status !== 'closed').length;

  const totalAdminsCount = staffRoles.filter(
    (r) => r.role === 'admin' && r.status === 'active'
  ).length;
  const totalManagersCount = staffRoles.filter(
    (r) => r.role === 'manager' && r.status === 'active'
  ).length;

  const allowedNavItems = useMemo(() => {
    if (!staffRole || accountStatus !== 'active') return [];

    const items: { id: AdminTab; label: string; icon: React.ReactNode }[] = [];

    if (hasPermission('dashboard_view')) {
      items.push({
        id: 'dashboard',
        label: 'Dashboard',
        icon: <LayoutDashboard className="h-4 w-4" />,
      });
    }

    if (hasPermission('products_view')) {
      items.push({
        id: 'products',
        label: 'Products',
        icon: <Package className="h-4 w-4" />,
      });
    }

    if (hasPermission('categories_manage')) {
      items.push(
        { id: 'categories', label: 'Categories', icon: <Grid className="h-4 w-4" /> },
        { id: 'occasions', label: 'Occasions', icon: <Sparkles className="h-4 w-4" /> }
      );
    }

    if (hasPermission('showrooms_manage')) {
      items.push({
        id: 'showrooms',
        label: 'Showrooms',
        icon: <MapPin className="h-4 w-4" />,
      });
    }

    if (hasPermission('banners_manage')) {
      items.push(
        {
          id: 'homepage',
          label: 'Homepage Sections',
          icon: <LayoutTemplate className="h-4 w-4" />,
        },
        { id: 'banners', label: 'Hero Banners', icon: <Image className="h-4 w-4" /> },
        {
          id: 'greetings',
          label: 'Greetings',
          icon: <MessageSquareText className="h-4 w-4" />,
        },
        { id: 'media', label: 'Media Library', icon: <FileImage className="h-4 w-4" /> }
      );
    }

    if (hasPermission('complaints_manage')) {
      items.push({
        id: 'complaints',
        label: `Complaints (${openComplaints})`,
        icon: <ShieldAlert className="h-4 w-4" />,
      });
    }

    if (hasPermission('chat_manage')) {
      items.push({
        id: 'chat',
        label: `Live Chat & AI (${activeChats})`,
        icon: <MessageCircle className="h-4 w-4" />,
      });
    }

    if (canRecruitment) {
      items.push({
        id: 'recruitment',
        label: 'Recruitment · নিয়োগ',
        icon: <Briefcase className="h-4 w-4" />,
      });
    }

    if (hasPermission('reports_view')) {
      items.push({
        id: 'reports',
        label: 'Reports & Analytics',
        icon: <BarChart3 className="h-4 w-4" />,
      });
    }

    if (hasPermission('seo_manage')) {
      items.push({
        id: 'seo',
        label: 'SEO & OpenGraph',
        icon: <Search className="h-4 w-4" />,
      });
    }

    if (hasPermission('settings_view')) {
      items.push({
        id: 'settings',
        label: 'Website & AI Settings',
        icon: <Settings className="h-4 w-4" />,
      });
    }

    if (isSuperAdmin || hasPermission('manager_manage') || hasPermission('admin_manage')) {
      items.push({
        id: 'admins',
        label: 'Admin Management',
        icon: <UserCog className="h-4 w-4" />,
      });
    }

    if (isSuperAdmin) {
      items.push({
        id: 'users',
        label: 'User Management',
        icon: <Users className="h-4 w-4" />,
      });
    }

    if (isSuperAdmin || hasPermission('reports_view')) {
      items.push({
        id: 'logs',
        label: 'Activity Logs',
        icon: <Activity className="h-4 w-4" />,
      });
    }

    if (isSuperAdmin || hasPermission('settings_view')) {
      items.push({
        id: 'system',
        label: 'System & Cloudflare',
        icon: <Server className="h-4 w-4" />,
      });
    }

    if (isSuperAdmin) {
      items.push({
        id: 'security',
        label: 'Security & Firebase',
        icon: <KeyRound className="h-4 w-4" />,
      });
    }

    return items;
  }, [
    staffRole,
    accountStatus,
    hasPermission,
    isSuperAdmin,
    canRecruitment,
    openComplaints,
    activeChats,
  ]);

  const activeTab: AdminTab = useMemo(() => {
    const requested = section as AdminTab | undefined;
    if (requested && allowedNavItems.some((item) => item.id === requested)) {
      return requested;
    }
    return allowedNavItems[0]?.id ?? 'dashboard';
  }, [section, allowedNavItems]);

  const selectTab = (nextTab: AdminTab) => {
    navigate(`/mahmud/${nextTab}`);
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedDemoCatalog();
      setSeedDone(true);
    } finally {
      setSeeding(false);
    }
  };

  if (!authReady || adminCheckLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAFAF8] px-4 py-24 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#E7E5E4] border-t-[#DC1F26]" />
        <p className="mt-4 text-sm text-[#57534E]">অ্যাডমিন সেশন যাচাই করা হচ্ছে...</p>
      </div>
    );
  }

  if (!user) {
    return <MahmudLoginScreen />;
  }

  if (!staffRole || accountStatus !== 'active') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8] px-4 py-20">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-red-200 bg-white text-center shadow-sm">
          <div className="flex justify-center bg-[#1C1917] px-6 py-5">
            <BrandLogo variant="compact" />
          </div>
          <div className="p-8">
            <ShieldAlert className="mx-auto h-10 w-10 text-[#DC1F26]" />
            <h1 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
              {accountStatus === 'suspended'
                ? 'অ্যাকাউন্ট স্থগিত করা হয়েছে (Suspended)'
                : accountStatus === 'disabled'
                ? 'অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে'
                : 'প্রবেশাধিকার সংরক্ষিত (403)'}
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-[#57534E]">
              আপনার অ্যাকাউন্টটি ({user.email}) অনুমোদিত অ্যাডমিন, ম্যানেজার বা সাপোর্ট তালিকায় সক্রিয় নয় অথবা পাসওয়ার্ড-ভিত্তিক অ্যাডমিন লগইন নয়।
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/"
                className="inline-flex items-center rounded-lg border border-[#D6D3D1] px-4 py-2.5 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917]"
              >
                হোমপেজে ফিরে যান
              </Link>
              <button
                type="button"
                onClick={signOutAdmin}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#DC1F26]"
              >
                <LogOut className="h-4 w-4" />
                <span>সাইন আউট করুন</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const roleMeta = ROLE_DISPLAY[staffRole];

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Top Admin Header */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl bg-[#1C1917] px-6 py-5 text-white sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-4">
            <BrandLogo variant="header" />
            <div className="border-l border-white/15 pl-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold ${roleMeta.badgeClass}`}
                >
                  <Shield className="h-3 w-3" />
                  <span>{roleMeta.label}</span>
                </span>
                {adminProfile?.manager_id && (
                  <span className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#FACC15]">
                    <BadgeCheck className="h-3 w-3" />
                    <span>{adminProfile.manager_id}</span>
                  </span>
                )}
                <span className="text-xs font-semibold text-[#FACC15]">
                  Home Recipe Foods · /mahmud Console
                </span>
              </div>
              <h1 className="font-display mt-1 text-2xl font-bold text-white sm:text-3xl">
                ম্যানেজমেন্ট ড্যাশবোর্ড
              </h1>
              <p className="mt-0.5 text-[11px] text-[#D6D3D1]">{roleMeta.scope}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/"
              className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-[#E7E5E4] transition-colors hover:bg-white/10"
            >
              View Live Site
            </Link>
            {isSuperAdmin && firestoreEmpty && !seedDone && (
              <button
                type="button"
                onClick={handleSeed}
                disabled={seeding}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]"
              >
                <Database className="h-4 w-4" />
                <span>{seeding ? 'সেভ হচ্ছে...' : 'নিরাপদে ডেমো ডাটা যুক্ত করুন'}</span>
              </button>
            )}
            <span className="font-mono text-xs text-[#D6D3D1]">{user.email}</span>
            <button
              type="button"
              onClick={signOutAdmin}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Mobile Tab Selector */}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2 lg:hidden">
          {allowedNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectTab(item.id)}
              className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold ${
                activeTab === item.id
                  ? 'border-[#1C1917] bg-[#1C1917] text-white'
                  : 'border-[#E7E5E4] bg-white text-[#44403C]'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Desktop Sidebar */}
          <aside className="hidden lg:col-span-3 lg:block">
            <nav className="space-y-1 rounded-xl border border-[#E7E5E4] bg-white p-2.5">
              {allowedNavItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                    activeTab === item.id
                      ? 'bg-[#1C1917] text-white'
                      : 'text-[#44403C] hover:bg-[#F5F4F0] hover:text-[#1C1917]'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          {/* Main Workspace */}
          <div className="lg:col-span-9">
            <AdminPanelErrorBoundary activeTab={activeTab}>
              <Suspense fallback={<PanelFallback />}>
              {activeTab === 'dashboard' && hasPermission('dashboard_view') && (
                <div className="space-y-6">
                  {isSuperAdmin && (
                    <div className="rounded-xl border border-[#1C1917] bg-[#1C1917] p-5 text-white">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <span className="inline-flex items-center gap-1.5 rounded bg-[#DC1F26] px-2.5 py-0.5 text-[11px] font-bold text-white">
                            <Shield className="h-3 w-3" />
                            <span>Super Admin — Enterprise Governance</span>
                          </span>
                          <h2 className="font-display mt-2 text-xl font-bold text-white">
                            সম্পূর্ণ ডাইনামিক ওয়েবসাইট, সিএমএস, ম্যানেজার এবং সিকিউরিটি নিয়ন্ত্রণ সক্রিয়
                          </h2>
                          <p className="mt-1 text-xs text-[#D6D3D1]">
                            প্রোডাক্ট, ক্যাটাগরি, শোরুম, হোমপেজ সেকশন, ব্যানার, গ্রিটিংস, মিডিয়া, এসইও, অভিযোগ, লাইভ চ্যাট এবং Admin/Manager পারমিশন এখান থেকে পরিচালনা করুন।
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {hasPermission('products_add') && firestoreEmpty && !seedDone && (
                    <div className="flex flex-col justify-between gap-3 rounded-xl border border-[#FDE047] bg-[#FEFCE8] p-5 sm:flex-row sm:items-center">
                      <div>
                        <h3 className="text-sm font-bold text-[#1C1917]">
                          Firestore ডাটাবেসে অনুপস্থিত ডিফল্ট ক্যাটালগ যোগ করুন
                        </h3>
                        <p className="mt-0.5 text-xs text-[#57534E]">
                          এটি নন-ডেস্ট্রাক্টিভ: শুধুমাত্র অনুপস্থিত ডকুমেন্টগুলো যোগ করবে এবং বিদ্যমান কোনো ডাটা পরিবর্তন করবে না।
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleSeed}
                        disabled={seeding}
                        className="shrink-0 cursor-pointer rounded-lg bg-[#DC1F26] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#B91C1C]"
                      >
                        {seeding ? 'সেভ হচ্ছে...' : 'নিরাপদে সেভ করুন'}
                      </button>
                    </div>
                  )}

                  {/* Enterprise KPI Cards */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    <div className="rounded-xl border border-[#E7E5E4] bg-white p-4">
                      <p className="text-xs text-[#78716C]">Total Products</p>
                      <p className="font-mono mt-1 text-2xl font-bold tabular-nums text-[#1C1917]">
                        {allProducts.filter((p) => !p.deleted).length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#E7E5E4] bg-white p-4">
                      <p className="text-xs text-[#78716C]">Total Categories</p>
                      <p className="font-mono mt-1 text-2xl font-bold tabular-nums text-[#1C1917]">
                        {allCategories.filter((c) => !c.deleted).length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#E7E5E4] bg-white p-4">
                      <p className="text-xs text-[#78716C]">Total Showrooms</p>
                      <p className="font-mono mt-1 text-2xl font-bold tabular-nums text-[#1C1917]">
                        {allShowrooms.filter((s) => !s.deleted).length}
                      </p>
                    </div>

                    {canComplaints && (
                      <>
                        <div className="rounded-xl border border-[#E7E5E4] bg-white p-4">
                          <p className="text-xs text-[#78716C]">Open Complaints</p>
                          <p className="font-mono mt-1 text-2xl font-bold tabular-nums text-[#DC1F26]">
                            {openComplaints}
                          </p>
                        </div>
                        <div className="rounded-xl border border-[#E7E5E4] bg-white p-4">
                          <p className="text-xs text-[#78716C]">Resolved Complaints</p>
                          <p className="font-mono mt-1 text-2xl font-bold tabular-nums text-emerald-700">
                            {resolvedComplaints}
                          </p>
                        </div>
                      </>
                    )}

                    {canChat && (
                      <div className="rounded-xl border border-[#E7E5E4] bg-white p-4">
                        <p className="text-xs text-[#78716C]">Active Live Chats</p>
                        <p className="font-mono mt-1 text-2xl font-bold tabular-nums text-[#DC1F26]">
                          {activeChats}
                        </p>
                      </div>
                    )}

                    {canStaffDirectory && (
                      <>
                        <div className="rounded-xl border border-[#E7E5E4] bg-white p-4">
                          <p className="text-xs text-[#78716C]">Total Admins</p>
                          <p className="font-mono mt-1 text-2xl font-bold tabular-nums text-[#1C1917]">
                            {totalAdminsCount}
                          </p>
                        </div>
                        <div className="rounded-xl border border-[#E7E5E4] bg-white p-4">
                          <p className="text-xs text-[#78716C]">Total Managers</p>
                          <p className="font-mono mt-1 text-2xl font-bold tabular-nums text-[#9A3412]">
                            {totalManagersCount}
                          </p>
                        </div>
                      </>
                    )}

                    {isSuperAdmin && (
                      <div className="rounded-xl border border-[#E7E5E4] bg-white p-4">
                        <p className="text-xs text-[#78716C]">Registered Users</p>
                        <p className="font-mono mt-1 text-2xl font-bold tabular-nums text-[#1C1917]">
                          {registeredUsers.length}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div className="rounded-xl border border-[#E7E5E4] bg-white p-6">
                    <h3 className="font-display text-xl font-bold text-[#1C1917]">
                      দ্রুত ব্যবস্থাপনা (Quick Actions)
                    </h3>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {hasPermission('products_view') && (
                        <button
                          type="button"
                          onClick={() => selectTab('products')}
                          className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold hover:border-[#DC1F26]"
                        >
                          + পণ্য যোগ / এডিট
                        </button>
                      )}
                      {hasPermission('categories_manage') && (
                        <button
                          type="button"
                          onClick={() => selectTab('categories')}
                          className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold hover:border-[#DC1F26]"
                        >
                          ক্যাটাগরি ও উপলক্ষ
                        </button>
                      )}
                      {hasPermission('showrooms_manage') && (
                        <button
                          type="button"
                          onClick={() => selectTab('showrooms')}
                          className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold hover:border-[#DC1F26]"
                        >
                          শোরুম ব্যবস্থাপনা
                        </button>
                      )}
                      {hasPermission('banners_manage') && (
                        <>
                          <button
                            type="button"
                            onClick={() => selectTab('homepage')}
                            className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold hover:border-[#DC1F26]"
                          >
                            হোমপেজ সেকশন সাজান
                          </button>
                          <button
                            type="button"
                            onClick={() => selectTab('banners')}
                            className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold hover:border-[#DC1F26]"
                          >
                            হিরো ব্যানার পরিবর্তন
                          </button>
                        </>
                      )}
                      {canComplaints && (
                        <button
                          type="button"
                          onClick={() => selectTab('complaints')}
                          className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold hover:border-[#DC1F26]"
                        >
                          অভিযোগ দেখুন ({openComplaints})
                        </button>
                      )}
                      {canChat && (
                        <button
                          type="button"
                          onClick={() => selectTab('chat')}
                          className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold hover:border-[#DC1F26]"
                        >
                          লাইভ চ্যাট ও AI ({activeChats})
                        </button>
                      )}
                      {canRecruitment && (
                        <button
                          type="button"
                          onClick={() => selectTab('recruitment')}
                          className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold hover:border-[#DC1F26]"
                        >
                          নিয়োগ ও আবেদন (Recruitment)
                        </button>
                      )}
                      {hasPermission('reports_view') && (
                        <button
                          type="button"
                          onClick={() => selectTab('reports')}
                          className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold hover:border-[#DC1F26]"
                        >
                          Reports &amp; CSV Export
                        </button>
                      )}
                      {(isSuperAdmin || hasPermission('manager_manage')) && (
                        <button
                          type="button"
                          onClick={() => selectTab('admins')}
                          className="cursor-pointer rounded-lg border border-[#1C1917] bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
                        >
                          + Add New User
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Live Activity & Complaints + System Status */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    <div className="rounded-xl border border-[#E7E5E4] bg-white p-5 lg:col-span-7">
                      <div className="flex items-center justify-between border-b border-[#F5F4F0] pb-3">
                        <h3 className="text-sm font-bold text-[#1C1917]">
                          Recent Activities
                        </h3>
                        {(isSuperAdmin || hasPermission('reports_view')) && (
                          <button
                            type="button"
                            onClick={() => selectTab('logs')}
                            className="cursor-pointer text-[11px] font-semibold text-[#DC1F26] hover:underline"
                          >
                            View All →
                          </button>
                        )}
                      </div>
                      {recentActivities.length === 0 ? (
                        <p className="py-6 text-center text-xs text-[#78716C]">
                          এখনো কোনো সাম্প্রতিক অ্যাক্টিভিটি লগ পাওয়া যায়নি।
                        </p>
                      ) : (
                        <div className="divide-y divide-[#F5F4F0] text-xs">
                          {recentActivities.slice(0, 6).map((act) => (
                            <div
                              key={act.id}
                              className="flex items-start justify-between gap-3 py-2.5"
                            >
                              <div>
                                <p className="font-semibold text-[#1C1917]">
                                  <span className="rounded bg-[#F5F4F0] px-1.5 py-0.5 font-mono text-[10px] uppercase">
                                    {act.action}
                                  </span>{' '}
                                  <span className="ml-1">{act.record_label || act.module}</span>
                                </p>
                                <p className="mt-0.5 text-[11px] text-[#57534E]">
                                  {act.summary || act.module} ·{' '}
                                  <span className="font-mono">{act.admin_email}</span>
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-6 lg:col-span-5">
                      <div className="rounded-xl border border-[#E7E5E4] bg-white p-5">
                        <h3 className="border-b border-[#F5F4F0] pb-3 text-sm font-bold text-[#1C1917]">
                          System &amp; Session Status
                        </h3>
                        <ul className="mt-3 space-y-2.5 text-xs">
                          <li className="flex items-center justify-between">
                            <span className="text-[#57534E]">Firebase Project</span>
                            <span className="font-mono font-semibold text-[#1C1917]">
                              {firebasePublicInfo.projectId}
                            </span>
                          </li>
                          <li className="flex items-center justify-between">
                            <span className="text-[#57534E]">Database Connection</span>
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {firebaseConnectionStatus}
                            </span>
                          </li>
                          <li className="flex items-center justify-between">
                            <span className="text-[#57534E]">Active Permissions</span>
                            <span className="rounded bg-[#FAFAF8] px-2 py-0.5 font-mono font-bold text-[#1C1917]">
                              {permissions.length} modules
                            </span>
                          </li>
                          <li className="flex items-center justify-between">
                            <span className="text-[#57534E]">Storefront Mode</span>
                            <span className="rounded bg-[#FEFCE8] px-2 py-0.5 font-semibold text-[#9A3412]">
                              Showcase Only
                            </span>
                          </li>
                        </ul>
                      </div>

                      {canComplaints && (
                        <div className="rounded-xl border border-[#E7E5E4] bg-white p-5">
                          <div className="flex items-center justify-between border-b border-[#F5F4F0] pb-3">
                            <h3 className="text-sm font-bold text-[#1C1917]">
                              Recent Complaints
                            </h3>
                            <button
                              type="button"
                              onClick={() => selectTab('complaints')}
                              className="cursor-pointer text-[11px] font-semibold text-[#DC1F26] hover:underline"
                            >
                              Manage →
                            </button>
                          </div>
                          {complaints.length === 0 ? (
                            <p className="py-5 text-center text-xs text-[#78716C]">
                              কোনো অভিযোগ জমা পড়েনি।
                            </p>
                          ) : (
                            <div className="divide-y divide-[#F5F4F0] text-xs">
                              {complaints.slice(0, 4).map((c) => (
                                <div key={c.id} className="flex items-center justify-between py-2.5">
                                  <div>
                                    <p className="font-semibold text-[#1C1917]">
                                      {c.customerName}
                                    </p>
                                    <p className="font-mono text-[10px] text-[#78716C]">
                                      {c.referenceCode} · {c.showroomName}
                                    </p>
                                  </div>
                                  <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-bold text-[#DC1F26]">
                                    {c.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'products' && hasPermission('products_view') && (
                <AdminProductsPanel />
              )}
              {activeTab === 'categories' && hasPermission('categories_manage') && (
                <AdminCategoriesPanel />
              )}
              {activeTab === 'occasions' && hasPermission('categories_manage') && (
                <AdminOccasionsPanel />
              )}
              {activeTab === 'showrooms' && hasPermission('showrooms_manage') && (
                <AdminShowroomsPanel />
              )}
              {activeTab === 'homepage' && hasPermission('banners_manage') && (
                <AdminHomepageSectionsPanel />
              )}
              {activeTab === 'banners' && hasPermission('banners_manage') && (
                <AdminBannersPanel />
              )}
              {activeTab === 'greetings' && hasPermission('banners_manage') && (
                <AdminGreetingPanel />
              )}
              {activeTab === 'media' && hasPermission('banners_manage') && (
                <AdminMediaLibraryPanel />
              )}

              {activeTab === 'complaints' && hasPermission('complaints_manage') && (
                <AdminComplaintsPanel complaints={complaints} />
              )}
              {activeTab === 'chat' && hasPermission('chat_manage') && (
                <AdminLiveChatPanel sessions={chatSessions} />
              )}
              {activeTab === 'recruitment' && canRecruitment && (
                <AdminRecruitmentPanel />
              )}
              {activeTab === 'reports' && hasPermission('reports_view') && (
                <AdminReportsPanel
                  complaints={complaints}
                  chatSessions={chatSessions}
                  staffRoles={staffRoles}
                  recentActivities={recentActivities}
                />
              )}

              {activeTab === 'seo' && hasPermission('seo_manage') && <AdminSeoPanel />}
              {activeTab === 'settings' && hasPermission('settings_view') && (
                <AdminSettingsPanel />
              )}
              {activeTab === 'admins' &&
                (isSuperAdmin || hasPermission('manager_manage') || hasPermission('admin_manage')) && (
                  <AdminRoleManagementPanel />
                )}
              {activeTab === 'users' && isSuperAdmin && <AdminUserManagementPanel />}
              {activeTab === 'logs' &&
                (isSuperAdmin || hasPermission('reports_view')) && (
                  <AdminActivityLogsPanel />
                )}
              {activeTab === 'system' &&
                (isSuperAdmin || hasPermission('settings_view')) && (
                  <AdminSystemSettingsPanel />
                )}
              {activeTab === 'security' && isSuperAdmin && (
                <AdminSecurityConfigPanel />
              )}
            </Suspense>
            </AdminPanelErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
