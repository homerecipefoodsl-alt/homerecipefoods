import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  NavigationType,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { LiveChatWidget } from './components/LiveChatWidget';
import { LoadingScreen } from './components/LoadingScreen';
import { MobileBottomNav } from './components/MobileBottomNav';
import { StoreProvider, useStore } from './context/StoreContext';
import { scrollToPageTop, scrollToSectionById } from './lib/scroll';
import { HomePage } from './pages/HomePage';

const ProductsPage = lazy(() =>
  import('./pages/ProductsPage').then((m) => ({ default: m.ProductsPage }))
);
const ProductDetailPage = lazy(() =>
  import('./pages/ProductDetailPage').then((m) => ({
    default: m.ProductDetailPage,
  }))
);
const ShowroomsPage = lazy(() =>
  import('./pages/ShowroomsPage').then((m) => ({ default: m.ShowroomsPage }))
);
const OutletsPage = lazy(() =>
  import('./pages/OutletsPage').then((m) => ({ default: m.OutletsPage }))
);
const ComplaintPage = lazy(() =>
  import('./pages/ComplaintPage').then((m) => ({ default: m.ComplaintPage }))
);
const AboutPage = lazy(() =>
  import('./pages/AboutPage').then((m) => ({ default: m.AboutPage }))
);
const ContactPage = lazy(() =>
  import('./pages/ContactPage').then((m) => ({ default: m.ContactPage }))
);
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((m) => ({ default: m.AdminPage }))
);
const JobsPage = lazy(() =>
  import('./pages/JobsPage').then((m) => ({ default: m.JobsPage }))
);
const JobDetailPage = lazy(() =>
  import('./pages/JobDetailPage').then((m) => ({ default: m.JobDetailPage }))
);
const JobApplyPage = lazy(() =>
  import('./pages/JobApplyPage').then((m) => ({ default: m.JobApplyPage }))
);
const ApplicationStatusPage = lazy(() =>
  import('./pages/ApplicationStatusPage').then((m) => ({
    default: m.ApplicationStatusPage,
  }))
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage }))
);

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorDetail: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorDetail: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      errorDetail: error?.message ? String(error.message).slice(0, 180) : '',
    };
  }

  componentDidCatch(error: Error) {
    console.error('Application boundary caught error:', error?.message || error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="font-display text-3xl font-bold text-[#1C1917]">
            সাময়িক ত্রুটি দেখা দিয়েছে
          </h1>
          <p className="mt-2 text-sm text-[#57534E]">
            অনুগ্রহ করে পৃষ্ঠাটি রিলোড করুন অথবা একটু পর আবার চেষ্টা করুন।
          </p>
          {this.state.errorDetail && (
            <p className="mt-3 rounded-lg border border-[#E7E5E4] bg-[#FAFAF8] px-3 py-2 font-mono text-[11px] text-[#57534E]">
              {this.state.errorDetail}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorDetail: '' })}
              className="cursor-pointer rounded-lg border border-[#D6D3D1] px-5 py-2.5 text-sm font-semibold text-[#1C1917] hover:border-[#1C1917]"
            >
              পুনরায় চেষ্টা করুন
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#B91C1C]"
            >
              পৃষ্ঠা রিলোড করুন
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function PageLoader() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="h-64 animate-pulse rounded-2xl bg-[#F5F4F0]" />
    </div>
  );
}

