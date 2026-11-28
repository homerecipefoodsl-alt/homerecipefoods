import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useStore } from '../../context/StoreContext';
import { SEED_SITE_SETTINGS } from '../../data/seedData';
import {
  AdminAuthError,
  ensureVerifiedAdminWriteSession,
  fetchDocFromServer,
  formatAdminFirestoreError,
  isValidFirestoreId,
  safeDeleteUnreferencedR2Urls,
} from '../../lib/adminDb';
import { resolveAssetUrl } from '../../lib/assets';
import { getDynamicEnglishDate } from '../../lib/bilingual';
import { db, requireDb } from '../../lib/firebase';
import {
  isForbiddenInlineImageUrl,
  uploadCatalogImageToStorage,
  validateCatalogImageFile,
} from '../../lib/productStorage';
import { getDynamicBengaliDate } from '../../lib/utils';
import type {
  AiKnowledgeEntry,
  ChatMessage,
  ChatSession,
  Complaint,
  ComplaintPriority,
  ComplaintStatus,
  DisplayLanguage,
  GreetingConfig,
  GreetingItem,
  HeroSlide,
  SiteSettings,
} from '../../types';

const COMPLAINT_STATUSES: ComplaintStatus[] = [
  'New',
  'Reviewing',
  'In Progress',
  'Resolved',
  'Rejected',
  'Closed',
];

const COMPLAINT_PRIORITIES: ComplaintPriority[] = ['Low', 'Normal', 'High', 'Urgent'];

const ALLOWED_SITE_SETTINGS_KEYS = [
  'brandName',
  'brandNameBn',
  'brandNameEn',
  'logoUrl',
  'faviconUrl',
  'tagline',
  'taglineBn',
  'taglineEn',
  'shortDescriptionBn',
  'shortDescriptionEn',
  'longDescriptionBn',
  'longDescriptionEn',
  'supportOnline',
  'supportPhone',
  'brandEmail',
  'brandAddressBn',
  'brandAddressEn',
  'messengerUrl',
  'facebookUrl',
  'instagramUrl',
  'youtubeUrl',
  'whatsappUrl',
  'footerTextBn',
  'footerTextEn',
  'announcementEnabled',
  'announcementBn',
  'announcementEn',
  'announcementLink',
  'primaryColor',
  'accentColor',
  'heroSlides',
  'defaultLanguage',
  'aiSupportEnabled',
  'aiAssistantName',
  'aiFallbackMessage',
  'aiCustomInstructions',
  'chatSupportHours',
  'chatOfflineMessage',
  'chatWelcomeMessage',
  'chatCategories',
  'complaintCategories',
  'complaintRefPrefix',
  'complaintTemplates',
  'aboutHeadingEn',
  'aboutHeadingBn',
  'aboutSubtitleEn',
  'aboutSubtitleBn',
  'aboutStoryEn',
  'aboutStoryBn',
  'aboutMissionEn',
  'aboutMissionBn',
  'aboutImageUrl',
  'contactHeadingEn',
  'contactHeadingBn',
  'contactSubtitleEn',
  'contactSubtitleBn',
  'supportHoursEn',
  'supportHoursBn',
  'secondaryPhone',
  'officeMapUrl',
] as const;

function buildWhitelistedSiteSettingsPayload(merged: SiteSettings): Record<string, unknown> {
  const src = merged as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_SITE_SETTINGS_KEYS) {
    if (src[key] !== undefined) {
      out[key] = src[key];
    }
  }
  out.brandName = String(merged.brandName || SEED_SITE_SETTINGS.brandName)
    .trim()
    .slice(0, 100);
  out.tagline = String(merged.tagline || SEED_SITE_SETTINGS.tagline)
    .trim()
    .slice(0, 200);
  out.supportOnline = Boolean(merged.supportOnline);
  const cleanPhone = String(merged.supportPhone || SEED_SITE_SETTINGS.supportPhone).trim();
  out.supportPhone = (cleanPhone.length >= 5 ? cleanPhone : SEED_SITE_SETTINGS.supportPhone).slice(
    0,
    40
  );
  out.messengerUrl = String(merged.messengerUrl || '').trim().slice(0, 300);
  out.facebookUrl = String(merged.facebookUrl || '').trim().slice(0, 300);
  out.instagramUrl = String(merged.instagramUrl || '').trim().slice(0, 300);
  out.youtubeUrl = String(merged.youtubeUrl || '').trim().slice(0, 300);
  if (typeof merged.aiAssistantName === 'string') {
    out.aiAssistantName =
      merged.aiAssistantName.trim().slice(0, 80) || 'Home Recipe AI Assistant';
  }
  if (typeof merged.aiFallbackMessage === 'string') {
    out.aiFallbackMessage =
      merged.aiFallbackMessage.trim().slice(0, 300) ||
      'এই তথ্যটি নিশ্চিতভাবে জানার জন্য আমাদের একজন প্রতিনিধি সাথে যোগাযোগ করুন।';
  }
  if (Array.isArray(merged.heroSlides)) {
    out.heroSlides = merged.heroSlides.slice(0, 6);
  }
  out.updatedAt = serverTimestamp();
  return out;
}

