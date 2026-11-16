import firebaseConfig from '../firebase-applet-config.json';

interface CloudflareAssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: CloudflareAssetsBinding;
  GEMINI_API_KEY?: string;
  APP_URL?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_FIRESTORE_DATABASE_ID?: string;
}

const PRIMARY_SUPER_ADMIN_EMAIL = 'mdmahmudulhashan0@gmail.com';
const FIREBASE_JWK_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

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
    projectId: (env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId || '').trim(),
    apiKey: (env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey || '').trim(),
    firestoreDatabaseId: (
      env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
      firebaseConfig.firestoreDatabaseId ||
      '(default)'
    ).trim(),
  };
}

async function verifyCallerStaffAuthorityWorker(
  idToken: string,
  callerEmail: string,
  projectId: string,
  firestoreDatabaseId: string
): Promise<{ allowed: boolean; isSuperAdmin: boolean; canManageManagers: boolean }> {
  if (callerEmail === PRIMARY_SUPER_ADMIN_EMAIL) {
    return { allowed: true, isSuperAdmin: true, canManageManagers: true };
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
      return { allowed: false, isSuperAdmin: false, canManageManagers: false };
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
    const isSuper = isActive && role === 'super_admin' && callerEmail === PRIMARY_SUPER_ADMIN_EMAIL;
    const canManageManagers = isActive && permissions.includes('manager_manage');
    return {
      allowed: isSuper || canManageManagers,
      isSuperAdmin: isSuper,
      canManageManagers,
    };
  } catch {
    return { allowed: false, isSuperAdmin: false, canManageManagers: false };
  }
}

function mapIdentityToolkitErrorWorker(code: string): { status: number; message: string } {
  switch (code) {
    case 'EMAIL_EXISTS':
      return {
        status: 409,
        message:
          'এই ইমেইল দিয়ে ইতিমধ্যেই Firebase Auth অ্যাকাউন্ট রয়েছে। "Existing Auth User" মোড ব্যবহার করুন অথবা ভিন্ন ইমেইল দিন।',
      };
    case 'INVALID_EMAIL':
      return { status: 400, message: 'সঠিক ইমেইল ঠিকানা লিখুন।' };
    case 'OPERATION_NOT_ALLOWED':
      return {
        status: 400,
        message:
          'Firebase Console-এ Email/Password Sign-in নিষ্ক্রিয় আছে। অনুগ্রহ করে Firebase Authentication → Sign-in method থেকে Email/Password চালু করুন।',
      };
    default:
      if (code.startsWith('WEAK_PASSWORD')) {
        return { status: 400, message: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের শক্তিশালী হতে হবে।' };
      }
      return {
        status: 400,
        message: `Firebase Auth অ্যাকাউন্ট তৈরি ব্যর্থ হয়েছে (${code || 'UNKNOWN'}).`,
      };
  }
}

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function handleAiChat(request: Request, env: Env): Promise<Response> {
  const defaultFallback =
    'এই তথ্যটি নিশ্চিতভাবে জানার জন্য আমাদের একজন প্রতিনিধি সাথে যোগাযোগ করুন।';

  try {
    const payload = (await request.json()) as {
      message?: string;
      history?: ChatHistoryItem[];
      catalogContext?: unknown;
      aiConfig?: AiConfigPayload;
    };

    const fallbackMsg =
      typeof payload.aiConfig?.aiFallbackMessage === 'string' &&
      payload.aiConfig.aiFallbackMessage.trim()
        ? payload.aiConfig.aiFallbackMessage.trim().slice(0, 300)
        : defaultFallback;

    if (payload.aiConfig?.aiSupportEnabled === false) {
      return jsonResponse({
        reply: `AI সহায়তা সাময়িকভাবে বন্ধ আছে। ${fallbackMsg}`,
      });
    }

    if (!payload.message || typeof payload.message !== 'string' || !payload.message.trim()) {
      return jsonResponse({ error: 'Message is required.' }, 400);
    }

    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ reply: fallbackMsg }, 503);
    }

    const assistantName =
      typeof payload.aiConfig?.aiAssistantName === 'string' &&
      payload.aiConfig.aiAssistantName.trim()
        ? payload.aiConfig.aiAssistantName.trim().slice(0, 80)
        : 'Home Recipe AI Assistant';

    const customGuidance =
      typeof payload.aiConfig?.aiCustomInstructions === 'string' &&
      payload.aiConfig.aiCustomInstructions.trim()
        ? `\nADDITIONAL BRAND GUIDANCE:\n${payload.aiConfig.aiCustomInstructions.trim().slice(0, 1000)}`
        : '';

    const systemInstruction = `You are "${assistantName}", the official AI Product & Showroom Concierge for "Home Recipe Foods" (হোম রেসিপি ফুডস), a premium Bangladeshi food brand.

STRICT BUSINESS & GROUNDING RULES:
1. Home Recipe Foods website is a Product Showcase & Customer Information platform ONLY. Customers CANNOT place online orders, use a cart, or pay online. Always politely guide them to visit or call one of our showrooms to purchase or reserve custom items.
2. You MUST ONLY answer using facts present in the LIVE DATABASE CONTEXT provided below (products, prices in BDT ৳, categories, ingredients, sizes/weights, suitable occasions, showrooms, phone numbers, opening hours, and admin knowledge base).
3. NEVER invent, guess, or extrapolate any product price, availability, ingredient, discount, delivery service, or showroom detail that is not explicitly in the LIVE DATABASE CONTEXT.
4. If the user asks about anything not found in the LIVE DATABASE CONTEXT (or if you are not 100% certain from the provided data), you MUST respond with this exact sentence:
"${fallbackMsg}"
5. Match the customer's language naturally (Bengali or English). Keep responses warm, refined, concise, and helpful.${customGuidance}

LIVE DATABASE CONTEXT:
${JSON.stringify(payload.catalogContext ?? {}, null, 2)}`;

    const contents = [
      ...(Array.isArray(payload.history)
        ? payload.history.slice(-8).map((item) => ({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(item.text || '').slice(0, 1500) }],
          }))
        : []),
      { role: 'user', parts: [{ text: payload.message.trim().slice(0, 1500) }] },
    ];

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        env.GEMINI_API_KEY
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
        }),
      }
    );

    if (!geminiResp.ok) {
      return jsonResponse({ reply: fallbackMsg }, 502);
    }

    const data = (await geminiResp.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const replyText =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || fallbackMsg;

    return jsonResponse({ reply: replyText });
  } catch {
    return jsonResponse({ reply: defaultFallback }, 500);
  }
}

