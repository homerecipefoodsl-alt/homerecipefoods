import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express, { type NextFunction, type Request, type Response } from 'express';
import dotenv from 'dotenv';
import {
  acquireAiRateLimitSlot,
  processAiChatRequest,
  type AiChatRequestBody,
} from './shared/aiChat';
import {
  EXPECTED_FIREBASE_PROJECT_ID as SHARED_EXPECTED_FIREBASE_PROJECT_ID,
  inspectServiceAccountConfig,
  type ServiceAccountConfig,
} from './shared/firebaseServiceAccount';
import {
  ALLOWED_MEDIA_MIME_TYPES,
  buildR2MediaPublicUrl,
  buildR2ObjectKey,
  CATALOG_UPLOAD_PERMISSIONS,
  CATALOG_UPLOAD_STAFF_ROLES,
  DEFAULT_R2_BUCKET_NAME,
  DEFAULT_R2_PUBLIC_DOMAIN,
  deleteObjectFromR2S3,
  extractR2KeyFromInput,
  getObjectFromR2S3,
  headObjectFromR2S3,
  inspectImageBytes,
  inspectR2S3Credentials,
  isAllowedMediaFolder,
  MAX_MEDIA_IMAGE_BYTES,
  putObjectToR2S3,
  resolveAllowedApiCorsOrigin,
  validateR2ReadKey,
  type MediaUploadFolder,
} from './shared/r2Media';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FirebaseAppletConfig {
  projectId?: string;
  apiKey?: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseAppletConfig(): FirebaseAppletConfig {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf-8');
    return JSON.parse(raw) as FirebaseAppletConfig;
  } catch {
    return {};
  }
}

const appletConfig = loadFirebaseAppletConfig();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '2mb' }));
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (
    req.path.startsWith('/api/') &&
    err &&
    typeof err === 'object' &&
    'type' in err &&
    (err as { type?: unknown }).type === 'entity.parse.failed'
  ) {
    res.status(400).json({
      success: false,
      ok: false,
      error: 'INVALID_REQUEST',
      code: 'INVALID_REQUEST',
      message: 'Invalid JSON request payload.',
    });
    return;
  }
  next(err);
});

// Ensure CORS & preflight headers on all /api/* routes and prevent caching
app.use('/api', (req, res, next) => {
  const host = req.get('host') || `localhost:${PORT}`;
  const proto = req.headers['x-forwarded-proto']
    ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
    : req.protocol;
  const currentOrigin = `${proto}://${host}`;
  const corsOrigin = resolveAllowedApiCorsOrigin(
    req.headers.origin,
    currentOrigin,
    process.env.APP_URL
  );
  res.setHeader('Vary', 'Origin');
  if (
    req.path === '/media/upload' ||
    req.path === '/media/delete' ||
    req.method === 'DELETE' ||
    req.path.startsWith('/admin/') ||
    req.path.startsWith('/auth/')
  ) {
    if (corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    }
  } else {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Chat-Client-Id, X-Upload-Folder, X-Entity-Id, X-File-Name, X-Is-Primary'
  );
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

const PRIMARY_SUPER_ADMIN_EMAIL = 'mdmahmudulhashan0@gmail.com';
const EXPECTED_FIREBASE_PROJECT_ID = 'ai-studio-applet-webapp-e4b0f';
const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const VALID_PERMISSIONS = [
  'dashboard_view',
  'products_view',
  'products_add',
  'products_edit',
  'products_delete',
  'categories_manage',
  'showrooms_manage',
  'banners_manage',
  'complaints_manage',
  'chat_manage',
  'recruitment_manage',
  'reports_view',
  'seo_manage',
  'settings_view',
  'admin_manage',
  'manager_manage',
] as const;

type StaffRole = 'primary_super_admin' | 'super_admin' | 'admin' | 'manager' | 'support_agent';

function isSuperAdminRole(role?: string | null): boolean {
  return role === 'primary_super_admin' || role === 'super_admin';
}

const DEFAULT_ROLE_PERMISSIONS: Record<StaffRole, string[]> = {
  primary_super_admin: [...VALID_PERMISSIONS],
  super_admin: [...VALID_PERMISSIONS],
  admin: [
    'dashboard_view',
    'products_view',
    'products_add',
    'products_edit',
    'products_delete',
    'categories_manage',
    'showrooms_manage',
    'banners_manage',
    'recruitment_manage',
    'reports_view',
  ],
  manager: [
    'dashboard_view',
    'products_view',
    'products_add',
    'products_edit',
    'categories_manage',
    'showrooms_manage',
    'complaints_manage',
    'recruitment_manage',
    'reports_view',
  ],
  support_agent: ['dashboard_view', 'complaints_manage', 'chat_manage'],
};

const firebaseProjectId = (
  process.env.VITE_FIREBASE_PROJECT_ID ||
  appletConfig.projectId ||
  EXPECTED_FIREBASE_PROJECT_ID
).trim();
const firebaseApiKey = (
  process.env.VITE_FIREBASE_API_KEY ||
  appletConfig.apiKey ||
  ''
).trim();
const firestoreDatabaseId = (
  process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
  appletConfig.firestoreDatabaseId ||
  '(default)'
).trim();

function sendError(
  res: Response,
  errorCode: string,
  message: string,
  status = 400,
  extra?: Record<string, unknown>
) {
  res.status(status).json({
    success: false,
    ok: false,
    error: errorCode,
    code: errorCode,
    message,
    ...(extra || {}),
  });
}

let cachedCerts: { keys: Record<string, string>; expiresAt: number } = {
  keys: {},
  expiresAt: 0,
};

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (now < cachedCerts.expiresAt && Object.keys(cachedCerts.keys).length > 0) {
    return cachedCerts.keys;
  }
  const resp = await fetch(FIREBASE_CERTS_URL);
  if (!resp.ok) {
    throw new Error('Failed to fetch Google Firebase public keys');
  }
  const keys = (await resp.json()) as Record<string, string>;
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = {
    keys,
    expiresAt: now + maxAgeSec * 1000,
  };
  return keys;
}

function base64UrlToBuffer(str: string): Buffer {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

interface VerifiedFirebaseToken {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseToken> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT structure');
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(base64UrlToBuffer(headerB64).toString('utf-8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(base64UrlToBuffer(payloadB64).toString('utf-8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported token algorithm');
  }

  const certs = await getFirebasePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    throw new Error('Unknown signing key');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const isValidSig = verifier.verify(certPem, base64UrlToBuffer(sigB64));
  if (!isValidSig) {
    throw new Error('Invalid token signature');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error('Token expired');
  }
  if (!payload.iat || payload.iat > nowSec + 300) {
    throw new Error('Token issued in the future');
  }
  if (firebaseProjectId) {
    if (
      payload.aud !== firebaseProjectId ||
      payload.iss !== `https://securetoken.google.com/${firebaseProjectId}`
    ) {
      throw new Error('Token project mismatch');
    }
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Missing subject UID');
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '',
    emailVerified: Boolean(payload.email_verified),
    name: typeof payload.name === 'string' ? payload.name : '',
  };
}

// Gemini client initialized per request inside shared/aiChat.ts using process.env.GEMINI_API_KEY

// Firebase service account validation & private_key \n handling lives in ./shared/firebaseServiceAccount.ts

let cachedServiceAccountToken: { token: string; expiresAt: number; clientEmail: string } | null =
  null;

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function getGoogleAdminAccessToken(sa: ServiceAccountConfig): Promise<string> {
  const now = Date.now();
  if (
    cachedServiceAccountToken &&
    cachedServiceAccountToken.clientEmail === sa.client_email &&
    now < cachedServiceAccountToken.expiresAt - 60_000
  ) {
    return cachedServiceAccountToken.token;
  }

  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope:
        'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/firebase',
      aud: 'https://oauth2.googleapis.com/token',
      iat,
      exp,
    })
  );

  const signingInput = `${header}.${claimSet}`;
  let signature: string;
  try {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    signature = base64UrlEncode(signer.sign(sa.private_key));
  } catch {
    throw new Error('Firebase Admin private key initialization failed.');
  }

  const assertion = `${signingInput}.${signature}`;
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });

  const tokenJson = (await tokenResp.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!tokenResp.ok || !tokenJson.access_token) {
    throw new Error('Firebase Admin OAuth token initialization failed.');
  }

  cachedServiceAccountToken = {
    token: tokenJson.access_token,
    expiresAt: now + (tokenJson.expires_in || 3600) * 1000,
    clientEmail: sa.client_email,
  };
  return tokenJson.access_token;
}

