import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '2mb' }));

const PRIMARY_SUPER_ADMIN_EMAIL = 'mdmahmudulhashan0@gmail.com';
const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const firebaseProjectId = (
  process.env.VITE_FIREBASE_PROJECT_ID || 'ai-studio-applet-webapp-e4b0f'
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, brand: 'Home Recipe Foods' });
});

/**
 * Cryptographically verifies Firebase Auth ID token server-side (using Google's public x509 keys,
 * zero private keys or secrets stored) and authorizes primary Super Admin initialization.
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
    res.json({
      verified: true,
      uid: decoded.uid,
      email: decoded.email,
      authorizedSuperAdmin: isPrimarySuperAdmin,
      role: isPrimarySuperAdmin ? 'super_admin' : 'customer',
    });
  } catch (err) {
    console.error('Session verification failed:', err);
    res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
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
