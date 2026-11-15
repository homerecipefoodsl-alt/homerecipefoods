import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Headphones,
  MessageCircle,
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
}

const SESSION_STORAGE_KEY = 'hrf_live_chat_session_id';

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
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      note: 'Showcase only. No online ordering or delivery checkout. Customers visit or call showrooms.',
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
        nameBn: c.name_bn || c.name,
        nameEn: c.name_en || c.nameEn,
        descriptionBn: c.description_bn || c.description,
        descriptionEn: c.description_en || c.descriptionEn || '',
      })),
      occasions: occasions.map((o) => ({
        nameBn: o.name_bn || o.name,
        nameEn: o.name_en || o.nameEn,
        descriptionBn: o.description_bn || o.description,
        descriptionEn: o.description_en || o.descriptionEn || '',
      })),
      showrooms: showrooms.map((s) => ({
        id: s.id,
        nameBn: s.name_bn || s.name,
        nameEn: s.name_en || s.nameEn || s.name,
        areaBn: s.area,
        areaEn: s.areaEn || s.area,
        addressBn: s.address_bn || s.address,
        addressEn: s.address_en || s.addressEn || s.address,
        phone: s.phone,
        openingHoursBn: s.openingHours,
        openingHoursEn: s.openingHoursEn || s.openingHours,
      })),
      products: products.map((p) => ({
        nameBn: p.name_bn || p.name,
        nameEn: p.name_en || p.nameEn,
        categoryBn: p.categoryName,
        categoryEn: p.categoryNameEn || '',
        priceBDT: p.price,
        priceUnit: p.priceUnit,
        shortDescriptionBn: p.short_description_bn || p.shortDescription,
        shortDescriptionEn: p.short_description_en || p.shortDescriptionEn || '',
        ingredients: p.ingredients,
        sizes: p.sizes,
        weight: p.weight,
        occasions: p.occasions,
        availability: p.availability,
        availableShowrooms: p.showrooms
          .map((sid) => {
            const sr = showrooms.find((s) => s.id === sid);
            return sr ? `${sr.name} (${sr.nameEn || sr.name})` : sid;
          }),
        importantNotes: p.importantNotes,
      })),
    };
  }, [products, categories, occasions, showrooms, aiKnowledge, siteSettings]);

  const handleSendAi = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = aiInput.trim();
    if (!trimmed || aiLoading) return;

    const userMsg: AiMessage = { id: `u-${Date.now()}`, role: 'user', text: trimmed };
    const nextHistory = [...aiMessages, userMsg];
    setAiMessages(nextHistory);
    setAiInput('');
    setAiLoading(true);

    try {
      const resp = await fetch('/api/chat/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: nextHistory.slice(1).map((m) => ({ role: m.role, text: m.text })),
          catalogContext,
          aiConfig: {
            aiSupportEnabled: siteSettings.aiSupportEnabled !== false,
            aiAssistantName: siteSettings.aiAssistantName,
            aiFallbackMessage: siteSettings.aiFallbackMessage,
            aiCustomInstructions: siteSettings.aiCustomInstructions,
          },
        }),
      });
      const data = (await resp.json()) as { reply?: string };
      setAiMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text:
            data.reply ||
            siteSettings.aiFallbackMessage ||
            'এই তথ্যটি নিশ্চিতভাবে জানার জন্য আমাদের একজন প্রতিনিধি সাথে যোগাযোগ করুন।',
        },
      ]);
    } catch {
      setAiMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: 'দুঃখিত, এই মুহূর্তে সংযোগে সমস্যা হচ্ছে। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন অথবা সরাসরি প্রতিনিধির সাথে কথা বলুন।',
        },
      ]);
    } finally {
      setAiLoading(false);
    }
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
      className="fixed bottom-16 right-3 left-3 z-50 flex h-[72vh] max-h-[560px] flex-col overflow-hidden rounded-2xl border border-[#D6D3D1] bg-white shadow-2xl sm:left-auto sm:bottom-6 sm:right-6 sm:w-[400px]"
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
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed sm:text-sm ${
                    msg.role === 'user'
                      ? 'bg-[#1C1917] text-white'
                      : 'border border-[#E7E5E4] bg-white text-[#1C1917]'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex items-start">
                <div className="rounded-2xl border border-[#E7E5E4] bg-white px-3.5 py-2 text-xs text-[#78716C]">
                  তথ্য যাচাই করা হচ্ছে...
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
                placeholder="পণ্য, দাম বা শোরুম সম্পর্কে লিখুন..."
                className="flex-1 rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs text-[#1C1917] focus:border-[#DC1F26] focus:outline-none sm:text-sm"
              />
              <button
                type="submit"
                disabled={aiLoading || !aiInput.trim()}
                aria-label="Send message"
                className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[#DC1F26] text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
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
