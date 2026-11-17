import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Headphones,
  Loader2,
  MessageCircle,
  RotateCcw,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { useStore } from '../context/StoreContext';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { generateSessionId } from '../lib/utils';
import type { ChatMessage, ChatSession } from '../types';
import { BrandLogo } from './BrandLogo';

interface LiveChatWidgetProps {
  open: boolean;
  initialMode?: 'select' | 'ai' | 'human';
  onOpen: () => void;
  onClose: () => void;
}

interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isError?: boolean;
  retryPrompt?: string;
}

const SESSION_STORAGE_KEY = 'hrf_live_chat_session_id';
const AI_CLIENT_ID_STORAGE_KEY = 'hrf_ai_client_id';

function getOrCreateAiClientId(): string {
  try {
    const existing = sessionStorage.getItem(AI_CLIENT_ID_STORAGE_KEY);
    if (existing && existing.trim().length >= 8) {
      return existing.trim();
    }
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `hrf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(AI_CLIENT_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `hrf-${Date.now()}`;
  }
}

export function LiveChatWidget({
  open,
  initialMode = 'select',
  onOpen,
  onClose,
}: LiveChatWidgetProps) {
  const { products, categories, occasions, showrooms, aiKnowledge, siteSettings, user } =
    useStore();
  const [mode, setMode] = useState<'select' | 'ai' | 'human'>(initialMode);

  // AI State
  const [aiMessages, setAiMessages] = useState<AiMessage[]>(() => [
    {
      id: 'ai-welcome',
      role: 'assistant',
      text:
        siteSettings.chatWelcomeMessage ||
        'আসসালামু আলাইকুম! আমি Home Recipe Foods-এর AI Assistant। আমাদের পণ্য, দাম, উপাদান, উপলক্ষ বা শোরুম সম্পর্কে যেকোনো প্রশ্ন করতে পারেন।',
    },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Human Support State
  const [sessionId, setSessionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [sessionData, setSessionData] = useState<ChatSession | null>(null);
  const [humanMessages, setHumanMessages] = useState<ChatMessage[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [humanInput, setHumanInput] = useState('');
  const [humanLoading, setHumanLoading] = useState(false);
  const [humanError, setHumanError] = useState<string | null>(null);

  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && initialMode) {
      setMode(initialMode);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [aiMessages, humanMessages, mode, open]);

  useEffect(() => {
    if (!db || !sessionId || sessionId.length < 24) {
      setSessionData(null);
      setHumanMessages([]);
      return;
    }

    const sessionRef = doc(db, 'chat_sessions', sessionId);
    const unsubSession = onSnapshot(
      sessionRef,
      (snap) => {
        if (snap.exists()) {
          setSessionData(snap.data() as ChatSession);
        } else {
          setSessionData(null);
        }
      },
      (err) => {
        console.error('Session listen error:', err);
      }
    );

    const msgQuery = query(
      collection(db, 'chat_sessions', sessionId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsubMsgs = onSnapshot(
      msgQuery,
      (snap) => {
        setHumanMessages(snap.docs.map((d) => d.data() as ChatMessage));
      },
      (err) => {
        console.error('Messages listen error:', err);
      }
    );

    return () => {
      unsubSession();
      unsubMsgs();
    };
  }, [sessionId]);

  const catalogContext = useMemo(() => {
    return {
      brand: siteSettings.brandName || 'Home Recipe Foods',
      tagline:
        siteSettings.tagline || 'খাঁটি স্বাদ, সুন্দর মুহূর্তের বিশ্বস্ত সঙ্গী',
      note: 'Showcase only. No online ordering, cart, or online checkout. Customers visit or call our showrooms to purchase or reserve custom items.',
      aboutInfo: {
        storyBn:
          siteSettings.footerTextBn ||
          'খাঁটি উপাদান, ঘরোয়া যত্ন ও আধুনিক বেকিং শিল্পের সমন্বয়ে তৈরি বাংলাদেশের অন্যতম প্রিমিয়াম ফুড ব্র্যান্ড। আমাদের নিজস্ব পেস্ট্রি ও সুইটস কিচেনে প্রতিদিন সকালে তৈরি হয় তাজা ব্রেড, বেলজিয়ান চকলেট কেক, স্পেশ্যাল জাফরান রসমালাই, শাহী আকদ বক্স এবং গরম ফাস্টফুড।',
        storyEn:
          siteSettings.footerTextEn ||
          'Home Recipe Foods is a premier Bangladeshi artisanal bakery, traditional sweets, custom celebration cake, and luxury Akd gift box brand crafted fresh daily with pure ingredients.',
        highlights: [
          'নিউজিল্যান্ড বাটার, বেলজিয়ান চকলেট ও খাঁটি দুধের ছানা ব্যবহার',
          'প্রতিদিন তাজা প্রস্তুতি ও পরিচ্ছন্ন রান্নাঘর',
          'বিয়ে, আকদ ও জন্মদিনের বিশেষ আয়োজনের জন্য শোরুম প্রতিনিধির পরামর্শ',
        ],
      },
      contactInfo: {
        supportPhone: siteSettings.supportPhone,
        brandEmail: siteSettings.brandEmail || '',
        supportHours:
          siteSettings.chatSupportHours || 'প্রতিদিন সকাল ৮:০০ – রাত ১১:০০',
        whatsappUrl: siteSettings.whatsappUrl || '',
        messengerUrl: siteSettings.messengerUrl || '',
        facebookUrl: siteSettings.facebookUrl || '',
        instagramUrl: siteSettings.instagramUrl || '',
        youtubeUrl: siteSettings.youtubeUrl || '',
        complaintBox:
          'গ্রাহকরা ওয়েবসাইটের Complaint Box (/complaint) পেজ থেকে ১০০% গোপনীয়ভাবে মতামত বা অভিযোগ জানাতে পারেন।',
      },
      supportPhone: siteSettings.supportPhone,
      supportHours: siteSettings.chatSupportHours || 'প্রতিদিন সকাল ৮:০০ – রাত ১১:০০',
      knowledgeBase: aiKnowledge.map((k) => ({
        title: k.title,
        category: k.category,
        question_bn: k.question_bn,
        question_en: k.question_en,
        answer_bn: k.answer_bn,
        answer_en: k.answer_en,
      })),
      categories: categories.map((c) => ({
        slug: c.slug,
        nameBn: c.name_bn || c.name,
        nameEn: c.name_en || c.nameEn,
        descriptionBn: c.description_bn || c.description,
        descriptionEn: c.description_en || c.descriptionEn || '',
      })),
      occasions: occasions.map((o) => ({
        slug: o.slug,
        nameBn: o.name_bn || o.name,
        nameEn: o.name_en || o.nameEn,
        descriptionBn: o.description_bn || o.description,
        descriptionEn: o.description_en || o.descriptionEn || '',
      })),
      showrooms: showrooms.map((s) => ({
        id: s.id,
        nameBn: s.name_bn || s.name,
        nameEn: s.name_en || s.nameEn || s.name,
        isMain: Boolean(s.isMain),
        areaBn: s.area,
        areaEn: s.areaEn || s.area,
        addressBn: s.address_bn || s.address,
        addressEn: s.address_en || s.addressEn || s.address,
        phone: s.phone,
        openingHoursBn: s.openingHours,
        openingHoursEn: s.openingHoursEn || s.openingHours,
      })),
      products: products.map((p) => ({
        slug: p.slug,
        nameBn: p.name_bn || p.name,
        nameEn: p.name_en || p.nameEn,
        categoryBn: p.categoryName,
        categoryEn: p.categoryNameEn || '',
        productType: p.productType,
        priceBDT: p.price,
        ...(p.price_label ? { priceLabel: p.price_label } : {}),
        ...(typeof p.old_price === 'number' ? { oldPriceBDT: p.old_price } : {}),
        ...(p.discount ? { discount: p.discount } : {}),
        priceUnit: p.priceUnit,
        shortDescriptionBn: p.short_description_bn || p.shortDescription,
        shortDescriptionEn: p.short_description_en || p.shortDescriptionEn || '',
        ingredients: p.ingredients,
        sizes: p.sizes,
        weight: p.weight,
        occasions: p.occasions,
        availability: p.availability,
        availableShowrooms: p.showrooms.map((sid) => {
          const sr = showrooms.find((s) => s.id === sid);
          return sr ? `${sr.name} (${sr.nameEn || sr.name})` : sid;
        }),
        importantNotes: p.importantNotes,
      })),
    };
  }, [products, categories, occasions, showrooms, aiKnowledge, siteSettings]);

  const submitAiPrompt = async (promptText: string, appendUserMessage: boolean) => {
    const trimmed = promptText.trim();
    if (!trimmed || aiLoading) return;

    const priorHistory = aiMessages
      .slice(1)
      .filter((m) => !m.isError)
      .map((m) => ({ role: m.role, text: m.text }));

    if (appendUserMessage) {
      const userMsg: AiMessage = { id: `u-${Date.now()}`, role: 'user', text: trimmed };
      setAiMessages((prev) => [...prev, userMsg]);
      setAiInput('');
    }
    setAiLoading(true);

    try {
      const resp = await fetch('/api/chat/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Chat-Client-Id': getOrCreateAiClientId(),
        },
        body: JSON.stringify({
          message: trimmed,
          history: priorHistory,
          catalogContext,
          aiConfig: {
            aiSupportEnabled: siteSettings.aiSupportEnabled !== false,
            aiAssistantName: siteSettings.aiAssistantName,
            aiFallbackMessage: siteSettings.aiFallbackMessage,
            aiCustomInstructions: siteSettings.aiCustomInstructions,
          },
        }),
      });

      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('NON_JSON_RESPONSE');
      }

      const data = (await resp.json()) as {
        reply?: string;
        code?: string;
        error?: string;
        message?: string;
        upstreamStatus?: number;
        retryAfterSec?: number;
      };

      if (!resp.ok) {
        const rawCode = String(data.code || data.error || '').trim().toLowerCase();
        const upstreamStatus =
          typeof data.upstreamStatus === 'number' ? data.upstreamStatus : 0;
        let errorText =
          'Gemini API সার্ভারে সাময়িক ত্রুটি হয়েছে (500)। অনুগ্রহ করে একটু পর আবার চেষ্টা করুন।';

        if (
          rawCode === 'missing_api_key' ||
          rawCode === 'ai_config_missing' ||
          rawCode === 'ai_config_invalid'
        ) {
          errorText = 'AI service configuration is missing.';
        } else if (
          resp.status === 401 ||
          upstreamStatus === 401 ||
          rawCode === 'invalid_api_key' ||
          rawCode === 'ai_key_invalid'
        ) {
          errorText =
            'Gemini API key সঠিক নয় বা মেয়াদোত্তীর্ণ হয়েছে (401)। অনুগ্রহ করে Cloudflare Worker Secret-এ বৈধ GEMINI_API_KEY যাচাই করুন।';
        } else if (
          resp.status === 403 ||
          upstreamStatus === 403 ||
          rawCode === 'permission_denied' ||
          rawCode === 'ai_permission_denied'
        ) {
          errorText =
            'এই Gemini API key-তে অনুরোধ করার অনুমতি নেই (403)। API permission ও restriction যাচাই করুন।';
        } else if (
          resp.status === 404 ||
          upstreamStatus === 404 ||
          rawCode === 'model_not_found' ||
          rawCode === 'ai_model_not_found'
        ) {
          errorText =
            'নির্বাচিত Gemini মডেলটি পাওয়া যায়নি (404)। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।';
        } else if (
          resp.status === 429 ||
          upstreamStatus === 429 ||
          rawCode === 'rate_limit' ||
          rawCode === 'rate_limited'
        ) {
          const serverMsg =
            typeof data.message === 'string' && /[\u0980-\u09FF]/.test(data.message)
              ? data.message.trim()
              : 'অনুরোধের সীমা অতিক্রম করেছে (429 rate_limit)। অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন।';
          const retryNote =
            typeof data.retryAfterSec === 'number' && data.retryAfterSec > 0
              ? ` (${data.retryAfterSec} সেকেন্ড পর চেষ্টা করুন)`
              : '';
          errorText = `${serverMsg}${retryNote}`;
        } else if (resp.status === 504 || upstreamStatus === 504 || rawCode === 'api_timeout') {
          errorText =
            'Gemini API থেকে উত্তর আসতে সময় বেশি লেগেছে (api_timeout)। অনুগ্রহ করে আবার চেষ্টা করুন।';
        } else if (
          resp.status === 500 ||
          upstreamStatus === 500 ||
          rawCode === 'worker_internal_error' ||
          rawCode === 'gemini_api_error' ||
          rawCode === 'ai_unavailable'
        ) {
          errorText =
            'Gemini API বা সার্ভারের অভ্যন্তরীণ ত্রুটি হয়েছে (500)। অনুগ্রহ করে একটু পর আবার চেষ্টা করুন।';
        } else if (typeof data.message === 'string' && data.message.trim() && resp.status === 400) {
          errorText = data.message.trim();
        }

        setAiMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            text: errorText,
            isError: true,
            retryPrompt: trimmed,
          },
        ]);
        return;
      }

      const replyText = typeof data.reply === 'string' ? data.reply.trim() : '';
      if (!replyText) {
        setAiMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            text: 'Gemini API থেকে উত্তর পাওয়া যায়নি (gemini_api_error)। আবার চেষ্টা করুন।',
            isError: true,
            retryPrompt: trimmed,
          },
        ]);
        return;
      }

      setAiMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: replyText,
        },
      ]);
    } catch {
      setAiMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: 'সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে (worker_internal_error)। আবার চেষ্টা করুন।',
          isError: true,
          retryPrompt: trimmed,
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSendAi = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitAiPrompt(aiInput, true);
  };

  const handleRetryAi = async (errorMsgId: string, promptText: string) => {
    if (aiLoading) return;
    setAiMessages((prev) => prev.filter((m) => m.id !== errorMsgId));
    await submitAiPrompt(promptText, false);
  };

  const startHumanSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) {
      setHumanError('ডাটাবেস সংযোগ সক্রিয় নয়। অনুগ্রহ করে হটলাইন নম্বরে কল করুন।');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      setHumanError('অনুগ্রহ করে আপনার নাম ও ফোন নম্বর দিন।');
      return;
    }

    setHumanError(null);
    setHumanLoading(true);
    const newId = generateSessionId();

    try {
      const now = serverTimestamp();
      const firstMsgText = 'আমি একজন প্রতিনিধির সাথে কথা বলতে চাই।';
      const firstMsgId = `msg_${Date.now()}`;

      await setDoc(doc(db, 'chat_sessions', newId), {
        id: newId,
        customerUid: user?.uid || '',
        customerName: customerName.trim().slice(0, 100),
        customerPhone: customerPhone.trim().slice(0, 32),
        status: 'waiting',
        assignedAdminEmail: '',
        assignedAdminName: '',
        lastMessage: firstMsgText,
        createdAt: now,
        updatedAt: now,
      });

      await setDoc(doc(db, 'chat_sessions', newId, 'messages', firstMsgId), {
        id: firstMsgId,
        sessionId: newId,
        customerUid: user?.uid || '',
        senderRole: 'customer',
        senderName: customerName.trim().slice(0, 100),
        text: firstMsgText,
        createdAt: now,
      });

      localStorage.setItem(SESSION_STORAGE_KEY, newId);
      setSessionId(newId);
    } catch (err) {
      setHumanError('চ্যাট শুরু করতে সমস্যা হয়েছে। অনুগ্রহ করে শোরুম নম্বরে কল করুন।');
      try {
        handleFirestoreError(err, OperationType.CREATE, `chat_sessions/${newId}`);
      } catch {
        // Logged cleanly
      }
    } finally {
      setHumanLoading(false);
    }
  };

  const sendHumanMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = humanInput.trim();
    if (!db || !trimmed || !sessionId || !sessionData || sessionData.status === 'closed') return;

    setHumanInput('');
    const msgId = `msg_${Date.now()}`;
    try {
      await setDoc(doc(db, 'chat_sessions', sessionId, 'messages', msgId), {
        id: msgId,
        sessionId,
        customerUid: user?.uid || '',
        senderRole: 'customer',
        senderName: sessionData.customerName,
        text: trimmed.slice(0, 2000),
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'chat_sessions', sessionId), {
        lastMessage: trimmed.slice(0, 500),
        status: sessionData.status,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setHumanError('বার্তা পাঠানো যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।');
      try {
        handleFirestoreError(err, OperationType.CREATE, `chat_sessions/${sessionId}/messages/${msgId}`);
      } catch {
        // Logged
      }
    }
  };

  const resetHumanSession = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionId(null);
    setSessionData(null);
    setHumanMessages([]);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setMode('select');
          onOpen();
        }}
        aria-label="Open Live Chat & AI Support"
        className="fixed bottom-16 right-4 z-40 inline-flex cursor-pointer items-center gap-2.5 rounded-full bg-[#DC1F26] px-4 py-3 text-xs font-semibold text-white shadow-lg transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#B91C1C] focus-visible:outline-2 focus-visible:outline-[#FACC15] sm:bottom-6 sm:right-6 sm:px-5 sm:text-sm"
      >
        <MessageCircle className="h-4 w-4 text-[#FACC15]" />
        <span className="whitespace-nowrap">সাহায্য ও লাইভ চ্যাট</span>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Home Recipe Foods Support Chat"
      className="fixed bottom-16 right-3 left-3 z-50 flex h-[min(74dvh,560px)] max-h-[calc(100dvh-5.5rem)] flex-col overflow-hidden rounded-2xl border border-[#D6D3D1] bg-white shadow-2xl sm:left-auto sm:bottom-6 sm:right-6 sm:w-[400px]"
    >
      {/* Header with Official Logo */}
      <div className="flex items-center justify-between border-b border-[#292524] bg-[#1C1917] px-4 py-2.5 text-white">
        <div className="flex items-center gap-3">
          <BrandLogo variant="chat" />
          <div className="border-l border-[#44403C] pl-3">
            <p className="text-xs font-semibold text-white">Customer Care</p>
            <p className="text-[11px] text-[#A8A29E]">
              {mode === 'ai'
                ? 'AI Assistant · দ্রুত তথ্য'
                : mode === 'human'
                ? siteSettings.supportOnline
                  ? 'প্রতিনিধি অনলাইনে আছেন'
                  : 'বার্তা রেখে যান'
                : 'সহায়তা মাধ্যম বাছাই'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {mode !== 'select' && (
            <button
              type="button"
              onClick={() => setMode('select')}
              className="cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium text-[#FACC15] hover:bg-[#292524]"
            >
              পরিবর্তন
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#D6D3D1] hover:bg-[#292524] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Choice Screen */}
      {mode === 'select' && (
        <div className="flex flex-1 flex-col justify-center gap-4 bg-[#FAFAF8] p-5">
          <div className="text-center">
            <p className="text-sm font-semibold text-[#1C1917]">
              কিভাবে সাহায্য করতে পারি?
            </p>
            <p className="mt-1 text-xs text-[#57534E]">
              পণ্য, দাম, উপাদান বা শোরুম সম্পর্কে জানতে নিচের যেকোনো একটি বেছে নিন
            </p>
          </div>

          <button
            type="button"
            onClick={() => setMode('ai')}
            className="flex cursor-pointer items-start gap-3.5 rounded-xl border border-[#E7E5E4] bg-white p-4 text-left transition-all hover:border-[#DC1F26] hover:shadow-sm"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#DC1F26]">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#1C1917]">AI Assistant</p>
              <p className="mt-0.5 text-xs text-[#57534E]">দ্রুত তথ্য জানতে</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('human')}
            className="flex cursor-pointer items-start gap-3.5 rounded-xl border border-[#E7E5E4] bg-white p-4 text-left transition-all hover:border-[#DC1F26] hover:shadow-sm"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1C1917] text-[#FACC15]">
              <Headphones className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#1C1917]">Customer Support</p>
              <p className="mt-0.5 text-xs text-[#57534E]">সরাসরি প্রতিনিধির সাথে কথা বলতে</p>
            </div>
          </button>
        </div>
      )}

      {/* AI Assistant Mode */}
      {mode === 'ai' && (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto bg-[#FAFAF8] p-4">
            {aiMessages.map((msg) => (
              <div
                key={msg.id}
                role={msg.isError ? 'alert' : undefined}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap sm:text-sm ${
                    msg.role === 'user'
                      ? 'bg-[#1C1917] text-white'
                      : msg.isError
                      ? 'flex items-start gap-2 border border-red-200 bg-red-50 text-red-800'
                      : 'border border-[#E7E5E4] bg-white text-[#1C1917]'
                  }`}
                >
                  {msg.isError && (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
                  )}
                  <div className="space-y-1.5">
                    <span>{msg.text}</span>
                    {msg.isError && msg.retryPrompt && (
                      <div>
                        <button
                          type="button"
                          onClick={() => handleRetryAi(msg.id, msg.retryPrompt!)}
                          disabled={aiLoading}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#B91C1C] transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>আবার চেষ্টা করুন</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex items-start">
                <div className="inline-flex items-center gap-2 rounded-2xl border border-[#E7E5E4] bg-white px-3.5 py-2 text-xs text-[#57534E]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#DC1F26]" />
                  <span>তথ্য যাচাই করা হচ্ছে...</span>
                </div>
              </div>
            )}
            <div ref={scrollEndRef} />
          </div>

          <div className="border-t border-[#E7E5E4] bg-white px-3 py-2">
            <button
              type="button"
              onClick={() => setMode('human')}
              className="mb-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#FEF2F2] py-1.5 text-[11px] font-semibold text-[#B91C1C] hover:bg-[#FEE2E2]"
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>সরাসরি প্রতিনিধির সাথে কথা বলুন</span>
            </button>
            <form onSubmit={handleSendAi} className="flex items-center gap-2">
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                disabled={aiLoading}
                placeholder="পণ্য, দাম বা শোরুম সম্পর্কে লিখুন..."
                className="flex-1 rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs text-[#1C1917] focus:border-[#DC1F26] focus:outline-none disabled:opacity-70 sm:text-sm"
              />
              <button
                type="submit"
                disabled={aiLoading || !aiInput.trim()}
                aria-label="Send message"
                className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[#DC1F26] text-white transition-colors hover:bg-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {aiLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </form>
          </div>
        </>
      )}

      {/* Human Support Mode */}
      {mode === 'human' && (
        <>
          {!sessionId || !sessionData ? (
            <form
              onSubmit={startHumanSession}
              className="flex flex-1 flex-col justify-center gap-3.5 bg-[#FAFAF8] p-5"
            >
              <div>
                <h4 className="text-sm font-bold text-[#1C1917]">
                  প্রতিনিধির সাথে সরাসরি চ্যাট শুরু করুন
                </h4>
                <p className="mt-1 text-xs text-[#57534E]">
                  আপনার নাম ও ফোন নম্বর দিলে আমাদের প্রতিনিধি দ্রুত যুক্ত হবেন।
                </p>
              </div>

              {humanError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  {humanError}
                </p>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-[#44403C]">
                  আপনার নাম
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="যেমন: তানভীর আহমেদ"
                  className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#44403C]">
                  ফোন নম্বর
                </label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={humanLoading}
                className="mt-1 w-full cursor-pointer rounded-lg bg-[#DC1F26] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-50"
              >
                {humanLoading ? 'সংযোগ করা হচ্ছে...' : 'প্রতিনিধির সাথে কথা বলুন'}
              </button>
            </form>
          ) : (
            <>
              <div className="border-b border-[#E7E5E4] bg-[#FEF9C3] px-4 py-2 text-xs font-medium text-[#854D0E]">
                {sessionData.status === 'waiting' &&
                  'একজন প্রতিনিধি আপনার সাথে সংযুক্ত হওয়ার চেষ্টা করছেন।'}
                {sessionData.status === 'active' &&
                  `${sessionData.assignedAdminName || 'আমাদের প্রতিনিধি'} এখন আপনার সাথে যুক্ত আছেন।`}
                {sessionData.status === 'closed' &&
                  'এই কথোপকথনটি সমাপ্ত হয়েছে।'}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-[#FAFAF8] p-4">
                {humanMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.senderRole === 'customer' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <span className="mb-0.5 text-[10px] text-[#78716C]">
                      {msg.senderRole === 'customer'
                        ? 'আপনি'
                        : 'Home Recipe Representative'}
                    </span>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed sm:text-sm ${
                        msg.senderRole === 'customer'
                          ? 'bg-[#1C1917] text-white'
                          : 'border border-[#E7E5E4] bg-white text-[#1C1917]'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={scrollEndRef} />
              </div>

              {sessionData.status === 'closed' ? (
                <div className="border-t border-[#E7E5E4] bg-white p-3">
                  <button
                    type="button"
                    onClick={resetHumanSession}
                    className="w-full cursor-pointer rounded-lg bg-[#1C1917] py-2 text-xs font-semibold text-white hover:bg-[#DC1F26]"
                  >
                    নতুন চ্যাট শুরু করুন
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={sendHumanMessage}
                  className="flex items-center gap-2 border-t border-[#E7E5E4] bg-white p-3"
                >
                  <input
                    type="text"
                    value={humanInput}
                    onChange={(e) => setHumanInput(e.target.value)}
                    placeholder="আপনার বার্তা লিখুন..."
                    className="flex-1 rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs text-[#1C1917] focus:border-[#DC1F26] focus:outline-none sm:text-sm"
                  />
                  <button
                    type="submit"
                    disabled={!humanInput.trim()}
                    aria-label="Send message"
                    className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[#DC1F26] text-white hover:bg-[#B91C1C] disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
