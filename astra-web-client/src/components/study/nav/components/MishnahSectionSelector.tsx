import clsx from 'clsx';
import { motion, type Variants } from 'framer-motion';

import type { MishnahSection } from '../types';
import { ITEM_VARIANTS } from '../variants';

interface MishnahSectionSelectorProps {
  active: MishnahSection | null;
  onSelect: (section: MishnahSection) => void;
  theme: 'dark' | 'light' | 'system';
  variants?: Variants;
}

const SECTIONS: { id: MishnahSection; label: string }[] = [
  { id: 'Zeraim', label: 'Зераим' },
  { id: 'Moed', label: 'Моэд' },
  { id: 'Nashim', label: 'Нашим' },
  { id: 'Nezikin', label: 'Незикин' },
  { id: 'Kodashim', label: 'Кодашим' },
  { id: 'Taharot', label: 'Тахарот' },
];

function MishnahSectionSelector({
  active,
  onSelect,
  theme,
  variants = ITEM_VARIANTS,
}: MishnahSectionSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {SECTIONS.map((section, index) => (
        <motion.button
          key={section.id}
          type="button"
          custom={index}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={() => onSelect(section.id)}
          className={clsx(
            'rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition',
            active === section.id
              ? theme === 'dark'
                ? 'bg-amber-300 text-emerald-900 shadow-lg shadow-amber-300/30'
                : 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/40'
              : theme === 'dark'
                ? 'bg-white/10 text-white/70 hover:bg-white/20'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
          )}
        >
          {section.label}
        </motion.button>
      ))}
    </div>
  );
}

export default MishnahSectionSelector;
