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

export type AiChatResult =
  | {
      ok: true;
      status: 200;
      reply: string;
      disabled?: boolean;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

export const DEFAULT_AI_FALLBACK_MESSAGE =
  'এই তথ্যটি নিশ্চিতভাবে জানার জন্য আমাদের একজন প্রতিনিধি সাথে যোগাযোগ করুন।';

export const AI_ERROR_MESSAGES = {
  CONFIG_MISSING: 'AI service configuration is missing.',
  RATE_LIMITED: 'অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন।',
  UNAVAILABLE: 'AI Assistant এখন সাময়িকভাবে unavailable। একটু পরে আবার চেষ্টা করুন।',
  EMPTY_MESSAGE: 'অনুগ্রহ করে আপনার প্রশ্ন বা বার্তা লিখুন।',
} as const;

function sanitizeHistory(rawHistory: unknown, currentMessage: string): Array<{
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}> {
  if (!Array.isArray(rawHistory)) return [];

  const cleaned: Array<{ role: 'user' | 'model'; text: string }> = [];
  for (const item of rawHistory.slice(-10)) {
    if (!item || typeof item !== 'object') continue;
    const rawRole = (item as { role?: unknown }).role;
    const rawText = (item as { text?: unknown }).text;
    if (typeof rawText !== 'string') continue;
    const text = rawText.trim().slice(0, 1500);
    if (!text) continue;
    const role: 'user' | 'model' = rawRole === 'assistant' ? 'model' : 'user';
    // Merge or avoid adjacent identical-role turns if malformed history was sent
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.role === role) {
      prev.text = `${prev.text}\n${text}`.slice(0, 1500);
    } else {
      cleaned.push({ role, text });
    }
  }

  // Prevent duplicating the current user message if already included at end of history
  const last = cleaned[cleaned.length - 1];
  if (last && last.role === 'user' && last.text === currentMessage) {
    cleaned.pop();
  }

  return cleaned.map((entry) => ({
    role: entry.role,
    parts: [{ text: entry.text }],
  }));
}

function buildSystemInstruction(
  assistantName: string,
  fallbackMsg: string,
  customGuidance: string,
  catalogContext: unknown
): string {
  return `You are "${assistantName}", the official AI Product & Showroom Concierge for "Home Recipe Foods" (হোম রেসিপি ফুডস), a premium Bangladeshi food, bakery, sweets, and celebration brand.

STRICT BUSINESS & GROUNDING RULES:
1. Home Recipe Foods website is a Product Showcase & Customer Information platform ONLY. Customers CANNOT place online orders, add items to a cart, or pay online. Always politely guide them to visit or call one of our showrooms to purchase or reserve custom items.
2. You help customers with accurate information about Home Recipe Foods' Products, Categories, Occasions, Showrooms, Contact Information, About/Brand Information, and Knowledge Base from the LIVE DATABASE CONTEXT below.
3. For greetings (such as "Hello", "Hi", "হ্যালো", "আসসালামু আলাইকুম"), warmly greet the customer and briefly mention how you can assist with products, prices, categories, showrooms, or contact details.
4. NEVER invent, guess, or extrapolate any product price, availability, ingredient, weight, discount, delivery service, or showroom detail that is not explicitly present in the LIVE DATABASE CONTEXT.
5. If the customer asks for specific information that is not in the LIVE DATABASE CONTEXT (or you cannot verify it from the provided data), politely respond with this exact sentence:
"${fallbackMsg}"
6. Match the customer's language naturally (Bengali or English). Keep responses warm, clear, concise, and helpful.${customGuidance}

LIVE DATABASE CONTEXT:
${JSON.stringify(catalogContext ?? {}, null, 2)}`;
}

function classifyGeminiError(err: unknown): {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
} {
  const errObj =
    err && typeof err === 'object'
      ? (err as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown })
      : {};

  const numericStatus =
    typeof errObj.status === 'number'
      ? errObj.status
      : typeof errObj.statusCode === 'number'
      ? errObj.statusCode
      : 0;
  const rawMessage = typeof errObj.message === 'string' ? errObj.message : String(err || '');
  const upper = rawMessage.toUpperCase();

  if (
    numericStatus === 429 ||
    upper.includes('429') ||
    upper.includes('RESOURCE_EXHAUSTED') ||
    upper.includes('RATE_LIMIT') ||
    upper.includes('QUOTA')
  ) {
    return {
      status: 429,
      code: 'RATE_LIMITED',
      message: AI_ERROR_MESSAGES.RATE_LIMITED,
      retryable: false,
    };
  }

  if (
    upper.includes('API_KEY_INVALID') ||
    upper.includes('API KEY NOT VALID') ||
    upper.includes('API KEY IS MISSING') ||
    (numericStatus === 400 && upper.includes('API_KEY')) ||
    numericStatus === 401
  ) {
    return {
      status: 503,
      code: 'AI_CONFIG_MISSING',
      message: AI_ERROR_MESSAGES.CONFIG_MISSING,
      retryable: false,
    };
  }

  if (numericStatus === 403 || upper.includes('PERMISSION_DENIED')) {
    return {
      status: 503,
      code: 'AI_CONFIG_MISSING',
      message: AI_ERROR_MESSAGES.CONFIG_MISSING,
      retryable: false,
    };
  }

  const retryable =
    numericStatus === 500 ||
    numericStatus === 502 ||
    numericStatus === 503 ||
    numericStatus === 504 ||
    upper.includes('UNAVAILABLE') ||
    upper.includes('INTERNAL') ||
    upper.includes('DEADLINE_EXCEEDED') ||
    upper.includes('TIMEOUT') ||
    upper.includes('ECONNRESET') ||
    upper.includes('FETCH FAILED') ||
    /\b(500|502|503|504)\b/.test(upper);

  return {
    status: 502,
    code: 'AI_UNAVAILABLE',
    message: AI_ERROR_MESSAGES.UNAVAILABLE,
    retryable,
  };
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const apiKey = typeof geminiApiKey === 'string' ? geminiApiKey.trim() : '';
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      ok: false,
      status: 503,
      code: 'AI_CONFIG_MISSING',
      message: AI_ERROR_MESSAGES.CONFIG_MISSING,
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

  const maxAttempts = 2;
  let lastClassified: ReturnType<typeof classifyGeminiError> | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const reply = response.text?.trim();
      if (!reply) {
        return {
          ok: true,
          status: 200,
          reply: fallbackMsg,
        };
      }

      return {
        ok: true,
        status: 200,
        reply,
      };
    } catch (err) {
      const classified = classifyGeminiError(err);
      lastClassified = classified;
      console.error(
        `Gemini API request failed (attempt ${attempt}/${maxAttempts}, code=${classified.code}, status=${classified.status})`
      );
      if (!classified.retryable || attempt >= maxAttempts) {
        return {
          ok: false,
          status: classified.status,
          code: classified.code,
          message: classified.message,
        };
      }
      await waitMs(350);
    }
  }

  return {
    ok: false,
    status: lastClassified?.status ?? 502,
    code: lastClassified?.code ?? 'AI_UNAVAILABLE',
    message: lastClassified?.message ?? AI_ERROR_MESSAGES.UNAVAILABLE,
  };
}
