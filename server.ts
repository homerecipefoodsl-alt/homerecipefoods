import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

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

const PRIMARY_SUPER_ADMIN_EMAIL = 'mdmahmudulhashan0@gmail.com';
const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const firebaseProjectId = (
  process.env.VITE_FIREBASE_PROJECT_ID ||
  appletConfig.projectId ||
  'ai-studio-applet-webapp-e4b0f'
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
    auth_time?: number;
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

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface ServiceAccountConfig {
  project_id?: string;
  client_email: string;
  private_key: string;
}

function parseServiceAccountJson(raw?: string): ServiceAccountConfig | null {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccountConfig>;
    if (
      typeof parsed.client_email === 'string' &&
      parsed.client_email.trim() &&
      typeof parsed.private_key === 'string' &&
      parsed.private_key.includes('PRIVATE KEY')
    ) {
      return {
        project_id: typeof parsed.project_id === 'string' ? parsed.project_id.trim() : undefined,
        client_email: parsed.client_email.trim(),
        private_key: parsed.private_key.replace(/\\n/g, '\n'),
      };
    }
    return null;
  } catch {
    return null;
  }
}

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
        'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/firebase',
      aud: 'https://oauth2.googleapis.com/token',
      iat,
      exp,
    })
  );

  const signingInput = `${header}.${claimSet}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = base64UrlEncode(signer.sign(sa.private_key));
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
    error?: string;
    error_description?: string;
  };
  if (!tokenResp.ok || !tokenJson.access_token) {
    throw new Error(
      tokenJson.error_description || tokenJson.error || 'Failed to obtain Service Account token'
    );
  }

  cachedServiceAccountToken = {
    token: tokenJson.access_token,
    expiresAt: now + (tokenJson.expires_in || 3600) * 1000,
    clientEmail: sa.client_email,
  };
  return tokenJson.access_token;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, brand: 'Home Recipe Foods' });
});

/**
 * Cryptographically verifies Firebase Auth ID token server-side (using Google's public x509 keys,
 * zero private keys or secrets stored) and authorizes Super Admin / capabilities check.
 */
app.post('/api/auth/session-init', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Missing Bearer token' });
      return;
    }

    const decoded = await verifyFirebaseIdToken(token);
    if (!decoded.email || !decoded.emailVerified) {
      res.status(403).json({
        verified: false,
        authorizedSuperAdmin: false,
        role: 'customer',
      });
      return;
    }

    const isPrimarySuperAdmin = decoded.email === PRIMARY_SUPER_ADMIN_EMAIL;
    const hasAdminCredentials = Boolean(parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
    res.json({
      verified: true,
      uid: decoded.uid,
      email: decoded.email,
      isPrimarySuperAdmin,
      authorizedSuperAdmin: isPrimarySuperAdmin,
      hasAdminCredentials,
      role: isPrimarySuperAdmin ? 'super_admin' : 'customer',
    });
  } catch (err) {
    console.error('Session verification failed:', err);
    res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
  }
});

interface CallerRbacCheck {
  allowed: boolean;
  isPrimarySuperAdmin: boolean;
  isSuperAdmin: boolean;
  canManageManagers: boolean;
  callerEmail: string;
}

async function verifyCallerStaffAuthority(
  idToken: string,
  callerEmail: string
): Promise<CallerRbacCheck> {
  if (callerEmail === PRIMARY_SUPER_ADMIN_EMAIL) {
    return {
      allowed: true,
      isPrimarySuperAdmin: true,
      isSuperAdmin: true,
      canManageManagers: true,
      callerEmail,
    };
  }

  try {
    const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      firebaseProjectId
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
        callerEmail,
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
      callerEmail,
    };
  } catch {
    return {
      allowed: false,
      isPrimarySuperAdmin: false,
      isSuperAdmin: false,
      canManageManagers: false,
      callerEmail,
    };
  }
}

function mapIdentityToolkitError(code: string): { status: number; message: string } {
  if (code.includes('EMAIL_EXISTS') || code.includes('DUPLICATE_EMAIL')) {
    return {
      status: 409,
      message: 'This email is already registered.',
    };
  }
  if (code.includes('INVALID_EMAIL')) {
    return { status: 400, message: 'Please enter a valid email address.' };
  }
  if (code.includes('OPERATION_NOT_ALLOWED')) {
    return {
      status: 400,
      message:
        'Email/Password sign-in is disabled in Firebase Authentication. Enable it under Firebase Console → Authentication → Sign-in method.',
    };
  }
  if (code.includes('WEAK_PASSWORD')) {
    return { status: 400, message: 'Password must be at least 8 characters.' };
  }
  if (code.includes('USER_NOT_FOUND')) {
    return { status: 404, message: 'No Firebase Auth user found for this account.' };
  }
  return {
    status: 400,
    message: `Firebase Auth request failed (${code || 'UNKNOWN'}).`,
  };
}

app.post('/api/admin/create-user', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      res.status(401).json({ error: 'Missing Authorization Bearer token' });
      return;
    }

    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch {
      res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
      return;
    }
    if (!decoded.email || !decoded.emailVerified) {
      res.status(403).json({ error: 'Verified administrator token required' });
      return;
    }

    const authority = await verifyCallerStaffAuthority(idToken, decoded.email);
    if (!authority.allowed) {
      res.status(403).json({ error: 'Insufficient privileges to create staff accounts' });
      return;
    }

    const { email, password, displayName, role, status, allowSuperAdminCreation } = req.body as {
      email?: string;
      password?: string;
      displayName?: string;
      role?: string;
      status?: string;
      allowSuperAdminCreation?: boolean;
    };

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanName = typeof displayName === 'string' ? displayName.trim().slice(0, 120) : '';
    const cleanRole = typeof role === 'string' ? role.trim() : '';
    const cleanStatus =
      status === 'suspended' || status === 'disabled' ? status : 'active';

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (cleanEmail === PRIMARY_SUPER_ADMIN_EMAIL) {
      res.status(403).json({ error: 'This email is already registered.' });
      return;
    }
    if (!['super_admin', 'admin', 'manager', 'support_agent'].includes(cleanRole)) {
      res.status(400).json({ error: 'Invalid role selected.' });
      return;
    }
    if (cleanRole === 'super_admin') {
      if (!authority.isPrimarySuperAdmin || allowSuperAdminCreation !== true) {
        res.status(403).json({
          error:
            'Only the primary Super Admin can explicitly authorize creating another Super Admin account.',
        });
        return;
      }
    }
    if (!authority.isSuperAdmin && cleanRole !== 'manager') {
      res.status(403).json({
        error: 'Only a Super Admin can create Admin or Support Agent accounts.',
      });
      return;
    }
    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    // Path A: Firebase Admin SDK REST API via Service Account (pre-verified, supports disabled status)
    const sa = parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (sa) {
      const adminToken = await getGoogleAdminAccessToken(sa);
      const targetProject = sa.project_id || firebaseProjectId;
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
            password,
            ...(cleanName ? { displayName: cleanName } : {}),
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
        const code = createJson.error?.message || 'ADMIN_CREATE_FAILED';
        const mapped = mapIdentityToolkitError(code);
        res.status(mapped.status).json({ error: mapped.message, code });
        return;
      }

      res.json({
        ok: true,
        uid: createJson.localId,
        email: (createJson.email || cleanEmail).toLowerCase(),
        emailVerified: true,
        verificationEmailSent: false,
        authMode: 'admin_sdk',
      });
      return;
    }

    // Path B: Identity Toolkit public REST fallback (preserves Super Admin session, sends verification email)
    if (!firebaseApiKey) {
      res.status(500).json({ error: 'Firebase Web API key missing on server.' });
      return;
    }

    const signUpResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(
        firebaseApiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          returnSecureToken: true,
        }),
      }
    );

    const signUpJson = (await signUpResp.json()) as {
      localId?: string;
      idToken?: string;
      email?: string;
      error?: { message?: string };
    };

    if (!signUpResp.ok || !signUpJson.localId || !signUpJson.idToken) {
      const code = signUpJson.error?.message || 'SIGNUP_FAILED';
      const mapped = mapIdentityToolkitError(code);
      res.status(mapped.status).json({ error: mapped.message, code });
      return;
    }

    let currentNewUserToken = signUpJson.idToken;

    if (cleanName) {
      try {
        const updateResp = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(
            firebaseApiKey
          )}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken: currentNewUserToken,
              displayName: cleanName,
              returnSecureToken: true,
            }),
          }
        );
        if (updateResp.ok) {
          const updateJson = (await updateResp.json()) as { idToken?: string };
          if (updateJson.idToken) {
            currentNewUserToken = updateJson.idToken;
          }
        }
      } catch {
        // Non-fatal profile name update
      }
    }

    let verificationEmailSent = false;
    try {
      const oobResp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(
          firebaseApiKey
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestType: 'VERIFY_EMAIL',
            idToken: currentNewUserToken,
          }),
        }
      );
      verificationEmailSent = oobResp.ok;
    } catch {
      verificationEmailSent = false;
    }

    res.json({
      ok: true,
      uid: signUpJson.localId,
      email: (signUpJson.email || cleanEmail).toLowerCase(),
      rollbackToken: currentNewUserToken,
      emailVerified: false,
      verificationEmailSent,
      authMode: 'identity_toolkit',
    });
  } catch (err) {
    console.error('Create staff user error:', err);
    res.status(500).json({ error: 'Server error while creating user account.' });
  }
});

app.post('/api/admin/rollback-user', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      res.status(401).json({ error: 'Missing Authorization Bearer token' });
      return;
    }

    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch {
      res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
      return;
    }
    if (!decoded.email || !decoded.emailVerified) {
      res.status(403).json({ error: 'Verified administrator token required' });
      return;
    }

    const authority = await verifyCallerStaffAuthority(idToken, decoded.email);
    if (!authority.allowed) {
      res.status(403).json({ error: 'Unauthorized rollback request' });
      return;
    }

    const { uid, rollbackToken } = req.body as { uid?: string; rollbackToken?: string };

    const sa = parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (sa && typeof uid === 'string' && uid.trim() && uid.trim() !== decoded.uid) {
      const adminToken = await getGoogleAdminAccessToken(sa);
      const targetProject = sa.project_id || firebaseProjectId;
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
          body: JSON.stringify({ localId: uid.trim() }),
        }
      );
      if (!delResp.ok) {
        res.status(500).json({ error: 'Admin SDK rollback delete failed' });
        return;
      }
      res.json({ ok: true });
      return;
    }

    if (typeof rollbackToken !== 'string' || !rollbackToken.trim() || !firebaseApiKey) {
      res.status(400).json({ error: 'Invalid rollback request' });
      return;
    }

    const delResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(
        firebaseApiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: rollbackToken.trim() }),
      }
    );

    if (!delResp.ok) {
      res.status(500).json({ error: 'Rollback delete failed' });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Rollback failed' });
  }
});

app.post('/api/admin/update-user-status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      res.status(401).json({ error: 'Missing Authorization Bearer token' });
      return;
    }

    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch {
      res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
      return;
    }
    if (!decoded.email || !decoded.emailVerified) {
      res.status(403).json({ error: 'Verified administrator token required' });
      return;
    }

    const authority = await verifyCallerStaffAuthority(idToken, decoded.email);
    if (!authority.allowed) {
      res.status(403).json({ error: 'Insufficient privileges' });
      return;
    }

    const { uid, email, role, disabled } = req.body as {
      uid?: string;
      email?: string;
      role?: string;
      disabled?: boolean;
    };

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanUid = typeof uid === 'string' ? uid.trim() : '';

    if (cleanEmail === PRIMARY_SUPER_ADMIN_EMAIL || (cleanUid && cleanUid === decoded.uid)) {
      res.status(403).json({ error: 'Primary Super Admin or current session cannot be disabled.' });
      return;
    }
    if (!authority.isSuperAdmin && role !== 'manager') {
      res.status(403).json({ error: 'Only a Super Admin can modify non-manager accounts.' });
      return;
    }

    const sa = parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (!sa || !cleanUid) {
      res.json({ ok: true, authSynced: false });
      return;
    }

    const adminToken = await getGoogleAdminAccessToken(sa);
    const targetProject = sa.project_id || firebaseProjectId;
    const updateResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(
        targetProject
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
        }),
      }
    );

    if (!updateResp.ok) {
      const errJson = (await updateResp.json()) as { error?: { message?: string } };
      res.status(400).json({
        error: errJson.error?.message || 'Failed to update Firebase Auth user status.',
      });
      return;
    }

    res.json({ ok: true, authSynced: true });
  } catch (err) {
    console.error('Update user status error:', err);
    res.status(500).json({ error: 'Failed to update user status.' });
  }
});

app.post('/api/admin/reset-password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      res.status(401).json({ error: 'Missing Authorization Bearer token' });
      return;
    }

    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch {
      res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
      return;
    }
    if (!decoded.email || !decoded.emailVerified) {
      res.status(403).json({ error: 'Verified administrator token required' });
      return;
    }

    const authority = await verifyCallerStaffAuthority(idToken, decoded.email);
    if (!authority.isSuperAdmin) {
      res.status(403).json({ error: 'Only a Super Admin can send user password resets.' });
      return;
    }

    const { email } = req.body as { email?: string };
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Valid target email address is required.' });
      return;
    }
    if (!firebaseApiKey) {
      res.status(500).json({ error: 'Firebase Web API key missing on server.' });
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
      res.status(mapped.status).json({ error: mapped.message });
      return;
    }

    res.json({ ok: true, email: cleanEmail });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to send password reset email.' });
  }
});

app.post('/api/admin/delete-user', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      res.status(401).json({ error: 'Missing Authorization Bearer token' });
      return;
    }

    let decoded: VerifiedFirebaseToken;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch {
      res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
      return;
    }
    if (!decoded.email || !decoded.emailVerified) {
      res.status(403).json({ error: 'Verified administrator token required' });
      return;
    }

    const authority = await verifyCallerStaffAuthority(idToken, decoded.email);
    if (!authority.isSuperAdmin) {
      res.status(403).json({ error: 'Only a Super Admin can delete user accounts.' });
      return;
    }

    const { uid, email } = req.body as { uid?: string; email?: string };
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanUid = typeof uid === 'string' ? uid.trim() : '';

    if (cleanEmail === PRIMARY_SUPER_ADMIN_EMAIL || (cleanUid && cleanUid === decoded.uid)) {
      res.status(403).json({ error: 'Primary Super Admin or current account cannot be deleted.' });
      return;
    }

    const sa = parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (!sa || !cleanUid) {
      res.json({ ok: true, authDeleted: false });
      return;
    }

    const adminToken = await getGoogleAdminAccessToken(sa);
    const targetProject = sa.project_id || firebaseProjectId;
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
        body: JSON.stringify({ localId: cleanUid }),
      }
    );

    if (!delResp.ok) {
      const errJson = (await delResp.json()) as { error?: { message?: string } };
      const code = errJson.error?.message || '';
      if (!code.includes('USER_NOT_FOUND')) {
        res.status(400).json({
          error: code || 'Failed to delete user from Firebase Authentication.',
        });
        return;
      }
    }

    res.json({ ok: true, authDeleted: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete Firebase Auth user.' });
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

interface ChatHistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

interface AiConfigPayload {
  aiSupportEnabled?: boolean;
  aiAssistantName?: string;
  aiFallbackMessage?: string;
  aiCustomInstructions?: string;
}

app.post('/api/chat/ai', async (req, res) => {
  try {
    const { message, history, catalogContext, aiConfig } = req.body as {
      message?: string;
      history?: ChatHistoryItem[];
      catalogContext?: unknown;
      aiConfig?: AiConfigPayload;
    };

    const fallbackMsg =
      typeof aiConfig?.aiFallbackMessage === 'string' && aiConfig.aiFallbackMessage.trim()
        ? aiConfig.aiFallbackMessage.trim().slice(0, 300)
        : 'এই তথ্যটি নিশ্চিতভাবে জানার জন্য আমাদের একজন প্রতিনিধি সাথে যোগাযোগ করুন।';

    if (aiConfig?.aiSupportEnabled === false) {
      res.json({
        reply: `AI সহায়তা সাময়িকভাবে বন্ধ আছে। ${fallbackMsg}`,
      });
      return;
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(503).json({ reply: fallbackMsg });
      return;
    }

    const assistantName =
      typeof aiConfig?.aiAssistantName === 'string' && aiConfig.aiAssistantName.trim()
        ? aiConfig.aiAssistantName.trim().slice(0, 80)
        : 'Home Recipe AI Assistant';
    const customGuidance =
      typeof aiConfig?.aiCustomInstructions === 'string' && aiConfig.aiCustomInstructions.trim()
        ? `\nADDITIONAL BRAND GUIDANCE:\n${aiConfig.aiCustomInstructions.trim().slice(0, 1000)}`
        : '';

    const systemInstruction = `You are "${assistantName}", the official AI Product & Showroom Concierge for "Home Recipe Foods" (হোম রেসিপি ফুডস), a premium Bangladeshi food brand.