interface CallerRbacCheck {
  allowed: boolean;
  isPrimarySuperAdmin: boolean;
  isSuperAdmin: boolean;
  canManageManagers: boolean;
  callerEmail: string;
  role: string;
  status: string;
  adminDocExists: boolean;
}

async function verifyCallerStaffAuthority(
  idToken: string,
  callerEmail: string,
  callerUid = ''
): Promise<CallerRbacCheck> {
  const emailLower = callerEmail.trim().toLowerCase();

  try {
    // 1. Primary Authority: /admins/{uid}
    if (callerUid) {
      const adminUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        firebaseProjectId
      )}/databases/${encodeURIComponent(
        firestoreDatabaseId
      )}/documents/admins/${encodeURIComponent(callerUid)}`;
      const adminResp = await fetch(adminUrl, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (adminResp.ok) {
        const adminData = (await adminResp.json()) as {
          fields?: {
            email?: { stringValue?: string };
            role?: { stringValue?: string };
            active?: { booleanValue?: boolean };
            isActive?: { booleanValue?: boolean };
            status?: { stringValue?: string };
            permissions?: { arrayValue?: { values?: Array<{ stringValue?: string }> } };
          };
        };
        const docEmail = (adminData.fields?.email?.stringValue || '').trim().toLowerCase();
        const role = adminData.fields?.role?.stringValue || '';
        const status = adminData.fields?.status?.stringValue || '';
        const hasActiveField = Boolean(adminData.fields && 'active' in adminData.fields);
        const hasIsActiveField = Boolean(adminData.fields && 'isActive' in adminData.fields);
        const activeFlag = adminData.fields?.active?.booleanValue;
        const isActiveFlag = adminData.fields?.isActive?.booleanValue;
        const emailMatches = !docEmail || docEmail === emailLower;
        const explicitlyInactive =
          activeFlag === false ||
          isActiveFlag === false ||
          status === 'disabled' ||
          status === 'suspended';
        const explicitlyActive =
          (hasActiveField && activeFlag === true) ||
          (hasIsActiveField && isActiveFlag === true) ||
          status === 'active';
        const isActive = emailMatches && !explicitlyInactive && explicitlyActive;

        const permissions = (adminData.fields?.permissions?.arrayValue?.values || [])
          .map((v) => v.stringValue || '')
          .filter(Boolean);
        const isSuper = isActive && isSuperAdminRole(role);
        const canManageManagers =
          isActive && (isSuper || permissions.includes('manager_manage'));
        return {
          allowed: isSuper || canManageManagers,
          isPrimarySuperAdmin: isSuper && emailLower === PRIMARY_SUPER_ADMIN_EMAIL,
          isSuperAdmin: isSuper,
          canManageManagers,
          callerEmail: emailLower,
          role: role || 'customer',
          status: isActive ? 'active' : status || 'disabled',
          adminDocExists: true,
        };
      }

      if (adminResp.status !== 404) {
        return {
          allowed: false,
          isPrimarySuperAdmin: false,
          isSuperAdmin: false,
          canManageManagers: false,
          callerEmail: emailLower,
          role: 'customer',
          status: 'disabled',
          adminDocExists: false,
        };
      }
    }

    // 2. Fallback Authority: /rbac_roles/{email} ONLY when /admins/{uid} does not exist (404)
    const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      firebaseProjectId
    )}/databases/${encodeURIComponent(
      firestoreDatabaseId
    )}/documents/rbac_roles/${encodeURIComponent(emailLower)}`;
    const resp = await fetch(docUrl, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (resp.ok) {
      const docData = (await resp.json()) as {
        fields?: {
          email?: { stringValue?: string };
          role?: { stringValue?: string };
          status?: { stringValue?: string };
          permissions?: { arrayValue?: { values?: Array<{ stringValue?: string }> } };
        };
      };
      const docEmail = (docData.fields?.email?.stringValue || '').trim().toLowerCase();
      const role = docData.fields?.role?.stringValue || '';
      const status = docData.fields?.status?.stringValue || '';
      const permissions = (docData.fields?.permissions?.arrayValue?.values || [])
        .map((v) => v.stringValue || '')
        .filter(Boolean);

      const isActive = (!docEmail || docEmail === emailLower) && status === 'active';
      const isSuper = isActive && isSuperAdminRole(role);
      const canManageManagers = isActive && (isSuper || permissions.includes('manager_manage'));
      return {
        allowed: isSuper || canManageManagers,
        isPrimarySuperAdmin: isSuper && emailLower === PRIMARY_SUPER_ADMIN_EMAIL,
        isSuperAdmin: isSuper,
        canManageManagers,
        callerEmail: emailLower,
        role: role || 'customer',
        status: isActive ? 'active' : status || 'disabled',
        adminDocExists: false,
      };
    }

    return {
      allowed: false,
      isPrimarySuperAdmin: false,
      isSuperAdmin: false,
      canManageManagers: false,
      callerEmail: emailLower,
      role: 'customer',
      status: 'disabled',
      adminDocExists: false,
    };
  } catch {
    return {
      allowed: false,
      isPrimarySuperAdmin: false,
      isSuperAdmin: false,
      canManageManagers: false,
      callerEmail: emailLower,
      role: 'customer',
      status: 'disabled',
      adminDocExists: false,
    };
  }
}

