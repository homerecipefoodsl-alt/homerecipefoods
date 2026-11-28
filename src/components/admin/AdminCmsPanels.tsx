import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Database,
  Globe,
  HardDrive,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { useStore } from '../../context/StoreContext';
import {
  AdminAuthError,
  ensureVerifiedAdminWriteSession,
  fetchCollectionFromServer,
  fetchDocFromServer,
  formatAdminFirestoreError,
  isValidFirestoreId,
  safeDeleteUnreferencedR2Urls,
} from '../../lib/adminDb';
import {
  db,
  firebaseConnectionStatus,
  firebaseMissingFields,
  firebasePublicInfo,
  requireDb,
} from '../../lib/firebase';
import {
  deleteCatalogImageFromStorage,
  isForbiddenInlineImageUrl,
  uploadCatalogImageToStorage,
  validateCatalogImageFile,
} from '../../lib/productStorage';
import type {
  ActivityLog,
  HomepageSection,
  MediaFolder,
  MediaItem,
  SeoSettings,
} from '../../types';

// ========================
// HOMEPAGE SECTIONS MANAGER
// ========================
const ALLOWED_SECTION_KEYS = new Set<HomepageSection['sectionKey']>([
  'hero',
  'announcement',
  'categories',
  'featured_products',
  'occasion_explorer',
  'popular_products',
  'promotional_banner',
  'showrooms',
  'complaint_and_support',
]);

