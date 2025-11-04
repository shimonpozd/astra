import clsx from 'clsx';
import { motion } from 'framer-motion';

import type { TanakhBookEntry } from '../types';
import { ITEM_VARIANTS } from '../variants';

interface BookListProps {
  books: TanakhBookEntry[];
  onSelect: (book: TanakhBookEntry) => void;
  activeTitle?: string;
  theme: 'dark' | 'light' | 'system';
}

function BookList({
  books,
  onSelect,
  activeTitle,
  theme,
}: BookListProps) {
  return (
    <div className="flex flex-col gap-2">
      {books.map((entry, index) => {
        const transliterated = entry.seed.title_ru ?? entry.seed.indexTitle ?? entry.work.title;
        const hebrew = entry.seed.title_he ?? entry.work.primaryTitles?.he;
        const english = entry.seed.indexTitle ?? entry.work.title;

        return (
          <motion.button
            key={entry.work.title}
            type="button"
            custom={index}
            variants={ITEM_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={() => onSelect(entry)}
            className={clsx(
              'flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition',
              theme === 'dark'
                ? 'border-white/10 bg-white/10 hover:bg-white/15'
                : 'border-gray-200 bg-white hover:bg-gray-100',
              activeTitle === entry.work.title
                ? theme === 'dark'
                  ? 'ring-2 ring-amber-300/70'
                  : 'ring-2 ring-emerald-500/60'
                : null,
            )}
          >
            <div className="min-w-0">
              <p
                className={clsx(
                  'truncate text-sm font-semibold',
                  theme === 'dark' ? 'text-white' : 'text-gray-900',
                )}
              >
                {transliterated}
              </p>
              {english && english !== transliterated && (
                <p className={clsx('truncate text-xs', theme === 'dark' ? 'text-white/60' : 'text-gray-500')}>
                  {english}
                </p>
              )}
            </div>
            {hebrew && (
              <span
                className={clsx(
                  'shrink-0 text-sm',
                  theme === 'dark' ? 'text-amber-200/90' : 'text-amber-700',
                )}
                dir="rtl"
              >
                {hebrew}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

export default BookList;
