import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

export interface AiConfigPayload {
  aiSupportEnabled?: boolean;
  aiAssistantName?: string;
  aiFallbackMessage?: string;
  aiCustomInstructions?: string;
}

export interface AiChatRequestBody {
  message?: unknown;
  history?: unknown;
  catalogContext?: unknown;
  aiConfig?: AiConfigPayload;
}

export type AiErrorCode =
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'permission_denied'
  | 'model_not_found'
  | 'rate_limit'
  | 'api_timeout'
  | 'gemini_api_error'
  | 'worker_internal_error'
  | 'VALIDATION_ERROR';

export type AiChatResult =
  | {
      ok: true;
      status: 200;
      reply: string;
      disabled?: boolean;
      modelUsed?: string;
    }
  | {
      ok: false;
      status: number;
      code: AiErrorCode;
      message: string;
      upstreamStatus?: number;
      retryAfterSec?: number;
    };

export const DEFAULT_AI_FALLBACK_MESSAGE =
  'এই তথ্যটি নিশ্চিতভাবে জানার জন্য আমাদের একজন প্রতিনিধি সাথে যোগাযোগ করুন।';

export const AI_ERROR_MESSAGES = {
  MISSING_API_KEY: 'AI service configuration is missing.',
  INVALID_API_KEY_401:
    'Gemini API key সঠিক নয় বা মেয়াদোত্তীর্ণ হয়েছে (401)। অনুগ্রহ করে বৈধ GEMINI_API_KEY যাচাই করুন।',
  PERMISSION_DENIED_403:
    'এই Gemini API key-তে অনুরোধ করার অনুমতি নেই (403)। API permission ও restriction যাচাই করুন।',
  MODEL_NOT_FOUND_404:
    'নির্বাচিত Gemini মডেলটি পাওয়া যায়নি (404)। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।',
  RATE_LIMIT_429:
    'অনুরোধের সীমা অতিক্রম করেছে (429 rate_limit)। অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন।',
  CONCURRENT_LIMIT_429:
    'আপনার আগের প্রশ্নটি এখনো প্রক্রিয়াকরণ হচ্ছে। অনুগ্রহ করে কয়েক সেকেন্ড অপেক্ষা করুন।',
  BURST_LIMIT_429:
    'খুব দ্রুত একাধিক অনুরোধ পাঠানো হয়েছে। অনুগ্রহ করে কয়েক সেকেন্ড পর আবার চেষ্টা করুন।',
  API_TIMEOUT:
    'Gemini API থেকে উত্তর আসতে সময় বেশি লেগেছে (api_timeout)। অনুগ্রহ করে আবার চেষ্টা করুন।',
  GEMINI_API_ERROR_500:
    'Gemini API সার্ভারে সাময়িক ত্রুটি হয়েছে (500)। অনুগ্রহ করে একটু পর আবার চেষ্টা করুন।',
  EMPTY_MESSAGE: 'অনুগ্রহ করে আপনার প্রশ্ন বা বার্তা লিখুন।',
} as const;

const GEMINI_REQUEST_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 800;

// Server-side per-user concurrency & rate-limit guards (isolate/process-scoped, no external DB writes)
const CONCURRENT_LOCK_TTL_MS = 45_000;
const MIN_REQUEST_COOLDOWN_MS = 1_200;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_USER_WINDOW = 8;

interface UserRateBucket {
  inFlightSince: number | null;
  lastRequestAt: number;
  timestamps: number[];
}

const userRateBuckets = new Map<string, UserRateBucket>();

export type RateLimitCheckResult =
  | {
      allowed: true;
      release: () => void;
    }
  | {
      allowed: false;
      status: 429;
      code: 'rate_limit';
      message: string;
      retryAfterSec: number;
      reason: 'concurrent' | 'cooldown' | 'window_limit';
    };

