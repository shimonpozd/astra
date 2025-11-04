import clsx from 'clsx';
import { motion, type Variants } from 'framer-motion';

import type { CurrentLocation } from '../types';
import { getTanakhSectionLabel, resolveTanakhSection } from '../utils/tanakh';

interface CurrentLocationPanelProps {
  location: CurrentLocation | null;
  nav?: { prev?: string; next?: string };
  onNavigate: (ref: string) => void;
  theme: 'dark' | 'light' | 'system';
  variants: Variants;
}

const buttonClasses = 'rounded-full border px-3 py-1 text-xs font-semibold transition';

function CurrentLocationPanel({
  location,
  nav,
  onNavigate,
  theme,
  variants,
}: CurrentLocationPanelProps) {
  if (!location) {
    return null;
  }

  let heading = '';
  let subtitle = '';
  let detail = '';

  if (location.type === 'tanakh') {
    const section = resolveTanakhSection(location.book);
    heading = location.book.seed.title_ru ?? location.book.seed.indexTitle ?? location.book.work.title;
    subtitle = `${getTanakhSectionLabel(section)} · Письменная Тора`;
    detail = `Глава ${location.chapter}${location.verse ? `, стих ${location.verse}` : ''}`;
  } else {
    const editionLabel = location.edition === 'Bavli' ? 'Бавли' : 'Иерушалми';
    heading = location.tractate;
    subtitle = `Талмуд · ${editionLabel}`;
    detail = `Лист ${location.daf}`;
  }

  return (
    <motion.section
      key="current-location"
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={clsx(
        'rounded-2xl border p-3 shadow-md backdrop-blur-lg',
        theme === 'dark'
          ? 'border-emerald-400/40 bg-emerald-600/15 text-white'
          : 'border-emerald-200 bg-emerald-50 text-emerald-900',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className={clsx(
              'text-[10px] uppercase tracking-wide',
              theme === 'dark' ? 'text-emerald-100/80' : 'text-emerald-600',
            )}
          >
            Текущая позиция
          </p>
          <h3 className="truncate text-base font-semibold">{heading}</h3>
          <p className={clsx('truncate text-xs', theme === 'dark' ? 'text-white/70' : 'text-gray-600')}>
            {subtitle}
          </p>
          <p className={clsx('text-[11px]', theme === 'dark' ? 'text-white/50' : 'text-gray-500')}>
            {detail}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => nav?.prev && onNavigate(nav.prev)}
            disabled={!nav?.prev}
            className={clsx(
              buttonClasses,
              nav?.prev
                ? theme === 'dark'
                  ? 'border-white/20 bg-white/10 text-white hover:bg-white/20'
                  : 'border-emerald-300 bg-emerald-600/10 text-emerald-700 hover:bg-emerald-500/20'
                : theme === 'dark'
                  ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/40'
                  : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400',
            )}
          >
            ← предыдущая
          </button>
          <button
            type="button"
            onClick={() => nav?.next && onNavigate(nav.next)}
            disabled={!nav?.next}
            className={clsx(
              buttonClasses,
              nav?.next
                ? theme === 'dark'
                  ? 'border-white bg-white text-emerald-700 hover:bg-emerald-50/80'
                  : 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-500/90'
                : theme === 'dark'
                  ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/40'
                  : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400',
            )}
          >
            следующая →
          </button>
        </div>
      </div>
    </motion.section>
  );
}

export default CurrentLocationPanel;