// ========================
// 5. PRIVATE COMPLAINT MANAGEMENT
// ========================
export function AdminComplaintsPanel({
  complaints,
  onRefresh,
}: {
  complaints: Complaint[];
  onRefresh?: () => Promise<void> | void;
}) {
  const { isSuperAdmin, hasPermission, logAdminActivity, refreshStoreData, refreshingStoreData } =
    useStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showroomFilter, setShowroomFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [statusVal, setStatusVal] = useState<ComplaintStatus>('New');
  const [priorityVal, setPriorityVal] = useState<ComplaintPriority>('Normal');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const showroomOptions = useMemo(() => {
    const names = new Set<string>();
    complaints.forEach((c) => {
      if (c.showroomName) names.add(c.showroomName);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [complaints]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        await refreshStoreData();
      }
    } finally {
      setRefreshing(false);
    }
  };

  const openComplaint = (c: Complaint) => {
    setSelected(c);
    setAdminNote(c.adminNote || '');
    setStatusVal(c.status);
    setPriorityVal(c.priority || 'Normal');
    setConfirmDeleteId(null);
    setFeedback(null);
  };

  const updateComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setFeedback(null);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'complaints_manage',
      });
      if (!isValidFirestoreId(selected.id)) {
        throw new AdminAuthError('validation/preflight-failed', 'অবৈধ অভিযোগ আইডি।');
      }
      const firestore = requireDb();
      const complaintRef = doc(firestore, 'complaints', selected.id);
      const existingSnap = await fetchDocFromServer(complaintRef);
      if (!existingSnap.exists()) {
        throw new AdminAuthError(
          'not-found',
          'সংশ্লিষ্ট অভিযোগ ডকুমেন্টটি Firestore-এ আর পাওয়া যায়নি। রিফ্রেশ করে আবার চেষ্টা করুন।'
        );
      }
      const existingData = existingSnap.data() as Complaint;
      if (existingData.status === 'Closed' && !isSuperAdmin) {
        throw new AdminAuthError(
          'rbac/missing-permission',
          'Closed অভিযোগ শুধুমাত্র Super Admin পরিবর্তন বা পুনরায় ওপেন করতে পারবেন।'
        );
      }
      const trimmedNote = adminNote.trim().slice(0, 2000);
      await updateDoc(complaintRef, {
        status: statusVal,
        priority: priorityVal,
        adminNote: trimmedNote,
        updatedAt: serverTimestamp(),
      });
      await logAdminActivity(
        'update_complaint',
        'complaints',
        selected.id,
        selected.referenceCode,
        `Status=${statusVal}, Priority=${priorityVal}`
      );
      setSelected({
        ...selected,
        status: statusVal,
        priority: priorityVal,
        adminNote: trimmedNote,
      });
      setFeedback({
        type: 'ok',
        text: `Updated ${selected.referenceCode} to ${statusVal} (${priorityVal}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'complaints_update', {
          collection: 'complaints',
          documentId: selected.id,
          path: `complaints/${selected.id}`,
          operation: 'UPDATE',
          authSession,
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteComplaint = async (complaint: Complaint) => {
    if (!isSuperAdmin || deletingId) return;
    setDeletingId(complaint.id);
    setFeedback(null);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'complaints_manage',
        superAdminOnly: true,
      });
      if (!isValidFirestoreId(complaint.id)) {
        throw new AdminAuthError('validation/preflight-failed', 'অবৈধ অভিযোগ আইডি।');
      }
      const firestore = requireDb();
      const complaintRef = doc(firestore, 'complaints', complaint.id);
      const existingSnap = await fetchDocFromServer(complaintRef);
      if (!existingSnap.exists()) {
        throw new AdminAuthError(
          'not-found',
          'সংশ্লিষ্ট অভিযোগ ডকুমেন্টটি Firestore-এ আর পাওয়া যায়নি।'
        );
      }
      await deleteDoc(complaintRef);
      await logAdminActivity(
        'delete_complaint',
        'complaints',
        complaint.id,
        complaint.referenceCode,
        `Deleted complaint by ${complaint.customerName}`
      );
      setConfirmDeleteId(null);
      if (selected?.id === complaint.id) {
        setSelected(null);
      }
      setFeedback({
        type: 'ok',
        text: `Deleted complaint ${complaint.referenceCode}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'complaints_delete', {
          collection: 'complaints',
          documentId: complaint.id,
          path: `complaints/${complaint.id}`,
          operation: 'DELETE',
          authSession,
        }),
      });
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = complaints.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (showroomFilter !== 'all' && c.showroomName !== showroomFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.referenceCode.toLowerCase().includes(q) ||
        c.customerName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.showroomName.toLowerCase().includes(q) ||
        c.message.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Private Complaint Management
          </h2>
          <p className="text-xs text-[#57534E]">
            Authorized staff and management can review confidential customer complaints, update status &amp; priority, and record internal notes.
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing || refreshingStoreData}
          onClick={() => void handleRefresh()}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing || refreshingStoreData ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-semibold ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-[#B91C1C]'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by reference code, name, phone, or outlet..."
          className="w-full max-w-xs rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold"
        >
          <option value="all">All Statuses</option>
          {COMPLAINT_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
        <select
          value={showroomFilter}
          onChange={(e) => setShowroomFilter(e.target.value)}
          className="rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold"
        >
          <option value="all">All Outlets</option>
          {showroomOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-2.5 lg:col-span-7">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-[#E7E5E4] bg-white p-10 text-center text-xs text-[#78716C]">
              No matching complaints found.
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openComplaint(c)}
                className={`w-full cursor-pointer rounded-xl border p-4 text-left transition-all ${
                  selected?.id === c.id
                    ? 'border-[#DC1F26] bg-white shadow-sm'
                    : 'border-[#E7E5E4] bg-white hover:border-[#D6D3D1]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[#DC1F26]">
                    {c.referenceCode}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] font-semibold">
                    {c.priority && c.priority !== 'Normal' && (
                      <span className="text-[#9A3412]">{c.priority} Priority</span>
                    )}
                    <span
                      className={
                        c.status === 'New' || c.status === 'Rejected'
                          ? 'text-red-700'
                          : c.status === 'Resolved' || c.status === 'Closed'
                          ? 'text-emerald-700'
                          : 'text-[#854D0E]'
                      }
                    >
                      {c.status}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-sm font-semibold text-[#1C1917]">
                  {c.customerName} · <span className="font-mono tabular-nums text-xs">{c.phone}</span>
                </p>
                <p className="mt-0.5 text-xs text-[#78716C]">
                  {c.category} · {c.showroomName}
                </p>
                <p className="mt-2 line-clamp-2 text-xs text-[#44403C]">{c.message}</p>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-5">
          {selected ? (
            <form
              onSubmit={updateComplaint}
              className="rounded-xl border border-[#E7E5E4] bg-white p-5"
            >
              <div className="border-b border-[#F5F4F0] pb-3">
                <p className="font-mono text-xs font-bold text-[#DC1F26]">
                  {selected.referenceCode}
                </p>
                <h3 className="font-display mt-0.5 text-xl font-bold text-[#1C1917]">
                  {selected.customerName}
                </h3>
                <p className="text-xs tabular-nums text-[#57534E]">
                  {selected.phone} {selected.email ? `· ${selected.email}` : ''}
                </p>
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <p>
                  <span className="font-semibold text-[#1C1917]">Category:</span>{' '}
                  {selected.category}
                </p>
                <p>
                  <span className="font-semibold text-[#1C1917]">Outlet:</span>{' '}
                  {selected.showroomName}
                </p>
                <div className="rounded-lg bg-[#FAFAF8] p-3 leading-relaxed text-[#1C1917]">
                  {selected.message}
                </div>

                {selected.attachmentImage && (
                  <div>
                    <p className="mb-1 font-semibold text-[#1C1917]">Attached Photo:</p>
                    <img
                      src={selected.attachmentImage}
                      alt="Complaint attachment"
                      className="max-h-56 w-full rounded-lg border border-[#E7E5E4] object-contain"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block font-semibold text-[#1C1917]">
                      Status
                    </label>
                    <select
                      value={statusVal}
                      onChange={(e) => setStatusVal(e.target.value as ComplaintStatus)}
                      className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                    >
                      {COMPLAINT_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-[#1C1917]">
                      Priority
                    </label>
                    <select
                      value={priorityVal}
                      onChange={(e) => setPriorityVal(e.target.value as ComplaintPriority)}
                      className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                    >
                      {COMPLAINT_PRIORITIES.map((pr) => (
                        <option key={pr} value={pr}>
                          {pr}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-[#1C1917]">
                    Internal Admin Note
                  </label>
                  <textarea
                    rows={3}
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="Record follow-up notes or resolution details..."
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                  />
                </div>
              </div>

              {selected.status === 'Closed' && !isSuperAdmin ? (
                <p className="mt-4 rounded-lg bg-[#FAFAF8] px-3 py-2 text-center text-xs font-medium text-[#78716C]">
                  This complaint is Closed. Only a Super Admin can reopen or modify it.
                </p>
              ) : (
                <button
                  type="submit"
                  disabled={saving}
                  className="mt-4 w-full cursor-pointer rounded-lg bg-[#1C1917] py-2.5 text-xs font-semibold text-white hover:bg-[#DC1F26] disabled:opacity-50"
                >
                  {saving ? 'Saving Update...' : 'Update Status'}
                </button>
              )}

              {isSuperAdmin && (
                <div className="mt-3 border-t border-[#F5F4F0] pt-3">
                  {confirmDeleteId === selected.id ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs">
                      <span className="font-semibold text-[#B91C1C]">Delete permanently?</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={deletingId === selected.id}
                          onClick={() => void deleteComplaint(selected)}
                          className="cursor-pointer rounded bg-[#DC1F26] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#B91C1C] disabled:opacity-50"
                        >
                          {deletingId === selected.id ? 'Deleting...' : 'Confirm Delete'}
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === selected.id}
                          onClick={() => setConfirmDeleteId(null)}
                          className="cursor-pointer rounded border border-[#D6D3D1] bg-white px-2 py-1 text-[11px] font-semibold text-[#57534E]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(selected.id)}
                      className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Complaint Permanently</span>
                    </button>
                  )}
                </div>
              )}
            </form>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-[#E7E5E4] bg-white p-6 text-center text-xs text-[#78716C]">
              Select a complaint on the left to review details and update status.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ========================
// 6. GREETING MANAGEMENT
// ========================
export function AdminGreetingPanel() {
  const {
    greeting,
    allGreetingItems,
    hasPermission,
    logAdminActivity,
    refreshStoreData,
    refreshingStoreData,
  } = useStore();
  const [form, setForm] = useState<GreetingConfig>(greeting);
  const [savingDaily, setSavingDaily] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [newTextBn, setNewTextBn] = useState('');
  const [newTextEn, setNewTextEn] = useState('');
  const [newDuration, setNewDuration] = useState(4200);
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');

  useEffect(() => {
    setForm(greeting);
  }, [greeting]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingDaily) return;
    setSavingDaily(true);
    setFeedback(null);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    let operation: 'CREATE' | 'UPDATE' = 'UPDATE';
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'banners_manage',
      });
      const greetingBn = (form.greetingText || form.greeting_bn || '').trim().slice(0, 160);
      const greetingEn = (form.greetingTextEn || form.greeting_en || '').trim().slice(0, 160);
      const msgBn = (form.dailyMessage || form.message_bn || '').trim().slice(0, 200);
      const msgEn = (form.dailyMessageEn || form.message_en || '').trim().slice(0, 200);
      const specialBn = (form.specialMessage || form.special_message_bn || '').trim().slice(0, 200);
      const specialEn = (form.specialMessageEn || form.special_message_en || '')
        .trim()
        .slice(0, 200);
      const annBn = (form.announcement || form.announcement_bn || '').trim().slice(0, 240);
      const annEn = (form.announcementEn || form.announcement_en || '').trim().slice(0, 240);

      const firestore = requireDb();
      const dailyRef = doc(firestore, 'greetings', 'daily');
      const existingSnap = await fetchDocFromServer(dailyRef);
      operation = existingSnap.exists() ? 'UPDATE' : 'CREATE';

      const payload = {
        useDynamicDate: Boolean(form.useDynamicDate),
        customDateText: form.customDateText.trim().slice(0, 120),
        customDateTextEn: (form.customDateTextEn || '').trim().slice(0, 120),
        greetingText: greetingBn || greetingEn || 'আসসালামু আলাইকুম',
        greetingTextEn: greetingEn,
        greeting_bn: greetingBn || greetingEn,
        greeting_en: greetingEn,
        dailyMessage: msgBn || msgEn || 'স্বাগতম Home Recipe Foods-এ',
        dailyMessageEn: msgEn,
        message_bn: msgBn || msgEn,
        message_en: msgEn,
        specialMessage: specialBn,
        specialMessageEn: specialEn,
        special_message_bn: specialBn,
        special_message_en: specialEn,
        announcement: annBn,
        announcementEn: annEn,
        announcement_bn: annBn,
        announcement_en: annEn,
        updatedAt: serverTimestamp(),
      };

      if (existingSnap.exists()) {
        await updateDoc(dailyRef, payload);
      } else {
        await setDoc(dailyRef, payload);
      }
      await logAdminActivity('update', 'greetings', 'daily', 'Daily Greeting Config');
      setFeedback({ type: 'ok', text: 'গ্রিটিং বার্তা সফলভাবে আপডেট হয়েছে।' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'greeting_daily_save', {
          collection: 'greetings',
          documentId: 'daily',
          path: 'greetings/daily',
          operation,
          authSession,
        }),
      });
    } finally {
      setSavingDaily(false);
    }
  };

  const handleAddGreetingItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addingItem) return;
    if (!newTextBn.trim() && !newTextEn.trim()) {
      setFeedback({ type: 'err', text: 'অন্তত বাংলা অথবা English গ্রিটিং টেক্সট লিখুন।' });
      return;
    }
    setAddingItem(true);
    setFeedback(null);
    const id = `grt_${Date.now()}`;
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'banners_manage',
      });
      const firestore = requireDb();
      const durationMs = Math.min(
        60000,
        Math.max(1000, Math.round(Number(newDuration) || 4200))
      );
      const item: Omit<GreetingItem, 'id'> = {
        text_bn: newTextBn.trim().slice(0, 240),
        text_en: newTextEn.trim().slice(0, 240),
        type: 'greeting',
        active: true,
        visible: true,
        display_order: Math.min(1000, allGreetingItems.length + 1),
        durationMs,
        startDate: newStartDate.slice(0, 32),
        endDate: newEndDate.slice(0, 32),
        deleted: false,
      };
      await setDoc(doc(firestore, 'greetings', id), {
        id,
        ...item,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logAdminActivity('create', 'greetings', id, item.text_en || item.text_bn);
      setNewTextBn('');
      setNewTextEn('');
      setNewStartDate('');
      setNewEndDate('');
      setFeedback({ type: 'ok', text: 'নতুন গ্রিটিং আইটেম যোগ হয়েছে।' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'greeting_item_create', {
          collection: 'greetings',
          documentId: id,
          path: `greetings/${id}`,
          operation: 'CREATE',
          authSession,
        }),
      });
    } finally {
      setAddingItem(false);
    }
  };

  const toggleGreetingItemActive = async (item: GreetingItem) => {
    if (busyItemId) return;
    setBusyItemId(item.id);
    setFeedback(null);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'banners_manage',
      });
      if (!isValidFirestoreId(item.id)) {
        throw new AdminAuthError('validation/preflight-failed', 'অবৈধ গ্রিটিং আইডি।');
      }
      const firestore = requireDb();
      const itemRef = doc(firestore, 'greetings', item.id);
      const existingSnap = await fetchDocFromServer(itemRef);
      if (!existingSnap.exists()) {
        throw new AdminAuthError('not-found', 'গ্রিটিং আইটেমটি Firestore-এ পাওয়া যায়নি।');
      }
      await updateDoc(itemRef, {
        active: !item.active,
        updatedAt: serverTimestamp(),
      });
      await logAdminActivity(
        'toggle_active',
        'greetings',
        item.id,
        item.text_en || item.text_bn,
        `Active=${!item.active}`
      );
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'greeting_item_toggle', {
          collection: 'greetings',
          documentId: item.id,
          path: `greetings/${item.id}`,
          operation: 'UPDATE',
          authSession,
        }),
      });
    } finally {
      setBusyItemId(null);
    }
  };

  const deleteGreetingItem = async (item: GreetingItem) => {
    if (busyItemId) return;
    setBusyItemId(item.id);
    setFeedback(null);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'banners_manage',
      });
      if (!isValidFirestoreId(item.id) || item.id === 'daily') {
        throw new AdminAuthError('validation/preflight-failed', 'এই গ্রিটিং আইটেম ডিলিট করা যাবে না।');
      }
      const firestore = requireDb();
      const itemRef = doc(firestore, 'greetings', item.id);
      const existingSnap = await fetchDocFromServer(itemRef);
      if (!existingSnap.exists()) {
        throw new AdminAuthError('not-found', 'গ্রিটিং আইটেমটি Firestore-এ আর পাওয়া যায়নি।');
      }
      await deleteDoc(itemRef);
      await logAdminActivity('delete', 'greetings', item.id, item.text_en || item.text_bn);
      setConfirmDeleteItemId(null);
      setFeedback({ type: 'ok', text: 'গ্রিটিং আইটেম ডিলিট করা হয়েছে।' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'greeting_item_delete', {
          collection: 'greetings',
          documentId: item.id,
          path: `greetings/${item.id}`,
          operation: 'DELETE',
          authSession,
        }),
      });
    } finally {
      setBusyItemId(null);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSave}
        className="max-w-3xl space-y-4 rounded-xl border border-[#E7E5E4] bg-white p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#1C1917]">
              Greeting &amp; Daily Message Management
            </h2>
            <p className="text-xs text-[#57534E]">
              লোগোর ঠিক নিচে পর্যায়ক্রমে প্রদর্শিত বাংলা ও English তারিখ, সালাম ও দৈনিক বার্তা পরিবর্তন করুন।
            </p>
          </div>
          <button
            type="button"
            disabled={refreshingStoreData}
            onClick={() => void refreshStoreData()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshingStoreData ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
              feedback.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-[#B91C1C]'
            }`}
          >
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#1C1917]">
          <input
            type="checkbox"
            checked={form.useDynamicDate}
            onChange={(e) => setForm({ ...form, useDynamicDate: e.target.checked })}
          />
          <span>
            স্বয়ংক্রিয়ভাবে আজকের বাংলা ও English তারিখ দেখান ({getDynamicBengaliDate()} |{' '}
            {getDynamicEnglishDate()})
          </span>
        </label>

        {!form.useDynamicDate && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold">Custom Date Text (বাংলা)</label>
              <input
                type="text"
                value={form.customDateText}
                onChange={(e) => setForm({ ...form, customDateText: e.target.value })}
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Custom Date Text (English)</label>
              <input
                type="text"
                value={form.customDateTextEn ?? ''}
                onChange={(e) => setForm({ ...form, customDateTextEn: e.target.value })}
                placeholder="e.g. Today's Special Menu"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold">Greeting (বাংলা) *</label>
            <input
              type="text"
              required
              value={form.greetingText}
              onChange={(e) =>
                setForm({
                  ...form,
                  greetingText: e.target.value,
                  greeting_bn: e.target.value,
                })
              }
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Greeting (English)</label>
            <input
              type="text"
              value={form.greetingTextEn ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  greetingTextEn: e.target.value,
                  greeting_en: e.target.value,
                })
              }
              placeholder="Assalamu Alaikum, Sir"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold">Daily Message (বাংলা) *</label>
            <input
              type="text"
              required
              value={form.dailyMessage}
              onChange={(e) =>
                setForm({
                  ...form,
                  dailyMessage: e.target.value,
                  message_bn: e.target.value,
                })
              }
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Daily Message (English)</label>
            <input
              type="text"
              value={form.dailyMessageEn ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  dailyMessageEn: e.target.value,
                  message_en: e.target.value,
                })
              }
              placeholder="Wishing You a Wonderful Day"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold">
              Special Occasion Message (বাংলা)
            </label>
            <input
              type="text"
              value={form.specialMessage}
              onChange={(e) =>
                setForm({
                  ...form,
                  specialMessage: e.target.value,
                  special_message_bn: e.target.value,
                })
              }
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              Special Occasion Message (English)
            </label>
            <input
              type="text"
              value={form.specialMessageEn ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  specialMessageEn: e.target.value,
                  special_message_en: e.target.value,
                })
              }
              placeholder="Handcrafted cakes & traditional sweets every morning"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold">Announcement (বাংলা)</label>
            <input
              type="text"
              value={form.announcement}
              onChange={(e) =>
                setForm({
                  ...form,
                  announcement: e.target.value,
                  announcement_bn: e.target.value,
                })
              }
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Announcement (English)</label>
            <input
              type="text"
              value={form.announcementEn ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  announcementEn: e.target.value,
                  announcement_en: e.target.value,
                })
              }
              placeholder="Visit or call our showrooms for your favorite items"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={savingDaily}
          className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
        >
          {savingDaily ? 'সংরক্ষণ হচ্ছে...' : 'গ্রিটিং সংরক্ষণ করুন'}
        </button>
      </form>

      {/* Extra Animated Greeting Ticker Items */}
      <div className="max-w-3xl space-y-4 rounded-xl border border-[#E7E5E4] bg-white p-6">
        <div>
          <h3 className="font-display text-xl font-bold text-[#1C1917]">
            Additional Scheduled Greeting Items ({allGreetingItems.length})
          </h3>
          <p className="text-xs text-[#57534E]">
            উৎসব বা বিশেষ দিনের জন্য অতিরিক্ত বাংলা ও English টিকার বার্তা যোগ করুন এবং সময় নির্ধারণ করুন।
          </p>
        </div>

        <form onSubmit={handleAddGreetingItem} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            type="text"
            value={newTextBn}
            onChange={(e) => setNewTextBn(e.target.value)}
            placeholder="Greeting Text (বাংলা)"
            className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
          />
          <input
            type="text"
            value={newTextEn}
            onChange={(e) => setNewTextEn(e.target.value)}
            placeholder="Greeting Text (English)"
            className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
          />
          <div className="grid grid-cols-3 gap-2 sm:col-span-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold">Duration (ms)</label>
              <input
                type="number"
                min={2000}
                step={500}
                value={newDuration}
                onChange={(e) => setNewDuration(Number(e.target.value))}
                className="w-full rounded-lg border border-[#D6D3D1] px-2.5 py-1.5 font-mono text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold">Start Date</label>
              <input
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
                className="w-full rounded-lg border border-[#D6D3D1] px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold">End Date</label>
              <input
                type="date"
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
                className="w-full rounded-lg border border-[#D6D3D1] px-2.5 py-1.5 text-xs"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={addingItem}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{addingItem ? 'Adding...' : 'Add Greeting Item'}</span>
            </button>
          </div>
        </form>

        {allGreetingItems.length > 0 && (
          <div className="space-y-2 border-t border-[#F5F4F0] pt-4">
            {allGreetingItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[#E7E5E4] bg-[#FAFAF8] px-3 py-2 text-xs"
              >
                <div>
                  <p className="font-semibold text-[#1C1917]">
                    {item.text_en || item.text_bn}
                  </p>
                  {item.text_en && item.text_bn && item.text_bn !== item.text_en && (
                    <p className="font-bn text-[11px] text-[#57534E]">{item.text_bn}</p>
                  )}
                  <p className="text-[11px] text-[#78716C]">
                    {(item.durationMs || 4200) / 1000}s
                    {item.startDate || item.endDate
                      ? ` · ${item.startDate || '...'} → ${item.endDate || '...'}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyItemId === item.id}
                    onClick={() => void toggleGreetingItemActive(item)}
                    className={`cursor-pointer rounded px-2 py-1 text-[11px] font-semibold disabled:opacity-50 ${
                      item.active !== false
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-[#E7E5E4] text-[#57534E]'
                    }`}
                  >
                    {item.active !== false ? 'Active' : 'Paused'}
                  </button>
                  {confirmDeleteItemId === item.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={busyItemId === item.id}
                        onClick={() => void deleteGreetingItem(item)}
                        className="cursor-pointer rounded bg-[#DC1F26] px-2 py-1 text-[10px] font-bold text-white"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteItemId(null)}
                        className="cursor-pointer rounded border border-[#D6D3D1] bg-white px-2 py-1 text-[10px] font-semibold text-[#57534E]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={busyItemId === item.id}
                      onClick={() => setConfirmDeleteItemId(item.id)}
                      className="cursor-pointer rounded p-1 text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ========================
// 7. HERO & SITE SETTINGS
// ========================
function normalizeSlidesForSave(slides: HeroSlide[]): HeroSlide[] {
  return slides.map((s) => {
    const titleEn = (s.title_en ?? s.title ?? '').trim();
    const titleBn = (s.title_bn ?? '').trim();
    const subtitleBn = (s.subtitle_bn ?? s.subtitle ?? '').trim();
    const subtitleEn = (s.subtitle_en ?? '').trim();
    return {
      ...s,
      title: titleEn || titleBn || s.title || 'Home Recipe Foods',
      title_bn: titleBn,
      title_en: titleEn,
      subtitle: subtitleBn || subtitleEn || s.subtitle || 'Handcrafted Fresh Daily',
      subtitle_bn: subtitleBn,
      subtitle_en: subtitleEn,
      displayLanguage: s.displayLanguage || 'both',
    };
  });
}

export function AdminSettingsPanel() {
  const {
    siteSettings,
    allProducts,
    allCategories,
    allShowrooms,
    allHeroBanners,
    mediaItems,
    seoSettings,
    hasPermission,
    logAdminActivity,
    refreshStoreData,
    refreshingStoreData,
  } = useStore();
  const [form, setForm] = useState<SiteSettings>(siteSettings);
  const [complaintCatsText, setComplaintCatsText] = useState(
    (siteSettings.complaintCategories || []).join(', ')
  );
  const [saving, setSaving] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setForm(siteSettings);
    setComplaintCatsText((siteSettings.complaintCategories || []).join(', '));
  }, [siteSettings]);

  const handleSlideUpload = async (idx: number, file: File) => {
    const validationErr = validateCatalogImageFile(file);
    if (validationErr) {
      setFeedback({ type: 'err', text: validationErr });
      return;
    }
    const targetSlide = form.heroSlides[idx];
    const entityId = targetSlide?.id || `slide-${idx + 1}`;
    setUploadingTarget(`slide-${idx}`);
    setFeedback(null);
    try {
      const res = await uploadCatalogImageToStorage({
        folder: 'banners',
        entityId,
        file,
      });
      setForm((prev) => ({
        ...prev,
        heroSlides: prev.heroSlides.map((s, i) =>
          i === idx ? { ...s, image: res.downloadUrl } : s
        ),
      }));
      setFeedback({
        type: 'ok',
        text: `Slide #${idx + 1} ছবি R2-তে আপলোড হয়েছে। পরিবর্তন প্রকাশ করতে সেভ করুন।`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'স্লাইড ছবি আপলোড করা যায়নি।',
      });
    } finally {
      setUploadingTarget(null);
    }
  };

  const handleBrandImageUpload = async (field: 'logoUrl' | 'faviconUrl', file: File) => {
    const validationErr = validateCatalogImageFile(file);
    if (validationErr) {
      setFeedback({ type: 'err', text: validationErr });
      return;
    }
    setUploadingTarget(field);
    setFeedback(null);
    try {
      const res = await uploadCatalogImageToStorage({
        folder: 'media',
        entityId: field === 'logoUrl' ? 'brand-logo' : 'brand-favicon',
        file,
      });
      setForm((prev) => ({ ...prev, [field]: res.downloadUrl }));
      setFeedback({
        type: 'ok',
        text: `${field === 'logoUrl' ? 'Logo' : 'Favicon'} R2-তে আপলোড হয়েছে। পরিবর্তন সংরক্ষণ করতে সেভ করুন।`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ছবি আপলোড করা যায়নি।',
      });
    } finally {
      setUploadingTarget(null);
    }
  };

  const addSlide = () => {
    if (form.heroSlides.length >= 6) return;
    const newSlide: HeroSlide = {
      id: `slide-${Date.now()}`,
      title: 'Crafted Fresh for Your Special Moments',
      title_bn: 'আপনার প্রতিটি বিশেষ মুহূর্তে',
      title_en: 'Crafted Fresh for Your Special Moments',
      subtitle: 'নতুন মৌসুমের স্পেশ্যাল মেনু এখন আমাদের সকল শোরুমে।',
      subtitle_bn: 'নতুন মৌসুমের স্পেশ্যাল মেনু এখন আমাদের সকল শোরুমে।',
      subtitle_en: 'Seasonal artisanal specialties now available across our showrooms.',
      displayLanguage: 'both',
      ctaLabel: 'Explore Products',
      ctaLink: '/products',
      image: '/src/assets/images/hero_bakery_clean_1794746110066.jpg',
    };
    setForm({ ...form, heroSlides: [...form.heroSlides, newSlide] });
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || uploadingTarget) return;
    if (form.brandName.trim().length < 1) {
      setFeedback({ type: 'err', text: 'Brand Name (English) অবশ্যই লিখতে হবে।' });
      return;
    }
    if (form.tagline.trim().length < 1) {
      setFeedback({ type: 'err', text: 'Brand Tagline অবশ্যই লিখতে হবে।' });
      return;
    }
    if (form.supportPhone.trim().length < 5) {
      setFeedback({ type: 'err', text: 'Support Phone কমপক্ষে ৫ অক্ষরের হতে হবে।' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    let operation: 'CREATE' | 'UPDATE' = 'UPDATE';
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'settings_view',
      });
      const firestore = requireDb();
      const parsedComplaintCats = complaintCatsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 15);

      const normalizedSlides = normalizeSlidesForSave(form.heroSlides);
      for (const s of normalizedSlides) {
        if (isForbiddenInlineImageUrl(s.image)) {
          throw new AdminAuthError(
            'validation/preflight-failed',
            'ব্যানারে Base64/inline ডেটা অনুমোদিত নয়। অনুগ্রহ করে ছবি পুনরায় আপলোড করুন।'
          );
        }
      }

      const mergedSettings: SiteSettings = {
        ...SEED_SITE_SETTINGS,
        ...siteSettings,
        ...form,
        complaintCategories:
          parsedComplaintCats.length > 0
            ? parsedComplaintCats
            : form.complaintCategories || [],
        defaultLanguage: form.defaultLanguage || 'both',
        heroSlides: normalizedSlides,
      };
      const payload = buildWhitelistedSiteSettingsPayload(mergedSettings);

      const settingsRef = doc(firestore, 'site_settings', 'main');
      const existingSnap = await fetchDocFromServer(settingsRef);
      operation = existingSnap.exists() ? 'UPDATE' : 'CREATE';
      if (existingSnap.exists()) {
        await updateDoc(settingsRef, payload);
      } else {
        await setDoc(settingsRef, payload);
      }

      const previousUrls: string[] = [];
      if (siteSettings.logoUrl && siteSettings.logoUrl !== mergedSettings.logoUrl) {
        previousUrls.push(siteSettings.logoUrl);
      }
      if (siteSettings.faviconUrl && siteSettings.faviconUrl !== mergedSettings.faviconUrl) {
        previousUrls.push(siteSettings.faviconUrl);
      }
      const nextSlideUrls = new Set(normalizedSlides.map((s) => s.image).filter(Boolean));
      for (const oldSlide of siteSettings.heroSlides || []) {
        if (oldSlide.image && !nextSlideUrls.has(oldSlide.image)) {
          previousUrls.push(oldSlide.image);
        }
      }
      if (previousUrls.length > 0) {
        void safeDeleteUnreferencedR2Urls({
          urls: previousUrls,
          snapshot: {
            allProducts,
            allCategories,
            allShowrooms,
            allHeroBanners,
            mediaItems,
            siteSettings: mergedSettings,
            seoSettings,
          },
        });
      }

      await logAdminActivity('update', 'site_settings', 'main', 'Website Settings');
      setFeedback({ type: 'ok', text: 'সেটিংস ও ব্র্যান্ড তথ্য আপডেট হয়েছে।' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'site_settings_save', {
          collection: 'site_settings',
          documentId: 'main',
          path: 'site_settings/main',
          operation,
          authSession,
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={saveSettings} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Website, Brand &amp; AI Settings
          </h2>
          <p className="text-xs text-[#57534E]">
            ব্র্যান্ড নাম, লোগো, ফুটার, অ্যানাউন্সমেন্ট বার, হটলাইন, সোশ্যাল লিংক ও AI সাপোর্ট সম্পূর্ণ পরিবর্তন করুন।
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={refreshingStoreData}
            onClick={() => void refreshStoreData()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshingStoreData ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="submit"
            disabled={saving || Boolean(uploadingTarget)}
            className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
          >
            {saving ? 'সংরক্ষণ হচ্ছে...' : 'সব পরিবর্তন সেভ করুন'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-[#B91C1C]'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Brand Identity */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-[#E7E5E4] bg-white p-5 sm:grid-cols-2">
        <div className="sm:col-span-2 border-b border-[#F5F4F0] pb-2">
          <h3 className="font-display text-lg font-bold text-[#1C1917]">
            Brand Identity &amp; Footer Information
          </h3>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Brand Name (English)</label>
          <input
            type="text"
            value={form.brandName}
            onChange={(e) => setForm({ ...form, brandName: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Brand Name (বাংলা)</label>
          <input
            type="text"
            value={form.brandNameBn ?? ''}
            onChange={(e) => setForm({ ...form, brandNameBn: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold">Brand Tagline</label>
          <input
            type="text"
            value={form.tagline}
            onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Logo URL (or Upload)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={form.logoUrl ?? ''}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              placeholder="/assets/aistudio/..."
              className="flex-1 rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
            />
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs font-semibold hover:border-[#DC1F26]">
              <span>Upload</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleBrandImageUpload('logoUrl', f);
                }}
                className="hidden"
              />
            </label>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Favicon URL (or Upload)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={form.faviconUrl ?? ''}
              onChange={(e) => setForm({ ...form, faviconUrl: e.target.value })}
              placeholder="/assets/aistudio/..."
              className="flex-1 rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
            />
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs font-semibold hover:border-[#DC1F26]">
              <span>Upload</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleBrandImageUpload('faviconUrl', f);
                }}
                className="hidden"
              />
            </label>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Footer Description (বাংলা)</label>
          <textarea
            rows={2}
            value={form.footerTextBn ?? ''}
            onChange={(e) => setForm({ ...form, footerTextBn: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Footer Description (English)</label>
          <textarea
            rows={2}
            value={form.footerTextEn ?? ''}
            onChange={(e) => setForm({ ...form, footerTextEn: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
          />
        </div>
      </div>

      {/* Contact, Language & Announcement Bar */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-[#E7E5E4] bg-white p-5 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold">Support Phone</label>
          <input
            type="text"
            value={form.supportPhone}
            onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Support / Contact Email</label>
          <input
            type="email"
            value={form.brandEmail ?? ''}
            onChange={(e) => setForm({ ...form, brandEmail: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">
            Default Website Language Mode
          </label>
          <select
            value={form.defaultLanguage ?? 'both'}
            onChange={(e) =>
              setForm({
                ...form,
                defaultLanguage: e.target.value as DisplayLanguage,
              })
            }
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          >
            <option value="both">Bengali + English (Both)</option>
            <option value="bn">Bengali Primary (বাংলা)</option>
            <option value="en">English Primary</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">WhatsApp URL</label>
          <input
            type="text"
            value={form.whatsappUrl ?? ''}
            onChange={(e) => setForm({ ...form, whatsappUrl: e.target.value })}
            placeholder="https://wa.me/8801..."
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Messenger URL</label>
          <input
            type="text"
            value={form.messengerUrl}
            onChange={(e) => setForm({ ...form, messengerUrl: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Facebook URL</label>
          <input
            type="text"
            value={form.facebookUrl}
            onChange={(e) => setForm({ ...form, facebookUrl: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Instagram URL</label>
          <input
            type="text"
            value={form.instagramUrl}
            onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">YouTube URL</label>
          <input
            type="text"
            value={form.youtubeUrl}
            onChange={(e) => setForm({ ...form, youtubeUrl: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>

        {/* Announcement Bar */}
        <div className="sm:col-span-2 border-t border-[#F5F4F0] pt-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-[#1C1917]">
            <input
              type="checkbox"
              checked={Boolean(form.announcementEnabled)}
              onChange={(e) => setForm({ ...form, announcementEnabled: e.target.checked })}
            />
            <span>Enable Top Announcement Bar (above Header)</span>
          </label>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              type="text"
              value={form.announcementBn ?? ''}
              onChange={(e) => setForm({ ...form, announcementBn: e.target.value })}
              placeholder="Announcement (বাংলা)"
              className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={form.announcementEn ?? ''}
              onChange={(e) => setForm({ ...form, announcementEn: e.target.value })}
              placeholder="Announcement (English)"
              className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={form.announcementLink ?? ''}
              onChange={(e) => setForm({ ...form, announcementLink: e.target.value })}
              placeholder="/products or /showrooms"
              className="rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-xs"
            />
          </div>
        </div>
      </div>

      {/* Complaint & Chat Configuration */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-[#E7E5E4] bg-white p-5 sm:grid-cols-2">
        <div className="sm:col-span-2 border-b border-[#F5F4F0] pb-2">
          <h3 className="font-display text-lg font-bold text-[#1C1917]">
            Complaint &amp; Live Chat Texts
          </h3>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">
            Complaint Categories (Comma-separated)
          </label>
          <input
            type="text"
            value={complaintCatsText}
            onChange={(e) => setComplaintCatsText(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">
            Complaint Reference Prefix (e.g. HRF)
          </label>
          <input
            type="text"
            value={form.complaintRefPrefix ?? 'HRF'}
            onChange={(e) => setForm({ ...form, complaintRefPrefix: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Chat Support Hours</label>
          <input
            type="text"
            value={form.chatSupportHours ?? ''}
            onChange={(e) => setForm({ ...form, chatSupportHours: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Chat Offline Message</label>
          <input
            type="text"
            value={form.chatOfflineMessage ?? ''}
            onChange={(e) => setForm({ ...form, chatOfflineMessage: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold">AI Chat Welcome Message</label>
          <input
            type="text"
            value={form.chatWelcomeMessage ?? ''}
            onChange={(e) => setForm({ ...form, chatWelcomeMessage: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
          />
        </div>
      </div>

      {/* AI Support Configuration */}
      <div className="space-y-4 rounded-xl border border-[#E7E5E4] bg-white p-5">
        <div className="flex flex-col justify-between gap-2 border-b border-[#F5F4F0] pb-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-display text-xl font-bold text-[#1C1917]">
              AI Support Configuration
            </h3>
            <p className="text-xs text-[#57534E]">
              ক্রেতাদের AI সহকারীর নাম, সক্রিয় অবস্থা ও উত্তর নির্দেশনা নিয়ন্ত্রণ করুন।
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#1C1917]">
            <input
              type="checkbox"
              checked={form.aiSupportEnabled !== false}
              onChange={(e) =>
                setForm({ ...form, aiSupportEnabled: e.target.checked })
              }
            />
            <span>AI Support Enabled</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold">
              AI Assistant Display Name
            </label>
            <input
              type="text"
              maxLength={80}
              value={form.aiAssistantName ?? 'Home Recipe AI Assistant'}
              onChange={(e) =>
                setForm({ ...form, aiAssistantName: e.target.value })
              }
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              Fallback Message (Unknown Queries)
            </label>
            <input
              type="text"
              maxLength={300}
              value={
                form.aiFallbackMessage ??
                'এই তথ্যটি নিশ্চিতভাবে জানার জন্য আমাদের একজন প্রতিনিধি সাথে যোগাযোগ করুন।'
              }
              onChange={(e) =>
                setForm({ ...form, aiFallbackMessage: e.target.value })
              }
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold">
              Brand Tone &amp; Additional Instructions (Optional)
            </label>
            <textarea
              rows={2}
              maxLength={1000}
              value={form.aiCustomInstructions ?? ''}
              onChange={(e) =>
                setForm({ ...form, aiCustomInstructions: e.target.value })
              }
              placeholder="উদাহরণ: সবসময় ভদ্রভাবে শোরুমে আসার আমন্ত্রণ জানাবেন..."
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Fallback Hero Banner Slides */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-bold text-[#1C1917]">
            Default Hero Banner Slides ({form.heroSlides.length}/6)
          </h3>
          {form.heroSlides.length < 6 && (
            <button
              type="button"
              onClick={addSlide}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-1.5 text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>নতুন ব্যানার</span>
            </button>
          )}
        </div>

        {form.heroSlides.map((slide, idx) => (
          <div
            key={slide.id}
            className="grid grid-cols-1 gap-4 rounded-xl border border-[#E7E5E4] bg-white p-4 sm:grid-cols-12"
          >
            <div className="sm:col-span-4">
              <img
                src={resolveAssetUrl(slide.image)}
                alt={slide.title}
                className="aspect-[16/9] w-full rounded-lg object-cover"
              />
              <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-[#DC1F26]">
                <Upload className="h-3.5 w-3.5" />
                <span>ব্যানার ছবি পরিবর্তন</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleSlideUpload(idx, f);
                  }}
                  className="hidden"
                />
              </label>
            </div>
            <div className="space-y-3 sm:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#78716C]">Slide #{idx + 1}</span>
                <div className="flex items-center gap-2">
                  <select
                    value={slide.displayLanguage ?? 'both'}
                    onChange={(e) => {
                      const next = form.heroSlides.map((s, i) =>
                        i === idx
                          ? { ...s, displayLanguage: e.target.value as DisplayLanguage }
                          : s
                      );
                      setForm({ ...form, heroSlides: next });
                    }}
                    className="rounded-md border border-[#D6D3D1] bg-[#FAFAF8] px-2 py-1 text-[11px] font-medium text-[#1C1917]"
                  >
                    <option value="both">Bengali + English</option>
                    <option value="bn">Bengali Only</option>
                    <option value="en">English Only</option>
                  </select>
                  {form.heroSlides.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          heroSlides: form.heroSlides.filter((_, i) => i !== idx),
                        })
                      }
                      className="cursor-pointer text-xs text-red-700 hover:underline"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={slide.title_bn ?? ''}
                  onChange={(e) => {
                    const next = form.heroSlides.map((s, i) =>
                      i === idx ? { ...s, title_bn: e.target.value } : s
                    );
                    setForm({ ...form, heroSlides: next });
                  }}
                  placeholder="Banner Headline (বাংলা)"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm font-semibold"
                />
                <input
                  type="text"
                  value={slide.title_en ?? slide.title}
                  onChange={(e) => {
                    const next = form.heroSlides.map((s, i) =>
                      i === idx
                        ? { ...s, title_en: e.target.value, title: e.target.value }
                        : s
                    );
                    setForm({ ...form, heroSlides: next });
                  }}
                  placeholder="Banner Headline (English)"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm font-semibold"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={slide.subtitle_bn ?? slide.subtitle}
                  onChange={(e) => {
                    const next = form.heroSlides.map((s, i) =>
                      i === idx
                        ? { ...s, subtitle_bn: e.target.value, subtitle: e.target.value }
                        : s
                    );
                    setForm({ ...form, heroSlides: next });
                  }}
                  placeholder="Banner Subtitle (বাংলা)"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={slide.subtitle_en ?? ''}
                  onChange={(e) => {
                    const next = form.heroSlides.map((s, i) =>
                      i === idx ? { ...s, subtitle_en: e.target.value } : s
                    );
                    setForm({ ...form, heroSlides: next });
                  }}
                  placeholder="Banner Subtitle (English)"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={slide.ctaLabel}
                  onChange={(e) => {
                    const next = form.heroSlides.map((s, i) =>
                      i === idx ? { ...s, ctaLabel: e.target.value } : s
                    );
                    setForm({ ...form, heroSlides: next });
                  }}
                  placeholder="CTA Label (e.g. Explore Products)"
                  className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={slide.ctaLink}
                  onChange={(e) => {
                    const next = form.heroSlides.map((s, i) =>
                      i === idx ? { ...s, ctaLink: e.target.value } : s
                    );
                    setForm({ ...form, heroSlides: next });
                  }}
                  placeholder="/products"
                  className="rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-xs"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </form>
  );
}

// ========================
// 7B. HERO BANNERS PANEL (Admin + Super Admin)
// ========================
export function AdminBannersPanel() {
  const {
    allHeroBanners,
    allProducts,
    allCategories,
    allShowrooms,
    mediaItems,
    siteSettings,
    seoSettings,
    hasPermission,
    logAdminActivity,
    refreshStoreData,
    refreshingStoreData,
  } = useStore();
  const [slides, setSlides] = useState<HeroSlide[]>(allHeroBanners);
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setSlides(allHeroBanners);
  }, [allHeroBanners]);

  const handleSlideUpload = async (idx: number, file: File) => {
    const validationErr = validateCatalogImageFile(file);
    if (validationErr) {
      setFeedback({ type: 'err', text: validationErr });
      return;
    }
    const entityId = slides[idx]?.id || `slide-${idx + 1}`;
    setUploadingIdx(idx);
    setFeedback(null);
    try {
      const res = await uploadCatalogImageToStorage({
        folder: 'banners',
        entityId,
        file,
      });
      setSlides((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, image: res.downloadUrl } : s))
      );
      setFeedback({
        type: 'ok',
        text: `Slide #${idx + 1} ছবি R2-তে আপলোড হয়েছে। ব্যানার সেভ করুন।`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ব্যানার ছবি আপলোড করা যায়নি।',
      });
    } finally {
      setUploadingIdx(null);
    }
  };

  const addSlide = () => {
    if (slides.length >= 6) return;
    setSlides([
      ...slides,
      {
        id: `slide-${Date.now()}`,
        title: 'Crafted Fresh for Your Special Moments',
        title_bn: 'আপনার প্রতিটি বিশেষ মুহূর্তে',
        title_en: 'Crafted Fresh for Your Special Moments',
        subtitle: 'নতুন মৌসুমের স্পেশ্যাল মেনু এখন আমাদের সকল শোরুমে।',
        subtitle_bn: 'নতুন মৌসুমের স্পেশ্যাল মেনু এখন আমাদের সকল শোরুমে।',
        subtitle_en: 'Seasonal artisanal specialties now available across our showrooms.',
        displayLanguage: 'both',
        ctaLabel: 'Explore Products',
        ctaLink: '/products',
        image: '/src/assets/images/hero_bakery_clean_1794746110066.jpg',
        order: slides.length + 1,
        active: true,
        visible: true,
      },
    ]);
  };

  const saveBanners = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || uploadingIdx !== null) return;
    setSaving(true);
    setFeedback(null);
    const normalized = normalizeSlidesForSave(slides);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    let currentPath = 'site_settings/main';
    let currentOp: 'CREATE' | 'UPDATE' | 'DELETE' = 'UPDATE';
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'banners_manage',
      });
      for (const s of normalized) {
        if (!isValidFirestoreId(s.id)) {
          throw new AdminAuthError('validation/preflight-failed', `অবৈধ ব্যানার আইডি: ${s.id}`);
        }
        if (!s.title || !s.title.trim()) {
          throw new AdminAuthError('validation/preflight-failed', 'প্রতিটি ব্যানারের শিরোনাম আবশ্যক।');
        }
        if (!s.image || isForbiddenInlineImageUrl(s.image)) {
          throw new AdminAuthError(
            'validation/preflight-failed',
            'ব্যানারে বৈধ ছবি URL অথবা R2 আপলোড প্রয়োজন (Base64 অনুমোদিত নয়)।'
          );
        }
      }

      const firestore = requireDb();
      const settingsRef = doc(firestore, 'site_settings', 'main');
      const existingSettingsSnap = await fetchDocFromServer(settingsRef);
      if (existingSettingsSnap.exists()) {
        currentOp = 'UPDATE';
        await updateDoc(settingsRef, {
          heroSlides: normalized,
          updatedAt: serverTimestamp(),
        });
      } else {
        currentOp = 'CREATE';
        const fullPayload = buildWhitelistedSiteSettingsPayload({
          ...SEED_SITE_SETTINGS,
          ...siteSettings,
          heroSlides: normalized,
        });
        await setDoc(settingsRef, fullPayload);
      }

      const keptIds = new Set(normalized.map((s) => s.id));
      for (let i = 0; i < normalized.length; i += 1) {
        const s = normalized[i];
        currentPath = `hero_banners/${s.id}`;
        const bannerRef = doc(firestore, 'hero_banners', s.id);
        const existingBannerSnap = await fetchDocFromServer(bannerRef);
        const bannerPayload: Record<string, unknown> = {
          id: s.id,
          title: s.title.slice(0, 200),
          title_bn: (s.title_bn || '').slice(0, 200),
          title_en: (s.title_en || '').slice(0, 200),
          subtitle: s.subtitle.slice(0, 400),
          subtitle_bn: (s.subtitle_bn || '').slice(0, 400),
          subtitle_en: (s.subtitle_en || '').slice(0, 400),
          displayLanguage: s.displayLanguage || 'both',
          ctaLabel: (s.ctaLabel || 'Explore Products').slice(0, 80),
          ctaLink: (s.ctaLink || '/products').slice(0, 300),
          image: s.image.slice(0, 500000),
          ...(s.mobileImage ? { mobileImage: s.mobileImage.slice(0, 500000) } : {}),
          order: Math.min(100, Math.max(0, Math.round(Number(s.order ?? i + 1)))),
          active: s.active !== false,
          visible: s.visible !== false,
          deleted: false,
          ...(s.startDate ? { startDate: s.startDate.slice(0, 32) } : {}),
          ...(s.endDate ? { endDate: s.endDate.slice(0, 32) } : {}),
          updatedAt: serverTimestamp(),
        };
        if (existingBannerSnap.exists()) {
          currentOp = 'UPDATE';
          await updateDoc(bannerRef, bannerPayload);
        } else {
          currentOp = 'CREATE';
          await setDoc(bannerRef, {
            ...bannerPayload,
            createdAt: serverTimestamp(),
          });
        }
      }

      const removedUrls: string[] = [];
      for (const prevSlide of allHeroBanners) {
        if (!keptIds.has(prevSlide.id) && isValidFirestoreId(prevSlide.id)) {
          currentPath = `hero_banners/${prevSlide.id}`;
          currentOp = 'DELETE';
          const prevRef = doc(firestore, 'hero_banners', prevSlide.id);
          const prevSnap = await fetchDocFromServer(prevRef);
          if (prevSnap.exists()) {
            await deleteDoc(prevRef);
          }
          if (prevSlide.image) removedUrls.push(prevSlide.image);
          if (prevSlide.mobileImage) removedUrls.push(prevSlide.mobileImage);
        } else if (prevSlide.id) {
          const matching = normalized.find((n) => n.id === prevSlide.id);
          if (matching && prevSlide.image && matching.image !== prevSlide.image) {
            removedUrls.push(prevSlide.image);
          }
        }
      }

      if (removedUrls.length > 0) {
        void safeDeleteUnreferencedR2Urls({
          urls: removedUrls,
          snapshot: {
            allProducts,
            allCategories,
            allShowrooms,
            allHeroBanners: normalized,
            mediaItems,
            siteSettings: { ...siteSettings, heroSlides: normalized },
            seoSettings,
          },
        });
      }

      await logAdminActivity('update', 'hero_banners', 'all', `${normalized.length} slides`);
      setFeedback({ type: 'ok', text: 'হিরো ব্যানার সফলভাবে আপডেট হয়েছে।' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'hero_banners_save', {
          collection: currentPath.split('/')[0],
          documentId: currentPath.split('/')[1],
          path: currentPath,
          operation: currentOp,
          authSession,
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={saveBanners} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Hero Banner Management
          </h2>
          <p className="text-xs text-[#57534E]">
            হোমপেজ স্লাইডার ব্যানার ছবি, বাংলা ও English শিরোনাম, প্রদর্শনের সময় ও ভাষা নির্বাচন করুন।
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={refreshingStoreData}
            onClick={() => void refreshStoreData()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshingStoreData ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="submit"
            disabled={saving || uploadingIdx !== null}
            className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
          >
            {saving ? 'সংরক্ষণ হচ্ছে...' : 'ব্যানার সেভ করুন'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-[#B91C1C]'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-[#1C1917]">
            Slides ({slides.length}/6)
          </h3>
          {slides.length < 6 && (
            <button
              type="button"
              onClick={addSlide}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-1.5 text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>নতুন ব্যানার</span>
            </button>
          )}
        </div>

        {slides.map((slide, idx) => (
          <div
            key={slide.id}
            className="grid grid-cols-1 gap-4 rounded-xl border border-[#E7E5E4] bg-white p-4 sm:grid-cols-12"
          >
            <div className="sm:col-span-4">
              <img
                src={resolveAssetUrl(slide.image)}
                alt={slide.title}
                className="aspect-[16/9] w-full rounded-lg object-cover"
              />
              <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-[#DC1F26]">
                <Upload className="h-3.5 w-3.5" />
                <span>ব্যানার ছবি পরিবর্তন</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleSlideUpload(idx, f);
                  }}
                  className="hidden"
                />
              </label>
            </div>
            <div className="space-y-3 sm:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#78716C]">Slide #{idx + 1}</span>
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold">
                    <input
                      type="checkbox"
                      checked={slide.active !== false}
                      onChange={(e) =>
                        setSlides(
                          slides.map((s, i) =>
                            i === idx ? { ...s, active: e.target.checked } : s
                          )
                        )
                      }
                    />
                    <span>Active</span>
                  </label>
                  <select
                    value={slide.displayLanguage ?? 'both'}
                    onChange={(e) =>
                      setSlides(
                        slides.map((s, i) =>
                          i === idx
                            ? { ...s, displayLanguage: e.target.value as DisplayLanguage }
                            : s
                        )
                      )
                    }
                    className="rounded-md border border-[#D6D3D1] bg-[#FAFAF8] px-2 py-1 text-[11px] font-medium text-[#1C1917]"
                  >
                    <option value="both">Bengali + English</option>
                    <option value="bn">Bengali Only</option>
                    <option value="en">English Only</option>
                  </select>
                  {slides.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSlides(slides.filter((_, i) => i !== idx))}
                      className="cursor-pointer text-xs text-red-700 hover:underline"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={slide.title_bn ?? ''}
                  onChange={(e) =>
                    setSlides(
                      slides.map((s, i) =>
                        i === idx ? { ...s, title_bn: e.target.value } : s
                      )
                    )
                  }
                  placeholder="Banner Headline (বাংলা)"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm font-semibold"
                />
                <input
                  type="text"
                  value={slide.title_en ?? slide.title}
                  onChange={(e) =>
                    setSlides(
                      slides.map((s, i) =>
                        i === idx
                          ? { ...s, title_en: e.target.value, title: e.target.value }
                          : s
                      )
                    )
                  }
                  placeholder="Banner Headline (English)"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm font-semibold"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={slide.subtitle_bn ?? slide.subtitle}
                  onChange={(e) =>
                    setSlides(
                      slides.map((s, i) =>
                        i === idx
                          ? { ...s, subtitle_bn: e.target.value, subtitle: e.target.value }
                          : s
                      )
                    )
                  }
                  placeholder="Banner Subtitle (বাংলা)"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={slide.subtitle_en ?? ''}
                  onChange={(e) =>
                    setSlides(
                      slides.map((s, i) =>
                        i === idx ? { ...s, subtitle_en: e.target.value } : s
                      )
                    )
                  }
                  placeholder="Banner Subtitle (English)"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <input
                  type="text"
                  value={slide.ctaLabel}
                  onChange={(e) =>
                    setSlides(
                      slides.map((s, i) => (i === idx ? { ...s, ctaLabel: e.target.value } : s))
                    )
                  }
                  placeholder="CTA Label"
                  className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={slide.ctaLink}
                  onChange={(e) =>
                    setSlides(
                      slides.map((s, i) => (i === idx ? { ...s, ctaLink: e.target.value } : s))
                    )
                  }
                  placeholder="/products"
                  className="rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-xs"
                />
                <input
                  type="date"
                  value={slide.startDate ?? ''}
                  onChange={(e) =>
                    setSlides(
                      slides.map((s, i) => (i === idx ? { ...s, startDate: e.target.value } : s))
                    )
                  }
                  title="Start Date"
                  className="rounded-lg border border-[#D6D3D1] px-2 py-2 text-xs"
                />
                <input
                  type="date"
                  value={slide.endDate ?? ''}
                  onChange={(e) =>
                    setSlides(
                      slides.map((s, i) => (i === idx ? { ...s, endDate: e.target.value } : s))
                    )
                  }
                  title="End Date"
                  className="rounded-lg border border-[#D6D3D1] px-2 py-2 text-xs"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </form>
  );
}

// ========================
// 8. LIVE HUMAN CHAT INBOX & AI KNOWLEDGE BASE
// ========================
export function AdminLiveChatPanel({
  sessions,
  onRefresh,
}: {
  sessions: ChatSession[];
  onRefresh?: () => Promise<void> | void;
}) {
  const {
    user,
    siteSettings,
    allAiKnowledge,
    isCatalogAdmin,
    hasPermission,
    logAdminActivity,
    refreshStoreData,
    refreshingStoreData,
  } = useStore();
  const [subTab, setSubTab] = useState<'inbox' | 'knowledge'>('inbox');
  const [selectedId, setSelectedId] = useState<string>(sessions[0]?.id ?? '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [transferEmail, setTransferEmail] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [closingChat, setClosingChat] = useState(false);
  const [assigningChat, setAssigningChat] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [busyKnowledgeId, setBusyKnowledgeId] = useState<string | null>(null);
  const [confirmDeleteKnowledgeId, setConfirmDeleteKnowledgeId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // AI Knowledge Entry Form
  const [kTitle, setKTitle] = useState('');
  const [kCategory, setKCategory] = useState('General');
  const [kQuestionBn, setKQuestionBn] = useState('');
  const [kQuestionEn, setKQuestionEn] = useState('');
  const [kAnswerBn, setKAnswerBn] = useState('');
  const [kAnswerEn, setKAnswerEn] = useState('');

  const activeSession = sessions.find((s) => s.id === selectedId) ?? sessions[0];

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        await refreshStoreData();
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!db || !activeSession) {
      setMessages([]);
      setMessagesError(null);
      return;
    }
    setMessagesError(null);
    const q = query(
      collection(db, 'chat_sessions', activeSession.id, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => d.data() as ChatMessage));
        setMessagesError(null);
      },
      (err) => {
        setMessagesError(
          formatAdminFirestoreError(err, 'chat_messages_list', {
            collection: 'chat_sessions',
            documentId: activeSession.id,
            path: `chat_sessions/${activeSession.id}/messages`,
            operation: 'READ',
          })
        );
      }
    );
    return () => unsub();
  }, [activeSession?.id]);

  const toggleOnlineStatus = async () => {
    if (togglingStatus) return;
    setTogglingStatus(true);
    setFeedback(null);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'chat_manage',
      });
      const firestore = requireDb();
      const settingsRef = doc(firestore, 'site_settings', 'main');
      const existingSnap = await fetchDocFromServer(settingsRef);
      if (!existingSnap.exists()) {
        throw new AdminAuthError(
          'not-found',
          'site_settings/main ডকুমেন্ট এখনো তৈরি হয়নি। একজন Super Admin বা Settings অ্যাডমিনকে সাইট সেটিংস একবার সেভ করতে বলুন।'
        );
      }
      const nextOnline = !siteSettings.supportOnline;
      await updateDoc(settingsRef, {
        supportOnline: nextOnline,
        updatedAt: serverTimestamp(),
      });
      await logAdminActivity(
        'toggle_chat_status',
        'site_settings',
        'main',
        nextOnline ? 'Support Online' : 'Support Offline'
      );
      setFeedback({
        type: 'ok',
        text: nextOnline ? 'Live support status set to Online.' : 'Live support status set to Offline.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'chat_toggle_online', {
          collection: 'site_settings',
          documentId: 'main',
          path: 'site_settings/main',
          operation: 'UPDATE',
          authSession,
        }),
      });
    } finally {
      setTogglingStatus(false);
    }
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !replyText.trim() || sendingReply) return;
    setSendingReply(true);
    setFeedback(null);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    const msgId = `msg_${Date.now()}`;
    let currentPath = `chat_sessions/${activeSession.id}/messages/${msgId}`;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'chat_manage',
      });
      const firestore = requireDb();
      const sessionRef = doc(firestore, 'chat_sessions', activeSession.id);
      const sessionSnap = await fetchDocFromServer(sessionRef);
      if (!sessionSnap.exists()) {
        throw new AdminAuthError('not-found', 'চ্যাট সেশনটি আর পাওয়া যায়নি। রিফ্রেশ করুন।');
      }
      const latestSession = sessionSnap.data() as ChatSession;
      if (latestSession.status === 'closed') {
        throw new AdminAuthError('failed-precondition', 'এই চ্যাট সেশনটি ইতিমধ্যে ক্লোজ করা হয়েছে।');
      }

      const text = replyText.trim().slice(0, 2000);
      const batch = writeBatch(firestore);
      const msgRef = doc(firestore, 'chat_sessions', activeSession.id, 'messages', msgId);
      batch.set(msgRef, {
        id: msgId,
        sessionId: activeSession.id,
        senderRole: 'admin',
        senderName: (user?.displayName || 'Home Recipe Representative').slice(0, 100),
        text,
        createdAt: serverTimestamp(),
      });
      batch.update(sessionRef, {
        status: 'active',
        assignedAdminEmail: (user?.email || '').slice(0, 254),
        assignedAdminName: (user?.displayName || 'Home Recipe Representative').slice(0, 120),
        lastMessage: text.slice(0, 500),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      setReplyText('');
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'chat_send_reply', {
          collection: 'chat_sessions',
          documentId: activeSession.id,
          path: currentPath,
          operation: 'UPDATE',
          authSession,
        }),
      });
    } finally {
      setSendingReply(false);
    }
  };

  const closeConversation = async () => {
    if (!activeSession || closingChat) return;
    setClosingChat(true);
    setFeedback(null);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'chat_manage',
      });
      const firestore = requireDb();
      const sessionRef = doc(firestore, 'chat_sessions', activeSession.id);
      const existingSnap = await fetchDocFromServer(sessionRef);
      if (!existingSnap.exists()) {
        throw new AdminAuthError('not-found', 'চ্যাট সেশনটি আর পাওয়া যায়নি।');
      }
      await updateDoc(sessionRef, {
        status: 'closed',
        updatedAt: serverTimestamp(),
      });
      await logAdminActivity('close_chat', 'chat_sessions', activeSession.id, activeSession.customerName);
      setFeedback({ type: 'ok', text: `Closed chat with ${activeSession.customerName}.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'chat_close', {
          collection: 'chat_sessions',
          documentId: activeSession.id,
          path: `chat_sessions/${activeSession.id}`,
          operation: 'UPDATE',
          authSession,
        }),
      });
    } finally {
      setClosingChat(false);
    }
  };

  const transferConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !transferEmail.trim() || assigningChat) return;
    setAssigningChat(true);
    setFeedback(null);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'chat_manage',
      });
      const firestore = requireDb();
      const sessionRef = doc(firestore, 'chat_sessions', activeSession.id);
      const existingSnap = await fetchDocFromServer(sessionRef);
      if (!existingSnap.exists()) {
        throw new AdminAuthError('not-found', 'চ্যাট সেশনটি আর পাওয়া যায়নি।');
      }
      const targetEmail = transferEmail.trim().slice(0, 254);
      await updateDoc(sessionRef, {
        assignedAdminEmail: targetEmail,
        assignedAdminName: targetEmail.slice(0, 120),
        status: 'active',
        updatedAt: serverTimestamp(),
      });
      await logAdminActivity(
        'assign_chat',
        'chat_sessions',
        activeSession.id,
        targetEmail,
        `Assigned to ${targetEmail}`
      );
      setTransferEmail('');
      setFeedback({ type: 'ok', text: `Assigned conversation to ${targetEmail}.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'chat_transfer', {
          collection: 'chat_sessions',
          documentId: activeSession.id,
          path: `chat_sessions/${activeSession.id}`,
          operation: 'UPDATE',
          authSession,
        }),
      });
    } finally {
      setAssigningChat(false);
    }
  };

  const handleAddKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingKnowledge) return;
    if (!kTitle.trim() || (!kAnswerBn.trim() && !kAnswerEn.trim())) {
      setFeedback({ type: 'err', text: 'শিরোনাম ও অন্তত একটি উত্তর (বাংলা বা English) লিখুন।' });
      return;
    }
    setSavingKnowledge(true);
    setFeedback(null);
    const id = `know_${Date.now()}`;
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: hasPermission('banners_manage') ? 'banners_manage' : 'chat_manage',
      });
      const firestore = requireDb();
      const entry: Omit<AiKnowledgeEntry, 'id'> = {
        title: kTitle.trim().slice(0, 160),
        category: (kCategory.trim() || 'General').slice(0, 80),
        question_bn: kQuestionBn.trim().slice(0, 400),
        question_en: kQuestionEn.trim().slice(0, 400),
        answer_bn: kAnswerBn.trim().slice(0, 2000),
        answer_en: kAnswerEn.trim().slice(0, 2000),
        active: true,
        visible: true,
        order: Math.min(1000, allAiKnowledge.length + 1),
        deleted: false,
      };
      await setDoc(doc(firestore, 'ai_knowledge', id), {
        id,
        ...entry,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logAdminActivity('create', 'ai_knowledge', id, entry.title);
      setKTitle('');
      setKQuestionBn('');
      setKQuestionEn('');
      setKAnswerBn('');
      setKAnswerEn('');
      setFeedback({ type: 'ok', text: `Saved AI Knowledge entry "${entry.title}".` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'ai_knowledge_create', {
          collection: 'ai_knowledge',
          documentId: id,
          path: `ai_knowledge/${id}`,
          operation: 'CREATE',
          authSession,
        }),
      });
    } finally {
      setSavingKnowledge(false);
    }
  };

  const toggleKnowledgeActive = async (entry: AiKnowledgeEntry) => {
    if (busyKnowledgeId) return;
    setBusyKnowledgeId(entry.id);
    setFeedback(null);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: hasPermission('banners_manage') ? 'banners_manage' : 'chat_manage',
      });
      if (!isValidFirestoreId(entry.id)) {
        throw new AdminAuthError('validation/preflight-failed', 'অবৈধ AI Knowledge আইডি।');
      }
      const firestore = requireDb();
      const ref = doc(firestore, 'ai_knowledge', entry.id);
      const existingSnap = await fetchDocFromServer(ref);
      if (!existingSnap.exists()) {
        throw new AdminAuthError('not-found', 'AI Knowledge এন্ট্রিটি আর পাওয়া যায়নি।');
      }
      await updateDoc(ref, {
        active: !entry.active,
        updatedAt: serverTimestamp(),
      });
      await logAdminActivity('toggle_active', 'ai_knowledge', entry.id, entry.title);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'ai_knowledge_toggle', {
          collection: 'ai_knowledge',
          documentId: entry.id,
          path: `ai_knowledge/${entry.id}`,
          operation: 'UPDATE',
          authSession,
        }),
      });
    } finally {
      setBusyKnowledgeId(null);
    }
  };

  const deleteKnowledge = async (entry: AiKnowledgeEntry) => {
    if (busyKnowledgeId) return;
    setBusyKnowledgeId(entry.id);
    setFeedback(null);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: hasPermission('banners_manage') ? 'banners_manage' : 'chat_manage',
      });
      if (!isValidFirestoreId(entry.id)) {
        throw new AdminAuthError('validation/preflight-failed', 'অবৈধ AI Knowledge আইডি।');
      }
      const firestore = requireDb();
      const ref = doc(firestore, 'ai_knowledge', entry.id);
      const existingSnap = await fetchDocFromServer(ref);
      if (!existingSnap.exists()) {
        throw new AdminAuthError('not-found', 'AI Knowledge এন্ট্রিটি আর পাওয়া যায়নি।');
      }
      await deleteDoc(ref);
      await logAdminActivity('delete', 'ai_knowledge', entry.id, entry.title);
      setConfirmDeleteKnowledgeId(null);
      setFeedback({ type: 'ok', text: `Deleted AI Knowledge entry "${entry.title}".` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'ai_knowledge_delete', {
          collection: 'ai_knowledge',
          documentId: entry.id,
          path: `ai_knowledge/${entry.id}`,
          operation: 'DELETE',
          authSession,
        }),
      });
    } finally {
      setBusyKnowledgeId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Live Customer Support &amp; AI Knowledge
          </h2>
          <p className="text-xs text-[#57534E]">
            সরাসরি ক্রেতাদের সাথে কথা বলুন, অনলাইন স্ট্যাটাস পরিবর্তন করুন এবং AI Knowledge Base পরিচালনা করুন।
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[#E7E5E4] bg-white p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setSubTab('inbox')}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold ${
                subTab === 'inbox' ? 'bg-[#1C1917] text-white' : 'text-[#57534E]'
              }`}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>Live Inbox ({sessions.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('knowledge')}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold ${
                subTab === 'knowledge' ? 'bg-[#1C1917] text-white' : 'text-[#57534E]'
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              <span>AI Knowledge ({allAiKnowledge.length})</span>
            </button>
          </div>

          <button
            type="button"
            disabled={refreshing || refreshingStoreData}
            onClick={() => void handleRefresh()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing || refreshingStoreData ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            disabled={togglingStatus}
            onClick={() => void toggleOnlineStatus()}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50 ${
              siteSettings.supportOnline
                ? 'bg-emerald-700 text-white'
                : 'border border-[#D6D3D1] bg-white text-[#44403C]'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                siteSettings.supportOnline ? 'bg-emerald-300' : 'bg-[#78716C]'
              }`}
            />
            <span>{siteSettings.supportOnline ? 'Support Online' : 'Support Offline'}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-semibold ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-[#B91C1C]'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {subTab === 'knowledge' ? (
        <div className="space-y-5">
          {isCatalogAdmin && (
            <form
              onSubmit={handleAddKnowledge}
              className="grid grid-cols-1 gap-3 rounded-xl border border-[#E7E5E4] bg-white p-5 sm:grid-cols-2"
            >
              <div className="sm:col-span-2">
                <h3 className="font-display text-lg font-bold text-[#1C1917]">
                  Add FAQ / Brand Policy for AI Assistant
                </h3>
              </div>
              <input
                type="text"
                required
                value={kTitle}
                onChange={(e) => setKTitle(e.target.value)}
                placeholder="Topic Title (e.g. Custom Cake Lead Time)"
                className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={kCategory}
                onChange={(e) => setKCategory(e.target.value)}
                placeholder="Category (e.g. Policy / Ordering / Ingredients)"
                className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={kQuestionBn}
                onChange={(e) => setKQuestionBn(e.target.value)}
                placeholder="প্রশ্ন (বাংলা)"
                className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={kQuestionEn}
                onChange={(e) => setKQuestionEn(e.target.value)}
                placeholder="Question (English)"
                className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
              <textarea
                rows={2}
                value={kAnswerBn}
                onChange={(e) => setKAnswerBn(e.target.value)}
                placeholder="সঠিক উত্তর (বাংলা)"
                className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
              <textarea
                rows={2}
                value={kAnswerEn}
                onChange={(e) => setKAnswerEn(e.target.value)}
                placeholder="Official Answer (English)"
                className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={savingKnowledge}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{savingKnowledge ? 'Saving...' : 'Save Knowledge Entry'}</span>
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {allAiKnowledge.length === 0 ? (
              <div className="rounded-xl border border-[#E7E5E4] bg-white p-8 text-center text-xs text-[#78716C]">
                এখনো কোনো অতিরিক্ত AI Knowledge Entry যুক্ত করা হয়নি। (AI স্বয়ংক্রিয়ভাবে লাইভ প্রোডাক্ট ও শোরুম ক্যাটালগ থেকে উত্তর দেয়।)
              </div>
            ) : (
              allAiKnowledge.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-[#E7E5E4] bg-white p-4 sm:flex-row sm:items-start"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[#F5F4F0] px-2 py-0.5 text-[10px] font-bold text-[#57534E]">
                        {entry.category}
                      </span>
                      <h4 className="text-sm font-bold text-[#1C1917]">{entry.title}</h4>
                    </div>
                    {entry.answer_bn && (
                      <p className="mt-1.5 text-xs text-[#44403C]">{entry.answer_bn}</p>
                    )}
                    {entry.answer_en && (
                      <p className="mt-0.5 text-[11px] text-[#78716C]">{entry.answer_en}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={busyKnowledgeId === entry.id}
                      onClick={() => void toggleKnowledgeActive(entry)}
                      className={`cursor-pointer rounded px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50 ${
                        entry.active !== false
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-[#F5F4F0] text-[#78716C]'
                      }`}
                    >
                      {entry.active !== false ? 'Active' : 'Disabled'}
                    </button>
                    {isCatalogAdmin &&
                      (confirmDeleteKnowledgeId === entry.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busyKnowledgeId === entry.id}
                            onClick={() => void deleteKnowledge(entry)}
                            className="cursor-pointer rounded bg-[#DC1F26] px-2 py-1 text-[10px] font-bold text-white"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteKnowledgeId(null)}
                            className="cursor-pointer rounded border border-[#D6D3D1] bg-white px-2 py-1 text-[10px] font-semibold text-[#57534E]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={busyKnowledgeId === entry.id}
                          onClick={() => setConfirmDeleteKnowledgeId(entry.id)}
                          className="cursor-pointer rounded border border-[#E7E5E4] p-1 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Session List */}
          <div className="space-y-2 lg:col-span-4">
            {sessions.length === 0 ? (
              <div className="rounded-xl border border-[#E7E5E4] bg-white p-8 text-center text-xs text-[#78716C]">
                এখন কোনো লাইভ চ্যাট সেশন নেই।
              </div>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full cursor-pointer rounded-xl border p-3.5 text-left ${
                    activeSession?.id === s.id
                      ? 'border-[#DC1F26] bg-white shadow-sm'
                      : 'border-[#E7E5E4] bg-white hover:border-[#D6D3D1]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#1C1917]">{s.customerName}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        s.status === 'waiting'
                          ? 'bg-[#FEF9C3] text-[#854D0E]'
                          : s.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-[#F5F4F0] text-[#78716C]'
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-[#57534E]">{s.customerPhone}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-[#78716C]">{s.lastMessage}</p>
                </button>
              ))
            )}
          </div>

          {/* Active Conversation */}
          <div className="flex h-[520px] flex-col overflow-hidden rounded-xl border border-[#E7E5E4] bg-white lg:col-span-8">
            {activeSession ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7E5E4] bg-[#FAFAF8] px-4 py-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#1C1917]">
                      {activeSession.customerName} ·{' '}
                      <span className="font-mono text-xs font-normal">
                        {activeSession.customerPhone}
                      </span>
                    </h3>
                    <p className="text-[11px] text-[#78716C]">
                      Assigned: {activeSession.assignedAdminName || 'Unassigned'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form onSubmit={transferConversation} className="flex items-center gap-1">
                      <input
                        type="email"
                        value={transferEmail}
                        onChange={(e) => setTransferEmail(e.target.value)}
                        placeholder="Transfer to email..."
                        className="rounded-md border border-[#D6D3D1] px-2 py-1 text-[11px]"
                      />
                      <button
                        type="submit"
                        disabled={assigningChat}
                        className="cursor-pointer rounded-md border border-[#D6D3D1] px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
                      >
                        {assigningChat ? '...' : 'Assign'}
                      </button>
                    </form>
                    {activeSession.status !== 'closed' && (
                      <button
                        type="button"
                        disabled={closingChat}
                        onClick={() => void closeConversation()}
                        className="cursor-pointer rounded-md bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        {closingChat ? 'Closing...' : 'Close Chat'}
                      </button>
                    )}
                  </div>
                </div>

                {messagesError && (
                  <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-[#B91C1C]">
                    {messagesError}
                  </div>
                )}

                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex flex-col ${
                        m.senderRole === 'admin' ? 'items-end' : 'items-start'
                      }`}
                    >
                      <span className="mb-0.5 text-[10px] text-[#78716C]">
                        {m.senderName} ({m.senderRole})
                      </span>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs sm:text-sm ${
                          m.senderRole === 'admin'
                            ? 'bg-[#1C1917] text-white'
                            : 'border border-[#E7E5E4] bg-[#FAFAF8] text-[#1C1917]'
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>

                {activeSession.status !== 'closed' ? (
                  <form
                    onSubmit={sendReply}
                    className="flex items-center gap-2 border-t border-[#E7E5E4] p-3"
                  >
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="ক্রেতার উত্তর লিখুন..."
                      className="flex-1 rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-sm focus:border-[#DC1F26] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sendingReply || !replyText.trim()}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{sendingReply ? 'পাঠানো হচ্ছে...' : 'পাঠান'}</span>
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center justify-center gap-2 border-t border-[#E7E5E4] bg-[#FAFAF8] p-3 text-xs text-[#78716C]">
                    <ShieldAlert className="h-4 w-4" />
                    <span>এই চ্যাটটি ক্লোজ করা হয়েছে।</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-xs text-[#78716C]">
                কথোপকথন দেখতে বাম পাশ থেকে একটি সেশন বেছে নিন।
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ========================
// 9. ABOUT & CONTACT PAGES CMS
// ========================
export function AdminAboutContactPanel() {
  const {
    siteSettings,
    allProducts,
    allCategories,
    allShowrooms,
    allHeroBanners,
    mediaItems,
    seoSettings,
    isSuperAdmin,
    hasPermission,
    logAdminActivity,
    refreshStoreData,
    refreshingStoreData,
  } = useStore();
  const [aboutHeadingEn, setAboutHeadingEn] = useState(siteSettings.aboutHeadingEn || '');
  const [aboutHeadingBn, setAboutHeadingBn] = useState(siteSettings.aboutHeadingBn || '');
  const [aboutSubtitleEn, setAboutSubtitleEn] = useState(siteSettings.aboutSubtitleEn || '');
  const [aboutSubtitleBn, setAboutSubtitleBn] = useState(siteSettings.aboutSubtitleBn || '');
  const [aboutStoryEn, setAboutStoryEn] = useState(siteSettings.aboutStoryEn || '');
  const [aboutStoryBn, setAboutStoryBn] = useState(siteSettings.aboutStoryBn || '');
  const [aboutMissionEn, setAboutMissionEn] = useState(siteSettings.aboutMissionEn || '');
  const [aboutMissionBn, setAboutMissionBn] = useState(siteSettings.aboutMissionBn || '');
  const [aboutImageUrl, setAboutImageUrl] = useState(siteSettings.aboutImageUrl || '');

  const [contactHeadingEn, setContactHeadingEn] = useState(siteSettings.contactHeadingEn || '');
  const [contactHeadingBn, setContactHeadingBn] = useState(siteSettings.contactHeadingBn || '');
  const [contactSubtitleEn, setContactSubtitleEn] = useState(siteSettings.contactSubtitleEn || '');
  const [contactSubtitleBn, setContactSubtitleBn] = useState(siteSettings.contactSubtitleBn || '');
  const [supportHoursEn, setSupportHoursEn] = useState(siteSettings.supportHoursEn || '');
  const [supportHoursBn, setSupportHoursBn] = useState(siteSettings.supportHoursBn || '');
  const [supportPhone, setSupportPhone] = useState(siteSettings.supportPhone || '');
  const [secondaryPhone, setSecondaryPhone] = useState(siteSettings.secondaryPhone || '');
  const [brandEmail, setBrandEmail] = useState(siteSettings.brandEmail || '');
  const [brandAddressEn, setBrandAddressEn] = useState(siteSettings.brandAddressEn || '');
  const [brandAddressBn, setBrandAddressBn] = useState(siteSettings.brandAddressBn || '');
  const [officeMapUrl, setOfficeMapUrl] = useState(siteSettings.officeMapUrl || '');
  const [facebookUrl, setFacebookUrl] = useState(siteSettings.facebookUrl || '');
  const [instagramUrl, setInstagramUrl] = useState(siteSettings.instagramUrl || '');
  const [youtubeUrl, setYoutubeUrl] = useState(siteSettings.youtubeUrl || '');
  const [messengerUrl, setMessengerUrl] = useState(siteSettings.messengerUrl || '');
  const [whatsappUrl, setWhatsappUrl] = useState(siteSettings.whatsappUrl || '');

  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setAboutHeadingEn(siteSettings.aboutHeadingEn || '');
    setAboutHeadingBn(siteSettings.aboutHeadingBn || '');
    setAboutSubtitleEn(siteSettings.aboutSubtitleEn || '');
    setAboutSubtitleBn(siteSettings.aboutSubtitleBn || '');
    setAboutStoryEn(siteSettings.aboutStoryEn || '');
    setAboutStoryBn(siteSettings.aboutStoryBn || '');
    setAboutMissionEn(siteSettings.aboutMissionEn || '');
    setAboutMissionBn(siteSettings.aboutMissionBn || '');
    setAboutImageUrl(siteSettings.aboutImageUrl || '');
    setContactHeadingEn(siteSettings.contactHeadingEn || '');
    setContactHeadingBn(siteSettings.contactHeadingBn || '');
    setContactSubtitleEn(siteSettings.contactSubtitleEn || '');
    setContactSubtitleBn(siteSettings.contactSubtitleBn || '');
    setSupportHoursEn(siteSettings.supportHoursEn || '');
    setSupportHoursBn(siteSettings.supportHoursBn || '');
    setSupportPhone(siteSettings.supportPhone || '');
    setSecondaryPhone(siteSettings.secondaryPhone || '');
    setBrandEmail(siteSettings.brandEmail || '');
    setBrandAddressEn(siteSettings.brandAddressEn || '');
    setBrandAddressBn(siteSettings.brandAddressBn || '');
    setOfficeMapUrl(siteSettings.officeMapUrl || '');
    setFacebookUrl(siteSettings.facebookUrl || '');
    setInstagramUrl(siteSettings.instagramUrl || '');
    setYoutubeUrl(siteSettings.youtubeUrl || '');
    setMessengerUrl(siteSettings.messengerUrl || '');
    setWhatsappUrl(siteSettings.whatsappUrl || '');
  }, [siteSettings]);

  const handleAboutImageUpload = async (file: File) => {
    const validationError = validateCatalogImageFile(file);
    if (validationError) {
      setFeedback({ type: 'err', text: validationError });
      return;
    }
    setUploadingImage(true);
    setFeedback(null);
    try {
      const res = await uploadCatalogImageToStorage({
        folder: 'media',
        entityId: 'about-brand-story',
        file,
      });
      setAboutImageUrl(res.downloadUrl);
      setFeedback({ type: 'ok', text: 'About page photograph uploaded to Cloudflare R2. Click Save Changes to publish.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to upload photograph.',
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || uploadingImage) return;
    if (!isSuperAdmin && !hasPermission('settings_view') && !hasPermission('showrooms_manage')) {
      setFeedback({ type: 'err', text: 'You do not have permission to update About & Contact settings.' });
      return;
    }
    const cleanPhone = supportPhone.trim();
    if (cleanPhone.length < 5) {
      setFeedback({ type: 'err', text: 'Primary Support Phone must be at least 5 characters.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    let operation: 'CREATE' | 'UPDATE' = 'UPDATE';
    try {
      const requiredPerm =
        isSuperAdmin || hasPermission('settings_view') ? 'settings_view' : 'showrooms_manage';
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: requiredPerm,
      });

      const cleanAboutUrl = aboutImageUrl.trim().slice(0, 400000);
      if (cleanAboutUrl && isForbiddenInlineImageUrl(cleanAboutUrl)) {
        throw new AdminAuthError(
          'validation/preflight-failed',
          'About ছবিতে Base64/inline ডেটা অনুমোদিত নয়। অনুগ্রহ করে ছবি আপলোড করুন।'
        );
      }

      const firestore = requireDb();
      const settingsRef = doc(firestore, 'site_settings', 'main');
      const aboutContactPayload: Record<string, unknown> = {
        aboutHeadingEn: aboutHeadingEn.trim().slice(0, 200),
        aboutHeadingBn: aboutHeadingBn.trim().slice(0, 200),
        aboutSubtitleEn: aboutSubtitleEn.trim().slice(0, 200),
        aboutSubtitleBn: aboutSubtitleBn.trim().slice(0, 200),
        aboutStoryEn: aboutStoryEn.trim().slice(0, 3000),
        aboutStoryBn: aboutStoryBn.trim().slice(0, 3000),
        aboutMissionEn: aboutMissionEn.trim().slice(0, 1500),
        aboutMissionBn: aboutMissionBn.trim().slice(0, 1500),
        aboutImageUrl: cleanAboutUrl,
        contactHeadingEn: contactHeadingEn.trim().slice(0, 240),
        contactHeadingBn: contactHeadingBn.trim().slice(0, 240),
        contactSubtitleEn: contactSubtitleEn.trim().slice(0, 240),
        contactSubtitleBn: contactSubtitleBn.trim().slice(0, 240),
        supportHoursEn: supportHoursEn.trim().slice(0, 160),
        supportHoursBn: supportHoursBn.trim().slice(0, 160),
        supportPhone: cleanPhone.slice(0, 40),
        secondaryPhone: secondaryPhone.trim().slice(0, 40),
        brandEmail: brandEmail.trim().slice(0, 254),
        brandAddressEn: brandAddressEn.trim().slice(0, 300),
        brandAddressBn: brandAddressBn.trim().slice(0, 300),
        officeMapUrl: officeMapUrl.trim().slice(0, 600),
        facebookUrl: facebookUrl.trim().slice(0, 300),
        instagramUrl: instagramUrl.trim().slice(0, 300),
        youtubeUrl: youtubeUrl.trim().slice(0, 300),
        messengerUrl: messengerUrl.trim().slice(0, 300),
        whatsappUrl: whatsappUrl.trim().slice(0, 300),
        updatedAt: serverTimestamp(),
      };

      const existingSnap = await fetchDocFromServer(settingsRef);
      if (!existingSnap.exists()) {
        operation = 'CREATE';
        await setDoc(
          settingsRef,
          buildWhitelistedSiteSettingsPayload({
            ...SEED_SITE_SETTINGS,
            ...siteSettings,
            ...aboutContactPayload,
          } as SiteSettings)
        );
      } else {
        operation = 'UPDATE';
        await updateDoc(settingsRef, aboutContactPayload);
      }

      if (siteSettings.aboutImageUrl && siteSettings.aboutImageUrl !== cleanAboutUrl) {
        void safeDeleteUnreferencedR2Urls({
          urls: [siteSettings.aboutImageUrl],
          snapshot: {
            allProducts,
            allCategories,
            allShowrooms,
            allHeroBanners,
            mediaItems,
            siteSettings: { ...siteSettings, aboutImageUrl: cleanAboutUrl },
            seoSettings,
          },
        });
      }

      await logAdminActivity('update', 'site_settings', 'about_contact', 'About & Contact CMS');
      setFeedback({ type: 'ok', text: 'About & Contact page content updated successfully.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: formatAdminFirestoreError(err, 'about_contact_save', {
          collection: 'site_settings',
          documentId: 'main',
          path: 'site_settings/main',
          operation,
          authSession,
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            About &amp; Contact Pages CMS
          </h2>
          <p className="text-xs text-[#57534E]">
            Manage the English &amp; Bengali story, feature image, customer hotline, head office address, and social links shown on /about, /contact, and Footer.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={refreshingStoreData}
            onClick={() => void refreshStoreData()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshingStoreData ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="submit"
            disabled={saving || uploadingImage}
            className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save About & Contact'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-semibold ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-[#B91C1C]'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* About Page Section */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-[#E7E5E4] bg-white p-5 sm:grid-cols-2">
        <div className="border-b border-[#F5F4F0] pb-2 sm:col-span-2">
          <h3 className="font-display text-lg font-bold text-[#1C1917]">
            About Us Page Content (/about)
          </h3>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold">Eyebrow Label (English)</label>
          <input
            type="text"
            value={aboutSubtitleEn}
            onChange={(e) => setAboutSubtitleEn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Eyebrow Label (বাংলা)</label>
          <input
            type="text"
            value={aboutSubtitleBn}
            onChange={(e) => setAboutSubtitleBn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold">Main Heading (English)</label>
          <input
            type="text"
            value={aboutHeadingEn}
            onChange={(e) => setAboutHeadingEn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Main Heading (বাংলা)</label>
          <input
            type="text"
            value={aboutHeadingBn}
            onChange={(e) => setAboutHeadingBn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold">Brand Story (English)</label>
          <textarea
            rows={4}
            value={aboutStoryEn}
            onChange={(e) => setAboutStoryEn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Brand Story (বাংলা)</label>
          <textarea
            rows={4}
            value={aboutStoryBn}
            onChange={(e) => setAboutStoryBn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold">Kitchen &amp; Showroom Promise (English)</label>
          <textarea
            rows={3}
            value={aboutMissionEn}
            onChange={(e) => setAboutMissionEn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Kitchen &amp; Showroom Promise (বাংলা)</label>
          <textarea
            rows={3}
            value={aboutMissionBn}
            onChange={(e) => setAboutMissionBn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>

        <div className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[#1C1917]">About Hero Feature Image</p>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C1917] hover:border-[#DC1F26]">
              {uploadingImage ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#DC1F26]" />
              ) : (
                <Upload className="h-3.5 w-3.5 text-[#DC1F26]" />
              )}
              <span>{uploadingImage ? 'Uploading...' : 'Upload Image'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadingImage}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void handleAboutImageUpload(f);
                }}
                className="hidden"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            {aboutImageUrl && (
              <img
                src={resolveAssetUrl(aboutImageUrl)}
                alt="About feature"
                className="h-20 w-32 shrink-0 rounded-lg border border-[#E7E5E4] object-cover bg-white"
              />
            )}
            <input
              type="text"
              value={aboutImageUrl}
              onChange={(e) => setAboutImageUrl(e.target.value)}
              placeholder="Image URL or /assets/aistudio/..."
              className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Contact Page Section */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-[#E7E5E4] bg-white p-5 sm:grid-cols-2">
        <div className="border-b border-[#F5F4F0] pb-2 sm:col-span-2">
          <h3 className="font-display text-lg font-bold text-[#1C1917]">
            Contact &amp; Head Office Details (/contact &amp; Footer)
          </h3>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold">Contact Heading (English)</label>
          <input
            type="text"
            value={contactHeadingEn}
            onChange={(e) => setContactHeadingEn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Contact Heading (বাংলা)</label>
          <input
            type="text"
            value={contactHeadingBn}
            onChange={(e) => setContactHeadingBn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold">Contact Intro (English)</label>
          <textarea
            rows={2}
            value={contactSubtitleEn}
            onChange={(e) => setContactSubtitleEn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Contact Intro (বাংলা)</label>
          <textarea
            rows={2}
            value={contactSubtitleBn}
            onChange={(e) => setContactSubtitleBn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold">Primary Hotline *</label>
          <input
            type="text"
            value={supportPhone}
            onChange={(e) => setSupportPhone(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Secondary Phone</label>
          <input
            type="text"
            value={secondaryPhone}
            onChange={(e) => setSecondaryPhone(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold">Customer Support Hours (English)</label>
          <input
            type="text"
            value={supportHoursEn}
            onChange={(e) => setSupportHoursEn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Customer Support Hours (বাংলা)</label>
          <input
            type="text"
            value={supportHoursBn}
            onChange={(e) => setSupportHoursBn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold">Support Email</label>
          <input
            type="email"
            value={brandEmail}
            onChange={(e) => setBrandEmail(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Head Office Google Maps URL</label>
          <input
            type="url"
            value={officeMapUrl}
            onChange={(e) => setOfficeMapUrl(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold">Head Office Address (English)</label>
          <input
            type="text"
            value={brandAddressEn}
            onChange={(e) => setBrandAddressEn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Head Office Address (বাংলা)</label>
          <input
            type="text"
            value={brandAddressBn}
            onChange={(e) => setBrandAddressBn(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold">Facebook URL</label>
          <input
            type="url"
            value={facebookUrl}
            onChange={(e) => setFacebookUrl(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Messenger URL</label>
          <input
            type="url"
            value={messengerUrl}
            onChange={(e) => setMessengerUrl(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Instagram URL</label>
          <input
            type="url"
            value={instagramUrl}
            onChange={(e) => setInstagramUrl(e.target.value)}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">YouTube / WhatsApp URL</label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="YouTube URL"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
            />
            <input
              type="url"
              value={whatsappUrl}
              onChange={(e) => setWhatsappUrl(e.target.value)}
              placeholder="WhatsApp URL"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
            />
          </div>
        </div>
      </div>
    </form>
  );
}
