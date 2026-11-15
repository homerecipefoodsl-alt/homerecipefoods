import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
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
import { PRIMARY_SUPER_ADMIN_EMAIL, useStore } from '../../context/StoreContext';
import {
  OperationType,
  db,
  firebaseConnectionStatus,
  firebaseMissingFields,
  firebasePublicInfo,
  handleFirestoreError,
  requireDb,
} from '../../lib/firebase';
import type {
  AccountStatus,
  RbacRoleEntry,
  StaffRole,
  UserAccount,
  UserRole,
} from '../../types';

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  support_agent: 'Support Agent',
  customer: 'Customer',
};

// ========================
// 9. ADMIN & ROLE MANAGEMENT (Super Admin Only)
// ========================
export function AdminRoleManagementPanel() {
  const { user, isSuperAdmin, logAdminActivity } = useStore();
  const [roles, setRoles] = useState<RbacRoleEntry[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [roleInput, setRoleInput] = useState<'admin' | 'support_agent'>('admin');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!db || !isSuperAdmin) {
      setRoles([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'rbac_roles'), orderBy('updatedAt', 'desc')),
      (snap) => {
        setRoles(snap.docs.map((d) => d.data() as RbacRoleEntry));
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'rbac_roles');
        } catch {
          // Handled safely
        }
      }
    );
    return () => unsub();
  }, [isSuperAdmin]);

  if (!isSuperAdmin) {
    return null;
  }

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    const cleanUsername = usernameInput.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFeedback({ type: 'err', text: 'সঠিক ইমেইল ঠিকানা লিখুন।' });
      return;
    }
    if (cleanEmail === PRIMARY_SUPER_ADMIN_EMAIL) {
      setFeedback({ type: 'err', text: 'প্রাইমারি Super Admin অ্যাকাউন্ট পরিবর্তনযোগ্য নয়।' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const firestore = requireDb();
      const now = serverTimestamp();
      const batch = writeBatch(firestore);

      batch.set(doc(firestore, 'rbac_roles', cleanEmail), {
        email: cleanEmail,
        uid: '',
        username: cleanUsername,
        displayName: nameInput.trim() || cleanEmail.split('@')[0],
        role: roleInput,
        status: 'active',
        addedByEmail: user?.email?.toLowerCase() || PRIMARY_SUPER_ADMIN_EMAIL,
        createdAt: now,
        updatedAt: now,
      });

      if (cleanUsername) {
        batch.set(doc(firestore, 'admin_usernames', cleanUsername), {
          username: cleanUsername,
          email: cleanEmail,
          active: true,
          updatedAt: now,
        });
      }

      await batch.commit();
      await logAdminActivity(
        'add_staff_role',
        'admins',
        cleanEmail,
        cleanUsername || cleanEmail,
        `Assigned role ${roleInput}`
      );
      setEmailInput('');
      setUsernameInput('');
      setNameInput('');
      setFeedback({
        type: 'ok',
        text: `${cleanEmail} কে ${ROLE_LABEL[roleInput]} হিসেবে অনুমোদন দেওয়া হয়েছে। Firebase Authentication (Email/Password)-এ একই ইমেইল দিয়ে অ্যাকাউন্ট তৈরি থাকতে হবে।`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'রোল যুক্ত করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।' });
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (entry: RbacRoleEntry, nextRole: 'admin' | 'support_agent') => {
    if (entry.email === PRIMARY_SUPER_ADMIN_EMAIL) return;
    setFeedback(null);
    try {
      const firestore = requireDb();
      const batch = writeBatch(firestore);
      batch.update(doc(firestore, 'rbac_roles', entry.email), {
        role: nextRole,
        updatedAt: serverTimestamp(),
      });
      if (entry.uid) {
        batch.update(doc(firestore, 'users', entry.uid), {
          role: nextRole,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      await logAdminActivity('change_role', 'admins', entry.email, nextRole);
      setFeedback({ type: 'ok', text: `${entry.email}-এর রোল আপডেট হয়েছে।` });
    } catch {
      setFeedback({ type: 'err', text: 'রোল পরিবর্তন ব্যর্থ হয়েছে।' });
    }
  };

  const handleToggleStatus = async (entry: RbacRoleEntry) => {
    if (entry.email === PRIMARY_SUPER_ADMIN_EMAIL) return;
    const nextStatus: AccountStatus = entry.status === 'active' ? 'disabled' : 'active';
    setFeedback(null);
    try {
      const firestore = requireDb();
      const batch = writeBatch(firestore);
      batch.update(doc(firestore, 'rbac_roles', entry.email), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      if (entry.username) {
        batch.set(
          doc(firestore, 'admin_usernames', entry.username.toLowerCase()),
          {
            username: entry.username.toLowerCase(),
            email: entry.email,
            active: nextStatus === 'active',
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      if (entry.uid) {
        batch.update(doc(firestore, 'users', entry.uid), {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      await logAdminActivity('toggle_staff_status', 'admins', entry.email, nextStatus);
      setFeedback({
        type: 'ok',
        text: `${entry.email} এখন ${nextStatus === 'active' ? 'সক্রিয়' : 'নিষ্ক্রিয়'}।`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'স্ট্যাটাস পরিবর্তন করা যায়নি।' });
    }
  };

  const handleRemoveRole = async (entry: RbacRoleEntry) => {
    if (entry.email === PRIMARY_SUPER_ADMIN_EMAIL) return;
    setFeedback(null);
    try {
      const firestore = requireDb();
      const batch = writeBatch(firestore);
      batch.delete(doc(firestore, 'rbac_roles', entry.email));
      if (entry.username) {
        batch.delete(doc(firestore, 'admin_usernames', entry.username.toLowerCase()));
      }
      if (entry.uid) {
        batch.update(doc(firestore, 'users', entry.uid), {
          role: 'customer',
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      await logAdminActivity('remove_staff_role', 'admins', entry.email, entry.email);
      setFeedback({ type: 'ok', text: `${entry.email} কে অ্যাডমিন তালিকা থেকে সরানো হয়েছে।` });
    } catch {
      setFeedback({ type: 'err', text: 'অপসারণ ব্যর্থ হয়েছে।' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#FDE047] bg-[#FEFCE8] p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#DC1F26]" />
          <div>
            <h3 className="text-sm font-bold text-[#1C1917]">
              Super Admin Governance Protected (Email/Password Only)
            </h3>
            <p className="mt-0.5 text-xs text-[#57534E]">
              <span className="font-mono font-semibold text-[#1C1917]">
                {PRIMARY_SUPER_ADMIN_EMAIL}
              </span>{' '}
              হলো অপরিবর্তনীয় প্রধান Super Admin। পাসওয়ার্ড শুধুমাত্র Firebase Authentication-এ সুরক্ষিত থাকে—কোনো ডাটাবেস বা সোর্স কোডে পাসওয়ার্ড সংরক্ষণ করা হয় না।
            </p>
          </div>
        </div>
      </div>

      {/* Add Admin or Support Agent Form */}
      <form
        onSubmit={handleAddRole}
        className="rounded-xl border border-[#E7E5E4] bg-white p-5 sm:p-6"
      >
        <h2 className="font-display text-2xl font-bold text-[#1C1917]">
          Add Admin or Support Agent
        </h2>
        <p className="mt-1 text-xs text-[#57534E]">
          Email এবং ঐচ্ছিক Username দিয়ে নতুন Admin বা Support Agent অনুমোদন দিন (Firebase Auth Email/Password ব্যবহারকারীর জন্য)।
        </p>

        {feedback && (
          <div
            className={`mt-4 rounded-lg border px-3 py-2 text-xs font-semibold ${
              feedback.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-[#B91C1C]'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Staff Email *
            </label>
            <input
              type="email"
              required
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="staff@homerecipefoods.com"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs focus:border-[#DC1F26] focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Username (Opt.)
            </label>
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="e.g. rahim"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-xs focus:border-[#DC1F26] focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Display Name
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Staff Name"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs focus:border-[#DC1F26] focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Role *
            </label>
            <select
              value={roleInput}
              onChange={(e) =>
                setRoleInput(e.target.value as 'admin' | 'support_agent')
              }
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs focus:border-[#DC1F26] focus:outline-none"
            >
              <option value="admin">Admin</option>
              <option value="support_agent">Support Agent</option>
            </select>
          </div>
          <div className="flex items-end sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{saving ? 'যোগ হচ্ছে...' : 'Add Role'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Role Registry List */}
      <div className="overflow-hidden rounded-xl border border-[#E7E5E4] bg-white">
        <div className="border-b border-[#E7E5E4] bg-[#FAFAF8] px-5 py-3">
          <h3 className="text-sm font-bold text-[#1C1917]">
            Authorized Administrators &amp; Support Agents ({roles.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E7E5E4] text-[#57534E]">
              <tr>
                <th className="px-4 py-3 font-semibold">User / Email / Username</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F4F0]">
              {roles.map((r) => {
                const isPrimary = r.email === PRIMARY_SUPER_ADMIN_EMAIL;
                return (
                  <tr key={r.email} className="hover:bg-[#FAFAF8]">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#1C1917]">
                        {r.displayName}
                        {r.username ? (
                          <span className="ml-2 rounded bg-[#F5F4F0] px-1.5 py-0.5 font-mono text-[10px] text-[#57534E]">
                            @{r.username}
                          </span>
                        ) : null}
                      </p>
                      <p className="font-mono text-[11px] text-[#57534E]">{r.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {isPrimary ? (
                        <span className="inline-flex items-center gap-1 rounded bg-[#1C1917] px-2.5 py-1 text-[11px] font-bold text-[#FACC15]">
                          <Shield className="h-3 w-3" />
                          <span>Super Admin</span>
                        </span>
                      ) : (
                        <select
                          value={r.role}
                          onChange={(e) =>
                            handleRoleChange(
                              r,
                              e.target.value as 'admin' | 'support_agent'
                            )
                          }
                          className="rounded-md border border-[#D6D3D1] bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1917]"
                        >
                          <option value="admin">Admin</option>
                          <option value="support_agent">Support Agent</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                          r.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-[#B91C1C]'
                        }`}
                      >
                        {r.status === 'active' ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isPrimary ? (
                        <span className="text-[11px] font-medium text-[#78716C]">
                          Protected Primary
                        </span>
                      ) : (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(r)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E7E5E4] px-2.5 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26]"
                          >
                            {r.status === 'active' ? (
                              <>
                                <UserX className="h-3 w-3 text-[#DC1F26]" />
                                <span>Disable</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-3 w-3 text-emerald-700" />
                                <span>Enable</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveRole(r)}
                            title="Remove Role"
                            className="cursor-pointer rounded-md border border-[#E7E5E4] p-1.5 text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ========================
// 10. USER MANAGEMENT (Super Admin Only)
// ========================
export function AdminUserManagementPanel() {
  const { user, isSuperAdmin } = useStore();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !isSuperAdmin) {
      setUsers([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'users'), orderBy('lastLoginAt', 'desc')),
      (snap) => {
        setUsers(snap.docs.map((d) => d.data() as UserAccount));
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'users');
        } catch {
          // Handled cleanly
        }
      }
    );
    return () => unsub();
  }, [isSuperAdmin]);

  if (!isSuperAdmin) return null;

  const updateUserRole = async (
    target: UserAccount,
    nextRole: 'customer' | 'admin' | 'support_agent'
  ) => {
    if (target.email === PRIMARY_SUPER_ADMIN_EMAIL) return;
    setFeedback(null);
    try {
      const firestore = requireDb();
      const batch = writeBatch(firestore);
      batch.update(doc(firestore, 'users', target.uid), {
        role: nextRole,
        updatedAt: serverTimestamp(),
      });
      if (nextRole === 'customer') {
        batch.delete(doc(firestore, 'rbac_roles', target.email));
      } else {
        batch.set(doc(firestore, 'rbac_roles', target.email), {
          email: target.email,
          uid: target.uid,
          displayName: target.displayName,
          role: nextRole as StaffRole,
          status: target.status,
          addedByEmail: user?.email?.toLowerCase() || PRIMARY_SUPER_ADMIN_EMAIL,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      setFeedback(`${target.email} এখন ${ROLE_LABEL[nextRole]} রোলে আপডেট হয়েছে।`);
    } catch {
      setFeedback('ইউজারের রোল আপডেট করা যায়নি।');
    }
  };

  const toggleUserStatus = async (target: UserAccount) => {
    if (target.email === PRIMARY_SUPER_ADMIN_EMAIL) return;
    const nextStatus: AccountStatus = target.status === 'active' ? 'disabled' : 'active';
    setFeedback(null);
    try {
      const firestore = requireDb();
      const batch = writeBatch(firestore);
      batch.update(doc(firestore, 'users', target.uid), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      if (target.role === 'admin' || target.role === 'support_agent') {
        batch.update(doc(firestore, 'rbac_roles', target.email), {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      setFeedback(`${target.email} স্ট্যাটাস: ${nextStatus}`);
    } catch {
      setFeedback('স্ট্যাটাস আপডেট ব্যর্থ হয়েছে।');
    }
  };

  const filtered = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-bold text-[#1C1917]">
          User Management
        </h2>
        <p className="text-xs text-[#57534E]">
          সাইন-ইন করা সকল ব্যবহারকারী দেখুন, রোল অ্যাসাইন করুন বা অ্যাকাউন্ট নিষ্ক্রিয় করুন।
        </p>
      </div>

      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          {feedback}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="নাম বা ইমেইল দিয়ে খুঁজুন..."
          className="w-full max-w-xs rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
        >
          <option value="all">সব রোল</option>
          <option value="super_admin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="support_agent">Support Agent</option>
          <option value="customer">Customer</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E7E5E4] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E7E5E4] bg-[#FAFAF8] text-[#57534E]">
              <tr>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F4F0]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[#78716C]">
                    কোনো নিবন্ধিত ব্যবহারকারী পাওয়া যায়নি।
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const isPrimary = u.email === PRIMARY_SUPER_ADMIN_EMAIL;
                  return (
                    <tr key={u.uid} className="hover:bg-[#FAFAF8]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Users className="h-4 w-4 text-[#78716C]" />
                          <div>
                            <p className="font-semibold text-[#1C1917]">
                              {u.displayName}
                            </p>
                            <p className="font-mono text-[11px] text-[#57534E]">
                              {u.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isPrimary ? (
                          <span className="inline-flex items-center gap-1 rounded bg-[#1C1917] px-2.5 py-1 text-[11px] font-bold text-[#FACC15]">
                            Super Admin
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={(e) =>
                              updateUserRole(
                                u,
                                e.target.value as 'customer' | 'admin' | 'support_agent'
                              )
                            }
                            className="rounded-md border border-[#D6D3D1] bg-white px-2 py-1 text-xs font-semibold"
                          >
                            <option value="customer">Customer</option>
                            <option value="support_agent">Support Agent</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                            u.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-red-50 text-[#B91C1C]'
                          }`}
                        >
                          {u.status === 'active' ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isPrimary ? (
                          <span className="text-[11px] text-[#78716C]">Immutable</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleUserStatus(u)}
                            className="cursor-pointer rounded-md border border-[#E7E5E4] px-2.5 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26]"
                          >
                            {u.status === 'active' ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ========================
// 11. SECURITY & FIREBASE APP OVERVIEW (Super Admin Only)
// ========================
export function AdminSecurityConfigPanel() {
  const { isSuperAdmin } = useStore();
  if (!isSuperAdmin) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-[#1C1917]">
          Security &amp; Firebase Application Settings
        </h2>
        <p className="text-xs text-[#57534E]">
          Firebase প্রজেক্ট ({firebasePublicInfo.expectedProjectId}) কনফিগারেশন, তিন-স্তরের রোল হায়ারার্কি এবং নিরাপত্তা নিয়মাবলী।
        </p>
      </div>

      {/* Public Non-Secret Firebase Configuration */}
      <div className="rounded-xl border border-[#E7E5E4] bg-white p-5">
        <div className="flex items-center justify-between gap-2 border-b border-[#F5F4F0] pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[#DC1F26]" />
            <h3 className="text-sm font-bold text-[#1C1917]">
              Target Firebase Project (Public Identifiers Only)
            </h3>
          </div>
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-bold ${
              firebaseConnectionStatus === 'connected'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-800'
            }`}
          >
            {firebaseConnectionStatus}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <div className="rounded-lg bg-[#FAFAF8] p-3">
            <p className="text-[#78716C]">Expected Firebase Project ID</p>
            <p className="mt-0.5 font-mono font-semibold text-[#1C1917]">
              {firebasePublicInfo.expectedProjectId}
            </p>
          </div>
          <div className="rounded-lg bg-[#FAFAF8] p-3">
            <p className="text-[#78716C]">Configured Project ID</p>
            <p className="mt-0.5 font-mono font-semibold text-[#1C1917]">
              {firebasePublicInfo.projectId || '(Not set in VITE_FIREBASE_PROJECT_ID)'}
            </p>
          </div>
          <div className="rounded-lg bg-[#FAFAF8] p-3">
            <p className="text-[#78716C]">Auth Domain</p>
            <p className="mt-0.5 font-mono font-semibold text-[#1C1917]">
              {firebasePublicInfo.authDomain || '(Not set)'}
            </p>
          </div>
          <div className="rounded-lg bg-[#FAFAF8] p-3">
            <p className="text-[#78716C]">Primary Super Admin</p>
            <p className="mt-0.5 font-mono font-semibold text-[#DC1F26]">
              {PRIMARY_SUPER_ADMIN_EMAIL}
            </p>
          </div>
        </div>

        {firebaseMissingFields.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Missing env variables: {firebaseMissingFields.join(', ')}
          </div>
        )}
      </div>

      {/* Role Hierarchy Matrix */}
      <div className="rounded-xl border border-[#E7E5E4] bg-white p-5">
        <h3 className="font-display text-lg font-bold text-[#1C1917]">
          Enforced Role Hierarchy &amp; Security Guarantees
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-[#1C1917] bg-[#1C1917] p-4 text-white">
            <p className="text-xs font-bold text-[#FACC15]">1. Super Admin</p>
            <p className="mt-1 font-mono text-[11px] text-[#D6D3D1]">
              {PRIMARY_SUPER_ADMIN_EMAIL}
            </p>
            <ul className="mt-3 space-y-1.5 text-[11px] text-[#E7E5E4]">
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#FACC15]" />
                <span>Full catalog, sections, SEO, media &amp; settings</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#FACC15]" />
                <span>Complaints, Live Chat, AI Config &amp; Logs</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#FACC15]" />
                <span>Admin, Support Agent &amp; User Management</span>
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF8] p-4">
            <p className="text-xs font-bold text-[#DC1F26]">2. Admin</p>
            <p className="mt-1 text-[11px] text-[#57534E]">Standard Catalog Access</p>
            <ul className="mt-3 space-y-1.5 text-[11px] text-[#44403C]">
              <li>• Manage Products, Categories &amp; Occasions</li>
              <li>• Manage Showrooms, Banners &amp; Greetings</li>
              <li>• Blocked from Super Admin, Users, Roles &amp; Security</li>
            </ul>
          </div>

          <div className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF8] p-4">
            <p className="text-xs font-bold text-[#1C1917]">3. Support Agent</p>
            <p className="mt-1 text-[11px] text-[#57534E]">Customer Support Access</p>
            <ul className="mt-3 space-y-1.5 text-[11px] text-[#44403C]">
              <li>• Manage Customer Live Chat &amp; Online status</li>
              <li>• View &amp; update Customer Complaints</li>
              <li>• Blocked from Catalog, Admins &amp; Site Settings</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