async function verifyCatalogUploadAuthority(
  idToken: string,
  callerUid: string,
  callerEmail: string
): Promise<{ allowed: boolean; role: string }> {
  const emailLower = callerEmail.trim().toLowerCase();

  try {
    // 1. Primary Authority: /admins/{uid}
    if (callerUid) {
      const adminUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        firebaseProjectId
      )}/databases/${encodeURIComponent(
        firestoreDatabaseId
      )}/documents/admins/${encodeURIComponent(callerUid)}`;
      const adminResp = await fetch(adminUrl, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (adminResp.ok) {
        const adminData = (await adminResp.json()) as {
          fields?: {
            email?: { stringValue?: string };
            role?: { stringValue?: string };
            active?: { booleanValue?: boolean };
            isActive?: { booleanValue?: boolean };
            status?: { stringValue?: string };
            permissions?: { arrayValue?: { values?: Array<{ stringValue?: string }> } };
          };
        };
        const docEmail = (adminData.fields?.email?.stringValue || '').trim().toLowerCase();
        const role = adminData.fields?.role?.stringValue || '';
        const status = adminData.fields?.status?.stringValue || '';
        const hasActiveField = Boolean(adminData.fields && 'active' in adminData.fields);
        const hasIsActiveField = Boolean(adminData.fields && 'isActive' in adminData.fields);
        const activeFlag = adminData.fields?.active?.booleanValue;
        const isActiveFlag = adminData.fields?.isActive?.booleanValue;
        const emailMatches = !docEmail || docEmail === emailLower;
        const explicitlyInactive =
          activeFlag === false ||
          isActiveFlag === false ||
          status === 'disabled' ||
          status === 'suspended';
        const explicitlyActive =
          (hasActiveField && activeFlag === true) ||
          (hasIsActiveField && isActiveFlag === true) ||
          status === 'active';
        const isActive = emailMatches && !explicitlyInactive && explicitlyActive;

        const hasExplicitPermissions = Boolean(adminData.fields && 'permissions' in adminData.fields);
        const permissions = (adminData.fields?.permissions?.arrayValue?.values || [])
          .map((v) => v.stringValue || '')
          .filter(Boolean);
        const hasCatalogPerm =
          isSuperAdminRole(role) ||
          (hasExplicitPermissions
            ? CATALOG_UPLOAD_PERMISSIONS.some((perm) => permissions.includes(perm))
            : CATALOG_UPLOAD_STAFF_ROLES.has(role));
        return { allowed: isActive && hasCatalogPerm, role: role || 'customer' };
      }

      if (adminResp.status !== 404) {
        return { allowed: false, role: 'customer' };
      }
    }

    // 2. Fallback Authority: /rbac_roles/{email} ONLY when /admins/{uid} is missing (404)
    const rbacUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      firebaseProjectId
    )}/databases/${encodeURIComponent(
      firestoreDatabaseId
    )}/documents/rbac_roles/${encodeURIComponent(emailLower)}`;
    const rbacResp = await fetch(rbacUrl, {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (rbacResp.ok) {
      const docData = (await rbacResp.json()) as {
        fields?: {
          email?: { stringValue?: string };
          role?: { stringValue?: string };
          status?: { stringValue?: string };
          permissions?: { arrayValue?: { values?: Array<{ stringValue?: string }> } };
        };
      };
      const docEmail = (docData.fields?.email?.stringValue || '').trim().toLowerCase();
      const role = docData.fields?.role?.stringValue || '';
      const status = docData.fields?.status?.stringValue || '';
      const hasExplicitPermissions = Boolean(docData.fields && 'permissions' in docData.fields);
      const permissions = (docData.fields?.permissions?.arrayValue?.values || [])
        .map((v) => v.stringValue || '')
        .filter(Boolean);
      const isActive = (!docEmail || docEmail === emailLower) && status === 'active';
      const hasCatalogPerm =
        isSuperAdminRole(role) ||
        (hasExplicitPermissions
          ? CATALOG_UPLOAD_PERMISSIONS.some((perm) => permissions.includes(perm))
          : CATALOG_UPLOAD_STAFF_ROLES.has(role));
      return { allowed: isActive && hasCatalogPerm, role: role || 'customer' };
    }
  } catch {
    // Deny on verification failure
  }

  return { allowed: false, role: 'customer' };
}

async function syncFirebaseStaffCustomClaims(params: {
  adminToken: string;
  projectId: string;
  uid: string;
  role: string;
  status: string;
}): Promise<boolean> {
  if (!params.uid) return false;
  const isCatalogStaff =
    params.status === 'active' &&
    ['primary_super_admin', 'super_admin', 'admin', 'manager'].includes(params.role);
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(
        params.projectId
      )}/accounts:update`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.adminToken}`,
        },
        body: JSON.stringify({
          localId: params.uid,
          customAttributes: JSON.stringify({
            hrf_staff: isCatalogStaff,
            role: params.role,
            staff_status: params.status,
          }),
        }),
      }
    );
    return resp.ok;
  } catch {
    return false;
  }
}

function mapIdentityToolkitError(rawCode: string): {
  status: number;
  code: string;
  message: string;
} {
  const code = (rawCode || 'AUTH_ERROR').trim();
  if (code.includes('EMAIL_EXISTS') || code.includes('DUPLICATE_EMAIL')) {
    return {
      status: 409,
      code: 'EMAIL_EXISTS',
      message: 'এই email দিয়ে ইতিমধ্যে একটি account রয়েছে।',
    };
  }
  if (code.includes('INVALID_EMAIL')) {
    return {
      status: 400,
      code: 'INVALID_EMAIL',
      message: 'Please enter a valid email address.',
    };
  }
  if (code.includes('OPERATION_NOT_ALLOWED')) {
    return {
      status: 400,
      code: 'OPERATION_NOT_ALLOWED',
      message:
        'Email/Password sign-in is disabled in Firebase Authentication. Enable it under Firebase Console → Authentication → Sign-in method.',
    };
  }
  if (code.includes('WEAK_PASSWORD')) {
    return {
      status: 400,
      code: 'WEAK_PASSWORD',
      message: 'Password must be at least 8 characters.',
    };
  }
  if (code.includes('USER_NOT_FOUND')) {
    return {
      status: 404,
      code: 'USER_NOT_FOUND',
      message: 'No Firebase Auth user found for this account.',
    };
  }
  return {
    status: 400,
    code,
    message: `Firebase Auth request failed (${code}).`,
  };
}

function toFirestoreStringArray(items: string[]) {
  return items.length > 0
    ? { arrayValue: { values: items.map((s) => ({ stringValue: s })) } }
    : { arrayValue: {} };
}

function generateManagerId(): string {
  const year = new Date().getFullYear();
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const rand = crypto.randomBytes(4);
  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix += chars[rand[i] % chars.length];
  }
  return `MGR-${year}-${suffix}`;
}

async function firestoreDocExists(
  adminToken: string,
  projectId: string,
  databaseId: string,
  collectionName: string,
  docId: string
): Promise<boolean> {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(databaseId)}/documents/${encodeURIComponent(
    collectionName
  )}/${encodeURIComponent(docId)}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  return resp.ok;
}

async function commitStaffProfileFirestore(params: {
  adminToken: string;
  projectId: string;
  databaseId: string;
  uid: string;
  email: string;
  name: string;
  phone: string;
  username: string;
  role: StaffRole;
  status: 'active' | 'suspended' | 'disabled';
  permissions: string[];
  managerId: string;
  managerTitle: string;
  creatorEmail: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const basePath = `projects/${params.projectId}/databases/${params.databaseId}/documents`;
  const isActive = params.status === 'active';

  const rbacFields: Record<string, unknown> = {
    email: { stringValue: params.email },
    uid: { stringValue: params.uid },
    username: { stringValue: params.username },
    name: { stringValue: params.name },
    displayName: { stringValue: params.name },
    phone: { stringValue: params.phone },
    permissions: toFirestoreStringArray(params.permissions),
    role: { stringValue: params.role },
    status: { stringValue: params.status },
    addedByEmail: { stringValue: params.creatorEmail },
    createdBy: { stringValue: params.creatorEmail },
  };
  if (params.role === 'manager') {
    rbacFields.managerId = { stringValue: params.managerId };
    rbacFields.managerTitle = { stringValue: params.managerTitle || 'Store Manager' };
  }

  const adminFields: Record<string, unknown> = {
    uid: { stringValue: params.uid },
    email: { stringValue: params.email },
    username: { stringValue: params.username },
    name: { stringValue: params.name },
    display_name: { stringValue: params.name },
    phone: { stringValue: params.phone },
    permissions: toFirestoreStringArray(params.permissions),
    role: { stringValue: params.role },
    active: { booleanValue: isActive },
    status: { stringValue: params.status },
    created_by: { stringValue: params.creatorEmail },
  };
  if (params.role === 'manager') {
    adminFields.manager_id = { stringValue: params.managerId };
    adminFields.manager_title = { stringValue: params.managerTitle || 'Store Manager' };
  }

  const userFields: Record<string, unknown> = {
    uid: { stringValue: params.uid },
    email: { stringValue: params.email },
    name: { stringValue: params.name },
    displayName: { stringValue: params.name },
    photoUrl: { stringValue: '' },
    phone: { stringValue: params.phone },
    permissions: toFirestoreStringArray(params.permissions),
    role: { stringValue: params.role },
    status: { stringValue: params.status },
    createdBy: { stringValue: params.creatorEmail },
    ...(params.role === 'manager' ? { managerId: { stringValue: params.managerId } } : {}),
  };

  const writes: Array<Record<string, unknown>> = [
    {
      update: {
        name: `${basePath}/rbac_roles/${params.email}`,
        fields: rbacFields,
      },
      updateTransforms: [
        { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
      ],
    },
    {
      update: {
        name: `${basePath}/admins/${params.uid}`,
        fields: adminFields,
      },
      updateTransforms: [
        { fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' },
      ],
    },
    {
      update: {
        name: `${basePath}/users/${params.uid}`,
        fields: userFields,
      },
      updateTransforms: [
        { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'lastLoginAt', setToServerValue: 'REQUEST_TIME' },
      ],
    },
  ];

  if (params.username) {
    writes.push({
      update: {
        name: `${basePath}/admin_usernames/${params.username}`,
        fields: {
          username: { stringValue: params.username },
          email: { stringValue: params.email },
          active: { booleanValue: isActive },
        },
      },
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
    });
  }

  const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    params.projectId
  )}/databases/${encodeURIComponent(params.databaseId)}/documents:commit`;

  const resp = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.adminToken}`,
    },
    body: JSON.stringify({ writes }),
  });

  if (!resp.ok) {
    let reason = `Firestore commit failed (${resp.status})`;
    try {
      const errJson = (await resp.json()) as { error?: { message?: string } };
      if (errJson.error?.message) {
        reason = errJson.error.message;
      }
    } catch {
      // Ignore parse failure
    }
    return { ok: false, message: reason };
  }

  return { ok: true };
}

