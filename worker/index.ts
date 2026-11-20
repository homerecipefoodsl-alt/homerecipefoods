import firebaseConfig from '../firebase-applet-config.json';
import {
  acquireAiRateLimitSlot,
  processAiChatRequest,
  type AiChatRequestBody,
} from '../shared/aiChat';
import {
  EXPECTED_FIREBASE_PROJECT_ID as SHARED_EXPECTED_FIREBASE_PROJECT_ID,
  inspectServiceAccountConfig as inspectSharedServiceAccountConfig,
  pemToPkcs8ArrayBuffer,
  verifyWebCryptoServiceAccountKey,
  type ServiceAccountConfig,
} from '../shared/firebaseServiceAccount';

interface CloudflareAssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: CloudflareAssetsBinding;
  GEMINI_API_KEY?: string;
  APP_URL?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_FIRESTORE_DATABASE_ID?: string;
}

const PRIMARY_SUPER_ADMIN_EMAIL = 'mdmahmudulhashan0@gmail.com';
const EXPECTED_FIREBASE_PROJECT_ID = 'ai-studio-applet-webapp-e4b0f';
const FIREBASE_JWK_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

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

type StaffRole = 'super_admin' | 'admin' | 'manager' | 'support_agent';

const DEFAULT_ROLE_PERMISSIONS: Record<StaffRole, string[]> = {
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

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Chat-Client-Id',
};

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
      ...(extraHeaders || {}),
    },
  });
}

function errorResponse(
  errorCode: string,
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): Response {
  return jsonResponse(
    {
      success: false,
      ok: false,
      error: errorCode,
      code: errorCode,
      message,
      ...(extra || {}),
    },
    status,
    extraHeaders
  );
}