STRICT BUSINESS & GROUNDING RULES:
1. Home Recipe Foods website is a Product Showcase & Customer Information platform ONLY. Customers CANNOT place online orders, use a cart, or pay online. Always politely guide them to visit or call one of our showrooms to purchase or reserve custom items.
2. You MUST ONLY answer using facts present in the LIVE DATABASE CONTEXT provided below (products, prices in BDT ৳, categories, ingredients, sizes/weights, suitable occasions, showrooms, phone numbers, opening hours).
3. NEVER invent, guess, or extrapolate any product price, availability, ingredient, discount, delivery service, or showroom detail that is not explicitly in the LIVE DATABASE CONTEXT.
4. If the user asks about anything not found in the LIVE DATABASE CONTEXT (or if you are not 100% certain from the provided data), you MUST respond with this exact sentence:
"${fallbackMsg}"
5. Match the customer's language naturally (Bengali or English). Keep responses warm, refined, concise, and helpful.${customGuidance}

LIVE DATABASE CONTEXT:
${JSON.stringify(catalogContext ?? {}, null, 2)}`;

    const formattedHistory = Array.isArray(history)
      ? history.slice(-8).map((item) => ({
          role: item.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(item.text || '').slice(0, 1500) }],
        }))
      : [];

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: [
        ...formattedHistory,
        { role: 'user', parts: [{ text: message.trim().slice(0, 1500) }] },
      ],
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const reply = response.text?.trim() || fallbackMsg;
    res.json({ reply });
  } catch (err) {
    console.error('AI Chat error:', err);
    res.status(500).json({
      reply: 'এই তথ্যটি নিশ্চিতভাবে জানার জন্য আমাদের একজন প্রতিনিধি সাথে যোগাযোগ করুন।',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
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