async function rollbackCreatedAuthUser(
  adminToken: string,
  targetProject: string,
  uidToDelete: string
): Promise<boolean> {
  if (!uidToDelete) return false;
  try {
    const delResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(
        targetProject
      )}/accounts:delete`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ localId: uidToDelete }),
      }
    );
    return delResp.ok;
  } catch {
    return false;
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    ok: true,
    brand: 'Home Recipe Foods',
    runtime: 'express-server',
    firebaseProjectId,
  });
});

app.post('/api/auth/session-init', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      sendError(res, 'UNAUTHORIZED', 'Missing Bearer token.', 401);
      return;
    }

    const decoded = await verifyFirebaseIdToken(token);
    if (!decoded.email || !decoded.emailVerified) {
      res.status(403).json({
        success: false,
        verified: false,
        authorizedSuperAdmin: false,
        role: 'customer',
      });
      return;
    }

    let authority = await verifyCallerStaffAuthority(token, decoded.email, decoded.uid);
    const saCheck = inspectServiceAccountConfig(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      SHARED_EXPECTED_FIREBASE_PROJECT_ID || firebaseProjectId
    );
    let cryptoInitialized = saCheck.ok;
    if (saCheck.ok) {
      try {
        crypto.createPrivateKey(saCheck.config.private_key);
      } catch {
        cryptoInitialized = false;
      }
    }

    const serviceAccountStatus = !saCheck.ok
      ? saCheck.diagnosticStatus
      : cryptoInitialized
      ? 'Ready'
      : 'initialization_error';

    const serviceAccountMessage = !saCheck.ok
      ? saCheck.message
      : cryptoInitialized
      ? 'Admin SDK Status: Ready'
      : 'Firebase Admin private key could not be initialized.';

    let adminDocExists = authority.adminDocExists;
    let adminDocCreated = false;
    const adminDocPath = `admins/${decoded.uid}`;

    let adminToken: string | null = null;
    if (saCheck.ok && cryptoInitialized) {
      try {
        adminToken = await getGoogleAdminAccessToken(saCheck.config);
      } catch {
        adminToken = null;
      }
    }

    // Server-side Admin SDK check & one-time missing primary super admin bootstrap ONLY if missing
    if (
      adminToken &&
      !adminDocExists &&
      decoded.email.trim().toLowerCase() === PRIMARY_SUPER_ADMIN_EMAIL &&
      decoded.emailVerified
    ) {
      try {
        const targetProject = saCheck.ok ? saCheck.config.project_id : firebaseProjectId;
        const adminGetUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
          targetProject
        )}/databases/${encodeURIComponent(
          firestoreDatabaseId
        )}/documents/admins/${encodeURIComponent(decoded.uid)}`;
        const existingCheck = await fetch(adminGetUrl, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (existingCheck.ok) {
          adminDocExists = true;
        } else if (existingCheck.status === 404) {
          const nowIso = new Date().toISOString();
          const createUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
            targetProject
          )}/databases/${encodeURIComponent(
            firestoreDatabaseId
          )}/documents/admins?documentId=${encodeURIComponent(decoded.uid)}`;
          const createResp = await fetch(createUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
              fields: {
                uid: { stringValue: decoded.uid },
                email: { stringValue: decoded.email.trim().toLowerCase() },
                username: { stringValue: 'mahmud' },
                display_name: { stringValue: 'Mahmud (Primary Super Admin)' },
                role: { stringValue: 'primary_super_admin' },
                active: { booleanValue: true },
                isActive: { booleanValue: true },
                status: { stringValue: 'active' },
                permissions: {
                  arrayValue: {
                    values: VALID_PERMISSIONS.map((p) => ({ stringValue: p })),
                  },
                },
                created_by: { stringValue: 'server-session-init' },
                created_at: { timestampValue: nowIso },
                updated_at: { timestampValue: nowIso },
                last_login_at: { timestampValue: nowIso },
              },
            }),
          });
          if (createResp.ok) {
            adminDocCreated = true;
            adminDocExists = true;
            authority = await verifyCallerStaffAuthority(token, decoded.email, decoded.uid);
          }
        }
      } catch {
        // Non-blocking bootstrap attempt
      }
    }

    let claimsSynced = false;
    if (
      adminToken &&
      saCheck.ok &&
      authority.status === 'active' &&
      ['primary_super_admin', 'super_admin', 'admin', 'manager', 'support_agent'].includes(
        authority.role
      )
    ) {
      try {
        claimsSynced = await syncFirebaseStaffCustomClaims({
          adminToken,
          projectId: saCheck.config.project_id,
          uid: decoded.uid,
          role: authority.role,
          status: authority.status,
        });
      } catch {
        claimsSynced = false;
      }
    }

    res.json({
      success: true,
      ok: true,
      verified: true,
      uid: decoded.uid,
      email: decoded.email,
      isPrimarySuperAdmin: authority.isPrimarySuperAdmin,
      authorizedSuperAdmin: authority.isSuperAdmin,
      adminDocExists,
      adminDocCreated,
      adminDocPath,
      adminRole: authority.role,
      hasAdminCredentials: saCheck.ok && cryptoInitialized,
      claimsSynced,
      serviceAccountStatus,
      serviceAccountMessage,
      role: isSuperAdminRole(authority.role) && authority.status === 'active'
        ? authority.role
        : ['admin', 'manager', 'support_agent'].includes(authority.role) && authority.status === 'active'
        ? authority.role
        : authority.canManageManagers
        ? 'manager'
        : 'customer',
    });
  } catch {
    sendError(res, 'UNAUTHORIZED', 'Invalid or expired Firebase ID token.', 401);
  }
});

async function handleCreateAdminUser(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      sendError(res, 'UNAUTHORIZED', 'Missing Authorization Bearer token.', 401);
      return;
    }

    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch {
      sendError(res, 'UNAUTHORIZED', 'Invalid or expired Firebase ID token.', 401);
      return;
    }
    if (!decoded.email || !decoded.emailVerified) {
      sendError(res, 'UNVERIFIED_ADMIN', 'Verified administrator token required.', 403);
      return;
    }

    const authority = await verifyCallerStaffAuthority(idToken, decoded.email, decoded.uid);
    if (!authority.isSuperAdmin) {
      sendError(
        res,
        'PERMISSION_DENIED',
        'Only a verified Super Admin can create Admin, Manager, or Staff accounts.',
        403
      );
      return;
    }

    const body = (req.body || {}) as {
      email?: unknown;
      password?: unknown;
      name?: unknown;
      displayName?: unknown;
      phone?: unknown;
      username?: unknown;
      role?: unknown;
      status?: unknown;
      permissions?: unknown;
      managerId?: unknown;
      managerTitle?: unknown;
      allowSuperAdminCreation?: unknown;
    };

    const cleanEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const rawName =
      typeof body.name === 'string' && body.name.trim()
        ? body.name
        : typeof body.displayName === 'string'
        ? body.displayName
        : '';
    const cleanName = rawName.trim().slice(0, 120);
    const cleanPhone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : '';
    const cleanUsername =
      typeof body.username === 'string'
        ? body.username
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '')
            .slice(0, 64)
        : '';
    const cleanRole = typeof body.role === 'string' ? body.role.trim() : '';
    const cleanStatus: 'active' | 'suspended' | 'disabled' =
      body.status === 'suspended' || body.status === 'disabled' ? body.status : 'active';

    if (!cleanName) {
      sendError(res, 'VALIDATION_ERROR', 'Full Name is required.', 400);
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      sendError(res, 'INVALID_EMAIL', 'Please enter a valid email address.', 400);
      return;
    }
    if (cleanEmail === PRIMARY_SUPER_ADMIN_EMAIL) {
      sendError(
        res,
        'EMAIL_EXISTS',
        'এই email দিয়ে ইতিমধ্যে একটি account রয়েছে।',
        409
      );
      return;
    }
    if (!['super_admin', 'admin', 'manager', 'support_agent'].includes(cleanRole)) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid role selected.', 400);
      return;
    }
    const targetRole = cleanRole as StaffRole;

    if (targetRole === 'super_admin') {
      if (!authority.isPrimarySuperAdmin || body.allowSuperAdminCreation !== true) {
        sendError(
          res,
          'PERMISSION_DENIED',
          'Only the primary Super Admin can explicitly authorize creating another Super Admin account.',
          403
        );
        return;
      }
    }
    if (typeof body.password !== 'string' || body.password.length < 8) {
      sendError(res, 'WEAK_PASSWORD', 'Password must be at least 8 characters.', 400);
      return;
    }
    if (cleanUsername === 'mahmud') {
      sendError(res, 'VALIDATION_ERROR', 'Username "mahmud" is reserved.', 400);
      return;
    }

    const validPermSet = new Set<string>(VALID_PERMISSIONS);
    const requestedPermissions = Array.isArray(body.permissions)
      ? body.permissions.filter(
          (p): p is string => typeof p === 'string' && validPermSet.has(p)
        )
      : DEFAULT_ROLE_PERMISSIONS[targetRole];
    const sanitizedPermissions =
      targetRole === 'super_admin'
        ? [...DEFAULT_ROLE_PERMISSIONS.super_admin]
        : Array.from(new Set(requestedPermissions)).slice(0, 25);

    const cleanManagerId =
      targetRole === 'manager'
        ? (typeof body.managerId === 'string' && body.managerId.trim()
            ? body.managerId.trim()
            : generateManagerId()
          )
            .toUpperCase()
            .slice(0, 40)
        : '';
    if (targetRole === 'manager' && !/^[A-Za-z0-9_-]{3,40}$/.test(cleanManagerId)) {
      sendError(
        res,
        'VALIDATION_ERROR',
        'Manager ID must be 3–40 characters using letters, numbers, - or _.',
        400
      );
      return;
    }
    const cleanManagerTitle =
      targetRole === 'manager'
        ? (typeof body.managerTitle === 'string' && body.managerTitle.trim()
            ? body.managerTitle.trim()
            : 'Store Manager'
          ).slice(0, 100)
        : '';

    const saCheck = inspectServiceAccountConfig(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      SHARED_EXPECTED_FIREBASE_PROJECT_ID || firebaseProjectId
    );
    if (!saCheck.ok) {
      sendError(res, saCheck.errorCode, saCheck.message, saCheck.status);
      return;
    }

    let adminToken: string;
    try {
      adminToken = await getGoogleAdminAccessToken(saCheck.config);
    } catch {
      sendError(
        res,
        'FIREBASE_ADMIN_INIT_FAILED',
        'Firebase Admin SDK initialization failed. Verify the FIREBASE_SERVICE_ACCOUNT_JSON secret.',
        500
      );
      return;
    }

    const targetProject = saCheck.config.project_id;

    const existingRbacDoc = await firestoreDocExists(
      adminToken,
      targetProject,
      firestoreDatabaseId,
      'rbac_roles',
      cleanEmail
    );
    if (existingRbacDoc) {
      sendError(
        res,
        'EMAIL_EXISTS',
        'এই email দিয়ে ইতিমধ্যে একটি account রয়েছে।',
        409
      );
      return;
    }

    if (cleanUsername) {
      const existingUsernameDoc = await firestoreDocExists(
        adminToken,
        targetProject,
        firestoreDatabaseId,
        'admin_usernames',
        cleanUsername
      );
      if (existingUsernameDoc) {
        sendError(
          res,
          'USERNAME_EXISTS',
          `Username "@${cleanUsername}" is already in use.`,
          409
        );
        return;
      }
    }

    const createResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(
        targetProject
      )}/accounts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: body.password,
          displayName: cleanName,
          emailVerified: true,
          disabled: cleanStatus !== 'active',
        }),
      }
    );

    const createJson = (await createResp.json()) as {
      localId?: string;
      email?: string;
      error?: { message?: string };
    };

    if (!createResp.ok || !createJson.localId) {
      const rawCode = createJson.error?.message || 'ADMIN_CREATE_FAILED';
      const mapped = mapIdentityToolkitError(rawCode);
      sendError(res, mapped.code, mapped.message, mapped.status);
      return;
    }

    const createdUid = createJson.localId;
    const createdEmail = (createJson.email || cleanEmail).toLowerCase();

    const firestoreResult = await commitStaffProfileFirestore({
      adminToken,
      projectId: targetProject,
      databaseId: firestoreDatabaseId,
      uid: createdUid,
      email: createdEmail,
      name: cleanName,
      phone: cleanPhone,
      username: cleanUsername,
      role: targetRole,
      status: cleanStatus,
      permissions: sanitizedPermissions,
      managerId: cleanManagerId,
      managerTitle: cleanManagerTitle,
      creatorEmail: decoded.email,
    });

    if (!firestoreResult.ok) {
      const rolledBack = await rollbackCreatedAuthUser(
        adminToken,
        targetProject,
        createdUid
      );
      sendError(
        res,
        'FIRESTORE_PROFILE_FAILED',
        rolledBack
          ? 'Failed to create Firestore user profile; newly created Auth user was automatically rolled back.'
          : 'Failed to create Firestore user profile.',
        500,
        { rolledBack }
      );
      return;
    }

    await syncFirebaseStaffCustomClaims({
      adminToken,
      projectId: targetProject,
      uid: createdUid,
      role: targetRole,
      status: cleanStatus,
    });

    const successMessage =
      targetRole === 'admin'
        ? 'Admin successfully created'
        : targetRole === 'manager'
        ? 'Manager successfully created'
        : targetRole === 'super_admin'
        ? 'Super Admin successfully created'
        : 'Staff user successfully created';

    res.status(201).json({
      success: true,
      ok: true,
      uid: createdUid,
      name: cleanName,
      displayName: cleanName,
      email: createdEmail,
      phone: cleanPhone,
      username: cleanUsername,
      role: targetRole,
      status: cleanStatus,
      permissions: sanitizedPermissions,
      ...(targetRole === 'manager'
        ? { managerId: cleanManagerId, managerTitle: cleanManagerTitle }
        : {}),
      emailVerified: true,
      verificationEmailSent: false,
      authMode: 'admin_sdk',
      firestoreSynced: true,
      message: successMessage,
    });
  } catch (err) {
    console.error('Create staff user error:', err instanceof Error ? err.message : 'Unknown error');
    sendError(
      res,
      'INTERNAL_SERVER_ERROR',
      'Unexpected server error while creating administrator account.',
      500
    );
  }
}

app.post('/api/admin/create-user', handleCreateAdminUser);
app.post('/api/admin/create', handleCreateAdminUser);

app.post('/api/admin/rollback-user', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      sendError(res, 'UNAUTHORIZED', 'Missing Authorization Bearer token.', 401);
      return;
    }

    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch {
      sendError(res, 'UNAUTHORIZED', 'Invalid or expired Firebase ID token.', 401);
      return;
    }
    if (!decoded.email || !decoded.emailVerified) {
      sendError(res, 'UNVERIFIED_ADMIN', 'Verified administrator token required.', 403);
      return;
    }

    const authority = await verifyCallerStaffAuthority(idToken, decoded.email, decoded.uid);
    if (!authority.isSuperAdmin) {
      sendError(res, 'PERMISSION_DENIED', 'Unauthorized rollback request.', 403);
      return;
    }

    const { uid } = (req.body || {}) as { uid?: string };
    const targetUid = typeof uid === 'string' ? uid.trim() : '';
    if (!targetUid || targetUid === decoded.uid) {
      sendError(res, 'INVALID_REQUEST', 'Invalid rollback target UID.', 400);
      return;
    }

    const saCheck = inspectServiceAccountConfig(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      firebaseProjectId
    );
    if (!saCheck.ok) {
      sendError(res, saCheck.errorCode, saCheck.message, saCheck.status);
      return;
    }

    const adminToken = await getGoogleAdminAccessToken(saCheck.config);
    const rolledBack = await rollbackCreatedAuthUser(
      adminToken,
      saCheck.config.project_id,
      targetUid
    );
    if (!rolledBack) {
      sendError(res, 'ROLLBACK_FAILED', 'Admin SDK rollback delete failed.', 500);
      return;
    }
    res.json({ success: true, ok: true });
  } catch {
    sendError(res, 'ROLLBACK_FAILED', 'Rollback failed.', 500);
  }
});

app.post('/api/admin/update-user-status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      sendError(res, 'UNAUTHORIZED', 'Missing Authorization Bearer token.', 401);
      return;
    }

    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch {
      sendError(res, 'UNAUTHORIZED', 'Invalid or expired Firebase ID token.', 401);
      return;
    }
    if (!decoded.email || !decoded.emailVerified) {
      sendError(res, 'UNVERIFIED_ADMIN', 'Verified administrator token required.', 403);
      return;
    }

    const authority = await verifyCallerStaffAuthority(idToken, decoded.email, decoded.uid);
    if (!authority.allowed) {
      sendError(res, 'PERMISSION_DENIED', 'Insufficient privileges.', 403);
      return;
    }

    const { uid, email, role, disabled } = (req.body || {}) as {
      uid?: string;
      email?: string;
      role?: string;
      disabled?: boolean;
    };

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanUid = typeof uid === 'string' ? uid.trim() : '';

    if (cleanEmail === PRIMARY_SUPER_ADMIN_EMAIL || (cleanUid && cleanUid === decoded.uid)) {
      sendError(
        res,
        'PERMISSION_DENIED',
        'Primary Super Admin or current session cannot be disabled.',
        403
      );
      return;
    }
    if (!authority.isSuperAdmin && role !== 'manager') {
      sendError(
        res,
        'PERMISSION_DENIED',
        'Only a Super Admin can modify non-manager accounts.',
        403
      );
      return;
    }

    const saCheck = inspectServiceAccountConfig(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      firebaseProjectId
    );
    if (!saCheck.ok || !cleanUid) {
      res.json({ success: true, ok: true, authSynced: false });
      return;
    }

    const adminToken = await getGoogleAdminAccessToken(saCheck.config);
    const updateResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(
        saCheck.config.project_id
      )}/accounts:update`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          localId: cleanUid,
          disableUser: Boolean(disabled),
          ...(typeof role === 'string' && role
            ? {
                customAttributes: JSON.stringify({
                  hrf_staff:
                    !Boolean(disabled) &&
                    ['primary_super_admin', 'super_admin', 'admin', 'manager'].includes(role),
                  role,
                  staff_status: Boolean(disabled) ? 'disabled' : 'active',
                }),
              }
            : {}),
        }),
      }
    );

    if (!updateResp.ok) {
      const errJson = (await updateResp.json()) as { error?: { message?: string } };
      sendError(
        res,
        'AUTH_UPDATE_FAILED',
        errJson.error?.message || 'Failed to update Firebase Auth user status.',
        400
      );
      return;
    }

    res.json({ success: true, ok: true, authSynced: true });
  } catch (err) {
    console.error('Update user status error:', err instanceof Error ? err.message : 'Unknown error');
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update user status.', 500);
  }
});

