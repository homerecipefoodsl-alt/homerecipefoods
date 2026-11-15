import { useEffect, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  MessageCircle,
  Plus,
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
} from 'firebase/firestore';
import { useStore } from '../../context/StoreContext';
import { resolveAssetUrl } from '../../lib/assets';
import { getDynamicEnglishDate } from '../../lib/bilingual';
import { OperationType, db, handleFirestoreError, requireDb } from '../../lib/firebase';
import { compressImageToDataUrl, getDynamicBengaliDate } from '../../lib/utils';
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

// ========================
// 5. PRIVATE COMPLAINT MANAGEMENT
// ========================
export function AdminComplaintsPanel({
  complaints,
}: {
  complaints: Complaint[];
}) {
  const { isSuperAdmin, logAdminActivity } = useStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [statusVal, setStatusVal] = useState<ComplaintStatus>('New');
  const [priorityVal, setPriorityVal] = useState<ComplaintPriority>('Normal');
  const [saving, setSaving] = useState(false);

  const openComplaint = (c: Complaint) => {
    setSelected(c);
    setAdminNote(c.adminNote || '');
    setStatusVal(c.status);
    setPriorityVal(c.priority || 'Normal');
  };

  const updateComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const firestore = requireDb();
      await updateDoc(doc(firestore, 'complaints', selected.id), {
        status: statusVal,
        priority: priorityVal,
        adminNote: adminNote.trim(),
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
        adminNote: adminNote.trim(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `complaints/${selected.id}`);
    } finally {
      setSaving(false);
    }
  };

  const filtered = complaints.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.referenceCode.toLowerCase().includes(q) ||
        c.customerName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.message.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-bold text-[#1C1917]">
          Private Complaint Management
        </h2>
        <p className="text-xs text-[#57534E]">
          শুধুমাত্র অনুমোদিত অ্যাডমিনরা এই গোপনীয় অভিযোগগুলো দেখতে এবং স্ট্যাটাস/প্রায়োরিটি পরিবর্তন করতে পারবেন।
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="রেফারেন্স নম্বর, নাম বা ফোন দিয়ে খুঁজুন..."
          className="w-full max-w-xs rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
        >
          <option value="all">সব স্ট্যাটাস</option>
          {COMPLAINT_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-2.5 lg:col-span-7">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-[#E7E5E4] bg-white p-10 text-center text-xs text-[#78716C]">
              কোনো অভিযোগ পাওয়া যায়নি।
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
                  <div className="flex items-center gap-1.5">
                    {c.priority && c.priority !== 'Normal' && (
                      <span className="rounded bg-[#1C1917] px-1.5 py-0.5 text-[10px] font-semibold text-[#FACC15]">
                        {c.priority}
                      </span>
                    )}
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                        c.status === 'New' || c.status === 'Rejected'
                          ? 'bg-red-50 text-red-700'
                          : c.status === 'Resolved' || c.status === 'Closed'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-[#FEF9C3] text-[#854D0E]'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-sm font-semibold text-[#1C1917]">
                  {c.customerName} · <span className="font-mono text-xs">{c.phone}</span>
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
                <p className="text-xs text-[#57534E]">
                  {selected.phone} {selected.email ? `· ${selected.email}` : ''}
                </p>
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <p>
                  <span className="font-semibold text-[#1C1917]">ধরন:</span>{' '}
                  {selected.category}
                </p>
                <p>
                  <span className="font-semibold text-[#1C1917]">শোরুম:</span>{' '}
                  {selected.showroomName}
                </p>
                <div className="rounded-lg bg-[#FAFAF8] p-3 leading-relaxed text-[#1C1917]">
                  {selected.message}
                </div>

                {selected.attachmentImage && (
                  <div>
                    <p className="mb-1 font-semibold text-[#1C1917]">সংযুক্ত ছবি:</p>
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
                    placeholder="টিম নোট বা সমাধানের বিবরণ লিখুন..."
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                  />
                </div>
              </div>

              {selected.status === 'Closed' && !isSuperAdmin ? (
                <p className="mt-4 rounded-lg bg-[#FAFAF8] px-3 py-2 text-center text-xs font-medium text-[#78716C]">
                  এই অভিযোগটি Closed রয়েছে। শুধুমাত্র Super Admin এটি পুনরায় পরিবর্তন করতে পারবেন।
                </p>
              ) : (
                <button
                  type="submit"
                  disabled={saving}
                  className="mt-4 w-full cursor-pointer rounded-lg bg-[#1C1917] py-2.5 text-xs font-semibold text-white hover:bg-[#DC1F26]"
                >
                  {saving ? 'আপডেট হচ্ছে...' : 'স্ট্যাটাস আপডেট করুন'}
                </button>
              )}
            </form>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-[#E7E5E4] bg-white p-6 text-center text-xs text-[#78716C]">
              বিস্তারিত দেখতে বাম পাশ থেকে একটি অভিযোগ নির্বাচন করুন।
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
  const { greeting, allGreetingItems, logAdminActivity } = useStore();
  const [form, setForm] = useState<GreetingConfig>(greeting);
  const [saved, setSaved] = useState(false);

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
    setSaved(false);
    const greetingBn = (form.greetingText || form.greeting_bn || '').trim();
    const greetingEn = (form.greetingTextEn || form.greeting_en || '').trim();
    const msgBn = (form.dailyMessage || form.message_bn || '').trim();
    const msgEn = (form.dailyMessageEn || form.message_en || '').trim();
    const specialBn = (form.specialMessage || form.special_message_bn || '').trim();
    const specialEn = (form.specialMessageEn || form.special_message_en || '').trim();
    const annBn = (form.announcement || form.announcement_bn || '').trim();
    const annEn = (form.announcementEn || form.announcement_en || '').trim();

    const firestore = requireDb();
    await setDoc(doc(firestore, 'greetings', 'daily'), {
      useDynamicDate: Boolean(form.useDynamicDate),
      customDateText: form.customDateText.trim(),
      customDateTextEn: (form.customDateTextEn || '').trim(),
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
    });
    await logAdminActivity('update', 'greetings', 'daily', 'Daily Greeting Config');
    setSaved(true);
  };

  const handleAddGreetingItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTextBn.trim() && !newTextEn.trim()) return;
    const firestore = requireDb();
    const id = `grt_${Date.now()}`;
    const item: Omit<GreetingItem, 'id'> = {
      text_bn: newTextBn.trim(),
      text_en: newTextEn.trim(),
      type: 'greeting',
      active: true,
      visible: true,
      display_order: allGreetingItems.length + 1,
      durationMs: Math.max(2000, Number(newDuration) || 4200),
      startDate: newStartDate,
      endDate: newEndDate,
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
  };

  const toggleGreetingItemActive = async (item: GreetingItem) => {
    const firestore = requireDb();
    await updateDoc(doc(firestore, 'greetings', item.id), {
      active: !item.active,
      updatedAt: serverTimestamp(),
    });
  };

  const deleteGreetingItem = async (id: string) => {
    const firestore = requireDb();
    await deleteDoc(doc(firestore, 'greetings', id));
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSave}
        className="max-w-3xl space-y-4 rounded-xl border border-[#E7E5E4] bg-white p-6"
      >
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Greeting &amp; Daily Message Management
          </h2>
          <p className="text-xs text-[#57534E]">
            লোগোর ঠিক নিচে পর্যায়ক্রমে প্রদর্শিত বাংলা ও English তারিখ, সালাম ও দৈনিক বার্তা পরিবর্তন করুন।
          </p>
        </div>

        {saved && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            <span>গ্রিটিং বার্তা সফলভাবে আপডেট হয়েছে।</span>
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
          className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#B91C1C]"
        >
          গ্রিটিং সংরক্ষণ করুন
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
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Greeting Item</span>
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
                    {item.text_bn} {item.text_en ? `| ${item.text_en}` : ''}
                  </p>
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
                    onClick={() => toggleGreetingItemActive(item)}
                    className={`cursor-pointer rounded px-2 py-1 text-[11px] font-semibold ${
                      item.active !== false
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-[#E7E5E4] text-[#57534E]'
                    }`}
                  >
                    {item.active !== false ? 'Active' : 'Paused'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteGreetingItem(item.id)}
                    className="cursor-pointer rounded p-1 text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
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
  const { siteSettings, logAdminActivity } = useStore();
  const [form, setForm] = useState<SiteSettings>(siteSettings);
  const [complaintCatsText, setComplaintCatsText] = useState(
    (siteSettings.complaintCategories || []).join(', ')
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(siteSettings);
    setComplaintCatsText((siteSettings.complaintCategories || []).join(', '));
  }, [siteSettings]);

  const handleSlideUpload = async (idx: number, file: File) => {
    const url = await compressImageToDataUrl(file, 1280, 0.78);
    const nextSlides = form.heroSlides.map((s, i) =>
      i === idx ? { ...s, image: url } : s
    );
    setForm({ ...form, heroSlides: nextSlides });
  };

  const handleBrandImageUpload = async (field: 'logoUrl' | 'faviconUrl', file: File) => {
    const url = await compressImageToDataUrl(file, field === 'faviconUrl' ? 256 : 800, 0.85);
    setForm({ ...form, [field]: url });
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
    setSaved(false);
    const firestore = requireDb();
    const parsedComplaintCats = complaintCatsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    await setDoc(doc(firestore, 'site_settings', 'main'), {
      ...form,
      complaintCategories:
        parsedComplaintCats.length > 0
          ? parsedComplaintCats
          : form.complaintCategories || [],
      defaultLanguage: form.defaultLanguage || 'both',
      heroSlides: normalizeSlidesForSave(form.heroSlides),
      updatedAt: serverTimestamp(),
    });
    await logAdminActivity('update', 'site_settings', 'main', 'Website Settings');
    setSaved(true);
  };

  return (
    <form onSubmit={saveSettings} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Website, Brand &amp; AI Settings
          </h2>
          <p className="text-xs text-[#57534E]">
            ব্র্যান্ড নাম, লোগো, ফুটার, অ্যানাউন্সমেন্ট বার, হটলাইন, সোশ্যাল লিংক ও AI সাপোর্ট সম্পূর্ণ পরিবর্তন করুন।
          </p>
        </div>
        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#B91C1C]"
        >
          সব পরিবর্তন সেভ করুন
        </button>
      </div>

      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          সেটিংস ও ব্র্যান্ড তথ্য আপডেট হয়েছে।
        </p>
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
  const { allHeroBanners, siteSettings, logAdminActivity } = useStore();
  const [slides, setSlides] = useState<HeroSlide[]>(allHeroBanners);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setSlides(allHeroBanners);
  }, [allHeroBanners]);

  const handleSlideUpload = async (idx: number, file: File) => {
    const url = await compressImageToDataUrl(file, 1280, 0.78);
    setSlides(slides.map((s, i) => (i === idx ? { ...s, image: url } : s)));
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
    setSaved(false);
    setErrorMsg(null);
    const normalized = normalizeSlidesForSave(slides);
    try {
      const firestore = requireDb();
      // Save to site_settings.heroSlides (works for Admin & Super Admin)
      await updateDoc(doc(firestore, 'site_settings', 'main'), {
        heroSlides: normalized,
        updatedAt: serverTimestamp(),
      });
      // Also persist individual hero_banners documents for scheduling/order control
      for (let i = 0; i < normalized.length; i += 1) {
        const s = normalized[i];
        await setDoc(doc(firestore, 'hero_banners', s.id), {
          ...s,
          order: s.order ?? i + 1,
          active: s.active !== false,
          visible: s.visible !== false,
          deleted: false,
          updatedAt: serverTimestamp(),
        });
      }
      await logAdminActivity('update', 'hero_banners', 'all', `${normalized.length} slides`);
      setSaved(true);
    } catch {
      // If site_settings/main doesn't exist yet, create fallback merge
      try {
        const firestore = requireDb();
        await setDoc(
          doc(firestore, 'site_settings', 'main'),
          {
            ...siteSettings,
            heroSlides: normalized,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        setSaved(true);
      } catch {
        setErrorMsg('ব্যানার সেভ করতে সমস্যা হয়েছে। নিশ্চিত করুন site_settings/main বা অনুমতি ঠিক আছে।');
      }
    }
  };

  return (
    <form onSubmit={saveBanners} className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Hero Banner Management
          </h2>
          <p className="text-xs text-[#57534E]">
            হোমপেজ স্লাইডার ব্যানার ছবি, বাংলা ও English শিরোনাম, প্রদর্শনের সময় ও ভাষা নির্বাচন করুন।
          </p>
        </div>
        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#B91C1C]"
        >
          ব্যানার সেভ করুন
        </button>
      </div>

      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          হিরো ব্যানার সফলভাবে আপডেট হয়েছে।
        </p>
      )}
      {errorMsg && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-[#B91C1C]">
          {errorMsg}
        </p>
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
}: {
  sessions: ChatSession[];
}) {
  const { user, siteSettings, allAiKnowledge, isCatalogAdmin, logAdminActivity } =
    useStore();
  const [subTab, setSubTab] = useState<'inbox' | 'knowledge'>('inbox');
  const [selectedId, setSelectedId] = useState<string>(sessions[0]?.id ?? '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [transferEmail, setTransferEmail] = useState('');

  // AI Knowledge Entry Form
  const [kTitle, setKTitle] = useState('');
  const [kCategory, setKCategory] = useState('General');
  const [kQuestionBn, setKQuestionBn] = useState('');
  const [kQuestionEn, setKQuestionEn] = useState('');
  const [kAnswerBn, setKAnswerBn] = useState('');
  const [kAnswerEn, setKAnswerEn] = useState('');

  const activeSession = sessions.find((s) => s.id === selectedId) ?? sessions[0];

  useEffect(() => {
    if (!db || !activeSession) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'chat_sessions', activeSession.id, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => d.data() as ChatMessage));
    });
    return () => unsub();
  }, [activeSession?.id]);

  const toggleOnlineStatus = async () => {
    const firestore = requireDb();
    try {
      await updateDoc(doc(firestore, 'site_settings', 'main'), {
        supportOnline: !siteSettings.supportOnline,
        updatedAt: serverTimestamp(),
      });
    } catch {
      await setDoc(
        doc(firestore, 'site_settings', 'main'),
        {
          ...siteSettings,
          supportOnline: !siteSettings.supportOnline,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !replyText.trim()) return;
    const firestore = requireDb();
    const text = replyText.trim();
    setReplyText('');
    const msgId = `msg_${Date.now()}`;

    await setDoc(doc(firestore, 'chat_sessions', activeSession.id, 'messages', msgId), {
      id: msgId,
      sessionId: activeSession.id,
      senderRole: 'admin',
      senderName: user?.displayName || 'Home Recipe Representative',
      text,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(firestore, 'chat_sessions', activeSession.id), {
      status: 'active',
      assignedAdminEmail: user?.email || '',
      assignedAdminName: user?.displayName || 'Home Recipe Representative',
      lastMessage: text.slice(0, 500),
      updatedAt: serverTimestamp(),
    });
  };

  const closeConversation = async () => {
    if (!activeSession) return;
    await updateDoc(doc(requireDb(), 'chat_sessions', activeSession.id), {
      status: 'closed',
      updatedAt: serverTimestamp(),
    });
  };

  const transferConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !transferEmail.trim()) return;
    await updateDoc(doc(requireDb(), 'chat_sessions', activeSession.id), {
      assignedAdminEmail: transferEmail.trim(),
      assignedAdminName: transferEmail.trim(),
      status: 'active',
      updatedAt: serverTimestamp(),
    });
    setTransferEmail('');
  };

  const handleAddKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kTitle.trim() || (!kAnswerBn.trim() && !kAnswerEn.trim())) return;
    const firestore = requireDb();
    const id = `know_${Date.now()}`;
    const entry: Omit<AiKnowledgeEntry, 'id'> = {
      title: kTitle.trim(),
      category: kCategory.trim() || 'General',
      question_bn: kQuestionBn.trim(),
      question_en: kQuestionEn.trim(),
      answer_bn: kAnswerBn.trim(),
      answer_en: kAnswerEn.trim(),
      active: true,
      visible: true,
      order: allAiKnowledge.length + 1,
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
  };

  const toggleKnowledgeActive = async (entry: AiKnowledgeEntry) => {
    await updateDoc(doc(requireDb(), 'ai_knowledge', entry.id), {
      active: !entry.active,
      updatedAt: serverTimestamp(),
    });
  };

  const deleteKnowledge = async (id: string) => {
    await deleteDoc(doc(requireDb(), 'ai_knowledge', id));
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
            onClick={toggleOnlineStatus}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold ${
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
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Save Knowledge Entry</span>
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
                      onClick={() => toggleKnowledgeActive(entry)}
                      className={`cursor-pointer rounded px-2.5 py-1 text-[11px] font-semibold ${
                        entry.active !== false
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-[#F5F4F0] text-[#78716C]'
                      }`}
                    >
                      {entry.active !== false ? 'Active' : 'Disabled'}
                    </button>
                    {isCatalogAdmin && (
                      <button
                        type="button"
                        onClick={() => deleteKnowledge(entry.id)}
                        className="cursor-pointer rounded border border-[#E7E5E4] p-1 text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
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
                        className="cursor-pointer rounded-md border border-[#D6D3D1] px-2 py-1 text-[11px] font-semibold"
                      >
                        Assign
                      </button>
                    </form>
                    {activeSession.status !== 'closed' && (
                      <button
                        type="button"
                        onClick={closeConversation}
                        className="cursor-pointer rounded-md bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                      >
                        Close Chat
                      </button>
                    )}
                  </div>
                </div>

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
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>পাঠান</span>
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
