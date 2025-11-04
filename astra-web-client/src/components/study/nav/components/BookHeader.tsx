import type { ReactNode } from 'react';

import clsx from 'clsx';

import type { BookTab, TanakhBookEntry } from '../types';

interface BookHeaderProps {
  book: TanakhBookEntry;
  activeTab: BookTab;
  onTabChange: (tab: BookTab) => void;
  loading: boolean;
  error: string | null;
  isMishnah?: boolean;
  hasParasha?: boolean;
  theme: 'dark' | 'light' | 'system';
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  theme: 'dark' | 'light' | 'system';
}

function TabButton({ active, onClick, children, theme }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition',
        active
          ? theme === 'dark'
            ? 'bg-amber-300 text-emerald-900 shadow-lg shadow-amber-300/30'
            : 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'
          : theme === 'dark'
            ? 'bg-white/10 text-white/70 hover:bg-white/15'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
      )}
    >
      {children}
    </button>
  );
}

function BookHeader({
  book,
  activeTab,
  onTabChange,
  loading,
  error,
  isMishnah = false,
  hasParasha = true,
  theme,
}: BookHeaderProps) {
  const transliteratedTitle = book.seed.title_ru ?? book.seed.indexTitle ?? book.work.title;
  const hebrewTitle = book.seed.title_he ?? book.work.primaryTitles?.he;
  const englishTitle = book.seed.indexTitle ?? book.work.title;

  return (
    <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-white/50">
          {isMishnah ? 'Седер' : 'Категория'} · {book.work.categories?.[1] ?? '-'} ·{' '}
          <span className="text-white/80">{englishTitle}</span>
        </p>
        <p className="text-sm uppercase tracking-wide text-amber-300/80">
          {isMishnah ? 'Мишна' : 'Письменная Тора'}
        </p>
        <h3 className="text-2xl font-semibold text-white">{transliteratedTitle}</h3>
        {hebrewTitle && (
          <p className="text-lg text-amber-200/90" dir="rtl">
            {hebrewTitle}
          </p>
        )}
        {englishTitle && englishTitle !== transliteratedTitle && (
          <p className="text-sm text-white/70">{englishTitle}</p>
        )}
        {error && (
          <p className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <TabButton
          active={activeTab === 'chapters'}
          onClick={() => onTabChange('chapters')}
          theme={theme}
        >
          Главы
        </TabButton>
        {!isMishnah && hasParasha && (
          <TabButton
            active={activeTab === 'parasha'}
            onClick={() => onTabChange('parasha')}
            theme={theme}
          >
            Парашот
          </TabButton>
        )}
        {loading && (
          <span className="text-xs uppercase tracking-wide text-white/60">
            Загрузка…
          </span>
        )}
      </div>
    </div>
  );
}

export default BookHeader;