interface JwkKey {
  kid?: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

let cachedJwks: { keys: JwkKey[]; expiresAt: number } = {
  keys: [],
  expiresAt: 0,
};

async function getFirebaseJwks(): Promise<JwkKey[]> {
  const now = Date.now();
  if (now < cachedJwks.expiresAt && cachedJwks.keys.length > 0) {
    return cachedJwks.keys;
  }
  const resp = await fetch(FIREBASE_JWK_URL);
  if (!resp.ok) {
    throw new Error('Failed to fetch Google Firebase public JWKs');
  }
  const data = (await resp.json()) as { keys?: JwkKey[] };
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedJwks = {
    keys: Array.isArray(data.keys) ? data.keys : [],
    expiresAt: now + maxAgeSec * 1000,
  };
  return cachedJwks.keys;
}

function base64UrlToUint8Array(str: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const buffer = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

interface VerifiedFirebaseToken {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

async function verifyFirebaseIdTokenWorker(
  idToken: string,
  projectId: string
): Promise<VerifiedFirebaseToken> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT structure');
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(headerB64))) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(payloadB64))) as {
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

  const jwks = await getFirebaseJwks();
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new Error('Unknown signing key');
  }

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToUint8Array(sigB64);
  const isValidSig = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signature,
    signingInput.buffer as ArrayBuffer
  );
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
  if (projectId) {
    if (
      payload.aud !== projectId ||
      payload.iss !== `https://securetoken.google.com/${projectId}`
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

function getFirebaseRuntimeConfig(env: Env) {
  return {
    projectId: (
      env.VITE_FIREBASE_PROJECT_ID ||
      firebaseConfig.projectId ||
      EXPECTED_FIREBASE_PROJECT_ID
    ).trim(),
    apiKey: (env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey || '').trim(),
    firestoreDatabaseId: (
      env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
      firebaseConfig.firestoreDatabaseId ||
      '(default)'
    ).trim(),
  };
}

let cachedWorkerSaToken: { token: string; expiresAt: number; clientEmail: string } | null = null;

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncodeText(text: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(text));
}

async function getGoogleAdminAccessTokenWorker(sa: ServiceAccountConfig): Promise<string> {
  const now = Date.now();
  if (
    cachedWorkerSaToken &&
    cachedWorkerSaToken.clientEmail === sa.client_email &&
    now < cachedWorkerSaToken.expiresAt - 60_000
  ) {
    return cachedWorkerSaToken.token;
  }

  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;
  const header = base64UrlEncodeText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64UrlEncodeText(
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
  let privateKey: CryptoKey;
  try {
    const pkcs8 = pemToPkcs8ArrayBuffer(sa.private_key);
    privateKey = await crypto.subtle.importKey(
      'pkcs8',
      pkcs8,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
  } catch {
    throw new Error('Firebase Admin private key initialization failed.');
  }

  const inputBytes = new TextEncoder().encode(signingInput);
  const inputBuffer = new ArrayBuffer(inputBytes.byteLength);
  new Uint8Array(inputBuffer).set(inputBytes);

  const sigBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, inputBuffer);
  const signature = base64UrlEncodeBytes(new Uint8Array(sigBuffer));
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

  cachedWorkerSaToken = {
    token: tokenJson.access_token,
    expiresAt: now + (tokenJson.expires_in || 3600) * 1000,
    clientEmail: sa.client_email,
  };
  return tokenJson.access_token;
}

async function verifyCallerStaffAuthorityWorker(
  idToken: string,
  callerEmail: string,
  projectId: string,
  firestoreDatabaseId: string
): Promise<{
  allowed: boolean;
  isPrimarySuperAdmin: boolean;
  isSuperAdmin: boolean;
  canManageManagers: boolean;
  role: string;
  status: string;
}> {
  if (callerEmail === PRIMARY_SUPER_ADMIN_EMAIL) {
    return {
      allowed: true,
      isPrimarySuperAdmin: true,
      isSuperAdmin: true,
      canManageManagers: true,
      role: 'super_admin',
      status: 'active',
    };
  }

  try {
    const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/databases/${encodeURIComponent(
      firestoreDatabaseId
    )}/documents/rbac_roles/${encodeURIComponent(callerEmail)}`;
    const resp = await fetch(docUrl, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!resp.ok) {
      return {
        allowed: false,
        isPrimarySuperAdmin: false,
        isSuperAdmin: false,
        canManageManagers: false,
        role: 'customer',
        status: 'disabled',
      };
    }
    const docData = (await resp.json()) as {
      fields?: {
        role?: { stringValue?: string };
        status?: { stringValue?: string };
        permissions?: { arrayValue?: { values?: Array<{ stringValue?: string }> } };
      };
    };
    const role = docData.fields?.role?.stringValue || '';
    const status = docData.fields?.status?.stringValue || '';
    const permissions = (docData.fields?.permissions?.arrayValue?.values || [])
      .map((v) => v.stringValue || '')
      .filter(Boolean);

    const isActive = status === 'active';
    const isSuper = isActive && role === 'super_admin';
    const canManageManagers = isActive && (isSuper || permissions.includes('manager_manage'));
    return {
      allowed: isSuper || canManageManagers,
      isPrimarySuperAdmin: false,
      isSuperAdmin: isSuper,
      canManageManagers,
      role: role || 'customer',
      status: status || 'disabled',
    };
  } catch {
    return {
      allowed: false,
      isPrimarySuperAdmin: false,
      isSuperAdmin: false,
      canManageManagers: false,
      role: 'customer',
      status: 'disabled',
    };
  }
}

async function syncFirebaseStaffCustomClaimsWorker(params: {
  adminToken: string;
  projectId: string;
  uid: string;
  role: string;
  status: string;
}): Promise<boolean> {
  if (!params.uid) return false;
  const isCatalogStaff =
    params.status === 'active' &&
    ['super_admin', 'admin', 'manager'].includes(params.role);
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

function mapIdentityToolkitErrorWorker(rawCode: string): {
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
  const rand = new Uint8Array(4);
  crypto.getRandomValues(rand);
  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix += chars[rand[i] % chars.length];
  }
  return `MGR-${year}-${suffix}`;
}

async function firestoreDocExistsWorker(
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

async function commitStaffProfileFirestoreWorker(params: {
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

async function rollbackCreatedAuthUserWorker(
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

async function handleAiChat(request: Request, env: Env): Promise<Response> {
  let payload: AiChatRequestBody;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return errorResponse('INVALID_REQUEST', 'Request body must be a JSON object.', 400);
    }
    payload = parsed as AiChatRequestBody;
  } catch {
    return errorResponse('INVALID_REQUEST', 'Invalid JSON request payload.', 400);
  }

  const clientIp =
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'worker-ip';
  const headerClientId = request.headers.get('x-chat-client-id')?.trim() || '';
  const rateLimitKey = headerClientId ? `${clientIp}:${headerClientId}` : clientIp;

  const slot = acquireAiRateLimitSlot(rateLimitKey);
  if (slot.allowed === false) {
    return errorResponse(
      slot.code,
      slot.message,
      slot.status,
      {
        upstreamStatus: 429,
        retryAfterSec: slot.retryAfterSec,
        reason: slot.reason,
      },
      { 'Retry-After': String(slot.retryAfterSec) }
    );
  }

  try {
    const result = await processAiChatRequest(payload, env.GEMINI_API_KEY);
    if (!result.ok) {
      const retryHeaders =
        result.status === 429
          ? { 'Retry-After': String(result.retryAfterSec ?? 10) }
          : undefined;
      return errorResponse(
        result.code,
        result.message,
        result.status,
        {
          ...(result.upstreamStatus ? { upstreamStatus: result.upstreamStatus } : {}),
          ...(result.retryAfterSec ? { retryAfterSec: result.retryAfterSec } : {}),
        },
        retryHeaders
      );
    }
    return jsonResponse({
      success: true,
      ok: true,
      reply: result.reply,
      ...(result.disabled ? { disabled: true } : {}),
    });
  } catch {
    return errorResponse(
      'worker_internal_error',
      'Unexpected server error while processing AI Assistant request.',
      500
    );
  } finally {
    slot.release();
  }
}

async function handleSessionInit(request: Request, env: Env): Promise<Response> {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return errorResponse('UNAUTHORIZED', 'Missing Bearer token.', 401);
    }
    const { projectId, firestoreDatabaseId } = getFirebaseRuntimeConfig(env);
    const decoded = await verifyFirebaseIdTokenWorker(token, projectId);
    if (!decoded.email || !decoded.emailVerified) {
      return jsonResponse(
        {
          success: false,
          verified: false,
          authorizedSuperAdmin: false,
          role: 'customer',
        },
        403
      );
    }

    const authority = await verifyCallerStaffAuthorityWorker(
      token,
      decoded.email,
      projectId,
      firestoreDatabaseId
    );
    const saCheck = inspectSharedServiceAccountConfig(
      env.FIREBASE_SERVICE_ACCOUNT_JSON,
      SHARED_EXPECTED_FIREBASE_PROJECT_ID || projectId
    );
    let cryptoInitialized = saCheck.ok;
    if (saCheck.ok) {
      cryptoInitialized = await verifyWebCryptoServiceAccountKey(saCheck.config.private_key);
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
      : 'Firebase Admin private key could not be initialized by Cloudflare Worker WebCrypto.';

    let claimsSynced = false;
    if (
      saCheck.ok &&
      cryptoInitialized &&
      authority.status === 'active' &&
      ['super_admin', 'admin', 'manager', 'support_agent'].includes(authority.role)
    ) {
      try {
        const adminToken = await getGoogleAdminAccessTokenWorker(saCheck.config);
        claimsSynced = await syncFirebaseStaffCustomClaimsWorker({
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

    return jsonResponse({
      success: true,
      ok: true,
      verified: true,
      uid: decoded.uid,
      email: decoded.email,
      isPrimarySuperAdmin: authority.isPrimarySuperAdmin,
      authorizedSuperAdmin: authority.isSuperAdmin,
      hasAdminCredentials: saCheck.ok && cryptoInitialized,
      claimsSynced,
      serviceAccountStatus,
      serviceAccountMessage,
      role: authority.isSuperAdmin
        ? 'super_admin'
        : ['admin', 'manager', 'support_agent'].includes(authority.role) && authority.status === 'active'
        ? authority.role
        : authority.canManageManagers
        ? 'manager'
        : 'customer',
    });
  } catch {
    return errorResponse('UNAUTHORIZED', 'Invalid or expired Firebase ID token.', 401);
  }
}

async function handleAdminCreateUser(request: Request, env: Env): Promise<Response> {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      return errorResponse('UNAUTHORIZED', 'Missing Authorization Bearer token.', 401);
    }

    const { projectId, firestoreDatabaseId } = getFirebaseRuntimeConfig(env);
    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdTokenWorker(idToken, projectId);
    } catch {
      return errorResponse('UNAUTHORIZED', 'Invalid or expired Firebase ID token.', 401);
    }
    if (!decoded.email || !decoded.emailVerified) {
      return errorResponse(
        'UNVERIFIED_ADMIN',
        'Verified administrator token required.',
        403
      );
    }

    const authority = await verifyCallerStaffAuthorityWorker(
      idToken,
      decoded.email,
      projectId,
      firestoreDatabaseId
    );
    if (!authority.isSuperAdmin) {
      return errorResponse(
        'PERMISSION_DENIED',
        'Only a verified Super Admin can create Admin, Manager, or Staff accounts.',
        403
      );
    }

    let body: {
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
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return errorResponse('INVALID_REQUEST', 'Request body must be a JSON object.', 400);
      }
      body = parsed as typeof body;
    } catch {
      return errorResponse('INVALID_REQUEST', 'Invalid JSON request payload.', 400);
    }

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
      return errorResponse('VALIDATION_ERROR', 'Full Name is required.', 400);
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return errorResponse('INVALID_EMAIL', 'Please enter a valid email address.', 400);
    }
    if (cleanEmail === PRIMARY_SUPER_ADMIN_EMAIL) {
      return errorResponse(
        'EMAIL_EXISTS',
        'এই email দিয়ে ইতিমধ্যে একটি account রয়েছে।',
        409
      );
    }
    if (!['super_admin', 'admin', 'manager', 'support_agent'].includes(cleanRole)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid role selected.', 400);
    }
    const targetRole = cleanRole as StaffRole;

    if (targetRole === 'super_admin') {
      if (!authority.isPrimarySuperAdmin || body.allowSuperAdminCreation !== true) {
        return errorResponse(
          'PERMISSION_DENIED',
          'Only the primary Super Admin can explicitly authorize creating another Super Admin account.',
          403
        );
      }
    }
    if (typeof body.password !== 'string' || body.password.length < 8) {
      return errorResponse(
        'WEAK_PASSWORD',
        'Password must be at least 8 characters.',
        400
      );
    }
    if (cleanUsername === 'mahmud') {
      return errorResponse('VALIDATION_ERROR', 'Username "mahmud" is reserved.', 400);
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
      return errorResponse(
        'VALIDATION_ERROR',
        'Manager ID must be 3–40 characters using letters, numbers, - or _.',
        400
      );
    }
    const cleanManagerTitle =
      targetRole === 'manager'
        ? (typeof body.managerTitle === 'string' && body.managerTitle.trim()
            ? body.managerTitle.trim()
            : 'Store Manager'
          ).slice(0, 100)
        : '';

    const saCheck = inspectSharedServiceAccountConfig(
      env.FIREBASE_SERVICE_ACCOUNT_JSON,
      SHARED_EXPECTED_FIREBASE_PROJECT_ID || projectId
    );
    if (!saCheck.ok) {
      return errorResponse(saCheck.errorCode, saCheck.message, saCheck.status);
    }

    let adminToken: string;
    try {
      adminToken = await getGoogleAdminAccessTokenWorker(saCheck.config);
    } catch {
      return errorResponse(
        'FIREBASE_ADMIN_INIT_FAILED',
        'Firebase Admin SDK initialization failed. Verify the FIREBASE_SERVICE_ACCOUNT_JSON secret.',
        500
      );
    }

    const targetProject = saCheck.config.project_id;

    // Pre-check email/username collision in Firestore before Auth creation
    const existingRbacDoc = await firestoreDocExistsWorker(
      adminToken,
      targetProject,
      firestoreDatabaseId,
      'rbac_roles',
      cleanEmail
    );
    if (existingRbacDoc) {
      return errorResponse(
        'EMAIL_EXISTS',
        'এই email দিয়ে ইতিমধ্যে একটি account রয়েছে।',
        409
      );
    }

    if (cleanUsername) {
      const existingUsernameDoc = await firestoreDocExistsWorker(
        adminToken,
        targetProject,
        firestoreDatabaseId,
        'admin_usernames',
        cleanUsername
      );
      if (existingUsernameDoc) {
        return errorResponse(
          'USERNAME_EXISTS',
          `Username "@${cleanUsername}" is already in use.`,
          409
        );
      }
    }

    // Step 1: Create pre-verified user in Firebase Authentication (Admin Identity Toolkit REST)
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
      const mapped = mapIdentityToolkitErrorWorker(rawCode);
      return errorResponse(mapped.code, mapped.message, mapped.status);
    }

    const createdUid = createJson.localId;
    const createdEmail = (createJson.email || cleanEmail).toLowerCase();

    // Step 2: Create Firestore RBAC / Admin / User profile atomically via REST commit
    const firestoreResult = await commitStaffProfileFirestoreWorker({
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
      // Strictly roll back ONLY the newly created Auth UID
      const rolledBack = await rollbackCreatedAuthUserWorker(
        adminToken,
        targetProject,
        createdUid
      );
      return errorResponse(
        'FIRESTORE_PROFILE_FAILED',
        rolledBack
          ? 'Failed to create Firestore user profile; newly created Auth user was automatically rolled back.'
          : 'Failed to create Firestore user profile.',
        500,
        { rolledBack }
      );
    }

    await syncFirebaseStaffCustomClaimsWorker({
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

    return jsonResponse(
      {
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
      },
      201
    );
  } catch {
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      'Unexpected server error while creating administrator account.',
      500
    );
  }
}

async function handleAdminRollbackUser(request: Request, env: Env): Promise<Response> {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      return errorResponse('UNAUTHORIZED', 'Missing Authorization Bearer token.', 401);
    }

    const { projectId, firestoreDatabaseId } = getFirebaseRuntimeConfig(env);
    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdTokenWorker(idToken, projectId);
    } catch {
      return errorResponse('UNAUTHORIZED', 'Invalid or expired Firebase ID token.', 401);
    }
    if (!decoded.email || !decoded.emailVerified) {
      return errorResponse(
        'UNVERIFIED_ADMIN',
        'Verified administrator token required.',
        403
      );
    }

    const authority = await verifyCallerStaffAuthorityWorker(
      idToken,
      decoded.email,
      projectId,
      firestoreDatabaseId
    );
    if (!authority.isSuperAdmin) {
      return errorResponse('PERMISSION_DENIED', 'Unauthorized rollback request.', 403);
    }

    const body = (await request.json()) as { uid?: string };
    const targetUid = typeof body.uid === 'string' ? body.uid.trim() : '';
    if (!targetUid || targetUid === decoded.uid) {
      return errorResponse('INVALID_REQUEST', 'Invalid rollback target UID.', 400);
    }

    const saCheck = inspectSharedServiceAccountConfig(
      env.FIREBASE_SERVICE_ACCOUNT_JSON,
      SHARED_EXPECTED_FIREBASE_PROJECT_ID || projectId
    );
    if (!saCheck.ok) {
      return errorResponse(saCheck.errorCode, saCheck.message, saCheck.status);
    }

    const adminToken = await getGoogleAdminAccessTokenWorker(saCheck.config);
    const rolledBack = await rollbackCreatedAuthUserWorker(
      adminToken,
      saCheck.config.project_id,
      targetUid
    );
    if (!rolledBack) {
      return errorResponse('ROLLBACK_FAILED', 'Admin SDK rollback delete failed.', 500);
    }
    return jsonResponse({ success: true, ok: true });
  } catch {
    return errorResponse('ROLLBACK_FAILED', 'Rollback failed.', 500);
  }
}

async function handleAdminUpdateUserStatus(request: Request, env: Env): Promise<Response> {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      return errorResponse('UNAUTHORIZED', 'Missing Authorization Bearer token.', 401);
    }

    const { projectId, firestoreDatabaseId } = getFirebaseRuntimeConfig(env);
    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdTokenWorker(idToken, projectId);
    } catch {
      return errorResponse('UNAUTHORIZED', 'Invalid or expired Firebase ID token.', 401);
    }
    if (!decoded.email || !decoded.emailVerified) {
      return errorResponse(
        'UNVERIFIED_ADMIN',
        'Verified administrator token required.',
        403
      );
    }

    const authority = await verifyCallerStaffAuthorityWorker(
      idToken,
      decoded.email,
      projectId,
      firestoreDatabaseId
    );
    if (!authority.allowed) {
      return errorResponse('PERMISSION_DENIED', 'Insufficient privileges.', 403);
    }

    const body = (await request.json()) as {
      uid?: string;
      email?: string;
      role?: string;
      disabled?: boolean;
    };
    const cleanEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const cleanUid = typeof body.uid === 'string' ? body.uid.trim() : '';

    if (cleanEmail === PRIMARY_SUPER_ADMIN_EMAIL || (cleanUid && cleanUid === decoded.uid)) {
      return errorResponse(
        'PERMISSION_DENIED',
        'Primary Super Admin or current session cannot be disabled.',
        403
      );
    }
    if (!authority.isSuperAdmin && body.role !== 'manager') {
      return errorResponse(
        'PERMISSION_DENIED',
        'Only a Super Admin can modify non-manager accounts.',
        403
      );
    }

    const saCheck = inspectSharedServiceAccountConfig(
      env.FIREBASE_SERVICE_ACCOUNT_JSON,
      SHARED_EXPECTED_FIREBASE_PROJECT_ID || projectId
    );
    if (!saCheck.ok || !cleanUid) {
      return jsonResponse({ success: true, ok: true, authSynced: false });
    }

    const adminToken = await getGoogleAdminAccessTokenWorker(saCheck.config);
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
          disableUser: Boolean(body.disabled),
          ...(typeof body.role === 'string' && body.role
            ? {
                customAttributes: JSON.stringify({
                  hrf_staff:
                    !Boolean(body.disabled) &&
                    ['super_admin', 'admin', 'manager'].includes(body.role),
                  role: body.role,
                  staff_status: Boolean(body.disabled) ? 'disabled' : 'active',
                }),
              }
            : {}),
        }),
      }
    );

    if (!updateResp.ok) {
      const errJson = (await updateResp.json()) as { error?: { message?: string } };
      return errorResponse(
        'AUTH_UPDATE_FAILED',
        errJson.error?.message || 'Failed to update Firebase Auth user status.',
        400
      );
    }

    return jsonResponse({ success: true, ok: true, authSynced: true });
  } catch {
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update user status.', 500);
  }
}

async function handleAdminResetPassword(request: Request, env: Env): Promise<Response> {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      return errorResponse('UNAUTHORIZED', 'Missing Authorization Bearer token.', 401);
    }

    const { projectId, apiKey, firestoreDatabaseId } = getFirebaseRuntimeConfig(env);
    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdTokenWorker(idToken, projectId);
    } catch {
      return errorResponse('UNAUTHORIZED', 'Invalid or expired Firebase ID token.', 401);
    }
    if (!decoded.email || !decoded.emailVerified) {
      return errorResponse(
        'UNVERIFIED_ADMIN',
        'Verified administrator token required.',
        403
      );
    }

    const authority = await verifyCallerStaffAuthorityWorker(
      idToken,
      decoded.email,
      projectId,
      firestoreDatabaseId
    );
    if (!authority.isSuperAdmin) {
      return errorResponse(
        'PERMISSION_DENIED',
        'Only a Super Admin can send user password resets.',
        403
      );
    }

    const body = (await request.json()) as { email?: string };
    const cleanEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return errorResponse(
        'VALIDATION_ERROR',
        'Valid target email address is required.',
        400
      );
    }
    if (!apiKey) {
      return errorResponse(
        'FIREBASE_CONFIG_MISSING',
        'Firebase Web API key missing on worker.',
        500
      );
    }

    const resetResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(
        apiKey
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
      const mapped = mapIdentityToolkitErrorWorker(errJson.error?.message || 'RESET_FAILED');
      return errorResponse(mapped.code, mapped.message, mapped.status);
    }

    return jsonResponse({ success: true, ok: true, email: cleanEmail });
  } catch {
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      'Failed to send password reset email.',
      500
    );
  }
}

async function handleAdminDeleteUser(request: Request, env: Env): Promise<Response> {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      return errorResponse('UNAUTHORIZED', 'Missing Authorization Bearer token.', 401);
    }

    const { projectId, firestoreDatabaseId } = getFirebaseRuntimeConfig(env);
    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdTokenWorker(idToken, projectId);
    } catch {
      return errorResponse('UNAUTHORIZED', 'Invalid or expired Firebase ID token.', 401);
    }
    if (!decoded.email || !decoded.emailVerified) {
      return errorResponse(
        'UNVERIFIED_ADMIN',
        'Verified administrator token required.',
        403
      );
    }

    const authority = await verifyCallerStaffAuthorityWorker(
      idToken,
      decoded.email,
      projectId,
      firestoreDatabaseId
    );
    if (!authority.isSuperAdmin) {
      return errorResponse(
        'PERMISSION_DENIED',
        'Only a Super Admin can delete user accounts.',
        403
      );
    }

    const body = (await request.json()) as { uid?: string; email?: string };
    const cleanEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const cleanUid = typeof body.uid === 'string' ? body.uid.trim() : '';

    if (cleanEmail === PRIMARY_SUPER_ADMIN_EMAIL || (cleanUid && cleanUid === decoded.uid)) {
      return errorResponse(
        'PERMISSION_DENIED',
        'Primary Super Admin or current account cannot be deleted.',
        403
      );
    }

    const saCheck = inspectSharedServiceAccountConfig(
      env.FIREBASE_SERVICE_ACCOUNT_JSON,
      SHARED_EXPECTED_FIREBASE_PROJECT_ID || projectId
    );
    if (!saCheck.ok || !cleanUid) {
      return jsonResponse({ success: true, ok: true, authDeleted: false });
    }

    const adminToken = await getGoogleAdminAccessTokenWorker(saCheck.config);
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
        return errorResponse(
          code,
          'Failed to delete user from Firebase Authentication.',
          400
        );
      }
    }

    return jsonResponse({ success: true, ok: true, authDeleted: true });
  } catch {
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to delete Firebase Auth user.', 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      if (url.pathname === '/api/health' && request.method === 'GET') {
        return jsonResponse({
          success: true,
          ok: true,
          brand: 'Home Recipe Foods',
          runtime: 'cloudflare-worker',
          firebaseProjectId: getFirebaseRuntimeConfig(env).projectId,
        });
      }

      if (url.pathname === '/api/auth/session-init' && request.method === 'POST') {
        return handleSessionInit(request, env);
      }

      if (
        (url.pathname === '/api/admin/create-user' || url.pathname === '/api/admin/create') &&
        request.method === 'POST'
      ) {
        return handleAdminCreateUser(request, env);
      }

      if (url.pathname === '/api/admin/rollback-user' && request.method === 'POST') {
        return handleAdminRollbackUser(request, env);
      }

      if (url.pathname === '/api/admin/update-user-status' && request.method === 'POST') {
        return handleAdminUpdateUserStatus(request, env);
      }

      if (url.pathname === '/api/admin/reset-password' && request.method === 'POST') {
        return handleAdminResetPassword(request, env);
      }

      if (url.pathname === '/api/admin/delete-user' && request.method === 'POST') {
        return handleAdminDeleteUser(request, env);
      }

      if (
        (url.pathname === '/api/chat/ai' || url.pathname === '/api/ai-assistant') &&
        request.method === 'POST'
      ) {
        return handleAiChat(request, env);
      }

      return errorResponse(
        'API_ROUTE_NOT_FOUND',
        `API endpoint ${url.pathname} not found.`,
        404
      );
    }

    if (url.pathname === '/robots.txt') {
      const origin = url.origin || env.APP_URL;
      return new Response(
        `User-agent: *\nAllow: /\nDisallow: /mahmud\nDisallow: /admin\nSitemap: ${origin}/sitemap.xml\n`,
        {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }
      );
    }

    if (url.pathname === '/sitemap.xml') {
      const origin = url.origin || env.APP_URL;
      const routes = [
        '/',
        '/products',
        '/outlets',
        '/showrooms',
        '/jobs',
        '/career',
        '/application-status',
        '/complaint',
        '/about',
        '/contact',
      ];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) => `  <url>
    <loc>${origin}${route}</loc>
    <changefreq>weekly</changefreq>
  </url>`
  )
  .join('\n')}
</urlset>`;
      return new Response(xml, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
