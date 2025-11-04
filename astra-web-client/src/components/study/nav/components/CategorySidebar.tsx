import clsx from 'clsx';
import { motion } from 'framer-motion';

import type { CorpusCategory, TanakhSection } from '../types';
import { ITEM_VARIANTS } from '../variants';

interface CategorySidebarProps {
  categories: CorpusCategory[];
  activeCorpus: string | null;
  onSelectCorpus: (
    corpusId: string,
    options?: { tanakhSection?: TanakhSection },
  ) => void;
  activeTanakhSection: TanakhSection | null;
  loadingExtra: string | null;
  theme: 'dark' | 'light' | 'system';
}

function CategorySidebar({
  categories,
  activeCorpus,
  activeTanakhSection,
  onSelectCorpus,
  loadingExtra,
  theme,
}: CategorySidebarProps) {
  return (
    <aside
      className={clsx(
        'flex max-h-full min-h-0 w-72 shrink-0 flex-col gap-3 overflow-y-auto rounded-3xl border p-4 pr-3',
        theme === 'dark'
          ? 'border-white/10 bg-white/10 shadow-lg shadow-black/30'
          : 'border-gray-200 bg-white/80 shadow-lg shadow-gray-200/40',
      )}
    >
      <h2
        className={clsx(
          'text-xs font-semibold uppercase tracking-wide',
          theme === 'dark' ? 'text-white/70' : 'text-gray-600',
        )}
      >
        Категории
      </h2>

      <div className="flex flex-col gap-3 pr-1">
        {categories.map((category, categoryIndex) => (
          <div key={category.id}>
            <button
              type="button"
              className={clsx(
                'flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition',
                theme === 'dark'
                  ? 'bg-white/5 text-white hover:bg-white/10'
                  : 'bg-white text-gray-800 hover:bg-gray-100',
                category.defaultExpanded ? 'font-semibold' : 'font-medium',
              )}
              onClick={() => {
                if (category.corpora.length === 1 && !category.corpora[0].children) {
                  onSelectCorpus(category.corpora[0].id);
                }
              }}
            >
              <span className="text-lg">{category.icon}</span>
              <span className="truncate">{category.label}</span>
            </button>

            <div className="mt-2 flex flex-col gap-2 pl-5">
              {category.corpora.map((corpus, corpusIndex) => {
                const hasChildren = Boolean(corpus.children?.length);
                const isLoading = loadingExtra === corpus.id;

                if (hasChildren) {
                  return (
                    <div key={`${corpus.id}-group`} className="flex flex-col gap-1">
                      <p
                        className={clsx(
                          'px-2 text-[11px] font-semibold uppercase tracking-wide',
                          theme === 'dark' ? 'text-white/40' : 'text-gray-500',
                        )}
                      >
                        {corpus.label}
                      </p>
                      <div className="flex flex-col gap-1">
                        {corpus.children?.map((child, childIndex) => {
                          const section = child.section;
                          const isChildActive =
                            activeCorpus === corpus.id &&
                            !!section &&
                            activeTanakhSection === section;

                          return (
                            <motion.button
                              key={child.id}
                              type="button"
                              custom={categoryIndex * 12 + corpusIndex * 4 + childIndex}
                              variants={ITEM_VARIANTS}
                              initial="initial"
                              animate="animate"
                              exit="exit"
                              className={clsx(
                                'flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition',
                                theme === 'dark'
                                  ? 'border-white/10 text-white/70 hover:border-white/20 hover:text-white'
                                  : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:text-gray-900',
                                isChildActive
                                  ? theme === 'dark'
                                    ? 'border-amber-300/60 text-amber-200'
                                    : 'border-emerald-500/60 text-emerald-700'
                                  : null,
                              )}
                              onClick={() =>
                                onSelectCorpus(corpus.id, section ? { tanakhSection: section } : undefined)
                              }
                            >
                              <span className="truncate">{child.label}</span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                const isActive = activeCorpus === corpus.id;

                return (
                  <motion.button
                    key={corpus.id}
                    type="button"
                    custom={categoryIndex * 8 + corpusIndex}
                    variants={ITEM_VARIANTS}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className={clsx(
                      'flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition',
                      theme === 'dark'
                        ? 'border-white/10 text-white/70 hover:border-white/20 hover:text-white'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:text-gray-900',
                      isActive
                        ? theme === 'dark'
                          ? 'border-amber-300/60 text-amber-200'
                          : 'border-emerald-500/60 text-emerald-700'
                        : null,
                    )}
                    onClick={() => onSelectCorpus(corpus.id)}
                  >
                    <span className="truncate">{corpus.label}</span>
                    {isLoading && (
                      <span className="text-[10px] uppercase tracking-wide opacity-70">Загрузка…</span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default CategorySidebar;
