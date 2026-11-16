import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
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
  support_agent: 'Staff / Support Agent',
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

function getPermissionLabel(key: PermissionKey): string {
  return ALL_PERMISSION_DEFINITIONS.find((p) => p.key === key)?.label || key;
}

// ========================
// 9. ADMIN MANAGEMENT & ADD NEW USER
// ========================
export function AdminRoleManagementPanel() {
  const { user, isSuperAdmin, isPrimarySuperAdmin, hasPermission, logAdminActivity } =
    useStore();
  const canManageManagers = isSuperAdmin || hasPermission('manager_manage');

  const [roles, setRoles] = useState<RbacRoleEntry[]>([]);
  const [hasAdminCredentials, setHasAdminCredentials] = useState<boolean | null>(null);

  // Add New User Form State
  const [creationMode, setCreationMode] = useState<'new_auth' | 'existing_auth'>('new_auth');
  const [allowSuperAdminCreation, setAllowSuperAdminCreation] = useState(false);
  const [roleInput, setRoleInput] = useState<StaffRole>('admin');
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [managerIdInput, setManagerIdInput] = useState('');
  const [managerTitleInput, setManagerTitleInput] = useState('');
  const [statusInput, setStatusInput] = useState<AccountStatus>('active');
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionKey[]>(
    DEFAULT_ROLE_PERMISSIONS.admin
  );

  // Filters & Feedback
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modals: View / Edit / Role / Permissions / Delete
  const [viewingEntry, setViewingEntry] = useState<RbacRoleEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState<RbacRoleEntry | null>(null);
  const [editMode, setEditMode] = useState<'full' | 'role' | 'permissions'>('full');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editManagerId, setEditManagerId] = useState('');
  const [editManagerTitle, setEditManagerTitle] = useState('');
  const [editRole, setEditRole] = useState<StaffRole>('manager');
  const [editStatus, setEditStatus] = useState<AccountStatus>('active');
  const [editPermissions, setEditPermissions] = useState<PermissionKey[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  const [deletingEntry, setDeletingEntry] = useState<RbacRoleEntry | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [actionBusyEmail, setActionBusyEmail] = useState<string | null>(null);

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
    let active = true;
    const checkCapabilities = async () => {
      if (!user) return;
      try {
        const idToken = await user.getIdToken();
        const resp = await fetch('/api/auth/session-init', {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as { hasAdminCredentials?: boolean };
        if (active && typeof data.hasAdminCredentials === 'boolean') {
          setHasAdminCredentials(data.hasAdminCredentials);
        }
      } catch {
        // Ignore non-fatal capability probe
      }
    };
    void checkCapabilities();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!isSuperAdmin && roleInput !== 'manager') {
      setRoleInput('manager');
      setSelectedPermissions(DEFAULT_ROLE_PERMISSIONS.manager);
    }
  }, [isSuperAdmin, roleInput]);

  useEffect(() => {
    if (roleInput === 'manager' && !managerIdInput) {
      setManagerIdInput(generateUniqueManagerId(roles));
    }
  }, [roleInput, roles, managerIdInput]);

  if (!canManageManagers) {
    return null;
  }

  const handleRoleSelectChange = (nextRole: StaffRole) => {
    if (!isSuperAdmin) {
      setRoleInput('manager');
      setSelectedPermissions(DEFAULT_ROLE_PERMISSIONS.manager);
      return;
    }
    if (nextRole === 'super_admin' && (!isPrimarySuperAdmin || !allowSuperAdminCreation)) {
      return;
    }
    setRoleInput(nextRole);
    setSelectedPermissions(DEFAULT_ROLE_PERMISSIONS[nextRole]);
    if (nextRole === 'manager' && !managerIdInput) {
      setManagerIdInput(generateUniqueManagerId(roles));
    }
  };

  const handleSuperAdminOptInToggle = (checked: boolean) => {
    if (!isPrimarySuperAdmin) return;
    setAllowSuperAdminCreation(checked);
    if (!checked && roleInput === 'super_admin') {
      setRoleInput('admin');
      setSelectedPermissions(DEFAULT_ROLE_PERMISSIONS.admin);
    }
  };

  const toggleCreatePermission = (perm: PermissionKey) => {
    if (roleInput === 'super_admin') return;
    if (!isSuperAdmin && perm === 'admin_manage') return;
    setSelectedPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const toggleEditPermission = (perm: PermissionKey) => {
    if (editRole === 'super_admin') return;
    if (!isSuperAdmin && perm === 'admin_manage') return;
    setEditPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveRole: StaffRole = isSuperAdmin ? roleInput : 'manager';

    if (
      effectiveRole === 'super_admin' &&
      (!isPrimarySuperAdmin || !allowSuperAdminCreation)
    ) {
      setFeedback({
        type: 'err',
        text: 'Creating a Super Admin is disabled by default unless the primary Super Admin explicitly enables permission.',
      });
      return;
    }

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
      setFeedback({ type: 'err', text: 'Full Name is required.' });
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFeedback({ type: 'err', text: 'Please enter a valid email address.' });
      return;
    }
    if (
      cleanEmail === PRIMARY_SUPER_ADMIN_EMAIL ||
      roles.some((r) => r.email.toLowerCase() === cleanEmail)
    ) {
      setFeedback({ type: 'err', text: 'This email is already registered.' });
      return;
    }
    if (cleanUsername && cleanUsername === 'mahmud') {
      setFeedback({ type: 'err', text: 'Username "mahmud" is reserved.' });
      return;
    }
    if (
      cleanUsername &&
      roles.some((r) => (r.username || '').toLowerCase() === cleanUsername)
    ) {
      setFeedback({
        type: 'err',
        text: `Username "@${cleanUsername}" is already in use.`,
      });
      return;
    }
    if (effectiveRole === 'manager') {
      if (!/^[A-Za-z0-9_-]{3,40}$/.test(cleanManagerId)) {
        setFeedback({
          type: 'err',
          text: 'Manager ID must be 3–40 characters using letters, numbers, - or _.',
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
          text: `Manager ID "${cleanManagerId}" is already assigned. Click Regenerate.`,
        });
        return;
      }
    }
    if (creationMode === 'new_auth') {
      if (passwordInput.length < 8) {
        setFeedback({
          type: 'err',
          text: 'Password must be at least 8 characters.',
        });
        return;
      }
      if (passwordInput !== confirmPasswordInput) {
        setFeedback({
          type: 'err',
          text: 'Password and Confirm Password do not match.',
        });
        return;
      }
    }

    const sanitizedPermissions =
      effectiveRole === 'super_admin'
        ? DEFAULT_ROLE_PERMISSIONS.super_admin
        : selectedPermissions.filter((p) => isSuperAdmin || p !== 'admin_manage');

    setSaving(true);
    setFeedback(null);

    let createdUid = '';
    let rollbackToken = '';
    let verificationEmailSent = false;
    let authMode: 'admin_sdk' | 'identity_toolkit' | undefined;

    try {
      if (creationMode === 'new_auth') {
        if (!user) {
          throw new Error('Active Super Admin session not found.');
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
            status: statusInput,
            allowSuperAdminCreation:
              effectiveRole === 'super_admin' &&
              isPrimarySuperAdmin &&
              allowSuperAdminCreation,
          }),
        });
        const apiJson = (await apiResp.json()) as {
          ok?: boolean;
          uid?: string;
          rollbackToken?: string;
          verificationEmailSent?: boolean;
          authMode?: 'admin_sdk' | 'identity_toolkit';
          error?: string;
        };
        if (!apiResp.ok || !apiJson.uid) {
          throw new Error(apiJson.error || 'Failed to create Firebase Auth user.');
        }
        createdUid = apiJson.uid;
        rollbackToken = apiJson.rollbackToken || '';
        verificationEmailSent = Boolean(apiJson.verificationEmailSent);
        authMode = apiJson.authMode;
      }

      const firestore = requireDb();
      const now = serverTimestamp();
      const batch = writeBatch(firestore);
      const isActive = statusInput === 'active';
      const creatorEmail = user?.email?.toLowerCase() || PRIMARY_SUPER_ADMIN_EMAIL;

      const rbacPayload: Record<string, unknown> = {
        email: cleanEmail,
        uid: createdUid,
        username: cleanUsername,
        displayName: cleanName,
        phone: cleanPhone,
        permissions: sanitizedPermissions,
        role: effectiveRole,
        status: statusInput,
        addedByEmail: creatorEmail,
        createdBy: creatorEmail,
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
          created_by: creatorEmail,
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
            phone: cleanPhone,
            ...(effectiveRole === 'manager' ? { managerId: cleanManagerId } : {}),
            permissions: sanitizedPermissions,
            role: effectiveRole,
            status: statusInput,
            createdBy: creatorEmail,
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
        if ((createdUid || rollbackToken) && user) {
          try {
            const idToken = await user.getIdToken();
            await fetch('/api/admin/rollback-user', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({ uid: createdUid, rollbackToken }),
            });
          } catch {
            // Best-effort rollback
          }
        }
        throw fsErr;
      }

      await logAdminActivity(
        'create_user',
        'admins',
        cleanEmail,
        cleanManagerId || cleanUsername || cleanEmail,
        `Created ${effectiveRole} (${cleanName}, status: ${statusInput})${
          cleanManagerId ? ` [${cleanManagerId}]` : ''
        }`
      );

      setNameInput('');
      setEmailInput('');
      setPhoneInput('');
      setUsernameInput('');
      setPasswordInput('');
      setConfirmPasswordInput('');
      setManagerTitleInput('');
      setManagerIdInput(
        effectiveRole === 'manager' ? generateUniqueManagerId(roles) : ''
      );
      setStatusInput('active');

      setFeedback({
        type: 'ok',
        text:
          creationMode === 'new_auth'
            ? `User "${cleanName}" (${cleanEmail}) created as ${ROLE_LABEL[effectiveRole]}${
                cleanManagerId ? ` · ID: ${cleanManagerId}` : ''
              } (UID: ${createdUid}).${
                authMode === 'admin_sdk'
                  ? ' Account is pre-verified and ready to sign in immediately. Your Super Admin session remains active.'
                  : verificationEmailSent
                  ? ' Verification email sent (user must verify before first /mahmud login). Your Super Admin session remains active.'
                  : ' Your Super Admin session remains active.'
              }`
            : `Assigned ${ROLE_LABEL[effectiveRole]} permissions to existing Auth user ${cleanEmail}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text:
          err instanceof Error && err.message
            ? err.message
            : 'Unable to create user account. Please check inputs and permissions.',
      });
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (
    entry: RbacRoleEntry,
    mode: 'full' | 'role' | 'permissions' = 'full'
  ) => {
    if (entry.email === PRIMARY_SUPER_ADMIN_EMAIL) return;
    if (!isSuperAdmin && entry.role !== 'manager') return;
    setEditingEntry(entry);
    setEditMode(mode);
    setEditName(entry.displayName || '');
    setEditPhone(entry.phone || '');
    setEditUsername(entry.username || '');
    setEditManagerId(entry.managerId || '');
    setEditManagerTitle(entry.managerTitle || '');
    setEditRole(entry.role);
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

    let targetRole: StaffRole = isSuperAdmin ? editRole : 'manager';
    if (
      targetRole === 'super_admin' &&
      editingEntry.role !== 'super_admin' &&
      !isPrimarySuperAdmin
    ) {
      targetRole = 'admin';
    }

    const cleanManagerId =
      targetRole === 'manager'
        ? (editManagerId.trim() || generateUniqueManagerId(roles)).toUpperCase()
        : '';
    const cleanManagerTitle =
      targetRole === 'manager' ? editManagerTitle.trim().slice(0, 100) : '';

    if (!cleanName) {
      setFeedback({ type: 'err', text: 'Full Name cannot be empty.' });
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
      setFeedback({ type: 'err', text: `Username "@${cleanUsername}" is already taken.` });
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
      setFeedback({ type: 'err', text: `Manager ID "${cleanManagerId}" is already assigned.` });
      return;
    }

    const sanitizedPerms =
      targetRole === 'super_admin'
        ? DEFAULT_ROLE_PERMISSIONS.super_admin
        : editPermissions.filter((p) => isSuperAdmin || p !== 'admin_manage');

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
            phone: cleanPhone,
            ...(targetRole === 'manager' ? { managerId: cleanManagerId } : {}),
            permissions: sanitizedPerms,
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

      if (editingEntry.uid && user && editStatus !== editingEntry.status) {
        try {
          const idToken = await user.getIdToken();
          await fetch('/api/admin/update-user-status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              uid: editingEntry.uid,
              email: editingEntry.email,
              role: targetRole,
              disabled: !isActive,
            }),
          });
        } catch {
          // Non-fatal Auth sync
        }
      }

      await logAdminActivity(
        'update_user',
        'admins',
        editingEntry.email,
        cleanManagerId || cleanName,
        `Updated ${editingEntry.email} (${targetRole}, ${editStatus})`
      );
      setEditingEntry(null);
      setFeedback({ type: 'ok', text: `Updated profile and permissions for ${editingEntry.email}.` });
    } catch {
      setFeedback({ type: 'err', text: 'Failed to save changes. Check permissions.' });
    } finally {
      setEditSaving(false);
    }
  };

  const handleToggleStatus = async (entry: RbacRoleEntry) => {
    if (entry.email === PRIMARY_SUPER_ADMIN_EMAIL || entry.uid === user?.uid) return;
    if (!isSuperAdmin && entry.role !== 'manager') return;
    const nextStatus: AccountStatus = entry.status === 'active' ? 'suspended' : 'active';
    setActionBusyEmail(entry.email);
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

      let authSynced = false;
      if (entry.uid && user) {
        try {
          const idToken = await user.getIdToken();
          const resp = await fetch('/api/admin/update-user-status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              uid: entry.uid,
              email: entry.email,
              role: entry.role,
              disabled: !isActive,
            }),
          });
          if (resp.ok) {
            const json = (await resp.json()) as { authSynced?: boolean };
            authSynced = Boolean(json.authSynced);
          }
        } catch {
          // Non-fatal
        }
      }

      await logAdminActivity('toggle_user_status', 'admins', entry.email, nextStatus);
      setFeedback({
        type: 'ok',
        text: `${entry.email} is now ${nextStatus === 'active' ? 'Active' : 'Suspended'}${
          authSynced ? ' (Firebase Auth status synced)' : ''
        }.`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'Failed to update account status.' });
    } finally {
      setActionBusyEmail(null);
    }
  };

  const handleResetPassword = async (entry: RbacRoleEntry) => {
    if (!isSuperAdmin || !user) return;
    setActionBusyEmail(entry.email);
    setFeedback(null);
    try {
      const idToken = await user.getIdToken();
      const resp = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ email: entry.email }),
      });
      const json = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok) {
        throw new Error(json.error || 'Failed to send reset email.');
      }
      await logAdminActivity(
        'send_password_reset',
        'admins',
        entry.email,
        entry.displayName,
        `Sent password reset email to ${entry.email}`
      );
      setFeedback({
        type: 'ok',
        text: `Password reset email sent to ${entry.email}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to send password reset email.',
      });
    } finally {
      setActionBusyEmail(null);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (
      !deletingEntry ||
      !isSuperAdmin ||
      deletingEntry.email === PRIMARY_SUPER_ADMIN_EMAIL ||
      deletingEntry.uid === user?.uid
    ) {
      return;
    }

    setDeleteLoading(true);
    setFeedback(null);
    try {
      let authDeleted = false;
      if (deletingEntry.uid && user) {
        const idToken = await user.getIdToken();
        const delResp = await fetch('/api/admin/delete-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            uid: deletingEntry.uid,
            email: deletingEntry.email,
          }),
        });
        if (!delResp.ok) {
          const delJson = (await delResp.json()) as { error?: string };
          throw new Error(delJson.error || 'Failed to remove Firebase Auth account.');
        }
        const delJson = (await delResp.json()) as { authDeleted?: boolean };
        authDeleted = Boolean(delJson.authDeleted);
      }

      const firestore = requireDb();
      const batch = writeBatch(firestore);
      batch.delete(doc(firestore, 'rbac_roles', deletingEntry.email));
      if (deletingEntry.username) {
        batch.delete(
          doc(firestore, 'admin_usernames', deletingEntry.username.toLowerCase())
        );
      }
      if (deletingEntry.uid) {
        batch.delete(doc(firestore, 'admins', deletingEntry.uid));
        batch.delete(doc(firestore, 'users', deletingEntry.uid));
      }
      await batch.commit();

      await logAdminActivity(
        'delete_user',
        'admins',
        deletingEntry.email,
        deletingEntry.displayName,
        `Deleted user ${deletingEntry.email}${authDeleted ? ' (incl. Firebase Auth)' : ''}`
      );

      setFeedback({
        type: 'ok',
        text: authDeleted
          ? `Deleted ${deletingEntry.email} from Firebase Authentication and Firestore.`
          : `Removed ${deletingEntry.email} access records from Firestore.`,
      });
      setDeletingEntry(null);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to delete user.',
      });
    } finally {
      setDeleteLoading(false);
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
  const supportCount = roles.filter(
    (r) => r.role === 'support_agent' && r.status === 'active'
  ).length;
  const superAdminCount = roles.filter(
    (r) => r.role === 'super_admin' && r.status === 'active'
  ).length;

  const passwordMismatch =
    creationMode === 'new_auth' &&
    confirmPasswordInput.length > 0 &&
    passwordInput !== confirmPasswordInput;

  return (
    <div className="space-y-6">
      {/* Governance Header Banner */}
      <div className="rounded-xl border border-[#FDE047] bg-[#FEFCE8] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#DC1F26]" />
            <div>
              <h3 className="text-sm font-bold text-[#1C1917]">
                Admin Management · Role-Based Access Control (Firebase Auth + Firestore)
              </h3>
              <p className="mt-0.5 text-xs text-[#57534E]">
                Primary Super Admin:{' '}
                <span className="font-mono font-semibold text-[#1C1917]">
                  {PRIMARY_SUPER_ADMIN_EMAIL}
                </span>
                . Server-side creation keeps your current Super Admin session signed in. Passwords are
                never stored in Firestore or client storage.
              </p>
              {hasAdminCredentials !== null && (
                <p className="mt-1 text-[11px] font-medium text-[#44403C]">
                  Auth Mode:{' '}
                  {hasAdminCredentials ? (
                    <span className="font-semibold text-emerald-700">
                      Firebase Admin Service Account Active (instant pre-verified accounts + Auth disable/delete sync)
                    </span>
                  ) : (
                    <span className="font-semibold text-amber-800">
                      Identity Toolkit REST Mode (sends email verification link to newly created users)
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="rounded bg-[#1C1917] px-2.5 py-1 text-[#FACC15] shadow-xs">
              Super Admins: {Math.max(1, superAdminCount)}
            </span>
            <span className="rounded bg-white px-2.5 py-1 text-[#1C1917] shadow-xs">
              Admins: {adminCount}
            </span>
            <span className="rounded bg-white px-2.5 py-1 text-[#DC1F26] shadow-xs">
              Managers: {managerCount}
            </span>
            <span className="rounded bg-white px-2.5 py-1 text-emerald-700 shadow-xs">
              Staff: {supportCount}
            </span>
          </div>
        </div>
      </div>

      {/* Add New User Form */}
      <form
        onSubmit={handleAddUser}
        className="rounded-xl border border-[#E7E5E4] bg-white p-5 sm:p-6"
      >
        <div className="flex flex-col justify-between gap-3 border-b border-[#F5F4F0] pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#1C1917]">
              Add New User
            </h2>
            <p className="mt-0.5 text-xs text-[#57534E]">
              {isSuperAdmin
                ? 'Create a new Admin, Manager (with Unique Manager ID), or Staff / Support Agent account.'
                : 'Create a new Manager account with Unique Manager ID and scoped permissions.'}
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
              Email *
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

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Phone
            </label>
            <input
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="+880 1XXX-XXXXXX"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs focus:border-[#DC1F26] focus:outline-none"
            />
          </div>

          {creationMode === 'new_auth' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Password * (min 8 chars)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full rounded-lg border border-[#D6D3D1] py-2 pr-9 pl-3 text-xs focus:border-[#DC1F26] focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-2.5 text-[#78716C] hover:text-[#1C1917]"
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Confirm Password *
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    placeholder="Re-enter password"
                    className={`w-full rounded-lg border py-2 pr-9 pl-3 text-xs focus:outline-none ${
                      passwordMismatch
                        ? 'border-red-500 focus:border-red-600'
                        : 'border-[#D6D3D1] focus:border-[#DC1F26]'
                    }`}
                  />
                  <button
                    type="button"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-2.5 text-[#78716C] hover:text-[#1C1917]"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                {passwordMismatch && (
                  <p className="mt-1 text-[11px] font-semibold text-[#B91C1C]">
                    Passwords do not match.
                  </p>
                )}
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Role *
            </label>
            <select
              value={isSuperAdmin ? roleInput : 'manager'}
              disabled={!isSuperAdmin}
              onChange={(e) => handleRoleSelectChange(e.target.value as StaffRole)}
              className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold focus:border-[#DC1F26] focus:outline-none disabled:bg-[#F5F4F0]"
            >
              {isSuperAdmin && <option value="admin">Admin (Full / Selected Permissions)</option>}
              <option value="manager">Manager (Selected Management + Manager ID)</option>
              {isSuperAdmin && (
                <option value="support_agent">Staff / Support Agent (Assigned Permissions)</option>
              )}
              {isPrimarySuperAdmin && allowSuperAdminCreation && (
                <option value="super_admin">Super Admin (Primary Authorized Only)</option>
              )}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Status *
            </label>
            <select
              value={statusInput}
              onChange={(e) => setStatusInput(e.target.value as AccountStatus)}
              className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold focus:border-[#DC1F26] focus:outline-none"
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="disabled">Disabled</option>
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
              placeholder="e.g. admin_tariq"
              className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 font-mono text-xs focus:border-[#DC1F26] focus:outline-none"
            />
          </div>

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

        {/* Explicit Super Admin Creation Safety Toggle (Primary Super Admin Only) */}
        {isPrimarySuperAdmin && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
            <label className="flex cursor-pointer items-start gap-2.5 text-xs">
              <input
                type="checkbox"
                checked={allowSuperAdminCreation}
                onChange={(e) => handleSuperAdminOptInToggle(e.target.checked)}
                className="mt-0.5 rounded border-amber-400 text-[#DC1F26] focus:ring-[#DC1F26]"
              />
              <div>
                <span className="font-bold text-[#1C1917]">
                  Explicitly allow creating another Super Admin (disabled by default)
                </span>
                <p className="mt-0.5 text-[11px] text-[#57534E]">
                  Only the primary Super Admin ({PRIMARY_SUPER_ADMIN_EMAIL}) can unlock the Super Admin role option. Leave unchecked for normal Admin, Manager, and Staff creation.
                </p>
              </div>
            </label>
          </div>
        )}

        {/* Granular Permissions Selection */}
        <div className="mt-5 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-[#1C1917]">
                Permissions ({selectedPermissions.length} selected)
              </p>
              <p className="text-[11px] text-[#57534E]">
                Enforced dynamically across both Admin Dashboard navigation and Firestore Security Rules.
              </p>
            </div>
            {roleInput !== 'super_admin' && (
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
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => setSelectedPermissions(ALL_PERMISSION_DEFINITIONS.map((p) => p.key))}
                    className="cursor-pointer rounded border border-[#1C1917] bg-white px-2 py-1 text-[10px] font-semibold text-[#1C1917] hover:bg-[#1C1917] hover:text-white"
                  >
                    Select All
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ALL_PERMISSION_DEFINITIONS.map((perm) => {
              const locked =
                roleInput === 'super_admin' || (!isSuperAdmin && perm.key === 'admin_manage');
              const checked =
                roleInput === 'super_admin' || selectedPermissions.includes(perm.key);
              return (
                <label
                  key={perm.key}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                    checked
                      ? 'border-[#1C1917] bg-white'
                      : 'border-[#E7E5E4] bg-white/60 text-[#57534E]'
                  } ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
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
            disabled={saving || passwordMismatch}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#DC1F26] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span>
              {saving
                ? 'Creating User...'
                : creationMode === 'new_auth'
                ? 'Create User Account'
                : 'Assign Role to Existing User'}
            </span>
          </button>
        </div>
      </form>

      {/* View User Modal */}
      {viewingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#E7E5E4] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between border-b border-[#F5F4F0] pb-3">
              <div>
                <h3 className="font-display text-xl font-bold text-[#1C1917]">
                  {viewingEntry.displayName}
                </h3>
                <p className="font-mono text-xs text-[#57534E]">{viewingEntry.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingEntry(null)}
                className="cursor-pointer rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F4F0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              <div className="rounded-lg bg-[#FAFAF8] p-3">
                <p className="text-[#78716C]">Role</p>
                <p className="mt-0.5 font-bold text-[#1C1917]">{ROLE_LABEL[viewingEntry.role]}</p>
              </div>
              <div className="rounded-lg bg-[#FAFAF8] p-3">
                <p className="text-[#78716C]">Status</p>
                <p className="mt-0.5 font-bold capitalize text-[#1C1917]">{viewingEntry.status}</p>
              </div>
              <div className="rounded-lg bg-[#FAFAF8] p-3">
                <p className="text-[#78716C]">Phone</p>
                <p className="mt-0.5 font-semibold text-[#1C1917]">{viewingEntry.phone || '—'}</p>
              </div>
              <div className="rounded-lg bg-[#FAFAF8] p-3">
                <p className="text-[#78716C]">Username</p>
                <p className="mt-0.5 font-mono text-[#1C1917]">
                  {viewingEntry.username ? `@${viewingEntry.username}` : '—'}
                </p>
              </div>
              {viewingEntry.managerId && (
                <div className="rounded-lg bg-[#FEFCE8] p-3">
                  <p className="text-[#78716C]">Manager ID / Title</p>
                  <p className="mt-0.5 font-mono font-bold text-[#9A3412]">
                    {viewingEntry.managerId}
                    {viewingEntry.managerTitle ? ` · ${viewingEntry.managerTitle}` : ''}
                  </p>
                </div>
              )}
              <div className="rounded-lg bg-[#FAFAF8] p-3">
                <p className="text-[#78716C]">Firebase UID</p>
                <p className="mt-0.5 break-all font-mono text-[11px] text-[#1C1917]">
                  {viewingEntry.uid || 'Pending first login'}
                </p>
              </div>
              <div className="rounded-lg bg-[#FAFAF8] p-3">
                <p className="text-[#78716C]">Created</p>
                <p className="mt-0.5 font-semibold text-[#1C1917]">
                  {formatFirestoreDate(viewingEntry.createdAt)}
                </p>
              </div>
              <div className="rounded-lg bg-[#FAFAF8] p-3">
                <p className="text-[#78716C]">Created By</p>
                <p className="mt-0.5 font-mono text-[11px] text-[#1C1917]">
                  {viewingEntry.createdBy || viewingEntry.addedByEmail || '—'}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-3.5">
              <p className="mb-2 text-xs font-bold text-[#1C1917]">Assigned Permissions</p>
              <div className="flex flex-wrap gap-1.5">
                {(viewingEntry.role === 'super_admin'
                  ? ALL_PERMISSION_DEFINITIONS.map((p) => p.key)
                  : viewingEntry.permissions || DEFAULT_ROLE_PERMISSIONS[viewingEntry.role] || []
                ).map((perm) => (
                  <span
                    key={perm}
                    className="rounded border border-[#E7E5E4] bg-white px-2 py-0.5 text-[11px] font-medium text-[#1C1917]"
                  >
                    {getPermissionLabel(perm)}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setViewingEntry(null)}
                className="cursor-pointer rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Change Role / Permissions Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleSaveEdit}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#E7E5E4] bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[#F5F4F0] pb-3">
              <div>
                <h3 className="font-display text-xl font-bold text-[#1C1917]">
                  {editMode === 'permissions'
                    ? 'Manage User Permissions'
                    : editMode === 'role'
                    ? 'Change User Role & Access'
                    : 'Edit User Profile & Permissions'}
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

            {editMode !== 'permissions' && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                    Full Name *
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
                      const next = e.target.value as StaffRole;
                      setEditRole(next);
                      setEditPermissions(DEFAULT_ROLE_PERMISSIONS[next]);
                      if (next === 'manager' && !editManagerId) {
                        setEditManagerId(generateUniqueManagerId(roles));
                      }
                    }}
                    className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold disabled:bg-[#F5F4F0]"
                  >
                    <option value="manager">Manager</option>
                    {isSuperAdmin && <option value="admin">Admin</option>}
                    {isSuperAdmin && <option value="support_agent">Staff / Support Agent</option>}
                    {isPrimarySuperAdmin && (
                      <option value="super_admin">Super Admin</option>
                    )}
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
            )}

            <div className="mt-4 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-3.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-[#1C1917]">
                  Permissions ({editRole === 'super_admin' ? ALL_PERMISSION_DEFINITIONS.length : editPermissions.length})
                </p>
                {editRole !== 'super_admin' && (
                  <div className="flex flex-wrap gap-1.5">
                    {PERMISSION_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          setEditPermissions(
                            preset.permissions.filter((p) => isSuperAdmin || p !== 'admin_manage')
                          )
                        }
                        className="cursor-pointer rounded border border-[#D6D3D1] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#44403C] hover:border-[#DC1F26]"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ALL_PERMISSION_DEFINITIONS.map((perm) => {
                  const locked =
                    editRole === 'super_admin' || (!isSuperAdmin && perm.key === 'admin_manage');
                  const checked =
                    editRole === 'super_admin' || editPermissions.includes(perm.key);
                  return (
                    <label
                      key={perm.key}
                      className={`flex cursor-pointer items-center gap-2 rounded border border-[#E7E5E4] bg-white px-2.5 py-1.5 text-xs ${
                        locked ? 'cursor-not-allowed opacity-60' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={locked}
                        checked={checked}
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

      {/* Delete User Confirmation Modal */}
      {deletingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-[#DC1F26]">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-[#1C1917]">
                  Delete User Account?
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[#57534E]">
                  This will permanently remove{' '}
                  <span className="font-semibold text-[#1C1917]">{deletingEntry.displayName}</span>{' '}
                  (<span className="font-mono">{deletingEntry.email}</span>) from admin role
                  records{deletingEntry.uid && hasAdminCredentials ? ' and Firebase Authentication' : ''}.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => setDeletingEntry(null)}
                className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#44403C]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleConfirmDeleteUser}
                className="cursor-pointer rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User & Role Management Table */}
      <div className="overflow-hidden rounded-xl border border-[#E7E5E4] bg-white">
        <div className="flex flex-col justify-between gap-3 border-b border-[#E7E5E4] bg-[#FAFAF8] px-5 py-3.5 sm:flex-row sm:items-center">
          <h3 className="text-sm font-bold text-[#1C1917]">
            Admin &amp; Staff Directory ({filteredRoles.length})
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
              <option value="support_agent">Staff / Support Agent</option>
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
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F4F0]">
              {filteredRoles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#78716C]">
                    No staff or admin records found.
                  </td>
                </tr>
              ) : (
                filteredRoles.map((r) => {
                  const isPrimary = r.email === PRIMARY_SUPER_ADMIN_EMAIL;
                  const isSelf = r.uid && user?.uid === r.uid;
                  const canEditRow =
                    !isPrimary && (isSuperAdmin || r.role === 'manager');
                  const permCount =
                    r.role === 'super_admin'
                      ? ALL_PERMISSION_DEFINITIONS.length
                      : Array.isArray(r.permissions)
                      ? r.permissions.length
                      : (DEFAULT_ROLE_PERMISSIONS[r.role] || []).length;
                  const isBusy = actionBusyEmail === r.email;

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
                        {(r.managerTitle || r.phone) && (
                          <p className="mt-0.5 text-[11px] text-[#78716C]">
                            {r.managerTitle ? `${r.managerTitle}` : ''}
                            {r.managerTitle && r.phone ? ' · ' : ''}
                            {r.phone ? `${r.phone}` : ''}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-mono text-[11px] text-[#1C1917]">{r.email}</p>
                        {!r.uid && (
                          <p className="mt-0.5 text-[10px] text-[#78716C]">
                            Pending first login
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {r.role === 'super_admin' ? (
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
                      </td>

                      <td className="px-4 py-3 text-[11px] text-[#57534E]">
                        {formatFirestoreDate(r.createdAt)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingEntry(r)}
                            title="View Details"
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E7E5E4] px-2 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#1C1917]"
                          >
                            <Eye className="h-3 w-3" />
                            <span>View</span>
                          </button>

                          {isPrimary ? (
                            <span className="ml-1 text-[11px] font-medium text-[#78716C]">
                              Protected
                            </span>
                          ) : !canEditRow ? (
                            <span className="ml-1 text-[11px] text-[#78716C]">
                              Super Admin Only
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(r, 'full')}
                                title="Edit User"
                                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E7E5E4] px-2 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#1C1917]"
                              >
                                <Edit3 className="h-3 w-3" />
                                <span>Edit</span>
                              </button>
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => openEditModal(r, 'role')}
                                  title="Change Role"
                                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E7E5E4] px-2 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26]"
                                >
                                  <Shield className="h-3 w-3" />
                                  <span>Role</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openEditModal(r, 'permissions')}
                                title="Edit Permissions"
                                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E7E5E4] px-2 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26]"
                              >
                                <SlidersHorizontal className="h-3 w-3" />
                                <span>Permissions</span>
                              </button>
                              {!isSelf && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleToggleStatus(r)}
                                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E7E5E4] px-2 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26] disabled:opacity-50"
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
                              )}
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleResetPassword(r)}
                                  title="Send Password Reset Email"
                                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E7E5E4] px-2 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
                                >
                                  <Mail className="h-3 w-3" />
                                  <span>Reset</span>
                                </button>
                              )}
                              {isSuperAdmin && !isSelf && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => setDeletingEntry(r)}
                                  title="Delete User"
                                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E7E5E4] px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Delete</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
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
// 10. USER MANAGEMENT (Super Admin Only — All Registered Accounts)
// ========================
export function AdminUserManagementPanel() {
  const { user, isSuperAdmin, isPrimarySuperAdmin, logAdminActivity } = useStore();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [viewingUser, setViewingUser] = useState<UserAccount | null>(null);
  const [editingPermsUser, setEditingPermsUser] = useState<UserAccount | null>(null);
  const [editPerms, setEditPerms] = useState<PermissionKey[]>([]);
  const [deletingUser, setDeletingUser] = useState<UserAccount | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

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
    nextRole: 'customer' | 'admin' | 'manager' | 'support_agent' | 'super_admin'
  ) => {
    if (target.email === PRIMARY_SUPER_ADMIN_EMAIL || target.uid === user?.uid) return;
    if (nextRole === 'super_admin' && !isPrimarySuperAdmin) return;
    setBusyUid(target.uid);
    setFeedback(null);
    try {
      const firestore = requireDb();
      const batch = writeBatch(firestore);
      const nextPermissions =
        nextRole === 'customer' ? [] : DEFAULT_ROLE_PERMISSIONS[nextRole as StaffRole];

      batch.update(doc(firestore, 'users', target.uid), {
        role: nextRole,
        permissions: nextPermissions,
        updatedAt: serverTimestamp(),
      });
      if (nextRole === 'customer') {
        batch.delete(doc(firestore, 'rbac_roles', target.email));
        batch.delete(doc(firestore, 'admins', target.uid));
      } else {
        batch.set(
          doc(firestore, 'rbac_roles', target.email),
          {
            email: target.email,
            uid: target.uid,
            displayName: target.displayName,
            ...(target.phone ? { phone: target.phone } : {}),
            permissions: nextPermissions,
            role: nextRole as StaffRole,
            status: target.status,
            addedByEmail: user?.email?.toLowerCase() || PRIMARY_SUPER_ADMIN_EMAIL,
            createdBy: user?.email?.toLowerCase() || PRIMARY_SUPER_ADMIN_EMAIL,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      await batch.commit();
      await logAdminActivity(
        'change_user_role',
        'users',
        target.email,
        nextRole,
        `Changed role for ${target.email} to ${nextRole}`
      );
      setFeedback({
        type: 'ok',
        text: `${target.email} role updated to ${ROLE_LABEL[nextRole]}.`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'Failed to update user role.' });
    } finally {
      setBusyUid(null);
    }
  };

  const toggleUserStatus = async (target: UserAccount) => {
    if (target.email === PRIMARY_SUPER_ADMIN_EMAIL || target.uid === user?.uid) return;
    const nextStatus: AccountStatus = target.status === 'active' ? 'suspended' : 'active';
    setBusyUid(target.uid);
    setFeedback(null);
    try {
      const firestore = requireDb();
      const batch = writeBatch(firestore);
      const isActive = nextStatus === 'active';
      batch.update(doc(firestore, 'users', target.uid), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      if (
        target.role === 'super_admin' ||
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

      if (user) {
        try {
          const idToken = await user.getIdToken();
          await fetch('/api/admin/update-user-status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              uid: target.uid,
              email: target.email,
              role: target.role,
              disabled: !isActive,
            }),
          });
        } catch {
          // Non-fatal
        }
      }

      await logAdminActivity('toggle_user_status', 'users', target.email, nextStatus);
      setFeedback({
        type: 'ok',
        text: `${target.email} status updated to ${nextStatus}.`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'Failed to update user status.' });
    } finally {
      setBusyUid(null);
    }
  };

  const handleSaveUserPermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPermsUser || editingPermsUser.role === 'customer') return;
    setBusyUid(editingPermsUser.uid);
    setFeedback(null);
    try {
      const firestore = requireDb();
      const batch = writeBatch(firestore);
      batch.update(doc(firestore, 'users', editingPermsUser.uid), {
        permissions: editPerms,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(firestore, 'rbac_roles', editingPermsUser.email), {
        permissions: editPerms,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setFeedback({
        type: 'ok',
        text: `Updated permissions for ${editingPermsUser.email}.`,
      });
      setEditingPermsUser(null);
    } catch {
      setFeedback({ type: 'err', text: 'Failed to update user permissions.' });
    } finally {
      setBusyUid(null);
    }
  };

  const handleResetPassword = async (target: UserAccount) => {
    if (!user) return;
    setBusyUid(target.uid);
    setFeedback(null);
    try {
      const idToken = await user.getIdToken();
      const resp = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ email: target.email }),
      });
      const json = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(json.error || 'Failed to send reset link.');
      setFeedback({
        type: 'ok',
        text: `Password reset email sent to ${target.email}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to send reset email.',
      });
    } finally {
      setBusyUid(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (
      !deletingUser ||
      deletingUser.email === PRIMARY_SUPER_ADMIN_EMAIL ||
      deletingUser.uid === user?.uid
    ) {
      return;
    }
    setBusyUid(deletingUser.uid);
    setFeedback(null);
    try {
      let authDeleted = false;
      if (user) {
        const idToken = await user.getIdToken();
        const resp = await fetch('/api/admin/delete-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ uid: deletingUser.uid, email: deletingUser.email }),
        });
        if (!resp.ok) {
          const errJson = (await resp.json()) as { error?: string };
          throw new Error(errJson.error || 'Auth delete failed.');
        }
        const json = (await resp.json()) as { authDeleted?: boolean };
        authDeleted = Boolean(json.authDeleted);
      }

      const firestore = requireDb();
      const batch = writeBatch(firestore);
      batch.delete(doc(firestore, 'users', deletingUser.uid));
      batch.delete(doc(firestore, 'rbac_roles', deletingUser.email));
      batch.delete(doc(firestore, 'admins', deletingUser.uid));
      await batch.commit();

      await logAdminActivity('delete_user', 'users', deletingUser.email, deletingUser.displayName);
      setFeedback({
        type: 'ok',
        text: authDeleted
          ? `Deleted ${deletingUser.email} from Firebase Auth and Firestore.`
          : `Removed ${deletingUser.email} records from Firestore.`,
      });
      setDeletingUser(null);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to delete user.',
      });
    } finally {
      setBusyUid(null);
    }
  };

  const filtered = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (statusFilter !== 'all' && u.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q)
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
          View registered users, change roles, inspect permissions, activate/suspend accounts, send password resets, or delete accounts.
        </p>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-[#B91C1C]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or phone..."
          className="w-full max-w-xs rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
        >
          <option value="all">All Roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="support_agent">Staff / Support Agent</option>
          <option value="customer">Customer</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      {/* View Modal */}
      {viewingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#E7E5E4] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between border-b border-[#F5F4F0] pb-3">
              <div>
                <h3 className="font-display text-xl font-bold text-[#1C1917]">
                  {viewingUser.displayName}
                </h3>
                <p className="font-mono text-xs text-[#57534E]">{viewingUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingUser(null)}
                className="cursor-pointer rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F4F0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-[#FAFAF8] p-3">
                <p className="text-[#78716C]">Role</p>
                <p className="mt-0.5 font-bold">{ROLE_LABEL[viewingUser.role]}</p>
              </div>
              <div className="rounded-lg bg-[#FAFAF8] p-3">
                <p className="text-[#78716C]">Status</p>
                <p className="mt-0.5 font-bold capitalize">{viewingUser.status}</p>
              </div>
              <div className="rounded-lg bg-[#FAFAF8] p-3">
                <p className="text-[#78716C]">Phone</p>
                <p className="mt-0.5 font-semibold">{viewingUser.phone || '—'}</p>
              </div>
              <div className="rounded-lg bg-[#FAFAF8] p-3">
                <p className="text-[#78716C]">Created</p>
                <p className="mt-0.5 font-semibold">{formatFirestoreDate(viewingUser.createdAt)}</p>
              </div>
              <div className="col-span-2 rounded-lg bg-[#FAFAF8] p-3">
                <p className="text-[#78716C]">UID</p>
                <p className="mt-0.5 break-all font-mono text-[11px]">{viewingUser.uid}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingUser(null)}
                className="cursor-pointer rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {editingPermsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleSaveUserPermissions}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#E7E5E4] bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between border-b border-[#F5F4F0] pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-[#1C1917]">
                  Edit Permissions · {editingPermsUser.displayName}
                </h3>
                <p className="font-mono text-xs text-[#57534E]">{editingPermsUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPermsUser(null)}
                className="cursor-pointer rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F4F0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ALL_PERMISSION_DEFINITIONS.map((perm) => (
                <label
                  key={perm.key}
                  className="flex cursor-pointer items-center gap-2 rounded border border-[#E7E5E4] bg-[#FAFAF8] px-2.5 py-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={editPerms.includes(perm.key)}
                    onChange={() =>
                      setEditPerms((prev) =>
                        prev.includes(perm.key)
                          ? prev.filter((p) => p !== perm.key)
                          : [...prev, perm.key]
                      )
                    }
                    className="rounded border-[#D6D3D1] text-[#DC1F26]"
                  />
                  <span className="font-medium text-[#1C1917]">{perm.label}</span>
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingPermsUser(null)}
                className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#44403C]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyUid === editingPermsUser.uid}
                className="cursor-pointer rounded-lg bg-[#1C1917] px-5 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
              >
                Save Permissions
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-xl">
            <h3 className="font-display text-lg font-bold text-[#1C1917]">
              Delete User Account?
            </h3>
            <p className="mt-1 text-xs text-[#57534E]">
              Permanently remove <span className="font-semibold">{deletingUser.displayName}</span>{' '}
              (<span className="font-mono">{deletingUser.email}</span>)?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#44403C]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyUid === deletingUser.uid}
                onClick={handleConfirmDelete}
                className="cursor-pointer rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[#E7E5E4] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E7E5E4] bg-[#FAFAF8] text-[#57534E]">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F4F0]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#78716C]">
                    No registered users found.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const isPrimary = u.email === PRIMARY_SUPER_ADMIN_EMAIL;
                  const isSelf = u.uid === user?.uid;
                  const busy = busyUid === u.uid;
                  return (
                    <tr key={u.uid} className="hover:bg-[#FAFAF8]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 shrink-0 text-[#78716C]" />
                          <div>
                            <p className="font-semibold text-[#1C1917]">{u.displayName}</p>
                            {u.phone && <p className="text-[11px] text-[#78716C]">{u.phone}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[#57534E]">
                        {u.email}
                      </td>
                      <td className="px-4 py-3">
                        {isPrimary || isSelf ? (
                          <span className="inline-flex items-center gap-1 rounded bg-[#1C1917] px-2.5 py-1 text-[11px] font-bold text-[#FACC15]">
                            {ROLE_LABEL[u.role]}
                          </span>
                        ) : (
                          <select
                            disabled={busy}
                            value={u.role}
                            onChange={(e) =>
                              updateUserRole(
                                u,
                                e.target.value as
                                  | 'customer'
                                  | 'admin'
                                  | 'manager'
                                  | 'support_agent'
                                  | 'super_admin'
                              )
                            }
                            className="rounded-md border border-[#D6D3D1] bg-white px-2 py-1 text-xs font-semibold"
                          >
                            <option value="customer">Customer</option>
                            <option value="support_agent">Staff / Support Agent</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                            {isPrimarySuperAdmin && u.role === 'super_admin' && (
                              <option value="super_admin">Super Admin</option>
                            )}
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
                      <td className="px-4 py-3 text-[11px] text-[#57534E]">
                        {formatFirestoreDate(u.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingUser(u)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E7E5E4] px-2 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#1C1917]"
                          >
                            <Eye className="h-3 w-3" />
                            <span>View</span>
                          </button>

                          {!isPrimary && !isSelf ? (
                            <>
                              {u.role !== 'customer' && u.role !== 'super_admin' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingPermsUser(u);
                                    setEditPerms(
                                      Array.isArray(u.permissions)
                                        ? u.permissions
                                        : DEFAULT_ROLE_PERMISSIONS[u.role as StaffRole] || []
                                    );
                                  }}
                                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#E7E5E4] px-2 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26]"
                                >
                                  <SlidersHorizontal className="h-3 w-3" />
                                  <span>Permissions</span>
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => toggleUserStatus(u)}
                                className="cursor-pointer rounded-md border border-[#E7E5E4] px-2 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26] disabled:opacity-50"
                              >
                                {u.status === 'active' ? 'Suspend' : 'Activate'}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleResetPassword(u)}
                                className="cursor-pointer rounded-md border border-[#E7E5E4] px-2 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#1C1917] disabled:opacity-50"
                              >
                                Reset
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setDeletingUser(u)}
                                className="cursor-pointer rounded-md border border-[#E7E5E4] px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <span className="ml-1 text-[11px] text-[#78716C]">Protected</span>
                          )}
                        </div>
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
          Firebase project ({firebasePublicInfo.expectedProjectId}), 4-tier RBAC hierarchy, and server-side user governance.
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

        <div className="mt-4 rounded-lg border border-[#E7E5E4] bg-[#FAFAF8] p-3 text-xs text-[#44403C]">
          <p className="font-bold text-[#1C1917]">
            Cloudflare Worker Secret for Admin SDK Pre-Verified User Creation
          </p>
          <p className="mt-1 text-[11px]">
            Optional: Add <code className="font-mono font-semibold">FIREBASE_SERVICE_ACCOUNT_JSON</code> as a Cloudflare Worker secret (<code className="font-mono">npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON</code>) so new accounts created by the Super Admin are pre-verified immediately and Auth disable/delete actions sync to Firebase Authentication. Never commit service account keys to Git or frontend code.
          </p>
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
                <span>Admin, Manager &amp; User Creation</span>
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
            <p className="text-xs font-bold text-emerald-700">4. Staff / Support Agent</p>
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
