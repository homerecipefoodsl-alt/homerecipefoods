import React, { Suspense, lazy, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { LiveChatWidget } from './components/LiveChatWidget';
import { LoadingScreen } from './components/LoadingScreen';
import { MobileBottomNav } from './components/MobileBottomNav';
import { StoreProvider, useStore } from './context/StoreContext';
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
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage }))
);

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
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
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#B91C1C]"
          >
            পৃষ্ঠা রিলোড করুন
          </button>
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
  disabled,
  needsVerification,
  onResendVerification,
  onRefreshVerification,
  onSignOut,
}: {
  email?: string | null;
  disabled: boolean;
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
            : disabled
            ? 'অ্যাকাউন্ট নিষ্ক্রিয় রয়েছে'
            : 'অ্যাডমিন প্যানেল সংরক্ষিত'}
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-[#57534E]">
          {needsVerification
            ? `${email || 'Your account'} ইমেইলটি Firebase Authentication-এ এখনো verified নয়। অ্যাডমিন ড্যাশবোর্ডে প্রবেশের আগে ইমেইল ভেরিফিকেশন সম্পন্ন করুন।`
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

  if (user && staffRole && accountStatus !== 'disabled') {
    return <Navigate to="/mahmud/dashboard" replace />;
  }

  if (user && (!staffRole || accountStatus === 'disabled')) {
    return (
      <UnauthorizedAdminCard
        email={user.email}
        disabled={accountStatus === 'disabled'}
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

  if (!staffRole || accountStatus === 'disabled') {
    return (
      <UnauthorizedAdminCard
        email={user.email}
        disabled={accountStatus === 'disabled'}
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

function AppShell() {
  const { loading } = useStore();

  return (
    <>
      <LoadingScreen ready={!loading} />
      <BrowserRouter>
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