app.post('/api/admin/reset-password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      sendError(res, 'UNAUTHORIZED', 'Missing Authorization Bearer token.', 401);
      return;
    }

    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch {
      sendError(res, 'UNAUTHORIZED', 'Invalid or expired Firebase ID token.', 401);
      return;
    }
    if (!decoded.email || !decoded.emailVerified) {
      sendError(res, 'UNVERIFIED_ADMIN', 'Verified administrator token required.', 403);
      return;
    }

    const authority = await verifyCallerStaffAuthority(idToken, decoded.email, decoded.uid);
    if (!authority.isSuperAdmin) {
      sendError(
        res,
        'PERMISSION_DENIED',
        'Only a Super Admin can send user password resets.',
        403
      );
      return;
    }

    const { email } = (req.body || {}) as { email?: string };
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      sendError(res, 'VALIDATION_ERROR', 'Valid target email address is required.', 400);
      return;
    }
    if (!firebaseApiKey) {
      sendError(res, 'FIREBASE_CONFIG_MISSING', 'Firebase Web API key missing on server.', 500);
      return;
    }

    const resetResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(
        firebaseApiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email: cleanEmail,
        }),
      }
    );

    if (!resetResp.ok) {
      const errJson = (await resetResp.json()) as { error?: { message?: string } };
      const mapped = mapIdentityToolkitError(errJson.error?.message || 'RESET_FAILED');
      sendError(res, mapped.code, mapped.message, mapped.status);
      return;
    }

    res.json({ success: true, ok: true, email: cleanEmail });
  } catch (err) {
    console.error('Reset password error:', err instanceof Error ? err.message : 'Unknown error');
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to send password reset email.', 500);
  }
});