function pruneExpiredRateBuckets(now: number): void {
  if (userRateBuckets.size <= 300) return;
  for (const [key, bucket] of userRateBuckets.entries()) {
    const activeLock =
      bucket.inFlightSince !== null && now - bucket.inFlightSince < CONCURRENT_LOCK_TTL_MS;
    const recentActivity = now - bucket.lastRequestAt < RATE_WINDOW_MS;
    if (!activeLock && !recentActivity) {
      userRateBuckets.delete(key);
    }
  }
}

export function normalizeRateLimitClientId(rawClientId: unknown): string {
  if (typeof rawClientId !== 'string') return 'anonymous';
  const cleaned = rawClientId.trim().slice(0, 128);
  return cleaned || 'anonymous';
}

export function acquireAiRateLimitSlot(rawClientId: unknown): RateLimitCheckResult {
  const now = Date.now();
  pruneExpiredRateBuckets(now);

  const clientId = normalizeRateLimitClientId(rawClientId);
  let bucket = userRateBuckets.get(clientId);
  if (!bucket) {
    bucket = { inFlightSince: null, lastRequestAt: 0, timestamps: [] };
    userRateBuckets.set(clientId, bucket);
  }

  // 1. Concurrent request protection for the same user
  if (
    bucket.inFlightSince !== null &&
    now - bucket.inFlightSince < CONCURRENT_LOCK_TTL_MS
  ) {
    return {
      allowed: false,
      status: 429,
      code: 'rate_limit',
      reason: 'concurrent',
      retryAfterSec: 3,
      message: AI_ERROR_MESSAGES.CONCURRENT_LIMIT_429,
    };
  }

  // 2. Minimum cooldown protection between consecutive requests
  if (bucket.lastRequestAt > 0 && now - bucket.lastRequestAt < MIN_REQUEST_COOLDOWN_MS) {
    const waitSec = Math.max(
      1,
      Math.ceil((MIN_REQUEST_COOLDOWN_MS - (now - bucket.lastRequestAt)) / 1000)
    );
    return {
      allowed: false,
      status: 429,
      code: 'rate_limit',
      reason: 'cooldown',
      retryAfterSec: waitSec,
      message: AI_ERROR_MESSAGES.BURST_LIMIT_429,
    };
  }

  // 3. Sliding 60-second window burst protection
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < RATE_WINDOW_MS);
  if (bucket.timestamps.length >= MAX_REQUESTS_PER_USER_WINDOW) {
    const oldest = bucket.timestamps[0] ?? now;
    const waitSec = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - oldest)) / 1000));
    return {
      allowed: false,
      status: 429,
      code: 'rate_limit',
      reason: 'window_limit',
      retryAfterSec: waitSec,
      message: AI_ERROR_MESSAGES.RATE_LIMIT_429,
    };
  }

  bucket.inFlightSince = now;
  bucket.lastRequestAt = now;
  bucket.timestamps.push(now);

  let released = false;
  return {
    allowed: true,
    release: () => {
      if (released) return;
      released = true;
      const current = userRateBuckets.get(clientId);
      if (current) {
        current.inFlightSince = null;
        current.lastRequestAt = Date.now();
      }
    },
  };
}

export function resetAiRateLimitStateForTesting(): void {
  userRateBuckets.clear();
}