export function AdminHomepageSectionsPanel() {
  const {
    allHomepageSections,
    hasPermission,
    logAdminActivity,
    refreshStoreData,
    refreshingStoreData,
  } = useStore();
  const [sections, setSections] = useState<HomepageSection[]>(allHomepageSections);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setSections(allHomepageSections);
  }, [allHomepageSections]);

  const moveSection = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setSections(
      next.map((s, idx) => ({
        ...s,
        display_order: idx + 1,
      }))
    );
  };

  const handleSaveAll = async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    let currentSectionId = 'layout';
    let currentOperation: 'CREATE' | 'UPDATE' = 'UPDATE';
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'banners_manage',
      });
      const firestore = requireDb();

      for (let i = 0; i < sections.length; i += 1) {
        const s = sections[i];
        currentSectionId = s.id;
        if (!isValidFirestoreId(s.id) || !ALLOWED_SECTION_KEYS.has(s.sectionKey)) {
          throw new AdminAuthError(
            'validation/preflight-failed',
            `হোমপেজ সেকশন "${s.id}" এর আইডি বা sectionKey সঠিক নয়।`
          );
        }

        const sectionRef = doc(firestore, 'homepage_sections', s.id);
        const existingSnap = await fetchDocFromServer(sectionRef);
        currentOperation = existingSnap.exists() ? 'UPDATE' : 'CREATE';
        const ctaBn = (s.ctaTextBn ?? s.cta_bn ?? '').trim().slice(0, 100);
        const ctaEn = (s.ctaTextEn ?? s.cta_en ?? '').trim().slice(0, 100);
        const ctaLink = (s.ctaLink ?? s.cta_link ?? '').trim().slice(0, 300);

        const payload: Record<string, unknown> = {
          id: existingSnap.exists()
            ? String((existingSnap.data() as Record<string, unknown>).id || s.id)
            : s.id,
          sectionKey: s.sectionKey,
          enabled: s.enabled !== false,
          visible: s.enabled !== false,
          display_order: Math.max(0, Math.min(100, i + 1)),
          title_bn: (s.title_bn || '').trim().slice(0, 200),
          title_en: (s.title_en || '').trim().slice(0, 200),
          subtitle_bn: (s.subtitle_bn || '').trim().slice(0, 400),
          subtitle_en: (s.subtitle_en || '').trim().slice(0, 400),
          ctaTextBn: ctaBn,
          ctaTextEn: ctaEn,
          ctaLink,
          cta_bn: ctaBn,
          cta_en: ctaEn,
          cta_link: ctaLink,
          ...(typeof s.content_bn === 'string'
            ? { content_bn: s.content_bn.trim().slice(0, 1000) }
            : {}),
          ...(typeof s.content_en === 'string'
            ? { content_en: s.content_en.trim().slice(0, 1000) }
            : {}),
          ...(typeof s.backgroundImage === 'string' && s.backgroundImage.trim()
            ? { backgroundImage: s.backgroundImage.trim().slice(0, 2048) }
            : {}),
          ...(s.status === 'draft' || s.status === 'published' || s.status === 'archived'
            ? { status: s.status }
            : {}),
          updatedAt: serverTimestamp(),
        };

        if (existingSnap.exists()) {
          await updateDoc(sectionRef, payload);
        } else {
          await setDoc(sectionRef, payload);
        }
      }

      await logAdminActivity('update', 'homepage_sections', 'layout', 'Updated homepage sections');
      setSaved(true);
    } catch (err) {
      setErrorMsg(
        formatAdminFirestoreError(err, 'homepage_sections_save', {
          collection: 'homepage_sections',
          documentId: currentSectionId,
          path: `homepage_sections/${currentSectionId}`,
          operation: currentOperation,
          authSession,
        })
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Homepage Sections Manager
          </h2>
          <p className="text-xs text-[#57534E]">
            হোমপেজের প্রতিটি সেকশন চালু/বন্ধ করুন, উপর-নিচে সাজান এবং বাংলা/English শিরোনাম ও বাটন পরিবর্তন করুন।
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={refreshingStoreData || saving}
            onClick={() => void refreshStoreData()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3.5 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshingStoreData ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAll}
            className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
          >
            {saving ? 'সেভ হচ্ছে...' : 'সব সেকশন সেভ করুন'}
          </button>
        </div>
      </div>

      {saved && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          হোমপেজ সেকশন লেআউট আপডেট হয়েছে।
        </p>
      )}
      {errorMsg && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-[#B91C1C]">
          {errorMsg}
        </p>
      )}

      <div className="space-y-3">
        {sections.map((sec, idx) => (
          <div
            key={sec.id}
            className="rounded-xl border border-[#E7E5E4] bg-white p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F5F4F0] pb-3">
              <div className="flex items-center gap-3">
                <span className="rounded bg-[#1C1917] px-2 py-0.5 font-mono text-[11px] font-bold text-[#FACC15]">
                  #{idx + 1} · {sec.sectionKey}
                </span>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-[#1C1917]">
                  <input
                    type="checkbox"
                    checked={sec.enabled !== false}
                    onChange={(e) =>
                      setSections(
                        sections.map((item, i) =>
                          i === idx
                            ? { ...item, enabled: e.target.checked, visible: e.target.checked }
                            : item
                        )
                      )
                    }
                  />
                  <span>{sec.enabled !== false ? 'Enabled' : 'Hidden'}</span>
                </label>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveSection(idx, -1)}
                  className="cursor-pointer rounded border border-[#E7E5E4] p-1.5 text-[#1C1917] disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === sections.length - 1}
                  onClick={() => moveSection(idx, 1)}
                  className="cursor-pointer rounded border border-[#E7E5E4] p-1.5 text-[#1C1917] disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={sec.title_bn}
                onChange={(e) =>
                  setSections(
                    sections.map((item, i) =>
                      i === idx ? { ...item, title_bn: e.target.value } : item
                    )
                  )
                }
                placeholder="Section Title (বাংলা)"
                className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs font-semibold"
              />
              <input
                type="text"
                value={sec.title_en}
                onChange={(e) =>
                  setSections(
                    sections.map((item, i) =>
                      i === idx ? { ...item, title_en: e.target.value } : item
                    )
                  )
                }
                placeholder="Section Title (English)"
                className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs font-semibold"
              />
              <input
                type="text"
                value={sec.subtitle_bn}
                onChange={(e) =>
                  setSections(
                    sections.map((item, i) =>
                      i === idx ? { ...item, subtitle_bn: e.target.value } : item
                    )
                  )
                }
                placeholder="Subtitle (বাংলা)"
                className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={sec.subtitle_en}
                onChange={(e) =>
                  setSections(
                    sections.map((item, i) =>
                      i === idx ? { ...item, subtitle_en: e.target.value } : item
                    )
                  )
                }
                placeholder="Subtitle (English)"
                className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={sec.ctaTextBn ?? sec.cta_bn ?? ''}
                onChange={(e) =>
                  setSections(
                    sections.map((item, i) =>
                      i === idx ? { ...item, ctaTextBn: e.target.value, cta_bn: e.target.value } : item
                    )
                  )
                }
                placeholder="CTA Text (বাংলা)"
                className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={sec.ctaTextEn ?? sec.cta_en ?? ''}
                onChange={(e) =>
                  setSections(
                    sections.map((item, i) =>
                      i === idx ? { ...item, ctaTextEn: e.target.value, cta_en: e.target.value } : item
                    )
                  )
                }
                placeholder="CTA Text (English)"
                className="rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={sec.ctaLink ?? sec.cta_link ?? ''}
                onChange={(e) =>
                  setSections(
                    sections.map((item, i) =>
                      i === idx ? { ...item, ctaLink: e.target.value, cta_link: e.target.value } : item
                    )
                  )
                }
                placeholder="CTA Link (/products)"
                className="rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-xs sm:col-span-2"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========================
// MEDIA LIBRARY PANEL
// ========================
const MEDIA_FOLDERS: MediaFolder[] = [
  'Products',
  'Categories',
  'Hero',
  'Showrooms',
  'General',
  'Branding',
];

export function AdminMediaLibraryPanel() {
  const {
    mediaItems,
    allProducts,
    allCategories,
    allShowrooms,
    allHeroBanners,
    siteSettings,
    seoSettings,
    user,
    isSuperAdmin,
    hasPermission,
    logAdminActivity,
    refreshStoreData,
    refreshingStoreData,
  } = useStore();
  const [folderFilter, setFolderFilter] = useState<string>('all');
  const [uploadFolder, setUploadFolder] = useState<MediaFolder>('Products');
  const [uploading, setUploading] = useState(false);
  const [busyMediaId, setBusyMediaId] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<MediaItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const validationError = validateCatalogImageFile(file);
    if (validationError) {
      setFeedback({ type: 'error', message: validationError });
      return;
    }

    setUploading(true);
    setFeedback(null);

    let uploadedStorage: { storagePath: string; downloadUrl: string } | null = null;
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    const mediaId = `med_${Date.now()}`;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'banners_manage',
      });
      const firestore = requireDb();
      const uploaded = await uploadCatalogImageToStorage({
        folder: 'media',
        entityId: uploadFolder,
        file,
      });

      if (!uploaded.downloadUrl || isForbiddenInlineImageUrl(uploaded.downloadUrl)) {
        throw new Error('ছবি সংরক্ষণ করা যাচ্ছে না। অনুগ্রহ করে পরে আবার চেষ্টা করুন।');
      }
      uploadedStorage = {
        storagePath: uploaded.storagePath,
        downloadUrl: uploaded.downloadUrl,
      };

      const cleanName = (file.name || `image-${Date.now()}`).trim().slice(0, 200);
      const item: MediaItem = {
        id: mediaId,
        name: cleanName,
        url: uploaded.downloadUrl,
        storagePath: uploaded.storagePath,
        folder: uploadFolder,
        mimeType: (file.type || 'image/jpeg').slice(0, 80),
        sizeBytes: Math.max(0, Math.round(Number(uploaded.sizeBytes) || 0)),
        uploadedByEmail: (user?.email || authSession.email || '').slice(0, 254),
        deleted: false,
      };

      await setDoc(doc(firestore, 'media', mediaId), {
        ...item,
        createdAt: serverTimestamp(),
      });
      uploadedStorage = null;
      await logAdminActivity('upload', 'media', mediaId, cleanName, `Folder=${uploadFolder}`);
      setFeedback({ type: 'success', message: 'ছবিটি সফলভাবে সংরক্ষণ হয়েছে।' });
    } catch (err) {
      if (uploadedStorage) {
        try {
          await deleteCatalogImageFromStorage(uploadedStorage);
        } catch {
          // Best-effort cleanup of uncommitted R2 image
        }
      }
      setFeedback({
        type: 'error',
        message: formatAdminFirestoreError(err, 'media_upload', {
          collection: 'media',
          documentId: mediaId,
          path: `media/${mediaId}`,
          operation: 'CREATE',
          authSession,
        }),
      });
    } finally {
      setUploading(false);
    }
  };

  const copyUrl = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const archiveMedia = async (item: MediaItem) => {
    setBusyMediaId(item.id);
    setFeedback(null);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'banners_manage',
      });
      const mediaRef = doc(requireDb(), 'media', item.id);
      const snap = await fetchDocFromServer(mediaRef);
      if (!snap.exists()) {
        throw new AdminAuthError('not-found', 'সংশ্লিষ্ট মিডিয়া আইটেমটি ডাটাবেসে পাওয়া যায়নি।');
      }
      await updateDoc(mediaRef, {
        deleted: true,
        updatedAt: serverTimestamp(),
      });
      await logAdminActivity('archive', 'media', item.id, item.name);
      setConfirmArchiveId(null);
      setFeedback({ type: 'success', message: `"${item.name}" আর্কাইভ করা হয়েছে।` });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: formatAdminFirestoreError(err, 'media_archive', {
          collection: 'media',
          documentId: item.id,
          path: `media/${item.id}`,
          operation: 'UPDATE',
          authSession,
        }),
      });
    } finally {
      setBusyMediaId(null);
    }
  };

  const permanentDeleteMedia = async (item: MediaItem) => {
    if (!isSuperAdmin) return;
    setBusyMediaId(item.id);
    setFeedback(null);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'banners_manage',
        superAdminOnly: true,
      });
      const mediaRef = doc(requireDb(), 'media', item.id);
      const snap = await fetchDocFromServer(mediaRef);
      if (snap.exists()) {
        await deleteDoc(mediaRef);
      }
      await safeDeleteUnreferencedR2Urls({
        urls: [item.url],
        exclude: { collection: 'media', docId: item.id },
        snapshot: {
          allProducts,
          allCategories,
          allShowrooms,
          allHeroBanners,
          mediaItems,
          siteSettings,
          seoSettings,
        },
      });
      await logAdminActivity('delete', 'media', item.id, item.name);
      setConfirmDeleteItem(null);
      setFeedback({ type: 'success', message: `"${item.name}" স্থায়ীভাবে ডিলিট করা হয়েছে।` });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: formatAdminFirestoreError(err, 'media_delete', {
          collection: 'media',
          documentId: item.id,
          path: `media/${item.id}`,
          operation: 'DELETE',
          authSession,
        }),
      });
    } finally {
      setBusyMediaId(null);
    }
  };

  const visibleItems = mediaItems.filter(
    (m) => folderFilter === 'all' || m.folder === folderFilter
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Media Library
          </h2>
          <p className="text-xs text-[#57534E]">
            পণ্য, ব্যানার, ক্যাটাগরি ও ব্র্যান্ডিংয়ের ছবি আপলোড করুন ও URL কপি করে ব্যবহার করুন।
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
          <select
            value={uploadFolder}
            onChange={(e) => setUploadFolder(e.target.value as MediaFolder)}
            className="rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold"
          >
            {MEDIA_FOLDERS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]">
            <Upload className="h-4 w-4" />
            <span>{uploading ? 'আপলোড হচ্ছে...' : 'ছবি আপলোড'}</span>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {feedback && (
        <p
          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
            feedback.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {feedback.message}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 text-xs">
        <button
          type="button"
          onClick={() => setFolderFilter('all')}
          className={`cursor-pointer rounded-md px-3 py-1.5 font-semibold ${
            folderFilter === 'all' ? 'bg-[#1C1917] text-white' : 'bg-white text-[#57534E]'
          }`}
        >
          All ({mediaItems.length})
        </button>
        {MEDIA_FOLDERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFolderFilter(f)}
            className={`cursor-pointer rounded-md px-3 py-1.5 font-semibold ${
              folderFilter === f ? 'bg-[#1C1917] text-white' : 'bg-white text-[#57534E]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-xl border border-[#E7E5E4] bg-white p-10 text-center text-xs text-[#78716C]">
          এই ফোল্ডারে এখনো কোনো ছবি নেই। উপরের বাটন থেকে ছবি আপলোড করুন।
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {visibleItems.map((m) => {
            const busy = busyMediaId === m.id;
            return (
              <div
                key={m.id}
                className="overflow-hidden rounded-xl border border-[#E7E5E4] bg-white"
              >
                <img src={m.url} alt={m.name} className="aspect-[4/3] w-full object-cover" />
                <div className="p-3">
                  <p className="truncate text-xs font-semibold text-[#1C1917]">{m.name}</p>
                  <p className="text-[10px] text-[#78716C]">{m.folder}</p>
                  <div className="mt-2 flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => copyUrl(m.id, m.url)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded border border-[#E7E5E4] px-2 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26]"
                    >
                      {copiedId === m.id ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-700" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy URL</span>
                        </>
                      )}
                    </button>
                    <div className="flex items-center gap-1">
                      {confirmArchiveId === m.id ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void archiveMedia(m)}
                            className="cursor-pointer rounded bg-amber-700 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                          >
                            Archive
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmArchiveId(null)}
                            className="cursor-pointer rounded border border-[#D6D3D1] px-1.5 py-1 text-[10px]"
                          >
                            বাতিল
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmArchiveId(m.id)}
                          title="Archive"
                          className="cursor-pointer rounded border border-[#E7E5E4] p-1 text-[#57534E] hover:text-amber-800 disabled:opacity-50"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {isSuperAdmin && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmDeleteItem(m)}
                          title="Permanent Delete"
                          className="cursor-pointer rounded border border-[#E7E5E4] p-1 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmDeleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-xl">
            <h3 className="font-display text-lg font-bold text-[#1C1917]">
              Delete Media Permanently?
            </h3>
            <p className="mt-1.5 text-xs text-[#57534E]">
              This removes <span className="font-semibold text-[#1C1917]">{confirmDeleteItem.name}</span> from Media Library and cleans up the R2 file if no product, showroom, or banner still references it.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busyMediaId === confirmDeleteItem.id}
                onClick={() => setConfirmDeleteItem(null)}
                className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#44403C]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyMediaId === confirmDeleteItem.id}
                onClick={() => void permanentDeleteMedia(confirmDeleteItem)}
                className="cursor-pointer rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
              >
                {busyMediaId === confirmDeleteItem.id ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================
// SEO SETTINGS PANEL
// ========================
export function AdminSeoPanel() {
  const {
    seoSettings,
    allProducts,
    allCategories,
    allShowrooms,
    allHeroBanners,
    mediaItems,
    siteSettings,
    hasPermission,
    logAdminActivity,
    refreshStoreData,
    refreshingStoreData,
  } = useStore();
  const [form, setForm] = useState<SeoSettings>(seoSettings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setForm(seoSettings);
  }, [seoSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaved(false);
    setErrorMsg(null);
    const cleanTitle = (form.siteTitle || '').trim().slice(0, 160);
    if (!cleanTitle) {
      setErrorMsg('Site Title কমপক্ষে ১ অক্ষরের হতে হবে।');
      return;
    }

    setSaving(true);
    let authSession: Awaited<ReturnType<typeof ensureVerifiedAdminWriteSession>> | null = null;
    let operation: 'CREATE' | 'UPDATE' = 'UPDATE';
    try {
      authSession = await ensureVerifiedAdminWriteSession({
        hasPermission,
        requiredPermission: 'seo_manage',
      });
      const firestore = requireDb();
      const seoRef = doc(firestore, 'seo_settings', 'main');
      const existingSnap = await fetchDocFromServer(seoRef);
      operation = existingSnap.exists() ? 'UPDATE' : 'CREATE';
      const previousOgImage = existingSnap.exists()
        ? String((existingSnap.data() as Record<string, unknown>).ogImage || '')
        : seoSettings.ogImage || '';

      const payload: Record<string, unknown> = {
        siteTitle: cleanTitle,
        metaDescription: (form.metaDescription || '').trim().slice(0, 400),
        metaKeywords: (form.metaKeywords || '').trim().slice(0, 400),
        ogTitle: (form.ogTitle || '').trim().slice(0, 160),
        ogDescription: (form.ogDescription || '').trim().slice(0, 400),
        ogImage: (form.ogImage || '').trim().slice(0, 500000),
        ...(typeof form.siteTitleBn === 'string'
          ? { siteTitleBn: form.siteTitleBn.trim().slice(0, 160) }
          : {}),
        ...(typeof form.twitterCard === 'string'
          ? { twitterCard: form.twitterCard.trim().slice(0, 40) }
          : {}),
        ...(typeof form.homepageTitle === 'string'
          ? { homepageTitle: form.homepageTitle.trim().slice(0, 160) }
          : {}),
        ...(typeof form.homepageDescription === 'string'
          ? { homepageDescription: form.homepageDescription.trim().slice(0, 400) }
          : {}),
        updatedAt: serverTimestamp(),
      };

      if (existingSnap.exists()) {
        await updateDoc(seoRef, payload);
      } else {
        await setDoc(seoRef, payload);
      }

      if (previousOgImage && previousOgImage !== payload.ogImage) {
        await safeDeleteUnreferencedR2Urls({
          urls: [previousOgImage],
          exclude: { collection: 'seo_settings', field: 'ogImage' },
          snapshot: {
            allProducts,
            allCategories,
            allShowrooms,
            allHeroBanners,
            mediaItems,
            siteSettings,
            seoSettings: { ...form, ogImage: String(payload.ogImage || '') },
          },
        });
      }

      await logAdminActivity('update', 'seo_settings', 'main', 'Global SEO Settings');
      setSaved(true);
    } catch (err) {
      setErrorMsg(
        formatAdminFirestoreError(err, 'seo_settings_save', {
          collection: 'seo_settings',
          documentId: 'main',
          path: 'seo_settings/main',
          operation,
          authSession,
        })
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            SEO &amp; OpenGraph Management
          </h2>
          <p className="text-xs text-[#57534E]">
            সার্চ ইঞ্জিন টাইটেল, মেটা বিবরণ, কীওয়ার্ড এবং সোশ্যাল মিডিয়া শেয়ার প্রিভিউ এখান থেকে পরিবর্তন করুন।
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={refreshingStoreData || saving}
            onClick={() => void refreshStoreData()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3.5 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshingStoreData ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="submit"
            disabled={saving}
            className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
          >
            {saving ? 'সেভ হচ্ছে...' : 'SEO সেভ করুন'}
          </button>
        </div>
      </div>

      {saved && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          SEO সেটিংস সফলভাবে আপডেট হয়েছে।
        </p>
      )}
      {errorMsg && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-[#B91C1C]">
          {errorMsg}
        </p>
      )}

      <div className="space-y-4 rounded-xl border border-[#E7E5E4] bg-white p-5">
        <div>
          <label className="mb-1 block text-xs font-semibold">Site Title</label>
          <input
            type="text"
            required
            value={form.siteTitle}
            onChange={(e) => setForm({ ...form, siteTitle: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Meta Description</label>
          <textarea
            rows={2}
            value={form.metaDescription}
            onChange={(e) => setForm({ ...form, metaDescription: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Meta Keywords</label>
          <input
            type="text"
            value={form.metaKeywords}
            onChange={(e) => setForm({ ...form, metaKeywords: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold">OpenGraph Title</label>
            <input
              type="text"
              value={form.ogTitle}
              onChange={(e) => setForm({ ...form, ogTitle: e.target.value })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">OpenGraph Image URL</label>
            <input
              type="text"
              value={form.ogImage}
              onChange={(e) => setForm({ ...form, ogImage: e.target.value })}
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">OpenGraph Description</label>
          <textarea
            rows={2}
            value={form.ogDescription}
            onChange={(e) => setForm({ ...form, ogDescription: e.target.value })}
            className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
          />
        </div>
      </div>

      {/* Live Search Preview */}
      <div className="rounded-xl border border-[#E7E5E4] bg-white p-5">
        <p className="flex items-center gap-1.5 text-xs font-bold text-[#78716C]">
          <Search className="h-3.5 w-3.5" />
          <span>Google Search Snippet Preview</span>
        </p>
        <div className="mt-3 rounded-lg bg-[#FAFAF8] p-4">
          <p className="text-xs text-[#14532D]">https://homerecipefoods.com</p>
          <p className="mt-0.5 text-base font-semibold text-blue-700">{form.siteTitle}</p>
          <p className="mt-1 text-xs text-[#57534E]">{form.metaDescription}</p>
        </div>
      </div>
    </form>
  );
}

// ========================
// ACTIVITY LOGS PANEL
// ========================
export function AdminActivityLogsPanel() {
  const { isSuperAdmin, hasPermission, staffRole } = useStore();
  const canViewLogs = isSuperAdmin || hasPermission('reports_view');
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [refreshingLogs, setRefreshingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const fetchLogsFromServer = useCallback(async () => {
    if (!db || !canViewLogs) return;
    setRefreshingLogs(true);
    setLogsError(null);
    try {
      const snap = await fetchCollectionFromServer(
        query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(100))
      );
      setLogs(snap.docs.map((d) => ({ ...(d.data() as ActivityLog), id: d.id })));
    } catch (err) {
      setLogsError(
        formatAdminFirestoreError(err, 'activity_logs_refresh', {
          collection: 'activity_logs',
          operation: 'READ',
          staffRole,
        })
      );
    } finally {
      setRefreshingLogs(false);
      setLoadingLogs(false);
    }
  }, [canViewLogs, staffRole]);

  useEffect(() => {
    if (!db || !canViewLogs) {
      setLogs([]);
      setLoadingLogs(false);
      return;
    }
    setLoadingLogs(true);
    setLogsError(null);
    const unsub = onSnapshot(
      query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(100)),
      (snap) => {
        setLogs(snap.docs.map((d) => ({ ...(d.data() as ActivityLog), id: d.id })));
        setLogsError(null);
        setLoadingLogs(false);
      },
      (err) => {
        setLogsError(
          formatAdminFirestoreError(err, 'activity_logs_listen', {
            collection: 'activity_logs',
            operation: 'READ',
            staffRole,
          })
        );
        setLoadingLogs(false);
      }
    );
    return () => unsub();
  }, [canViewLogs, staffRole]);

  if (!canViewLogs) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Admin Activity Audit Logs
          </h2>
          <p className="text-xs text-[#57534E]">
            লগইন, প্রোডাক্ট আপডেট, রোল পরিবর্তন ও সেটিংস পরিবর্তনের অডিট রেকর্ড।
          </p>
        </div>
        <button
          type="button"
          disabled={refreshingLogs}
          onClick={() => void fetchLogsFromServer()}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3.5 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshingLogs ? 'animate-spin' : ''}`} />
          <span>{refreshingLogs ? 'লোড হচ্ছে...' : 'Refresh Logs'}</span>
        </button>
      </div>

      {logsError && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-[#B91C1C]">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{logsError}</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchLogsFromServer()}
            className="cursor-pointer rounded border border-red-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#B91C1C]"
          >
            Retry
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[#E7E5E4] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E7E5E4] bg-[#FAFAF8] text-[#57534E]">
              <tr>
                <th className="px-4 py-3 font-semibold">Admin</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Module / Target</th>
                <th className="px-4 py-3 font-semibold">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F4F0]">
              {loadingLogs ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[#78716C]">
                    অ্যাক্টিভিটি লগ লোড হচ্ছে...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[#78716C]">
                    এখনো কোনো অ্যাক্টিভিটি লগ রেকর্ড হয়নি।
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="hover:bg-[#FAFAF8]">
                    <td className="px-4 py-3 font-mono text-[11px] text-[#1C1917]">
                      {l.admin_email}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded bg-[#F5F4F0] px-2 py-0.5 font-mono text-[10px] font-bold text-[#1C1917]">
                        <Activity className="h-3 w-3 text-[#DC1F26]" />
                        {l.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">{l.module}</span>
                      {l.record_label ? ` · ${l.record_label}` : ''}
                    </td>
                    <td className="px-4 py-3 text-[#57534E]">{l.summary || l.record_id}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ========================
// SYSTEM SETTINGS & CLOUDFLARE/FIREBASE STATUS PANEL
// ========================
export function AdminSystemSettingsPanel() {
  const {
    isSuperAdmin,
    hasPermission,
    seedDemoCatalog,
    importProductMasterList,
    masterImportStats,
    masterImportRunning,
    refreshStoreData,
    refreshingStoreData,
  } = useStore();
  const canViewSystem = isSuperAdmin || hasPermission('settings_view');
  const canAddProducts = hasPermission('products_add');
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [masterResult, setMasterResult] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  if (!canViewSystem) return null;

  const handleSafeSeed = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await seedDemoCatalog();
      setSeedResult({
        type: 'ok',
        text:
          res.createdCount > 0
            ? `${res.createdCount}টি অনুপস্থিত ডকুমেন্ট নিরাপদে যুক্ত করা হয়েছে (বিদ্যমান কোনো ডাটা পরিবর্তন করা হয়নি)।`
            : 'সব প্রয়োজনীয় ডকুমেন্ট ইতিমধ্যে ডাটাবেসে বিদ্যমান রয়েছে।',
      });
    } catch (err) {
      setSeedResult({
        type: 'err',
        text: formatAdminFirestoreError(err, 'system_safe_seed', {
          operation: 'WRITE',
        }),
      });
    } finally {
      setSeeding(false);
    }
  };

  const handleMasterSync = async () => {
    setMasterResult(null);
    try {
      const summary = await importProductMasterList();
      setMasterResult({
        type: 'ok',
        text: `মাস্টার তালিকা সিঙ্ক সম্পন্ন: মোট ${summary.totalMasterCount}টি, পূর্বে ছিল ${summary.existingProductCount}টি, নতুন যোগ ${summary.newlyAddedCount}টি, স্কিপ ${summary.skippedExistingCount}টি।`,
      });
    } catch (err) {
      setMasterResult({
        type: 'err',
        text: formatAdminFirestoreError(err, 'system_master_sync', {
          collection: 'products',
          operation: 'WRITE',
        }),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            System Status &amp; Cloudflare Deployment
          </h2>
          <p className="text-xs text-[#57534E]">
            Firebase প্রজেক্ট সংযোগ, নিরাপদ ইনিশিয়ালাইজেশন এবং Cloudflare SPA রাউটিং অবস্থা দেখুন।
          </p>
        </div>
        <button
          type="button"
          disabled={refreshingStoreData}
          onClick={() => void refreshStoreData()}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3.5 py-2 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshingStoreData ? 'animate-spin' : ''}`} />
          <span>{refreshingStoreData ? 'Syncing...' : 'Refresh Store Data'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[#E7E5E4] bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#1C1917]">
            <HardDrive className="h-4 w-4 text-[#DC1F26]" />
            <span>Firebase Project Integration</span>
          </div>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <dt className="text-[#78716C]">Required Project ID:</dt>
              <dd className="font-mono font-bold">{firebasePublicInfo.expectedProjectId}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#78716C]">Connection Status:</dt>
              <dd className="font-mono font-bold uppercase">{firebaseConnectionStatus}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#78716C]">Missing Env Vars:</dt>
              <dd className="font-mono text-[11px]">
                {firebaseMissingFields.length === 0 ? 'None' : firebaseMissingFields.length}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-[#E7E5E4] bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#1C1917]">
            <Globe className="h-4 w-4 text-[#DC1F26]" />
            <span>Cloudflare Deployment Ready</span>
          </div>
          <ul className="mt-3 space-y-1.5 text-xs text-[#57534E]">
            <li>• Static SPA output in <code className="font-mono">dist/</code></li>
            <li>• Workers Static Assets (<code className="font-mono">wrangler.jsonc</code> SPA fallback)</li>
            <li>• Secret <code className="font-mono">GEMINI_API_KEY</code> isolated server-side in <code className="font-mono">worker/index.ts</code></li>
            <li>• Primary Admin Login Route: <code className="font-mono">/mahmud</code></li>
          </ul>
        </div>
      </div>

      {canAddProducts && (
        <div className="rounded-xl border border-[#E7E5E4] bg-white p-5">
          <h3 className="font-display text-lg font-bold text-[#1C1917]">
            Authoritative Product Master List ({masterImportStats.totalMaster}টি পণ্য)
          </h3>
          <p className="mt-1 text-xs text-[#57534E]">
            সিঙ্কড: {masterImportStats.syncedCount}/{masterImportStats.totalMaster}টি · অনুপস্থিত:{' '}
            {masterImportStats.missingCount}টি · ছবি ছাড়া: {masterImportStats.missingImageCount}টি।
            বিদ্যমান কোনো পণ্য বা ছবি ওভাররাইট না করে শুধুমাত্র অনুপস্থিত পণ্যগুলো যোগ করে।
          </p>
          {masterResult && (
            <p
              className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
                masterResult.type === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-red-200 bg-red-50 text-[#B91C1C]'
              }`}
            >
              {masterResult.text}
            </p>
          )}
          <button
            type="button"
            onClick={handleMasterSync}
            disabled={masterImportRunning}
            className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#DC1F26] disabled:opacity-50"
          >
            <Database className="h-4 w-4" />
            <span>
              {masterImportRunning
                ? 'সিঙ্ক হচ্ছে...'
                : 'মাস্টার প্রোডাক্ট তালিকা নিরাপদে সিঙ্ক করুন'}
            </span>
          </button>
        </div>
      )}

      <div className="rounded-xl border border-[#E7E5E4] bg-white p-5">
        <h3 className="font-display text-lg font-bold text-[#1C1917]">
          Non-Destructive Demo Data Initializer
        </h3>
        <p className="mt-1 text-xs text-[#57534E]">
          এই বাটনটি শুধুমাত্র অনুপস্থিত ডকুমেন্টগুলো যোগ করে—বিদ্যমান কোনো পণ্য, ক্যাটাগরি বা ক্রেতার ডাটা কখনোই মুছে ফেলে না বা পরিবর্তন করে না।
        </p>
        {seedResult && (
          <p
            className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
              seedResult.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-[#B91C1C]'
            }`}
          >
            {seedResult.text}
          </p>
        )}
        <button
          type="button"
          onClick={handleSafeSeed}
          disabled={seeding}
          className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1C1917] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#DC1F26] disabled:opacity-50"
        >
          <Database className="h-4 w-4" />
          <span>{seeding ? 'প্রসেস হচ্ছে...' : 'অনুপস্থিত ডিফল্ট ডাটা নিরাপদে যুক্ত করুন'}</span>
        </button>
      </div>
    </div>
  );
}