app.post('/api/admin/delete-user', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      sendError(res, 'UNAUTHORIZED', 'Missing Authorization Bearer token.', 401);
      return;
    }

    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch {
      sendError(res, 'UNAUTHORIZED', 'Invalid or expired Firebase ID token.', 401);
      return;
    }
    if (!decoded.email || !decoded.emailVerified) {
      sendError(res, 'UNVERIFIED_ADMIN', 'Verified administrator token required.', 403);
      return;
    }

    const authority = await verifyCallerStaffAuthority(idToken, decoded.email, decoded.uid);
    if (!authority.isSuperAdmin) {
      sendError(res, 'PERMISSION_DENIED', 'Only a Super Admin can delete user accounts.', 403);
      return;
    }

    const { uid, email } = (req.body || {}) as { uid?: string; email?: string };
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanUid = typeof uid === 'string' ? uid.trim() : '';

    if (cleanEmail === PRIMARY_SUPER_ADMIN_EMAIL || (cleanUid && cleanUid === decoded.uid)) {
      sendError(
        res,
        'PERMISSION_DENIED',
        'Primary Super Admin or current account cannot be deleted.',
        403
      );
      return;
    }

    const saCheck = inspectServiceAccountConfig(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      firebaseProjectId
    );
    if (!saCheck.ok || !cleanUid) {
      res.json({ success: true, ok: true, authDeleted: false });
      return;
    }

    const adminToken = await getGoogleAdminAccessToken(saCheck.config);
    const delResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(
        saCheck.config.project_id
      )}/accounts:delete`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ localId: cleanUid }),
      }
    );

    if (!delResp.ok) {
      const errJson = (await delResp.json()) as { error?: { message?: string } };
      const code = errJson.error?.message || 'AUTH_DELETE_FAILED';
      if (!code.includes('USER_NOT_FOUND')) {
        sendError(
          res,
          code,
          'Failed to delete user from Firebase Authentication.',
          400
        );
        return;
      }
    }

    res.json({ success: true, ok: true, authDeleted: true });
  } catch (err) {
    console.error('Delete user error:', err instanceof Error ? err.message : 'Unknown error');
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to delete Firebase Auth user.', 500);
  }
});

app.get('/robots.txt', (req, res) => {
  const origin = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /mahmud\nDisallow: /admin\nSitemap: ${origin}/sitemap.xml\n`
  );
});

