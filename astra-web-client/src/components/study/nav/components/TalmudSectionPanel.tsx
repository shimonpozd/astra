import { useMemo } from 'react';

import clsx from 'clsx';
import { motion, type Variants } from 'framer-motion';

import type { CatalogWork } from '../../../../lib/sefariaCatalog';
import type { TalmudEdition, TalmudSeder } from '../types';
import { TALMUD_SEDER_LABELS } from '../constants';
import TalmudEditionSelector from './TalmudEditionSelector';
import TractateList from './TractateList';
import TalmudDafGrid from './TalmudDafGrid';

interface TalmudSectionPanelProps {
  edition: TalmudEdition;
  sedarim: Partial<Record<TalmudSeder, CatalogWork[]>>;
  sederOrder: TalmudSeder[];
  selectedSeder: TalmudSeder | null;
  selectedTractate: CatalogWork | null;
  onEditionChange: (edition: TalmudEdition) => void;
  onSelectSeder: (seder: TalmudSeder) => void;
  onSelectTractate: (tractate: CatalogWork) => void;
  onSelectDaf: (dafLabel: string) => void;
  theme: 'dark' | 'light' | 'system';
  variants: Variants;
}


function TalmudSectionPanel({
  edition,
  sedarim,
  sederOrder,
  selectedSeder,
  selectedTractate,
  onEditionChange,
  onSelectSeder,
  onSelectTractate,
  onSelectDaf,
  theme,
  variants,
}: TalmudSectionPanelProps) {
  const currentSeder = useMemo(() => {
    if (selectedSeder && sedarim[selectedSeder]?.length) {
      return selectedSeder;
    }
    return sederOrder[0] ?? null;
  }, [selectedSeder, sedarim, sederOrder]);

  const tractates = useMemo(() => {
    return currentSeder ? sedarim[currentSeder] ?? [] : [];
  }, [sedarim, currentSeder]);

  const activeTractate = useMemo(() => {
    if (!tractates.length) {
      return null;
    }
    if (selectedTractate) {
      const match = tractates.find((work) =>
        selectedTractate.path && work.path
          ? selectedTractate.path === work.path
          : selectedTractate.title === work.title,
      );
      if (match) {
        return match;
      }
    }
    return tractates[0];
  }, [tractates, selectedTractate]);

  return (
    <motion.section
      key="talmud"
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
      <div className="space-y-4">
        <header className="space-y-3">
          <h3
            className={clsx(
              'text-sm font-semibold uppercase tracking-wide',
              theme === 'dark' ? 'text-amber-200/90' : 'text-amber-700',
            )}
          >
            Талмуд
          </h3>
          <TalmudEditionSelector value={edition} onChange={onEditionChange} theme={theme} />
        </header>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {sederOrder.map((seder) => {
              const isActive = currentSeder === seder;
              const hasTractates = Boolean(sedarim[seder]?.length);
              return (
                <button
                  key={seder}
                  type="button"
                  disabled={!hasTractates}
                  onClick={() => onSelectSeder(seder)}
                  className={clsx(
                    'rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition',
                    hasTractates
                      ? theme === 'dark'
                        ? 'bg-white/10 text-white/80 hover:bg-white/20'
                        : 'bg-white text-gray-700 hover:bg-emerald-50'
                      : theme === 'dark'
                        ? 'bg-white/5 text-white/30 cursor-not-allowed'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed',
                    isActive
                      ? theme === 'dark'
                        ? 'ring-2 ring-amber-300/70 text-emerald-100'
                        : 'ring-2 ring-emerald-500/60 text-emerald-700'
                      : null,
                  )}
                >
                  {TALMUD_SEDER_LABELS[seder]}
                </button>
              );
            })}
          </div>

          {currentSeder ? (
            <p
              className={clsx(
                'text-xs uppercase tracking-wide',
                theme === 'dark' ? 'text-white/60' : 'text-gray-600',
              )}
            >
              Седер: {TALMUD_SEDER_LABELS[currentSeder]}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr),minmax(0,1.2fr)]">
          {tractates.length ? (
            <TractateList
              tractates={tractates}
              activeTitle={activeTractate?.title}
              onSelect={onSelectTractate}
              theme={theme}
            />
          ) : (
            <div
              className={clsx(
                'flex min-h-[200px] items-center justify-center rounded-2xl border px-4 py-6 text-sm text-center',
                theme === 'dark'
                  ? 'border-white/10 bg-white/5 text-white/70'
                  : 'border-gray-300 bg-white text-gray-600',
              )}
            >
              Для выбранного раздела нет трактатов.
            </div>
          )}

          {activeTractate ? (
            <TalmudDafGrid tractate={activeTractate} onSelect={onSelectDaf} theme={theme} />
          ) : (
            <div
              className={clsx(
                'flex min-h-[200px] items-center justify-center rounded-2xl border px-4 py-6 text-sm text-center',
                theme === 'dark'
                  ? 'border-white/10 bg-white/5 text-white/70'
                  : 'border-gray-300 bg-white text-gray-600',
              )}
            >
              Выберите трактат, чтобы просмотреть список листов.
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}

export default TalmudSectionPanel;
