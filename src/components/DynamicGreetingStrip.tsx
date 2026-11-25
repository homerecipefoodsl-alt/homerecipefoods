import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import { getGreetingItems } from '../lib/bilingual';

export function DynamicGreetingStrip() {
  const { greeting, greetingItems, languageMode } = useStore();
  const [index, setIndex] = useState(0);

  const items = useMemo(() => {
    const baseItems = getGreetingItems(greeting, languageMode).map((item) => ({
      ...item,
      durationMs: 4200,
    }));
    const extraItems = greetingItems.map((g) => ({
      bn: languageMode === 'en' ? '' : g.text_bn,
      en: languageMode === 'bn' ? '' : g.text_en,
      durationMs: g.durationMs || 4200,
    })).filter((item) => item.bn || item.en);
    const merged = [...baseItems, ...extraItems];
    return merged.length > 0 ? merged : [{ bn: 'স্বাগতম Home Recipe Foods-এ', en: 'Welcome to Home Recipe Foods', durationMs: 4200 }];
  }, [greeting, greetingItems, languageMode]);

  useEffect(() => {
    setIndex(0);
  }, [items.length]);

  const current = items[index % items.length];

  useEffect(() => {
    if (items.length <= 1) return;
    const ms = Math.max(2000, current?.durationMs || 4200);
    const timer = window.setTimeout(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, ms);
    return () => window.clearTimeout(timer);
  }, [index, items.length, current?.durationMs]);

  return (
    <div className="border-b border-[#E7E5E4] bg-[#F5F4F0]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-3 py-1 sm:px-6 lg:px-8">
        <div className="relative flex min-h-[18px] flex-1 items-center overflow-hidden sm:min-h-[20px]">
          <AnimatePresence mode="wait">
            <motion.p
              key={`${index}-${current.en}-${current.bn}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="truncate text-[11px] font-medium text-[#1C1917] sm:text-xs"
            >
              <span className="mr-1.5 text-[#DC1F26]" aria-hidden="true">
                ·
              </span>
              {current.en && <span>{current.en}</span>}
              {current.en && current.bn && (
                <span className="mx-2 text-[#A8A29E]" aria-hidden="true">
                  ·
                </span>
              )}
              {current.bn && (
                <span className="font-bn text-[10.5px] font-normal text-[#57534E] sm:text-[11px]">
                  {current.bn}
                </span>
              )}
            </motion.p>
          </AnimatePresence>
        </div>
        <span className="hidden shrink-0 text-[11px] font-medium text-[#57534E] sm:inline">
          Browse · Explore · Visit Showrooms
        </span>
      </div>
    </div>
  );
}