export function normalizeGeminiApiKey(rawKey: unknown): string {
  if (typeof rawKey !== 'string') return '';
  let normalized = rawKey
    .replace(/[\uFEFF\u200B-\u200D]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  const upper = normalized.toUpperCase();
  if (
    !normalized ||
    upper === 'MY_GEMINI_API_KEY' ||
    upper === 'YOUR_GEMINI_API_KEY' ||
    upper === 'GEMINI_API_KEY' ||
    upper.startsWith('REPLACE_')
  ) {
    return '';
  }
  return normalized;
}

export function hasConfiguredGeminiApiKey(rawKey: unknown): boolean {
  return normalizeGeminiApiKey(rawKey).length > 0;
}

function sanitizeHistory(rawHistory: unknown, currentMessage: string): Array<{
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}> {
  if (!Array.isArray(rawHistory)) return [];

  const cleaned: Array<{ role: 'user' | 'model'; text: string }> = [];
  for (const item of rawHistory.slice(-8)) {
    if (!item || typeof item !== 'object') continue;
    const rawRole = (item as { role?: unknown }).role;
    const rawText = (item as { text?: unknown }).text;
    if (typeof rawText !== 'string') continue;
    const text = rawText.trim().slice(0, 1200);
    if (!text) continue;
    const role: 'user' | 'model' = rawRole === 'assistant' ? 'model' : 'user';
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.role === role) {
      prev.text = `${prev.text}\n${text}`.slice(0, 1200);
    } else {
      cleaned.push({ role, text });
    }
  }

  const last = cleaned[cleaned.length - 1];
  if (last && last.role === 'user' && last.text === currentMessage) {
    cleaned.pop();
  }

  return cleaned.map((entry) => ({
    role: entry.role,
    parts: [{ text: entry.text }],
  }));
}