app.get('/sitemap.xml', (req, res) => {
  const origin = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const staticRoutes = [
    '/',
    '/products',
    '/showrooms',
    '/complaint',
    '/about',
    '/contact',
    '/category/fast-food',
    '/category/bread',
    '/category/pastry',
    '/category/frozen-items',
    '/category/special-sweets',
    '/category/dry-sweets',
    '/category/cookies',
    '/category/custom-cake',
    '/category/akd-box',
    '/occasion/wedding',
    '/occasion/birthday',
    '/occasion/office-party',
    '/occasion/anniversary',
    '/occasion/family-event',
    '/occasion/eid',
    '/occasion/iftar',
    '/occasion/mehedi',
    '/occasion/akd',
    '/occasion/aqiqah',
    '/occasion/gift',
    '/product/chocolate-cake',
    '/product/chicken-burger',
    '/product/akd-luxury-gift-box',
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticRoutes
  .map(
    (route) => `  <url>
    <loc>${origin}${route}</loc>
    <changefreq>weekly</changefreq>
  </url>`
  )
  .join('\n')}
</urlset>`;

  res.type('application/xml').send(xml);
});

async function handleAiChatEndpoint(req: Request, res: Response) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : typeof forwardedFor === 'string'
    ? forwardedFor.split(',')[0]?.trim()
    : '';
  const clientIp = forwardedIp || req.ip || 'express-ip';
  const rawHeaderClientId = req.headers['x-chat-client-id'];
  const headerClientId =
    (Array.isArray(rawHeaderClientId) ? rawHeaderClientId[0] : rawHeaderClientId)?.trim() || '';
  const rateLimitKey = headerClientId ? `${clientIp}:${headerClientId}` : clientIp;

  const slot = acquireAiRateLimitSlot(rateLimitKey);
  if (slot.allowed === false) {
    res.setHeader('Retry-After', String(slot.retryAfterSec));
    sendError(res, slot.code, slot.message, slot.status, {
      upstreamStatus: 429,
      retryAfterSec: slot.retryAfterSec,
      reason: slot.reason,
    });
    return;
  }

  try {
    const body = (req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : {}) as AiChatRequestBody;

    const result = await processAiChatRequest(body, process.env.GEMINI_API_KEY);
    if (!result.ok) {
      if (result.status === 429) {
        res.setHeader('Retry-After', String(result.retryAfterSec ?? 10));
      }
      sendError(res, result.code, result.message, result.status, {
        ...(result.upstreamStatus ? { upstreamStatus: result.upstreamStatus } : {}),
        ...(result.retryAfterSec ? { retryAfterSec: result.retryAfterSec } : {}),
      });
      return;
    }

    res.json({
      success: true,
      ok: true,
      reply: result.reply,
      ...(result.disabled ? { disabled: true } : {}),
    });
  } catch {
    sendError(
      res,
      'worker_internal_error',
      'Unexpected server error while processing AI Assistant request.',
      500
    );
  } finally {
    slot.release();
  }
}

app.get('/api/media/health', (_req, res) => {
  const s3Configured = inspectR2S3Credentials(process.env).configured;
  res.json({
    success: true,
    ok: s3Configured,
    provider: 'cloudflare-r2',
    bindingName: 'PRODUCT_IMAGES',
    bucketName: DEFAULT_R2_BUCKET_NAME,
    bindingActive: false,
    s3FallbackActive: s3Configured,
  });
});

app.head('/api/media/file/*', async (req, res) => {
  try {
    const rawKey = req.path.replace(/^\/api\/media\/file\//, '');
    const objectKey = validateR2ReadKey(rawKey);
    if (!objectKey) {
      res.status(404).end();
      return;
    }

    const s3Creds = inspectR2S3Credentials(process.env);
    if (!s3Creds.configured) {
      res.status(503).end();
      return;
    }

    const s3Resp = await headObjectFromR2S3({
      creds: s3Creds.creds,
      objectKey,
    });
    if (!s3Resp.ok) {
      res.status(s3Resp.status === 404 ? 404 : 502).end();
      return;
    }

    const rawMime = (s3Resp.headers.get('content-type') || '').toLowerCase();
    const safeMime = (ALLOWED_MEDIA_MIME_TYPES as readonly string[]).includes(rawMime)
      ? rawMime
      : objectKey.endsWith('.png')
      ? 'image/png'
      : objectKey.endsWith('.webp')
      ? 'image/webp'
      : objectKey.endsWith('.gif')
      ? 'image/gif'
      : 'image/jpeg';

    res.setHeader('Content-Type', safeMime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const contentLength = s3Resp.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.status(200).end();
  } catch {
    res.status(500).end();
  }
});

app.get('/api/media/file/*', async (req, res) => {
  try {
    const rawKey = req.path.replace(/^\/api\/media\/file\//, '');
    const objectKey = validateR2ReadKey(rawKey);
    if (!objectKey) {
      res.status(404).send('Not found');
      return;
    }

    const s3Creds = inspectR2S3Credentials(process.env);
    if (!s3Creds.configured) {
      res.status(503).send('Cloudflare R2 credentials not configured on Express server.');
      return;
    }

    const s3Resp = await getObjectFromR2S3({
      creds: s3Creds.creds,
      objectKey,
    });
    if (!s3Resp.ok) {
      res.status(s3Resp.status === 404 ? 404 : 502).send('Image not found');
      return;
    }

    const rawMime = (s3Resp.headers.get('content-type') || '').toLowerCase();
    const safeMime = (ALLOWED_MEDIA_MIME_TYPES as readonly string[]).includes(rawMime)
      ? rawMime
      : objectKey.endsWith('.png')
      ? 'image/png'
      : objectKey.endsWith('.webp')
      ? 'image/webp'
      : objectKey.endsWith('.gif')
      ? 'image/gif'
      : 'image/jpeg';

    const buf = Buffer.from(await s3Resp.arrayBuffer());
    res.setHeader('Content-Type', safeMime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(buf);
  } catch {
    res.status(500).send('Failed to fetch media file');
  }
});

async function handleExpressMediaUpload(
  req: Request,
  res: Response,
  overrides?: {
    folder?: MediaUploadFolder;
    entityId?: string;
    isPrimary?: boolean;
  }
) {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      sendError(
        res,
        'UNAUTHORIZED',
        'ছবি আপলোড করতে অ্যাডমিন অ্যাকাউন্টে লগইন থাকতে হবে।',
        401
      );
      return;
    }

    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch {
      sendError(
        res,
        'UNAUTHORIZED',
        'আপনার লগইন সেশন শেষ হয়ে গেছে। অনুগ্রহ করে আবার লগইন করুন।',
        401
      );
      return;
    }

    if (!decoded.email || !decoded.emailVerified) {
      sendError(
        res,
        'UNVERIFIED_ADMIN',
        'অ্যাডমিন ইমেইল যাচাইকৃত না হলে ছবি আপলোড করা যাবে না।',
        403
      );
      return;
    }

    const authority = await verifyCatalogUploadAuthority(idToken, decoded.uid, decoded.email);
    if (!authority.allowed) {
      sendError(
        res,
        'PERMISSION_DENIED',
        'ছবি আপলোডের জন্য আপনার পর্যাপ্ত প্রশাসনিক অনুমতি নেই।',
        403
      );
      return;
    }

    const rawFolder = String(
      overrides?.folder || req.query.folder || req.headers['x-upload-folder'] || 'products'
    )
      .trim()
      .toLowerCase();
    if (!isAllowedMediaFolder(rawFolder)) {
      sendError(res, 'INVALID_FOLDER', 'অবৈধ মিডিয়া ফোল্ডার নির্বাচিত হয়েছে।', 400);
      return;
    }

    const rawEntityId = String(
      overrides?.entityId ||
        req.query.entityId ||
        req.headers['x-entity-id'] ||
        `item-${Date.now()}`
    );
    let rawFileName = String(
      req.query.filename || req.headers['x-file-name'] || 'image.jpg'
    );
    let isPrimary =
      overrides?.isPrimary ??
      (req.query.isPrimary === 'true' ||
        req.query.slot === 'main' ||
        req.headers['x-is-primary'] === 'true' ||
        req.headers['x-is-primary'] === '1');

    if (!Buffer.isBuffer(req.body)) {
      sendError(
        res,
        'UNSUPPORTED_MEDIA_TYPE',
        'অসমর্থিত ফাইল ফরম্যাট। শুধু JPG, PNG, WEBP অথবা GIF ছবি আপলোড করা যাবে।',
        415
      );
      return;
    }

    let bytes: Uint8Array;
    let declaredMime =
      typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : undefined;

    if ((declaredMime || '').toLowerCase().includes('multipart/form-data')) {
      const formBuffer = new ArrayBuffer(req.body.byteLength);
      new Uint8Array(formBuffer).set(req.body);
      const parsedForm = await new Response(formBuffer, {
        headers: { 'content-type': declaredMime! },
      }).formData();
      const candidateFile = parsedForm.get('file') || parsedForm.get('image');
      if (!candidateFile || typeof candidateFile === 'string') {
        sendError(
          res,
          'MISSING_IMAGE_FILE',
          'অনুগ্রহ করে একটি বৈধ ছবি ফাইল নির্বাচন করুন।',
          400
        );
        return;
      }
      rawFileName = candidateFile.name || rawFileName;
      declaredMime = candidateFile.type || undefined;
      if (parsedForm.get('isPrimary') === 'true' || parsedForm.get('slot') === 'main') {
        isPrimary = true;
      }
      bytes = new Uint8Array(await candidateFile.arrayBuffer());
    } else {
      bytes = new Uint8Array(req.body.buffer, req.body.byteOffset, req.body.byteLength);
    }

    const inspection = inspectImageBytes(bytes, declaredMime);
    if (inspection.ok === false) {
      sendError(res, inspection.code, inspection.message, inspection.status);
      return;
    }

    const s3Creds = inspectR2S3Credentials(process.env);
    if (!s3Creds.configured) {
      sendError(
        res,
        'R2_NOT_CONFIGURED',
        `প্রিভিউ সার্ভারে Cloudflare R2 S3 টোকেন সেট করা নেই। লাইভ Cloudflare সাইটে (${DEFAULT_R2_BUCKET_NAME}) PRODUCT_IMAGES বাইন্ডিং সরাসরি কাজ করবে, অথবা প্রিভিউতে আপলোড করতে .env/Secrets-এ R2_ACCOUNT_ID, R2_ACCESS_KEY_ID ও R2_SECRET_ACCESS_KEY যোগ করুন।`,
        503
      );
      return;
    }

    const objectKey = buildR2ObjectKey({
      folder: rawFolder,
      entityId: rawEntityId,
      fileName: rawFileName,
      ext: inspection.ext,
      isPrimary,
    });

    const s3Result = await putObjectToR2S3({
      creds: s3Creds.creds,
      objectKey,
      body: bytes,
      contentType: inspection.contentType,
    });
    if (s3Result.ok === false) {
      sendError(
        res,
        'R2_UPLOAD_FAILED',
        'Cloudflare R2-তে ছবি সংরক্ষণ করা যায়নি। অনুগ্রহ করে R2 বাকেট ও অনুমতি যাচাই করুন।',
        502
      );
      return;
    }

    const host = req.get('host') || `localhost:${PORT}`;
    const proto = req.headers['x-forwarded-proto']
      ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
      : req.protocol;
    const serverOrigin = `${proto}://${host}`;
    const downloadUrl = buildR2MediaPublicUrl({
      objectKey,
      publicBaseUrl: process.env.R2_PUBLIC_URL,
      workerOrigin: serverOrigin,
    });

    res.status(201).json({
      success: true,
      ok: true,
      imageUrl: downloadUrl,
      imageKey: objectKey,
      downloadUrl,
      storagePath: objectKey,
      fileName: rawFileName,
      sizeBytes: bytes.byteLength,
      contentType: inspection.contentType,
      storageProvider: 'cloudflare-r2',
    });
  } catch {
    sendError(
      res,
      'MEDIA_UPLOAD_ERROR',
      'ছবি আপলোডের সময় সার্ভারে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
      500
    );
  }
}

