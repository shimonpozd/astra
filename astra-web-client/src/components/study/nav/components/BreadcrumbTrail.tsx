import clsx from 'clsx';
import { motion } from 'framer-motion';

import { ITEM_VARIANTS } from '../variants';

interface BreadcrumbTrailProps {
  items: string[];
  theme: 'dark' | 'light' | 'system';
  variants: typeof ITEM_VARIANTS;
}

function BreadcrumbTrail({ items, theme, variants }: BreadcrumbTrailProps) {
  if (!items.length) {
    return (
      <div
        className={clsx(
          'rounded-full border px-4 py-1.5 text-xs uppercase tracking-wide',
          theme === 'dark' ? 'border-white/10 text-white/60' : 'border-gray-200 text-gray-500',
        )}
      >
        выберите раздел
      </div>
    );
  }

  return (
    <motion.nav
      className={clsx(
        'max-w-xl overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-4 py-1.5 text-xs uppercase tracking-wide',
        theme === 'dark' ? 'border-white/10 text-white/70' : 'border-gray-200 text-gray-600',
      )}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {items.join(' · ')}
    </motion.nav>
  );
}

export default BreadcrumbTrail;
