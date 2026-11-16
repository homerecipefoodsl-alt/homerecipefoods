import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  Edit3,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
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
import {
  ALL_PERMISSION_DEFINITIONS,
  DEFAULT_ROLE_PERMISSIONS,
  type AccountStatus,
  type PermissionKey,
  type RbacRoleEntry,
  type StaffRole,
  type UserAccount,
  type UserRole,
} from '../../types';

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  support_agent: 'Support Agent',
  customer: 'Customer',
};

const PERMISSION_PRESETS: ReadonlyArray<{
  label: string;
  permissions: PermissionKey[];
}> = [
  {
    label: 'Catalog Manager',
    permissions: [
      'dashboard_view',
      'products_view',
      'products_add',
      'products_edit',
      'categories_manage',
      'reports_view',
    ],
  },
  {
    label: 'Showroom & Support Manager',
    permissions: [
      'dashboard_view',
      'products_view',
      'showrooms_manage',
      'complaints_manage',
      'chat_manage',
      'reports_view',
    ],
  },
  {
    label: 'Full Operations Manager',
    permissions: [
      'dashboard_view',
      'products_view',
      'products_add',
      'products_edit',
      'categories_manage',
      'showrooms_manage',
      'banners_manage',
      'complaints_manage',
      'chat_manage',
      'reports_view',
      'seo_manage',
    ],
  },
];