function UnauthorizedAdminCard({
  email,
  uid,
  disabled,
  adminDocMissing,
  needsVerification,
  onResendVerification,
  onRefreshVerification,
  onSignOut,
}: {
  email?: string | null;
  uid?: string | null;
  disabled: boolean;
  adminDocMissing?: boolean;
  needsVerification?: boolean;
  onResendVerification?: () => Promise<void>;
  onRefreshVerification?: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSend = async () => {
    if (!onResendVerification) return;
    setBusy(true);
    setNotice(null);
    try {
      await onResendVerification();
      setNotice('Verification email sent! Please check your inbox and then click Refresh.');
    } catch {
      setNotice('Could not send verification email right now. Please try again in a minute.');
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    if (!onRefreshVerification) return;
    setBusy(true);
    setNotice(null);
    try {
      await onRefreshVerification();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8] px-4 py-20 text-center">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
        <p className="font-mono text-xs font-bold uppercase tracking-wider text-[#DC1F26]">
          {needsVerification ? 'Email Verification Required' : '403 · Unauthorized Route Access'}
        </p>
        <h1 className="font-display mt-2 text-2xl font-bold text-[#1C1917]">
          {needsVerification
            ? 'ইমেইল ভেরিফাই করুন'
            : adminDocMissing
            ? 'অ্যাডমিন রেকর্ড পাওয়া যায়নি'
            : disabled
            ? 'অ্যাকাউন্ট নিষ্ক্রিয় রয়েছে'
            : 'অ্যাডমিন প্যানেল সংরক্ষিত'}
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-[#57534E]">
          {needsVerification
            ? `${email || 'Your account'} ইমেইলটি Firebase Authentication-এ এখনো verified নয়। অ্যাডমিন ড্যাশবোর্ডে প্রবেশের আগে ইমেইল ভেরিফিকেশন সম্পন্ন করুন।`
            : adminDocMissing
            ? `Firestore-এ admins/${uid || 'uid'} ডকুমেন্টটি পাওয়া যায়নি বা সক্রিয় নয়।`
            : `${email || 'Current session'} অ্যাকাউন্টটির জন্য কোনো অনুমোদিত অ্যাডমিন বা সাপোর্ট অনুমতি নেই।`}
        </p>
        {notice && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
            {notice}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          {needsVerification && onResendVerification && (
            <button
              type="button"
              disabled={busy}
              onClick={handleSend}
              className="cursor-pointer rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26] disabled:opacity-50"
            >
              Send Verification Email
            </button>
          )}
          {needsVerification && onRefreshVerification && (
            <button
              type="button"
              disabled={busy}
              onClick={handleRefresh}
              className="cursor-pointer rounded-lg border border-[#1C1917] px-4 py-2 text-xs font-semibold text-[#1C1917] hover:bg-[#F5F4F0] disabled:opacity-50"
            >
              I Verified · Refresh
            </button>
          )}
          <a
            href="/"
            className="rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917]"
          >
            হোমপেজে ফিরে যান
          </a>
          <button
            type="button"
            onClick={onSignOut}
            className="cursor-pointer rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

// Route: /mahmud (Login Screen, or redirect to /mahmud/dashboard once authenticated as active staff)
function MahmudLoginRoute() {
  const {
    user,
    authReady,
    adminCheckLoading,
    adminDocMissing,
    staffRole,
    accountStatus,
    emailVerificationRequired,
    resendAdminVerificationEmail,
    refreshAdminSession,
    signOutAdmin,
  } = useStore();

  if (!authReady || adminCheckLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAFAF8] px-4 py-24 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#E7E5E4] border-t-[#DC1F26]" />
        <p className="mt-4 text-sm text-[#57534E]">সেশন যাচাই করা হচ্ছে...</p>
      </div>
    );
  }

  if (user && staffRole && accountStatus === 'active') {
    return <Navigate to="/mahmud/dashboard" replace />;
  }

  if (user && (!staffRole || accountStatus !== 'active')) {
    return (
      <UnauthorizedAdminCard
        email={user.email}
        uid={user.uid}
        disabled={accountStatus !== 'active'}
        adminDocMissing={adminDocMissing}
        needsVerification={emailVerificationRequired}
        onResendVerification={resendAdminVerificationEmail}
        onRefreshVerification={refreshAdminSession}
        onSignOut={signOutAdmin}
      />
    );
  }

  return <AdminPage />;
}

// Route: /mahmud/* (Strictly protected dashboard & sub-routes; unauthenticated users redirect to /mahmud)
function ProtectedMahmudRoute() {
  const {
    user,
    authReady,
    adminCheckLoading,
    adminDocMissing,
    staffRole,
    accountStatus,
    emailVerificationRequired,
    resendAdminVerificationEmail,
    refreshAdminSession,
    signOutAdmin,
  } = useStore();

  if (!authReady || adminCheckLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAFAF8] px-4 py-24 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#E7E5E4] border-t-[#DC1F26]" />
        <p className="mt-4 text-sm text-[#57534E]">অ্যাডমিন অনুমোদন যাচাই করা হচ্ছে...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/mahmud" replace />;
  }

  if (!staffRole || accountStatus !== 'active') {
    return (
      <UnauthorizedAdminCard
        email={user.email}
        uid={user.uid}
        disabled={accountStatus !== 'active'}
        adminDocMissing={adminDocMissing}
        needsVerification={emailVerificationRequired}
        onResendVerification={resendAdminVerificationEmail}
        onRefreshVerification={refreshAdminSession}
        onSignOut={signOutAdmin}
      />
    );
  }

  return <AdminPage />;
}

function RoutedLayout() {
  const location = useLocation();
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMode, setChatMode] = useState<'select' | 'ai' | 'human'>('select');

  const isMahmudRoute =
    location.pathname === '/mahmud' || location.pathname.startsWith('/mahmud/');

  const handleOpenChat = (mode?: 'ai' | 'human') => {
    setChatMode(mode ?? 'select');
    setChatOpen(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAF8] text-[#1C1917]">
      {!isMahmudRoute && <Header onOpenChat={handleOpenChat} />}
      <main className="flex-1">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<HomePage onOpenChat={handleOpenChat} />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/product/:slug" element={<ProductDetailPage />} />
            <Route path="/products/:slug" element={<ProductDetailPage />} />
            <Route path="/category/:categorySlug" element={<ProductsPage />} />
            <Route path="/occasion/:occasionSlug" element={<ProductsPage />} />
            <Route path="/showrooms" element={<ShowroomsPage />} />
            <Route path="/outlets" element={<OutletsPage />} />
            <Route path="/our-outlets" element={<OutletsPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/career" element={<JobsPage />} />
            <Route path="/jobs/:slug" element={<JobDetailPage />} />
            <Route path="/apply/:slug" element={<JobApplyPage />} />
            <Route path="/jobs/:slug/apply" element={<JobApplyPage />} />
            <Route path="/application-status" element={<ApplicationStatusPage />} />
            <Route path="/complaint" element={<ComplaintPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route
              path="/contact"
              element={<ContactPage onOpenChat={handleOpenChat} />}
            />
            <Route path="/mahmud" element={<MahmudLoginRoute />} />
            <Route path="/mahmud/:section" element={<ProtectedMahmudRoute />} />
            <Route path="/mahmud/*" element={<ProtectedMahmudRoute />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      {!isMahmudRoute && (
        <>
          <Footer onOpenChat={handleOpenChat} />
          <MobileBottomNav onOpenChat={handleOpenChat} />
          <LiveChatWidget
            open={chatOpen}
            initialMode={chatMode}
            onOpen={() => setChatOpen(true)}
            onClose={() => setChatOpen(false)}
          />
        </>
      )}
    </div>
  );
}

interface RouteScrollState {
  scrollTarget?: string;
  scrollNonce?: number;
}

function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const prevPathnameRef = useRef(location.pathname);
  const prevHashRef = useRef(location.hash);
  const initialLoadHandledRef = useRef(false);

  useEffect(() => {
    const prevPathname = prevPathnameRef.current;
    const prevHash = prevHashRef.current;
    prevPathnameRef.current = location.pathname;
    prevHashRef.current = location.hash;

    const state = (location.state as RouteScrollState | null) ?? null;
    const explicitTarget = state?.scrollTarget || '';
    const hashTarget = location.hash ? location.hash.slice(1) : '';
    const targetId = explicitTarget || hashTarget;

    const isInitialMount = !initialLoadHandledRef.current;
    initialLoadHandledRef.current = true;

    let rafA = 0;
    let rafB = 0;
    let cancelled = false;
    let attempts = 0;

    const scheduleSectionScroll = (id: string) => {
      const tryScroll = () => {
        if (cancelled) return;
        if (scrollToSectionById(id)) return;
        attempts += 1;
        if (attempts < 20) {
          rafB = window.requestAnimationFrame(tryScroll);
        }
      };
      // Wait two animation frames so drawer close / route layout settles before measuring header height
      rafA = window.requestAnimationFrame(() => {
        rafB = window.requestAnimationFrame(tryScroll);
      });
    };

    if (isInitialMount) {
      if (hashTarget) {
        scheduleSectionScroll(hashTarget);
      }
      return () => {
        cancelled = true;
        if (rafA) window.cancelAnimationFrame(rafA);
        if (rafB) window.cancelAnimationFrame(rafB);
      };
    }

    // Preserve browser Back / Forward scroll restoration on POP navigations
    if (navigationType === NavigationType.Pop) {
      return;
    }

    if (targetId) {
      scheduleSectionScroll(targetId);
      return () => {
        cancelled = true;
        if (rafA) window.cancelAnimationFrame(rafA);
        if (rafB) window.cancelAnimationFrame(rafB);
      };
    }

    if (location.pathname !== prevPathname || (prevHash && !location.hash)) {
      scrollToPageTop();
    }
  }, [location.pathname, location.hash, location.key, location.state, navigationType]);

  return null;
}

function AppShell() {
  const { loading } = useStore();

  return (
    <>
      <LoadingScreen ready={!loading} />
      <BrowserRouter>
        <ScrollManager />
        <RoutedLayout />
      </BrowserRouter>
    </>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <StoreProvider>
        <AppShell />
      </StoreProvider>
    </AppErrorBoundary>
  );
}