const rawMediaUploadMiddleware = express.raw({
  type: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/octet-stream',
    'multipart/form-data',
  ],
  limit: MAX_MEDIA_IMAGE_BYTES + 65536,
});

app.post('/api/media/upload', rawMediaUploadMiddleware, (req, res) =>
  handleExpressMediaUpload(req, res)
);

app.post('/api/admin/products/:productId/image', rawMediaUploadMiddleware, (req, res) =>
  handleExpressMediaUpload(req, res, {
    folder: 'products',
    entityId: req.params.productId,
  })
);

function handleRawMediaSizeLimitError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  if (
    err &&
    typeof err === 'object' &&
    'type' in err &&
    (err as { type?: unknown }).type === 'entity.too.large'
  ) {
    sendError(
      res,
      'IMAGE_TOO_LARGE',
      'ছবির আকার অনেক বড়। সর্বোচ্চ ৫ এমবি আকারের ছবি আপলোড করা যাবে।',
      413
    );
    return;
  }
  next(err);
}

app.use('/api/media/upload', handleRawMediaSizeLimitError);
app.use('/api/admin/products/:productId/image', handleRawMediaSizeLimitError);

async function handleExpressMediaDelete(req: Request, res: Response, rawPathKey?: string) {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      sendError(res, 'UNAUTHORIZED', 'ছবি মুছতে অ্যাডমিন অ্যাকাউন্টে লগইন থাকতে হবে।', 401);
      return;
    }

    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch {
      sendError(
        res,
        'UNAUTHORIZED',
        'আপনার লগইন সেশন শেষ হয়ে গেছে। অনুগ্রহ করে আবার লগইন করুন।',
        401
      );
      return;
    }

    if (!decoded.email || !decoded.emailVerified) {
      sendError(
        res,
        'UNVERIFIED_ADMIN',
        'অ্যাডমিন ইমেইল যাচাইকৃত না হলে ছবি মুছা যাবে না।',
        403
      );
      return;
    }

    const authority = await verifyCatalogUploadAuthority(idToken, decoded.uid, decoded.email);
    if (!authority.allowed) {
      sendError(
        res,
        'PERMISSION_DENIED',
        'ছবি মুছে ফেলার জন্য আপনার পর্যাপ্ত প্রশাসনিক অনুমতি নেই।',
        403
      );
      return;
    }

    const objectKey = rawPathKey
      ? validateR2ReadKey(rawPathKey)
      : extractR2KeyFromInput(
          (req.body || {}) as {
            storagePath?: string;
            imageKey?: string;
            downloadUrl?: string;
            imageUrl?: string;
          },
          process.env.R2_PUBLIC_URL || DEFAULT_R2_PUBLIC_DOMAIN
        );

    if (!objectKey) {
      sendError(res, 'INVALID_OBJECT_KEY', 'বৈধ R2 object key প্রদান করা হয়নি।', 400);
      return;
    }

    const s3Creds = inspectR2S3Credentials(process.env);
    if (!s3Creds.configured) {
      sendError(
        res,
        'R2_NOT_CONFIGURED',
        `Cloudflare R2 বাকেট (${DEFAULT_R2_BUCKET_NAME}) সার্ভারে কনফিগার করা নেই।`,
        503
      );
      return;
    }

    const delRes = await deleteObjectFromR2S3({
      creds: s3Creds.creds,
      objectKey,
    });
    if (delRes.ok === false) {
      sendError(res, 'R2_DELETE_FAILED', 'Cloudflare R2 থেকে ছবিটি মুছে ফেলা যায়নি।', 502);
      return;
    }

    res.json({
      success: true,
      ok: true,
      deletedKey: objectKey,
      storageProvider: 'cloudflare-r2',
    });
  } catch {
    sendError(res, 'MEDIA_DELETE_ERROR', 'ছবি মুছে ফেলার সময় সার্ভারে সমস্যা হয়েছে।', 500);
  }
}

app.post('/api/media/delete', (req, res) => handleExpressMediaDelete(req, res));
app.delete('/api/media/delete', (req, res) => handleExpressMediaDelete(req, res));
app.delete('/api/admin/products/:productId/image', (req, res) =>
  handleExpressMediaDelete(req, res)
);
app.delete('/api/media/file/*', (req, res) => {
  const rawKey = req.path.replace(/^\/api\/media\/file\//, '');
  return handleExpressMediaDelete(req, res, rawKey);
});

app.post('/api/chat/ai', handleAiChatEndpoint);
app.post('/api/ai-assistant', handleAiChatEndpoint);

// JSON 404 guard so unmatched /api/* routes NEVER fall through to Vite/SPA HTML
app.all('/api/*', (req, res) => {
  sendError(res, 'API_ROUTE_NOT_FOUND', `API endpoint ${req.path} not found.`, 404);
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vitePromise = (async () => {
      const { createServer: createViteServer } = await import('vite');
      return createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
    })();

    vitePromise.catch((err) => {
      console.error('Vite dev server initialization failed:', err);
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Home Recipe Foods server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
