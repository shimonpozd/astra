import clsx from 'clsx';
import { motion, type Variants } from 'framer-motion';

import type { TanakhBookEntry, TanakhSection, TanakhCollections } from '../types';
import BookList from './BookList';
import { getTanakhSectionLabel } from '../utils/tanakh';

export interface TanakhSectionPanelProps {
  collections: TanakhCollections | null;
  section: TanakhSection | null;
  onSelectBook: (book: TanakhBookEntry) => void;
  activeBookTitle?: string;
  loadingSeed: boolean;
  theme: 'dark' | 'light' | 'system';
  variants: Variants;
}

const TORAH_BOOKS = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'] as const;

const NEVIIM_FORMER = [
  'Joshua',
  'Judges',
  'I Samuel',
  'II Samuel',
  'I Kings',
  'II Kings',
] as const;

const NEVIIM_LATTER_MAJOR = ['Isaiah', 'Jeremiah', 'Ezekiel'] as const;

const NEVIIM_LATTER_TREI_ASAR = [
  'Hosea',
  'Joel',
  'Amos',
  'Obadiah',
  'Jonah',
  'Micah',
  'Nahum',
  'Habakkuk',
  'Zephaniah',
  'Haggai',
  'Zechariah',
  'Malachi',
] as const;

const KETUVIM_POETRY = ['Psalms', 'Proverbs', 'Job'] as const;

const KETUVIM_MEGILLOT = [
  'Song of Songs',
  'Ruth',
  'Lamentations',
  'Ecclesiastes',
  'Esther',
] as const;

const KETUVIM_HISTORICAL = [
  'Daniel',
  'Ezra',
  'Nehemiah',
  'I Chronicles',
  'II Chronicles',
] as const;

interface DisplayGroup {
  id: string;
  label: string;
  description?: string;
  books: TanakhBookEntry[];
  children?: DisplayGroup[];
}

function buildEntryIndex(collections: TanakhCollections | null): Map<string, TanakhBookEntry> {
  const index = new Map<string, TanakhBookEntry>();
  if (!collections) {
    return index;
  }

  const allEntries: TanakhBookEntry[] = [
    ...(collections.torah ?? []),
    ...(collections.neviim ?? []),
    ...(collections.ketuvim ?? []),
  ];

  allEntries.forEach((entry) => {
    index.set(entry.work.title, entry);
  });

  return index;
}

function selectBooks(
  index: Map<string, TanakhBookEntry>,
  titles: readonly string[],
): TanakhBookEntry[] {
  return titles
    .map((title) => index.get(title))
    .filter((entry): entry is TanakhBookEntry => Boolean(entry));
}

function buildGroups(
  section: TanakhSection,
  collections: TanakhCollections | null,
): DisplayGroup[] {
  const index = buildEntryIndex(collections);

  if (section === 'Torah') {
    return [
      {
        id: 'torah-chumash',
        label: 'Пятикнижие',
        books: selectBooks(index, TORAH_BOOKS),
      },
    ];
  }

  if (section === 'Neviim') {
    const majorLaterProphets = selectBooks(index, NEVIIM_LATTER_MAJOR);
    const treiAsar = selectBooks(index, NEVIIM_LATTER_TREI_ASAR);

    return [
      {
        id: 'neviim-former',
        label: 'Ранние пророки',
        books: selectBooks(index, NEVIIM_FORMER),
      },
      {
        id: 'neviim-latter',
        label: 'Поздние пророки',
        books: majorLaterProphets,
        children: treiAsar.length
          ? [
              {
                id: 'neviim-twelve',
                label: 'Трей Асар — Двенадцать пророков',
                books: treiAsar,
              },
            ]
          : undefined,
      },
    ];
  }

  const poetry = selectBooks(index, KETUVIM_POETRY);
  const megillot = selectBooks(index, KETUVIM_MEGILLOT);
  const historical = selectBooks(index, KETUVIM_HISTORICAL);

  return [
    {
      id: 'ketuvim-poetry',
      label: 'Поэтические книги',
      books: poetry,
    },
    {
      id: 'ketuvim-megillot',
      label: 'Пять свитков',
      books: megillot,
    },
    {
      id: 'ketuvim-historical',
      label: 'Исторические книги',
      books: historical,
    },
  ];
}

