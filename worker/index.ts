interface CloudflareAssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: CloudflareAssetsBinding;
  GEMINI_API_KEY?: string;
  APP_URL?: string;
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
