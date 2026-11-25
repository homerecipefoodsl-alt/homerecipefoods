import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BrandLogo } from './BrandLogo';

interface LoadingScreenProps {
  ready: boolean;
}

export function LoadingScreen({ ready }: LoadingScreenProps) {
  const [minElapsed, setMinElapsed] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinElapsed(true), 550);
    // Hard safety cap so slow networks never stall on loading screen
    const maxTimer = window.setTimeout(() => setVisible(false), 1400);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(maxTimer);
    };
  }, []);

  useEffect(() => {
    if (ready && minElapsed) {
      setVisible(false);
    }
  }, [ready, minElapsed]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          aria-label="Loading Home Recipe Foods"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#FAFAF8] px-6 text-center"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center"
          >
            <BrandLogo variant="hero" />
            <div className="mt-6 h-0.5 w-36 overflow-hidden rounded-full bg-[#E7E5E4]">
              <div className="animate-loading-sweep h-full w-16 rounded-full bg-[#DC1F26]" />
            </div>
            <p className="font-display mt-4 text-lg font-medium tracking-wide text-[#1C1917] sm:text-xl">
              Pure Ingredients. Craftsmanship. Everyday Freshness.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
