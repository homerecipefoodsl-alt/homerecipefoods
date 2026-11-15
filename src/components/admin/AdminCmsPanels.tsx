import { useEffect, useState } from 'react';
import {
  Activity,
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Database,
  Globe,
  HardDrive,
  Search,
  Upload,
} from 'lucide-react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useStore } from '../../context/StoreContext';
import {
  db,
  firebaseConnectionStatus,
  firebaseMissingFields,
  firebasePublicInfo,
  requireDb,
  storage,
} from '../../lib/firebase';
import { compressImageToDataUrl } from '../../lib/utils';
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
export function AdminHomepageSectionsPanel() {
  const { allHomepageSections, logAdminActivity } = useStore();
  const [sections, setSections] = useState<HomepageSection[]>(allHomepageSections);
  const [saved, setSaved] = useState(false);

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
    const firestore = requireDb();
    setSaved(false);
    for (let i = 0; i < sections.length; i += 1) {
      const s = sections[i];
      await setDoc(doc(firestore, 'homepage_sections', s.id), {
        ...s,
        display_order: i + 1,
        updatedAt: serverTimestamp(),
      });
    }
    await logAdminActivity('update', 'homepage_sections', 'layout', 'Updated homepage sections');
    setSaved(true);
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
        <button
          type="button"
          onClick={handleSaveAll}
          className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#B91C1C]"
        >
          সব সেকশন সেভ করুন
        </button>
      </div>

      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          হোমপেজ সেকশন লেআউট আপডেট হয়েছে।
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
  const { mediaItems, user, logAdminActivity } = useStore();
  const [folderFilter, setFolderFilter] = useState<string>('all');
  const [uploadFolder, setUploadFolder] = useState<MediaFolder>('Products');
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFeedback(null);

    try {
      const firestore = requireDb();
      const mediaId = `med_${Date.now()}`;
      let finalUrl = '';

      let storagePath = '';
      if (storage) {
        try {
          storagePath = `media/${uploadFolder}/${mediaId}_${file.name}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, file);
          finalUrl = await getDownloadURL(storageRef);
        } catch {
          storagePath = '';
          finalUrl = await compressImageToDataUrl(file, 1000, 0.78);
        }
      } else {
        finalUrl = await compressImageToDataUrl(file, 1000, 0.78);
      }

      const item: MediaItem = {
        id: mediaId,
        name: file.name,
        url: finalUrl,
        storagePath,
        folder: uploadFolder,
        mimeType: file.type || 'image/jpeg',
        sizeBytes: file.size,
        uploadedByEmail: user?.email || '',
        deleted: false,
      };

      await setDoc(doc(firestore, 'media', mediaId), {
        ...item,
        createdAt: serverTimestamp(),
      });
      await logAdminActivity('upload', 'media', mediaId, file.name, `Folder=${uploadFolder}`);
      setFeedback('ছবিটি Media Library-তে যুক্ত হয়েছে।');
    } catch {
      setFeedback('আপলোড ব্যর্থ হয়েছে।');
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

  const archiveMedia = async (id: string) => {
    await updateDoc(doc(requireDb(), 'media', id), {
      deleted: true,
      updatedAt: serverTimestamp(),
    });
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
        <div className="flex items-center gap-2">
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
              accept="image/*"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {feedback && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          {feedback}
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
          {visibleItems.map((m) => (
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
                  <button
                    type="button"
                    onClick={() => archiveMedia(m.id)}
                    title="Archive"
                    className="cursor-pointer rounded border border-[#E7E5E4] p-1 text-[#57534E] hover:text-red-700"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ========================
// SEO SETTINGS PANEL
// ========================
export function AdminSeoPanel() {
  const { seoSettings, logAdminActivity } = useStore();
  const [form, setForm] = useState<SeoSettings>(seoSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(seoSettings);
  }, [seoSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    await setDoc(doc(requireDb(), 'seo_settings', 'main'), {
      ...form,
      updatedAt: serverTimestamp(),
    });
    await logAdminActivity('update', 'seo_settings', 'main', 'Global SEO Settings');
    setSaved(true);
  };

  return (
    <form onSubmit={handleSave} className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            SEO &amp; OpenGraph Management
          </h2>
          <p className="text-xs text-[#57534E]">
            সার্চ ইঞ্জিন টাইটেল, মেটা বিবরণ, কীওয়ার্ড এবং সোশ্যাল মিডিয়া শেয়ার প্রিভিউ এখান থেকে পরিবর্তন করুন।
          </p>
        </div>
        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#B91C1C]"
        >
          SEO সেভ করুন
        </button>
      </div>

      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          SEO সেটিংস সফলভাবে আপডেট হয়েছে।
        </p>
      )}

      <div className="space-y-4 rounded-xl border border-[#E7E5E4] bg-white p-5">
        <div>
          <label className="mb-1 block text-xs font-semibold">Site Title</label>
          <input
            type="text"
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
  const { isSuperAdmin } = useStore();
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    if (!db || !isSuperAdmin) {
      setLogs([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(100)),
      (snap) => {
        setLogs(snap.docs.map((d) => d.data() as ActivityLog));
      },
      () => {}
    );
    return () => unsub();
  }, [isSuperAdmin]);

  if (!isSuperAdmin) return null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-bold text-[#1C1917]">
          Admin Activity Audit Logs
        </h2>
        <p className="text-xs text-[#57534E]">
          লগইন, প্রোডাক্ট আপডেট, রোল পরিবর্তন ও সেটিংস পরিবর্তনের অডিট রেকর্ড।
        </p>
      </div>

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
              {logs.length === 0 ? (
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
  const { isSuperAdmin, seedDemoCatalog } = useStore();
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  if (!isSuperAdmin) return null;

  const handleSafeSeed = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await seedDemoCatalog();
      setSeedResult(
        res.createdCount > 0
          ? `${res.createdCount}টি অনুপস্থিত ডকুমেন্ট নিরাপদে যুক্ত করা হয়েছে (বিদ্যমান কোনো ডাটা পরিবর্তন করা হয়নি)।`
          : 'সব প্রয়োজনীয় ডকুমেন্ট ইতিমধ্যে ডাটাবেসে বিদ্যমান রয়েছে।'
      );
    } catch {
      setSeedResult('ডাটাবেস সিডিং ব্যর্থ হয়েছে।');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-[#1C1917]">
          System Status &amp; Cloudflare Deployment
        </h2>
        <p className="text-xs text-[#57534E]">
          Firebase প্রজেক্ট সংযোগ, নিরাপদ ইনিশিয়ালাইজেশন এবং Cloudflare SPA রাউটিং অবস্থা দেখুন।
        </p>
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
            <li>• Workers Static Assets (<code className="font-mono">wrangler.jsonc</code>) + Pages (<code className="font-mono">public/_redirects</code>)</li>
            <li>• Secret <code className="font-mono">GEMINI_API_KEY</code> isolated server-side in <code className="font-mono">worker/index.ts</code></li>
            <li>• Primary Admin Login Route: <code className="font-mono">/mahmud</code></li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-[#E7E5E4] bg-white p-5">
        <h3 className="font-display text-lg font-bold text-[#1C1917]">
          Non-Destructive Demo Data Initializer
        </h3>
        <p className="mt-1 text-xs text-[#57534E]">
          এই বাটনটি শুধুমাত্র অনুপস্থিত ডকুমেন্টগুলো যোগ করে—বিদ্যমান কোনো পণ্য, ক্যাটাগরি বা ক্রেতার ডাটা কখনোই মুছে ফেলে না বা পরিবর্তন করে না।
        </p>
        {seedResult && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            {seedResult}
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