function pruneEmptyContextFields(value: unknown, depth = 0): unknown {
  if (depth > 6) return undefined;
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    const cleaned = value
      .map((item) => pruneEmptyContextFields(item, depth + 1))
      .filter((item) => item !== undefined);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = pruneEmptyContextFields(v, depth + 1);
      if (cleaned !== undefined) {
        out[k] = cleaned;
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return undefined;
}

function compactCatalogContext(rawContext: unknown): string {
  if (!rawContext || typeof rawContext !== 'object') {
    return '{}';
  }
  // Compact single-line JSON without empty keys saves input tokens per request to avoid TPM 429 limits
  try {
    const pruned = pruneEmptyContextFields(rawContext);
    return JSON.stringify(pruned ?? {});
  } catch {
    return '{}';
  }
}

function buildSystemInstruction(
  assistantName: string,
  fallbackMsg: string,
  customGuidance: string,
  catalogContext: unknown
): string {
  return `You are "${assistantName}", the official AI Product & Showroom Concierge for "Home Recipe Foods" (হোম রেসিপি ফুডস), a premium Bangladeshi food, bakery, sweets, and celebration brand.

STRICT BUSINESS & GROUNDING RULES:
1. Home Recipe Foods website is a Product Showcase & Customer Information platform ONLY. Customers CANNOT place online orders, add items to a cart, or pay online. Always politely guide them to visit or call our showrooms to purchase or reserve custom items.
2. You help customers with accurate information about Home Recipe Foods' Products, Categories, Occasions, Showrooms, Contact Information, About/Brand Information, and Knowledge Base from the LIVE DATABASE CONTEXT below.
3. For greetings (such as "Hello", "Hi", "হ্যালো", "আসসালামু আলাইকুম"), warmly greet the customer and briefly mention how you can assist with products, prices, categories, showrooms, or contact details.
4. NEVER invent, guess, or extrapolate any product price, availability, ingredient, weight, discount, delivery service, or showroom detail that is not explicitly present in the LIVE DATABASE CONTEXT.
5. If the customer asks for specific information that is not in the LIVE DATABASE CONTEXT (or you cannot verify it from the provided data), politely respond with this exact sentence:
"${fallbackMsg}"
6. Match the customer's language naturally (Bengali or English). Keep responses warm, clear, concise, and helpful.${customGuidance}

LIVE DATABASE CONTEXT:
${compactCatalogContext(catalogContext)}`;
}

export function classifyGeminiError(err: unknown): {
  status: number;
  code: Exclude<AiErrorCode, 'missing_api_key' | 'worker_internal_error' | 'VALIDATION_ERROR'>;
  message: string;
  retryable: boolean;
  upstreamStatus: number;
} {
  const errObj =
    err && typeof err === 'object'
      ? (err as {
          name?: unknown;
          status?: unknown;
          statusCode?: unknown;
          code?: unknown;
          message?: unknown;
          error?: { code?: unknown; status?: unknown; message?: unknown };
        })
      : {};

  const errName = typeof errObj.name === 'string' ? errObj.name.toUpperCase() : '';
  const numericStatus =
    typeof errObj.status === 'number'
      ? errObj.status
      : typeof errObj.statusCode === 'number'
      ? errObj.statusCode
      : typeof errObj.error?.code === 'number'
      ? errObj.error.code
      : 0;
  const rawMessage =
    typeof errObj.error?.message === 'string'
      ? errObj.error.message
      : typeof errObj.message === 'string'
      ? errObj.message
      : String(err || '');
  const upper = rawMessage.toUpperCase();

  if (
    errName === 'ABORTERROR' ||
    errName === 'TIMEOUTERROR' ||
    numericStatus === 504 ||
    upper.includes('API_TIMEOUT') ||
    upper.includes('DEADLINE_EXCEEDED') ||
    upper.includes('TIMED OUT') ||
    upper.includes('TIMEOUT') ||
    upper.includes('ABORT')
  ) {
    return {
      status: 504,
      code: 'api_timeout',
      message: AI_ERROR_MESSAGES.API_TIMEOUT,
      retryable: true,
      upstreamStatus: numericStatus || 504,
    };
  }

  if (
    numericStatus === 429 ||
    upper.includes('429') ||
    upper.includes('RESOURCE_EXHAUSTED') ||
    upper.includes('RATE_LIMIT') ||
    upper.includes('TOO MANY REQUESTS') ||
    upper.includes('QUOTA')
  ) {
    return {
      status: 429,
      code: 'rate_limit',
      message: AI_ERROR_MESSAGES.RATE_LIMIT_429,
      retryable: true,
      upstreamStatus: numericStatus || 429,
    };
  }

  if (
    numericStatus === 401 ||
    upper.includes('API_KEY_INVALID') ||
    upper.includes('API KEY NOT VALID') ||
    upper.includes('API KEY EXPIRED') ||
    upper.includes('API_KEY_EXPIRED') ||
    upper.includes('API KEY IS MISSING') ||
    upper.includes('UNAUTHENTICATED') ||
    (numericStatus === 400 && (upper.includes('API_KEY') || upper.includes('API KEY')))
  ) {
    return {
      status: 502,
      code: 'invalid_api_key',
      message: AI_ERROR_MESSAGES.INVALID_API_KEY_401,
      retryable: false,
      upstreamStatus: 401,
    };
  }

  if (numericStatus === 403 || upper.includes('PERMISSION_DENIED') || upper.includes('FORBIDDEN')) {
    return {
      status: 502,
      code: 'permission_denied',
      message: AI_ERROR_MESSAGES.PERMISSION_DENIED_403,
      retryable: false,
      upstreamStatus: 403,
    };
  }

  if (numericStatus === 404 || upper.includes('NOT_FOUND') || upper.includes('MODEL IS NOT FOUND')) {
    return {
      status: 502,
      code: 'model_not_found',
      message: AI_ERROR_MESSAGES.MODEL_NOT_FOUND_404,
      retryable: false,
      upstreamStatus: 404,
    };
  }

  const retryable =
    numericStatus === 500 ||
    numericStatus === 502 ||
    numericStatus === 503 ||
    upper.includes('UNAVAILABLE') ||
    upper.includes('INTERNAL') ||
    upper.includes('ECONNRESET') ||
    upper.includes('FETCH FAILED') ||
    /\b(500|502|503)\b/.test(upper);

  return {
    status: 502,
    code: 'gemini_api_error',
    message: AI_ERROR_MESSAGES.GEMINI_API_ERROR_500,
    retryable,
    upstreamStatus: numericStatus || 500,
  };
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeExponentialBackoffMs(retryNumber: number): number {
  const jitter = Math.floor(Math.random() * 200);
  return BASE_RETRY_DELAY_MS * 2 ** (retryNumber - 1) + jitter;
}

export async function processAiChatRequest(
  payload: AiChatRequestBody,
  geminiApiKey: string | undefined
): Promise<AiChatResult> {
  const fallbackMsg =
    typeof payload.aiConfig?.aiFallbackMessage === 'string' &&
    payload.aiConfig.aiFallbackMessage.trim()
      ? payload.aiConfig.aiFallbackMessage.trim().slice(0, 300)
      : DEFAULT_AI_FALLBACK_MESSAGE;

  if (payload.aiConfig?.aiSupportEnabled === false) {
    return {
      ok: true,
      status: 200,
      reply: `AI সহায়তা সাময়িকভাবে বন্ধ আছে। ${fallbackMsg}`,
      disabled: true,
    };
  }

  const cleanMessage =
    typeof payload.message === 'string' ? payload.message.trim().slice(0, 1500) : '';
  if (!cleanMessage) {
    return {
      ok: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: AI_ERROR_MESSAGES.EMPTY_MESSAGE,
    };
  }

  const apiKey = normalizeGeminiApiKey(geminiApiKey);
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      code: 'missing_api_key',
      message: AI_ERROR_MESSAGES.MISSING_API_KEY,
    };
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

  const systemInstruction = buildSystemInstruction(
    assistantName,
    fallbackMsg,
    customGuidance,
    payload.catalogContext
  );

  const historyContents = sanitizeHistory(payload.history, cleanMessage);
  const contents = [
    ...historyContents,
    { role: 'user' as const, parts: [{ text: cleanMessage }] },
  ];

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Initial attempt + up to MAX_BACKOFF_RETRIES (3) retries with quota-compatible fallback model
  const attemptPlan: Array<{ model: string; useThinkingConfig: boolean }> = [
    { model: 'gemini-4-hydrogen', useThinkingConfig: true },
    { model: 'gemini-3.1-flash-lite', useThinkingConfig: false },
    { model: 'gemini-3.1-flash-lite', useThinkingConfig: false },
    { model: 'gemini-4-hydrogen', useThinkingConfig: true },
  ];

  let lastClassified: ReturnType<typeof classifyGeminiError> | null = null;
  const maxAttempts = Math.min(attemptPlan.length, 1 + MAX_BACKOFF_RETRIES);

  for (let idx = 0; idx < maxAttempts; idx += 1) {
    const { model, useThinkingConfig } = attemptPlan[idx];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error('API_TIMEOUT'));
    }, GEMINI_REQUEST_TIMEOUT_MS);

    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          ...(useThinkingConfig ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          abortSignal: controller.signal,
        },
      });

      const reply = response.text?.trim();
      if (!reply) {
        return {
          ok: true,
          status: 200,
          reply: fallbackMsg,
          modelUsed: model,
        };
      }

      return {
        ok: true,
        status: 200,
        reply,
        modelUsed: model,
      };
    } catch (err) {
      const classified = classifyGeminiError(err);
      lastClassified = classified;

      const hasMoreAttempts = idx < maxAttempts - 1;
      const shouldRetry =
        hasMoreAttempts && (classified.retryable || classified.code === 'model_not_found');

      if (!shouldRetry) {
        console.error(
          `Gemini API request failed (attempt ${idx + 1}/${maxAttempts}, code=${classified.code}, status=${classified.status}, upstreamStatus=${classified.upstreamStatus})`
        );
        return {
          ok: false,
          status: classified.status,
          code: classified.code,
          message: classified.message,
          ...(classified.upstreamStatus ? { upstreamStatus: classified.upstreamStatus } : {}),
          ...(classified.code === 'rate_limit' ? { retryAfterSec: 15 } : {}),
        };
      }

      await waitMs(computeExponentialBackoffMs(idx + 1));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    ok: false,
    status: lastClassified?.status ?? 502,
    code: lastClassified?.code ?? 'gemini_api_error',
    message: lastClassified?.message ?? AI_ERROR_MESSAGES.GEMINI_API_ERROR_500,
    ...(lastClassified?.upstreamStatus ? { upstreamStatus: lastClassified.upstreamStatus } : {}),
    ...(lastClassified?.code === 'rate_limit' ? { retryAfterSec: 15 } : {}),
  };
}