function shouldRenderGroup(group: DisplayGroup): boolean {
  const hasBooks = group.books.length > 0;
  const hasNested = (group.children ?? []).some(shouldRenderGroup);
  return hasBooks || hasNested;
}

function TanakhSectionPanel({
  collections,
  section,
  onSelectBook,
  activeBookTitle,
  loadingSeed,
  theme,
  variants,
}: TanakhSectionPanelProps) {
  const currentSection = section ?? 'Torah';
  const headerLabel = getTanakhSectionLabel(currentSection);
  const groups = buildGroups(currentSection, collections).filter(shouldRenderGroup);

  const renderChildGroup = (group: DisplayGroup) => {
    if (!shouldRenderGroup(group)) {
      return null;
    }

    return (
      <div
        key={group.id}
        className={clsx(
          'mt-4 rounded-xl border px-3 py-3',
          theme === 'dark'
            ? 'border-white/10 bg-white/5 text-white/90'
            : 'border-gray-200 bg-gray-50 text-gray-900',
        )}
      >
        <h5
          className={clsx(
            'mb-2 text-xs font-semibold uppercase tracking-wide',
            theme === 'dark' ? 'text-amber-200/80' : 'text-emerald-700',
          )}
        >
          {group.label}
        </h5>
        {group.description && (
          <p className={clsx('mb-2 text-xs', theme === 'dark' ? 'text-white/60' : 'text-gray-600')}>
            {group.description}
          </p>
        )}
        {group.books.length > 0 && (
          <BookList
            books={group.books}
            onSelect={onSelectBook}
            activeTitle={activeBookTitle}
            theme={theme}
          />
        )}
      </div>
    );
  };

  return (
    <motion.section
      key="tanakh"
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={clsx(
        'rounded-2xl border p-4 shadow-lg backdrop-blur-lg',
        theme === 'dark'
          ? 'border-white/10 bg-white/10 shadow-black/20'
          : 'border-gray-200 bg-white/20 shadow-gray-200/20',
      )}
    >
      <h3
        className={clsx(
          'mb-3 text-sm font-semibold uppercase tracking-wide',
          theme === 'dark' ? 'text-amber-200/90' : 'text-amber-700',
        )}
      >
        Письменная Тора · Танах
      </h3>

      {collections && groups.length ? (
        <>
          <div
            className={clsx(
              'rounded-xl border px-3 py-2 text-xs uppercase tracking-wide',
              theme === 'dark'
                ? 'border-white/10 bg-white/5 text-white/70'
                : 'border-gray-200 bg-white/60 text-gray-700',
            )}
          >
            <span>{`Раздел: ${headerLabel}`}</span>
          </div>

          <div className="mt-4 space-y-4">
            {groups.map((group) => {
              if (!shouldRenderGroup(group)) {
                return null;
              }

              return (
                <div
                  key={group.id}
                  className={clsx(
                    'rounded-2xl border px-4 py-3',
                    theme === 'dark'
                      ? 'border-white/10 bg-white/5 text-white'
                      : 'border-gray-200 bg-white text-gray-900',
                  )}
                >
                  <div className="mb-3">
                    <h4
                      className={clsx(
                        'text-sm font-semibold uppercase tracking-wide',
                        theme === 'dark' ? 'text-amber-200/80' : 'text-emerald-700',
                      )}
                    >
                      {group.label}
                    </h4>
                    {group.description && (
                      <p
                        className={clsx(
                          'mt-1 text-xs',
                          theme === 'dark' ? 'text-white/70' : 'text-gray-600',
                        )}
                      >
                        {group.description}
                      </p>
                    )}
                  </div>

                  {group.books.length > 0 && (
                    <BookList
                      books={group.books}
                      onSelect={onSelectBook}
                      activeTitle={activeBookTitle}
                      theme={theme}
                    />
                  )}

                  {group.children?.map(renderChildGroup)}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div
          className={clsx(
            'mt-4 flex items-center justify-center rounded-xl border px-4 py-6 text-sm text-center',
            theme === 'dark'
              ? 'border-white/10 bg-white/5 text-white/70'
              : 'border-gray-300 bg-white/30 text-gray-700',
          )}
        >
          {loadingSeed
            ? 'Загружаем структуру Танаха…'
            : 'Не удалось получить структуру Танаха.'}
        </div>
      )}
    </motion.section>
  );
}

export default TanakhSectionPanel;
