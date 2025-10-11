'use client'

import { AnimatePresence, motion } from 'motion/react';
import { usePathname } from 'next/navigation';

export default function Template({ children }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode='wait'>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, x: 15 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 15 }}
        transition={{ ease: 'easeInOut', duration: 0.5 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>      
  );
}