async function handleSessionInit(request: Request, env: Env): Promise<Response> {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return jsonResponse({ error: 'Missing Bearer token' }, 401);
    }
    const { projectId } = getFirebaseRuntimeConfig(env);
    const decoded = await verifyFirebaseIdTokenWorker(token, projectId);
    if (!decoded.email || !decoded.emailVerified) {
      return jsonResponse(
        { verified: false, authorizedSuperAdmin: false, role: 'customer' },
        403
      );
    }
    const isPrimarySuperAdmin = decoded.email === PRIMARY_SUPER_ADMIN_EMAIL;
    return jsonResponse({
      verified: true,
      uid: decoded.uid,
      email: decoded.email,
      authorizedSuperAdmin: isPrimarySuperAdmin,
      role: isPrimarySuperAdmin ? 'super_admin' : 'customer',
    });
  } catch {
    return jsonResponse({ error: 'Invalid or expired Firebase ID token' }, 401);
  }
}

async function handleAdminCreateUser(request: Request, env: Env): Promise<Response> {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      return jsonResponse({ error: 'Missing Authorization Bearer token' }, 401);
    }

    const { projectId, apiKey, firestoreDatabaseId } = getFirebaseRuntimeConfig(env);
    const decoded = await verifyFirebaseIdTokenWorker(idToken, projectId);
    if (!decoded.email || !decoded.emailVerified) {
      return jsonResponse({ error: 'Verified administrator token required' }, 403);
    }

    const authority = await verifyCallerStaffAuthorityWorker(
      idToken,
      decoded.email,
      projectId,
      firestoreDatabaseId
    );
    if (!authority.allowed) {
      return jsonResponse({ error: 'Insufficient privileges to create staff accounts' }, 403);
    }

    const body = (await request.json()) as {
      email?: string;
      password?: string;
      displayName?: string;
      role?: string;
    };

    const cleanEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const cleanName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 120) : '';
    const cleanRole = typeof body.role === 'string' ? body.role.trim() : '';

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return jsonResponse({ error: 'সঠিক ইমেইল ঠিকানা দিন।' }, 400);
    }
    if (cleanEmail === PRIMARY_SUPER_ADMIN_EMAIL) {
      return jsonResponse({ error: 'Primary Super Admin অ্যাকাউন্ট পরিবর্তনযোগ্য নয়।' }, 403);
    }
    if (!['admin', 'manager', 'support_agent'].includes(cleanRole)) {
      return jsonResponse({ error: 'অননুমোদিত রোল নির্ধারিত হয়েছে।' }, 400);
    }
    if (!authority.isSuperAdmin && cleanRole !== 'manager') {
      return jsonResponse(
        { error: 'শুধুমাত্র Super Admin নতুন Admin বা Support Agent তৈরি করতে পারবেন।' },
        403
      );
    }
    if (typeof body.password !== 'string' || body.password.length < 6) {
      return jsonResponse({ error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' }, 400);
    }
    if (!apiKey) {
      return jsonResponse({ error: 'Firebase Web API key missing on worker.' }, 500);
    }

    const signUpResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password: body.password,
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
      const mapped = mapIdentityToolkitErrorWorker(code);
      return jsonResponse({ error: mapped.message, code }, mapped.status);
    }

    let currentNewUserToken = signUpJson.idToken;
    if (cleanName) {
      try {
        const updateResp = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(
            apiKey
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
        // Non-fatal
      }
    }

    let verificationEmailSent = false;
    try {
      const oobResp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(
          apiKey
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

    return jsonResponse({
      ok: true,
      uid: signUpJson.localId,
      email: (signUpJson.email || cleanEmail).toLowerCase(),
      rollbackToken: currentNewUserToken,
      verificationEmailSent,
    });
  } catch {
    return jsonResponse({ error: 'নতুন স্টাফ অ্যাকাউন্ট তৈরি করতে সার্ভার ত্রুটি হয়েছে।' }, 500);
  }
}

async function handleAdminRollbackUser(request: Request, env: Env): Promise<Response> {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!idToken) {
      return jsonResponse({ error: 'Missing Authorization Bearer token' }, 401);
    }

    const { projectId, apiKey, firestoreDatabaseId } = getFirebaseRuntimeConfig(env);
    const decoded = await verifyFirebaseIdTokenWorker(idToken, projectId);
    if (!decoded.email || !decoded.emailVerified) {
      return jsonResponse({ error: 'Verified administrator token required' }, 403);
    }

    const authority = await verifyCallerStaffAuthorityWorker(
      idToken,
      decoded.email,
      projectId,
      firestoreDatabaseId
    );
    if (!authority.allowed) {
      return jsonResponse({ error: 'Unauthorized rollback request' }, 403);
    }

    const body = (await request.json()) as { rollbackToken?: string };
    if (typeof body.rollbackToken !== 'string' || !body.rollbackToken.trim() || !apiKey) {
      return jsonResponse({ error: 'Invalid rollback request' }, 400);
    }

    const delResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: body.rollbackToken.trim() }),
      }
    );

    if (!delResp.ok) {
      return jsonResponse({ error: 'Rollback delete failed' }, 500);
    }
    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ error: 'Rollback failed' }, 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return jsonResponse({
        ok: true,
        brand: 'Home Recipe Foods',
        runtime: 'cloudflare-worker',
      });
    }

    if (url.pathname === '/api/auth/session-init' && request.method === 'POST') {
      return handleSessionInit(request, env);
    }

    if (url.pathname === '/api/admin/create-user' && request.method === 'POST') {
      return handleAdminCreateUser(request, env);
    }

    if (url.pathname === '/api/admin/rollback-user' && request.method === 'POST') {
      return handleAdminRollbackUser(request, env);
    }

    if (url.pathname === '/api/chat/ai' && request.method === 'POST') {
      return handleAiChat(request, env);
    }

    if (url.pathname === '/robots.txt') {
      const origin = env.APP_URL || url.origin;
      return new Response(
        `User-agent: *\nAllow: /\nDisallow: /mahmud\nDisallow: /admin\nSitemap: ${origin}/sitemap.xml\n`,
        {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }
      );
    }

    if (url.pathname === '/sitemap.xml') {
      const origin = env.APP_URL || url.origin;
      const routes = [
        '/',
        '/products',
        '/showrooms',
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