function generateUniqueManagerId(existingRoles: RbacRoleEntry[]): string {
  const year = new Date().getFullYear();
  const existingIds = new Set(
    existingRoles
      .map((r) => (r.managerId || '').trim().toUpperCase())
      .filter(Boolean)
  );
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    let suffix = '';
    for (let i = 0; i < 4; i += 1) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    const candidate = `MGR-${year}-${suffix}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }
  return `MGR-${year}-${Date.now().toString().slice(-4)}`;
}

function formatFirestoreDate(val: unknown): string {
  if (!val) return '—';
  if (typeof val === 'object' && val !== null && 'toDate' in val) {
    const fn = (val as { toDate?: () => Date }).toDate;
    if (typeof fn === 'function') {
      return fn().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  }
  return '—';
}

// ========================
// 9. ADMIN & MANAGER MANAGEMENT (Super Admin + manager_manage)
// ========================
export function AdminRoleManagementPanel() {
  const { user, isSuperAdmin, hasPermission, logAdminActivity } = useStore();
  const canManageManagers = isSuperAdmin || hasPermission('manager_manage');

  const [roles, setRoles] = useState<RbacRoleEntry[]>([]);
  const [creationMode, setCreationMode] = useState<'new_auth' | 'existing_auth'>('new_auth');
  const [roleInput, setRoleInput] = useState<'admin' | 'manager' | 'support_agent'>(
    isSuperAdmin ? 'manager' : 'manager'
  );
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [managerIdInput, setManagerIdInput] = useState('');
  const [managerTitleInput, setManagerTitleInput] = useState('');
  const [statusInput, setStatusInput] = useState<'active' | 'suspended'>('active');
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionKey[]>(
    DEFAULT_ROLE_PERMISSIONS.manager
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [editingEntry, setEditingEntry] = useState<RbacRoleEntry | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editManagerId, setEditManagerId] = useState('');
  const [editManagerTitle, setEditManagerTitle] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'manager' | 'support_agent'>('manager');
  const [editStatus, setEditStatus] = useState<AccountStatus>('active');
  const [editPermissions, setEditPermissions] = useState<PermissionKey[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    if (!db || !canManageManagers) {
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
          // Handled cleanly
        }
      }
    );
    return () => unsub();
  }, [canManageManagers]);

  useEffect(() => {
    if (roleInput === 'manager' && !managerIdInput) {
      setManagerIdInput(generateUniqueManagerId(roles));
    }
  }, [roleInput, roles, managerIdInput]);

  if (!canManageManagers) {
    return null;
  }

  const handleRoleSelectChange = (nextRole: 'admin' | 'manager' | 'support_agent') => {
    const safeRole = isSuperAdmin ? nextRole : 'manager';
    setRoleInput(safeRole);
    setSelectedPermissions(DEFAULT_ROLE_PERMISSIONS[safeRole]);
    if (safeRole === 'manager' && !managerIdInput) {
      setManagerIdInput(generateUniqueManagerId(roles));
    }
  };

  const toggleCreatePermission = (perm: PermissionKey) => {
    if (!isSuperAdmin && perm === 'admin_manage') return;
    setSelectedPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const toggleEditPermission = (perm: PermissionKey) => {
    if (!isSuperAdmin && perm === 'admin_manage') return;
    setEditPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveRole: 'admin' | 'manager' | 'support_agent' = isSuperAdmin
      ? roleInput
      : 'manager';
    const cleanEmail = emailInput.trim().toLowerCase();
    const cleanName = nameInput.trim();
    const cleanPhone = phoneInput.trim().slice(0, 40);
    const cleanUsername = usernameInput
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
    const cleanManagerId =
      effectiveRole === 'manager'
        ? (managerIdInput.trim() || generateUniqueManagerId(roles)).toUpperCase()
        : '';
    const cleanManagerTitle =
      effectiveRole === 'manager' ? managerTitleInput.trim().slice(0, 100) : '';

    if (!cleanName) {
      setFeedback({ type: 'err', text: 'অনুগ্রহ করে স্টাফ/ম্যানেজারের পূর্ণ নাম লিখুন।' });
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFeedback({ type: 'err', text: 'সঠিক ইমেইল ঠিকানা লিখুন।' });
      return;
    }
    if (cleanEmail === PRIMARY_SUPER_ADMIN_EMAIL) {
      setFeedback({ type: 'err', text: 'প্রাইমারি Super Admin অ্যাকাউন্ট পরিবর্তনযোগ্য নয়।' });
      return;
    }
    if (roles.some((r) => r.email.toLowerCase() === cleanEmail)) {
      setFeedback({
        type: 'err',
        text: `${cleanEmail} ইতিমধ্যেই Staff/Role তালিকায় রয়েছে। তালিকা থেকে Edit করুন।`,
      });
      return;
    }
    if (cleanUsername && cleanUsername === 'mahmud') {
      setFeedback({ type: 'err', text: 'mahmud ইউজারনেমটি সংরক্ষিত।' });
      return;
    }
    if (
      cleanUsername &&
      roles.some((r) => (r.username || '').toLowerCase() === cleanUsername)
    ) {
      setFeedback({
        type: 'err',
        text: `Username "@${cleanUsername}" ইতিমধ্যেই ব্যবহৃত হচ্ছে। ভিন্ন Username দিন।`,
      });
      return;
    }
    if (effectiveRole === 'manager') {
      if (!/^[A-Za-z0-9_-]{3,40}$/.test(cleanManagerId)) {
        setFeedback({
          type: 'err',
          text: 'Manager ID অবশ্যই শুধুমাত্র অক্ষর, সংখ্যা, - বা _ দিয়ে ৩-৪০ অক্ষরের হতে হবে।',
        });
        return;
      }
      if (
        roles.some(
          (r) => (r.managerId || '').trim().toUpperCase() === cleanManagerId
        )
      ) {
        setFeedback({
          type: 'err',
          text: `Manager ID "${cleanManagerId}" ইতিমধ্যেই ব্যবহৃত হচ্ছে। Regenerate বাটনে ক্লিক করুন।`,
        });
        return;
      }
    }
    if (creationMode === 'new_auth' && passwordInput.length < 6) {
      setFeedback({
        type: 'err',
        text: 'নতুন Firebase Auth অ্যাকাউন্ট তৈরির জন্য কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন।',
      });
      return;
    }

    const sanitizedPermissions = selectedPermissions.filter(
      (p) => isSuperAdmin || p !== 'admin_manage'
    );

    setSaving(true);
    setFeedback(null);

    let createdUid = '';
    let rollbackToken = '';
    let verificationEmailSent = false;

    try {
      if (creationMode === 'new_auth') {
        if (!user) {
          throw new Error('আপনার অ্যাডমিন সেশন পাওয়া যায়নি।');
        }
        const idToken = await user.getIdToken();
        const apiResp = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            email: cleanEmail,
            password: passwordInput,
            displayName: cleanName,
            role: effectiveRole,
          }),
        });
        const apiJson = (await apiResp.json()) as {
          ok?: boolean;
          uid?: string;
          rollbackToken?: string;
          verificationEmailSent?: boolean;
          error?: string;
        };
        if (!apiResp.ok || !apiJson.uid) {
          throw new Error(apiJson.error || 'Firebase Auth অ্যাকাউন্ট তৈরি ব্যর্থ হয়েছে।');
        }
        createdUid = apiJson.uid;
        rollbackToken = apiJson.rollbackToken || '';
        verificationEmailSent = Boolean(apiJson.verificationEmailSent);
      }

      const firestore = requireDb();
      const now = serverTimestamp();
      const batch = writeBatch(firestore);
      const isActive = statusInput === 'active';

      const rbacPayload: Record<string, unknown> = {
        email: cleanEmail,
        uid: createdUid,
        username: cleanUsername,
        displayName: cleanName,
        phone: cleanPhone,
        permissions: sanitizedPermissions,
        role: effectiveRole,
        status: statusInput,
        addedByEmail: user?.email?.toLowerCase() || PRIMARY_SUPER_ADMIN_EMAIL,
        createdAt: now,
        updatedAt: now,
      };
      if (effectiveRole === 'manager') {
        rbacPayload.managerId = cleanManagerId;
        rbacPayload.managerTitle = cleanManagerTitle || 'Store Manager';
      }
      batch.set(doc(firestore, 'rbac_roles', cleanEmail), rbacPayload);

      if (createdUid) {
        const adminPayload: Record<string, unknown> = {
          uid: createdUid,
          email: cleanEmail,
          username: cleanUsername,
          display_name: cleanName,
          phone: cleanPhone,
          permissions: sanitizedPermissions,
          role: effectiveRole,
          active: isActive,
          status: statusInput,
          created_by: user?.email?.toLowerCase() || PRIMARY_SUPER_ADMIN_EMAIL,
          created_at: now,
          updated_at: now,
        };
        if (effectiveRole === 'manager') {
          adminPayload.manager_id = cleanManagerId;
          adminPayload.manager_title = cleanManagerTitle || 'Store Manager';
        }
        batch.set(doc(firestore, 'admins', createdUid), adminPayload);

        if (isSuperAdmin) {
          batch.set(doc(firestore, 'users', createdUid), {
            uid: createdUid,
            email: cleanEmail,
            displayName: cleanName,
            photoUrl: '',
            role: effectiveRole,
            status: statusInput,
            createdAt: now,
            updatedAt: now,
            lastLoginAt: now,
          });
        }
      }

      if (cleanUsername) {
        batch.set(doc(firestore, 'admin_usernames', cleanUsername), {
          username: cleanUsername,
          email: cleanEmail,
          active: isActive,
          updatedAt: now,
        });
      }

      try {
        await batch.commit();
      } catch (fsErr) {
        // Automatic rollback of newly created Firebase Auth user if Firestore batch fails
        if (rollbackToken && user) {
          try {
            const idToken = await user.getIdToken();
            await fetch('/api/admin/rollback-user', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({ rollbackToken }),
            });
          } catch {
            // Best-effort rollback
          }
        }
        throw fsErr;
      }

      await logAdminActivity(
        'create_staff',
        'admins',
        cleanEmail,
        cleanManagerId || cleanUsername || cleanEmail,
        `Created ${effectiveRole} (${cleanName})${cleanManagerId ? ` [${cleanManagerId}]` : ''}`
      );

      setNameInput('');
      setEmailInput('');
      setPhoneInput('');
      setUsernameInput('');
      setPasswordInput('');
      setManagerTitleInput('');
      setManagerIdInput(
        effectiveRole === 'manager' ? generateUniqueManagerId(roles) : ''
      );
      setStatusInput('active');

      setFeedback({
        type: 'ok',
        text:
          creationMode === 'new_auth'
            ? `${cleanName} (${cleanEmail}) কে ${ROLE_LABEL[effectiveRole]}${
                cleanManagerId ? ` · ID: ${cleanManagerId}` : ''
              } হিসেবে Firebase Auth + Firestore-এ সফলভাবে তৈরি করা হয়েছে!${
                verificationEmailSent
                  ? ' ভেরিফিকেশন ইমেইল পাঠানো হয়েছে (লগইনের আগে ইমেইল ভেরিফাই করতে হবে)।'
                  : ''
              }`
            : `${cleanName} (${cleanEmail}) কে ${ROLE_LABEL[effectiveRole]} হিসেবে অনুমোদন দেওয়া হয়েছে।`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text:
          err instanceof Error && err.message
            ? err.message
            : 'অ্যাকাউন্ট যুক্ত করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।',
      });
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (entry: RbacRoleEntry) => {
    if (entry.email === PRIMARY_SUPER_ADMIN_EMAIL) return;
    if (!isSuperAdmin && entry.role !== 'manager') return;
    setEditingEntry(entry);
    setEditName(entry.displayName || '');
    setEditPhone(entry.phone || '');
    setEditUsername(entry.username || '');
    setEditManagerId(entry.managerId || '');
    setEditManagerTitle(entry.managerTitle || '');
    setEditRole(
      entry.role === 'admin' || entry.role === 'support_agent'
        ? entry.role
        : 'manager'
    );
    setEditStatus(entry.status || 'active');
    setEditPermissions(
      Array.isArray(entry.permissions)
        ? entry.permissions
        : DEFAULT_ROLE_PERMISSIONS[entry.role] ?? []
    );
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry || editingEntry.email === PRIMARY_SUPER_ADMIN_EMAIL) return;

    const cleanName = editName.trim();
    const cleanPhone = editPhone.trim().slice(0, 40);
    const cleanUsername = editUsername
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
    const targetRole: 'admin' | 'manager' | 'support_agent' = isSuperAdmin
      ? editRole
      : 'manager';
    const cleanManagerId =
      targetRole === 'manager'
        ? (editManagerId.trim() || generateUniqueManagerId(roles)).toUpperCase()
        : '';
    const cleanManagerTitle =
      targetRole === 'manager' ? editManagerTitle.trim().slice(0, 100) : '';

    if (!cleanName) {
      setFeedback({ type: 'err', text: 'নাম খালি রাখা যাবে না।' });
      return;
    }
    if (
      cleanUsername &&
      roles.some(
        (r) =>
          r.email !== editingEntry.email &&
          (r.username || '').toLowerCase() === cleanUsername
      )
    ) {
      setFeedback({ type: 'err', text: `Username "@${cleanUsername}" ইতিমধ্যেই ব্যবহৃত।` });
      return;
    }
    if (
      targetRole === 'manager' &&
      roles.some(
        (r) =>
          r.email !== editingEntry.email &&
          (r.managerId || '').trim().toUpperCase() === cleanManagerId
      )
    ) {
      setFeedback({ type: 'err', text: `Manager ID "${cleanManagerId}" ইতিমধ্যেই ব্যবহৃত।` });
      return;
    }

    const sanitizedPerms = editPermissions.filter(
      (p) => isSuperAdmin || p !== 'admin_manage'
    );

    setEditSaving(true);
    setFeedback(null);
    try {
      const firestore = requireDb();
      const now = serverTimestamp();
      const batch = writeBatch(firestore);
      const isActive = editStatus === 'active';

      const rbacUpdate: Record<string, unknown> = {
        displayName: cleanName,
        phone: cleanPhone,
        username: cleanUsername,
        permissions: sanitizedPerms,
        status: editStatus,
        updatedAt: now,
      };
      if (isSuperAdmin) {
        rbacUpdate.role = targetRole;
      }
      if (targetRole === 'manager') {
        rbacUpdate.managerId = cleanManagerId;
        rbacUpdate.managerTitle = cleanManagerTitle || 'Store Manager';
      }
      batch.update(doc(firestore, 'rbac_roles', editingEntry.email), rbacUpdate);

      if (editingEntry.uid) {
        const adminUpdate: Record<string, unknown> = {
          display_name: cleanName,
          phone: cleanPhone,
          username: cleanUsername,
          permissions: sanitizedPerms,
          role: targetRole,
          active: isActive,
          status: editStatus,
          updated_at: now,
        };
        if (targetRole === 'manager') {
          adminUpdate.manager_id = cleanManagerId;
          adminUpdate.manager_title = cleanManagerTitle || 'Store Manager';
        }
        batch.update(doc(firestore, 'admins', editingEntry.uid), adminUpdate);

        if (isSuperAdmin) {
          batch.update(doc(firestore, 'users', editingEntry.uid), {
            displayName: cleanName,
            role: targetRole,
            status: editStatus,
            updatedAt: now,
          });
        }
      }

      const oldUsername = (editingEntry.username || '').trim().toLowerCase();
      if (isSuperAdmin && oldUsername && oldUsername !== cleanUsername) {
        batch.delete(doc(firestore, 'admin_usernames', oldUsername));
      }
      if (cleanUsername) {
        batch.set(
          doc(firestore, 'admin_usernames', cleanUsername),
          {
            username: cleanUsername,
            email: editingEntry.email,
            active: isActive,
            updatedAt: now,
          },
          { merge: true }
        );
      }

      await batch.commit();
      await logAdminActivity(
        'update_staff',
        'admins',
        editingEntry.email,
        cleanManagerId || cleanName,
        `Updated ${editingEntry.email} (${targetRole}, ${editStatus})`
      );
      setEditingEntry(null);
      setFeedback({ type: 'ok', text: `${editingEntry.email} প্রোফাইল আপডেট হয়েছে।` });
    } catch {
      setFeedback({ type: 'err', text: 'আপডেট ব্যর্থ হয়েছে। পারমিশন যাচাই করুন।' });
    } finally {
      setEditSaving(false);
    }
  };

  const handleToggleStatus = async (entry: RbacRoleEntry) => {
    if (entry.email === PRIMARY_SUPER_ADMIN_EMAIL) return;
    if (!isSuperAdmin && entry.role !== 'manager') return;
    const nextStatus: AccountStatus = entry.status === 'active' ? 'suspended' : 'active';
    setFeedback(null);
    try {
      const firestore = requireDb();
      const batch = writeBatch(firestore);
      const isActive = nextStatus === 'active';
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
            active: isActive,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      if (entry.uid) {
        batch.update(doc(firestore, 'admins', entry.uid), {
          active: isActive,
          status: nextStatus,
          updated_at: serverTimestamp(),
        });
        if (isSuperAdmin) {
          batch.update(doc(firestore, 'users', entry.uid), {
            status: nextStatus,
            updatedAt: serverTimestamp(),
          });
        }
      }
      await batch.commit();
      await logAdminActivity('toggle_staff_status', 'admins', entry.email, nextStatus);
      setFeedback({
        type: 'ok',
        text: `${entry.email} এখন ${nextStatus === 'active' ? 'Active (সক্রিয়)' : 'Suspended (স্থগিত)'}।`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'স্ট্যাটাস পরিবর্তন করা যায়নি।' });
    }
  };

  const handleRemoveRole = async (entry: RbacRoleEntry) => {
    if (!isSuperAdmin || entry.email === PRIMARY_SUPER_ADMIN_EMAIL) return;
    setFeedback(null);
    try {
      const firestore = requireDb();
      const batch = writeBatch(firestore);
      batch.delete(doc(firestore, 'rbac_roles', entry.email));
      if (entry.username) {
        batch.delete(doc(firestore, 'admin_usernames', entry.username.toLowerCase()));
      }
      if (entry.uid) {
        batch.delete(doc(firestore, 'admins', entry.uid));
        batch.update(doc(firestore, 'users', entry.uid), {
          role: 'customer',
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      await logAdminActivity('remove_staff_role', 'admins', entry.email, entry.email);
      setFeedback({ type: 'ok', text: `${entry.email} কে স্টাফ তালিকা থেকে সরানো হয়েছে।` });
    } catch {
      setFeedback({ type: 'err', text: 'অপসারণ ব্যর্থ হয়েছে।' });
    }
  };

  const filteredRoles = useMemo(() => {
    return roles.filter((r) => {
      if (roleFilter !== 'all' && r.role !== roleFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return (
          r.email.toLowerCase().includes(q) ||
          (r.displayName || '').toLowerCase().includes(q) ||
          (r.username || '').toLowerCase().includes(q) ||
          (r.managerId || '').toLowerCase().includes(q) ||
          (r.managerTitle || '').toLowerCase().includes(q) ||
          (r.phone || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [roles, roleFilter, statusFilter, searchQuery]);

  const adminCount = roles.filter((r) => r.role === 'admin' && r.status === 'active').length;
  const managerCount = roles.filter((r) => r.role === 'manager' && r.status === 'active').length;
  const supportCount = roles.filter((r) => r.role === 'support_agent' && r.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Governance Banner */}
      <div className="rounded-xl border border-[#FDE047] bg-[#FEFCE8] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#DC1F26]" />
            <div>
              <h3 className="text-sm font-bold text-[#1C1917]">
                Admin &amp; Manager Governance (Firebase Auth + Unique Manager ID)
              </h3>
              <p className="mt-0.5 text-xs text-[#57534E]">
                Primary Super Admin:{' '}
                <span className="font-mono font-semibold text-[#1C1917]">
                  {PRIMARY_SUPER_ADMIN_EMAIL}
                </span>{' '}
                (অপরিবর্তনীয়)। নতুন Admin বা Manager তৈরি করলে Firebase Authentication-এ সুরক্ষিত অ্যাকাউন্ট এবং Firestore-এ রোল + পারমিশন ট্রানজ্যাকশনালভাবে যুক্ত হয়।
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="rounded bg-white px-2.5 py-1 text-[#1C1917] shadow-xs">
              Admins: {adminCount}
            </span>
            <span className="rounded bg-white px-2.5 py-1 text-[#DC1F26] shadow-xs">
              Managers: {managerCount}
            </span>
            <span className="rounded bg-white px-2.5 py-1 text-emerald-700 shadow-xs">
              Support: {supportCount}
            </span>
          </div>
        </div>
      </div>

      {/* Create Admin / Manager / Support Agent Form */}
      <form
        onSubmit={handleAddRole}
        className="rounded-xl border border-[#E7E5E4] bg-white p-5 sm:p-6"
      >
        <div className="flex flex-col justify-between gap-3 border-b border-[#F5F4F0] pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#1C1917]">
              Create Admin or Manager Account
            </h2>
            <p className="mt-0.5 text-xs text-[#57534E]">
              {isSuperAdmin
                ? 'নতুন Admin, Manager (Unique Manager ID সহ) অথবা Support Agent তৈরি করুন।'
                : 'অনুমোদিত Manager হিসেবে নতুন Manager অ্যাকাউন্ট এবং পারমিশন তৈরি করুন।'}
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-[#E7E5E4] bg-[#FAFAF8] p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setCreationMode('new_auth')}
              className={`cursor-pointer rounded-md px-3 py-1.5 transition-colors ${
                creationMode === 'new_auth'
                  ? 'bg-[#1C1917] text-white'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              Create New Auth User
            </button>
            <button
              type="button"
              onClick={() => setCreationMode('existing_auth')}
              className={`cursor-pointer rounded-md px-3 py-1.5 transition-colors ${
                creationMode === 'existing_auth'
                  ? 'bg-[#1C1917] text-white'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              Existing Auth User
            </button>
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-4 rounded-lg border px-3.5 py-2.5 text-xs font-semibold ${
              feedback.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-[#B91C1C]'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Tariqul Islam"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs focus:border-[#DC1F26] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Staff Email *
            </label>
            <input
              type="email"
              required
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="manager@homerecipefoods.com"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs focus:border-[#DC1F26] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Phone Number
            </label>
            <input
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="+880 1XXX-XXXXXX"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs focus:border-[#DC1F26] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Role Type *
            </label>
            <select
              value={isSuperAdmin ? roleInput : 'manager'}
              disabled={!isSuperAdmin}
              onChange={(e) =>
                handleRoleSelectChange(
                  e.target.value as 'admin' | 'manager' | 'support_agent'
                )
              }
              className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold focus:border-[#DC1F26] focus:outline-none disabled:bg-[#F5F4F0]"
            >
              <option value="manager">Manager (Unique Manager ID)</option>
              {isSuperAdmin && <option value="admin">Admin</option>}
              {isSuperAdmin && <option value="support_agent">Support Agent</option>}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Username (Optional)
            </label>
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="e.g. mgr_tariq"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-xs focus:border-[#DC1F26] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Account Status
            </label>
            <select
              value={statusInput}
              onChange={(e) =>
                setStatusInput(e.target.value as 'active' | 'suspended')
              }
              className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold focus:border-[#DC1F26] focus:outline-none"
            >
              <option value="active">Active (সক্রিয়)</option>
              <option value="suspended">Suspended (স্থগিত)</option>
            </select>
          </div>

          {creationMode === 'new_auth' && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Initial Password * (min 6 chars)
              </label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs focus:border-[#DC1F26] focus:outline-none"
              />
            </div>
          )}

          {(isSuperAdmin ? roleInput : 'manager') === 'manager' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Unique Manager ID *
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    required
                    value={managerIdInput}
                    onChange={(e) => setManagerIdInput(e.target.value.toUpperCase())}
                    placeholder="MGR-2026-4821"
                    className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 font-mono text-xs font-bold text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    title="Generate New Unique Manager ID"
                    onClick={() => setManagerIdInput(generateUniqueManagerId(roles))}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-[#D6D3D1] bg-white px-2.5 py-2 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Manager Role Title
                </label>
                <input
                  type="text"
                  value={managerTitleInput}
                  onChange={(e) => setManagerTitleInput(e.target.value)}
                  placeholder="e.g. Catalog & Showroom Manager"
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs focus:border-[#DC1F26] focus:outline-none"
                />
              </div>
            </>
          )}
        </div>

        {/* Granular Permissions Selection */}
        <div className="mt-5 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-[#1C1917]">
                Granular Module Permissions ({selectedPermissions.length} selected)
              </p>
              <p className="text-[11px] text-[#57534E]">
                নির্বাচিত পারমিশন অনুযায়ী ড্যাশবোর্ড সাইডবার ও Firestore ডাটাবেস রুলস কার্যকর হবে।
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PERMISSION_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    setSelectedPermissions(
                      preset.permissions.filter((p) => isSuperAdmin || p !== 'admin_manage')
                    )
                  }
                  className="cursor-pointer rounded border border-[#D6D3D1] bg-white px-2 py-1 text-[10px] font-semibold text-[#44403C] hover:border-[#DC1F26] hover:text-[#DC1F26]"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ALL_PERMISSION_DEFINITIONS.map((perm) => {
              const locked = !isSuperAdmin && perm.key === 'admin_manage';
              const checked = selectedPermissions.includes(perm.key);
              return (
                <label
                  key={perm.key}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                    checked
                      ? 'border-[#1C1917] bg-white'
                      : 'border-[#E7E5E4] bg-white/60 text-[#57534E]'
                  } ${locked ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={checked}
                    onChange={() => toggleCreatePermission(perm.key)}
                    className="mt-0.5 rounded border-[#D6D3D1] text-[#DC1F26] focus:ring-[#DC1F26]"
                  />
                  <div>
                    <p className="font-semibold text-[#1C1917]">{perm.label}</p>
                    <p className="text-[10px] text-[#78716C]">{perm.labelBn}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span>
              {saving
                ? 'তৈরি হচ্ছে...'
                : creationMode === 'new_auth'
                ? 'Create Account & Assign Role'
                : 'Assign Role to Existing User'}
            </span>
          </button>
        </div>
      </form>

      {/* Edit Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleSaveEdit}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#E7E5E4] bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[#F5F4F0] pb-3">
              <div>
                <h3 className="font-display text-xl font-bold text-[#1C1917]">
                  Edit Staff / Manager Profile
                </h3>
                <p className="font-mono text-xs text-[#57534E]">{editingEntry.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="cursor-pointer rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F4F0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Display Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Phone
                </label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Username
                </label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Role
                </label>
                <select
                  value={editRole}
                  disabled={!isSuperAdmin}
                  onChange={(e) => {
                    const next = e.target.value as 'admin' | 'manager' | 'support_agent';
                    setEditRole(next);
                    if (next === 'manager' && !editManagerId) {
                      setEditManagerId(generateUniqueManagerId(roles));
                    }
                  }}
                  className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold disabled:bg-[#F5F4F0]"
                >
                  <option value="manager">Manager</option>
                  {isSuperAdmin && <option value="admin">Admin</option>}
                  {isSuperAdmin && <option value="support_agent">Support Agent</option>}
                </select>
              </div>
              {editRole === 'manager' && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                      Manager ID
                    </label>
                    <input
                      type="text"
                      value={editManagerId}
                      onChange={(e) => setEditManagerId(e.target.value.toUpperCase())}
                      className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                      Manager Title
                    </label>
                    <input
                      type="text"
                      value={editManagerTitle}
                      onChange={(e) => setEditManagerTitle(e.target.value)}
                      className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as AccountStatus)}
                  className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-3.5">
              <p className="mb-2 text-xs font-bold text-[#1C1917]">
                Permissions ({editPermissions.length})
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ALL_PERMISSION_DEFINITIONS.map((perm) => {
                  const locked = !isSuperAdmin && perm.key === 'admin_manage';
                  return (
                    <label
                      key={perm.key}
                      className="flex cursor-pointer items-center gap-2 rounded border border-[#E7E5E4] bg-white px-2.5 py-1.5 text-xs"
                    >
                      <input
                        type="checkbox"
                        disabled={locked}
                        checked={editPermissions.includes(perm.key)}
                        onChange={() => toggleEditPermission(perm.key)}
                        className="rounded border-[#D6D3D1] text-[#DC1F26]"
                      />
                      <span className="font-medium text-[#1C1917]">{perm.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#44403C]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="cursor-pointer rounded-lg bg-[#1C1917] px-5 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26] disabled:opacity-50"
              >
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Role & Manager Registry List */}
      <div className="overflow-hidden rounded-xl border border-[#E7E5E4] bg-white">
        <div className="flex flex-col justify-between gap-3 border-b border-[#E7E5E4] bg-[#FAFAF8] px-5 py-3.5 sm:flex-row sm:items-center">
          <h3 className="text-sm font-bold text-[#1C1917]">
            Authorized Admins, Managers &amp; Support Staff ({filteredRoles.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#78716C]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, email, MGR ID..."
                className="rounded-lg border border-[#D6D3D1] bg-white py-1.5 pr-3 pl-8 text-xs focus:border-[#DC1F26] focus:outline-none"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-lg border border-[#D6D3D1] bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="all">All Roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="support_agent">Support Agent</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[#D6D3D1] bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E7E5E4] text-[#57534E]">
              <tr>
                <th className="px-4 py-3 font-semibold">Staff / Manager Info</th>
                <th className="px-4 py-3 font-semibold">Role &amp; Permissions</th>
                <th className="px-4 py-3 font-semibold">Status &amp; Dates</th>
                <th className="px-4 py-3 text-right font-semibold">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F4F0]">
              {filteredRoles.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[#78716C]">
                    কোনো স্টাফ বা ম্যানেজার রেকর্ড পাওয়া যায়নি।
                  </td>
                </tr>
              ) : (
                filteredRoles.map((r) => {
                  const isPrimary = r.email === PRIMARY_SUPER_ADMIN_EMAIL;
                  const canEditRow = isSuperAdmin || r.role === 'manager';
                  const permCount =
                    r.role === 'super_admin'
                      ? ALL_PERMISSION_DEFINITIONS.length
                      : Array.isArray(r.permissions)
                      ? r.permissions.length
                      : (DEFAULT_ROLE_PERMISSIONS[r.role] || []).length;

                  return (
                    <tr key={r.email} className="hover:bg-[#FAFAF8]">
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-[#1C1917]">{r.displayName}</span>
                          {r.managerId && (
                            <span className="inline-flex items-center gap-1 rounded bg-[#FEFCE8] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#9A3412] ring-1 ring-[#FDE047]">
                              <BadgeCheck className="h-3 w-3" />
                              {r.managerId}
                            </span>
                          )}
                          {r.username && (
                            <span className="rounded bg-[#F5F4F0] px-1.5 py-0.5 font-mono text-[10px] text-[#57534E]">
                              @{r.username}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 font-mono text-[11px] text-[#57534E]">{r.email}</p>
                        {(r.managerTitle || r.phone) && (
                          <p className="mt-0.5 text-[11px] text-[#78716C]">
                            {r.managerTitle ? `${r.managerTitle}` : ''}
                            {r.managerTitle && r.phone ? ' · ' : ''}
                            {r.phone ? `${r.phone}` : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isPrimary ? (
                          <span className="inline-flex items-center gap-1 rounded bg-[#1C1917] px-2.5 py-1 text-[11px] font-bold text-[#FACC15]">
                            <Shield className="h-3 w-3" />
                            <span>Super Admin</span>
                          </span>
                        ) : (
                          <div className="space-y-1">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                                r.role === 'admin'
                                  ? 'bg-[#FACC15] text-[#1C1917]'
                                  : r.role === 'manager'
                                  ? 'bg-red-50 text-[#DC1F26]'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {ROLE_LABEL[r.role]}
                            </span>
                            <p className="text-[11px] text-[#78716C]">
                              {permCount} permissions
                              {!r.uid ? ' · Pending first login' : ''}
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                            r.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : r.status === 'suspended'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-red-50 text-[#B91C1C]'
                          }`}
                        >
                          {r.status === 'active'
                            ? 'Active'
                            : r.status === 'suspended'
                            ? 'Suspended'
                            : 'Disabled'}
                        </span>
                        <p className="mt-1 text-[10px] text-[#78716C]">
                          Added: {formatFirestoreDate(r.createdAt)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isPrimary ? (
                          <span className="text-[11px] font-medium text-[#78716C]">
                            Protected Primary
                          </span>
                        ) : !canEditRow ? (
                          <span className="text-[11px] text-[#78716C]">Super Admin Only</span>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditModal(r)}
                              title="Edit Permissions & Profile"
                              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E7E5E4] px-2.5 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#1C1917]"
                            >
                              <Edit3 className="h-3 w-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(r)}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E7E5E4] px-2.5 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26]"
                            >
                              {r.status === 'active' ? (
                                <>
                                  <UserX className="h-3 w-3 text-amber-700" />
                                  <span>Suspend</span>
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3 w-3 text-emerald-700" />
                                  <span>Activate</span>
                                </>
                              )}
                            </button>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => handleRemoveRole(r)}
                                title="Remove Role"
                                className="cursor-pointer rounded-md border border-[#E7E5E4] p-1.5 text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
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
    nextRole: 'customer' | 'admin' | 'manager' | 'support_agent'
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
        batch.delete(doc(firestore, 'admins', target.uid));
      } else {
        batch.set(doc(firestore, 'rbac_roles', target.email), {
          email: target.email,
          uid: target.uid,
          displayName: target.displayName,
          permissions: DEFAULT_ROLE_PERMISSIONS[nextRole as StaffRole],
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
    const nextStatus: AccountStatus = target.status === 'active' ? 'suspended' : 'active';
    setFeedback(null);
    try {
      const firestore = requireDb();
      const batch = writeBatch(firestore);
      batch.update(doc(firestore, 'users', target.uid), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      if (
        target.role === 'admin' ||
        target.role === 'manager' ||
        target.role === 'support_agent'
      ) {
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
          সাইন-ইন করা সকল ব্যবহারকারী দেখুন, রোল অ্যাসাইন করুন বা অ্যাকাউন্ট স্থগিত/সক্রিয় করুন।
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
          <option value="manager">Manager</option>
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
                            <p className="font-semibold text-[#1C1917]">{u.displayName}</p>
                            <p className="font-mono text-[11px] text-[#57534E]">{u.email}</p>
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
                                e.target.value as
                                  | 'customer'
                                  | 'admin'
                                  | 'manager'
                                  | 'support_agent'
                              )
                            }
                            className="rounded-md border border-[#D6D3D1] bg-white px-2 py-1 text-xs font-semibold"
                          >
                            <option value="customer">Customer</option>
                            <option value="support_agent">Support Agent</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                            u.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : u.status === 'suspended'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-red-50 text-[#B91C1C]'
                          }`}
                        >
                          {u.status === 'active'
                            ? 'Active'
                            : u.status === 'suspended'
                            ? 'Suspended'
                            : 'Disabled'}
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
                            {u.status === 'active' ? 'Suspend' : 'Activate'}
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
          Firebase প্রজেক্ট ({firebasePublicInfo.expectedProjectId}) কনফিগারেশন, চার-স্তরের রোল হায়ারার্কি এবং নিরাপত্তা নিয়মাবলী।
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
          Enforced 4-Tier Role Hierarchy &amp; Permission Guarantees
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-[#1C1917] bg-[#1C1917] p-4 text-white">
            <p className="text-xs font-bold text-[#FACC15]">1. Super Admin</p>
            <p className="mt-1 font-mono text-[11px] text-[#D6D3D1]">
              {PRIMARY_SUPER_ADMIN_EMAIL}
            </p>
            <ul className="mt-3 space-y-1.5 text-[11px] text-[#E7E5E4]">
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#FACC15]" />
                <span>Full catalog, CMS, SEO, media &amp; settings</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#FACC15]" />
                <span>Complaints, Live Chat, AI &amp; Reports</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#FACC15]" />
                <span>Admin, Manager &amp; User Governance</span>
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF8] p-4">
            <p className="text-xs font-bold text-[#DC1F26]">2. Admin</p>
            <p className="mt-1 text-[11px] text-[#57534E]">Catalog &amp; CMS Operations</p>
            <ul className="mt-3 space-y-1.5 text-[11px] text-[#44403C]">
              <li>• Manage Products, Categories &amp; Occasions</li>
              <li>• Manage Showrooms, Banners &amp; Greetings</li>
              <li>• View Reports &amp; optional delegated modules</li>
            </ul>
          </div>

          <div className="rounded-lg border border-[#FDE047] bg-[#FEFCE8] p-4">
            <p className="text-xs font-bold text-[#9A3412]">3. Manager</p>
            <p className="mt-1 text-[11px] text-[#57534E]">Unique Manager ID + Granular Scope</p>
            <ul className="mt-3 space-y-1.5 text-[11px] text-[#44403C]">
              <li>• Tracked via unique MGR-YYYY-XXXX ID</li>
              <li>• Custom module permissions enforced in Rules</li>
              <li>• Cannot alter Super Admin or Admin roles</li>
            </ul>
          </div>

          <div className="rounded-lg border border-[#E7E5E4] bg-[#FAFAF8] p-4">
            <p className="text-xs font-bold text-emerald-700">4. Support Agent</p>
            <p className="mt-1 text-[11px] text-[#57534E]">Customer Care Access</p>
            <ul className="mt-3 space-y-1.5 text-[11px] text-[#44403C]">
              <li>• Manage Customer Live Chat &amp; Online status</li>
              <li>• View &amp; resolve Customer Complaints</li>
              <li>• Blocked from Admins &amp; Site Settings</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
