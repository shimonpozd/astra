import clsx from 'clsx';

import type { BookAliyah, BookParasha } from '../types';

interface ParashaListProps {
  parshiot: BookParasha[];
  onSelectParasha: (parasha: BookParasha) => void;
  onSelectAliyah: (aliyah: BookAliyah) => void;
  isLoading: boolean;
  theme: 'dark' | 'light' | 'system';
}

function ParashaList({
  parshiot,
  onSelectParasha,
  onSelectAliyah,
  isLoading,
  theme,
}: ParashaListProps) {
  if (!parshiot.length) {
    return (
      <div
        className={clsx(
          'rounded-xl border px-4 py-6 text-sm',
          theme === 'dark'
            ? 'border-white/10 bg-white/5 text-white/70'
            : 'border-gray-200 bg-gray-50 text-gray-600',
        )}
      >
        Для этой книги не найдено разбивки на парашот.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {parshiot.map((parasha) => (
        <div
          key={parasha.slug}
          className={clsx(
            'rounded-2xl border p-4',
            theme === 'dark'
              ? 'border-white/10 bg-white/5 text-white'
              : 'border-gray-200 bg-white text-gray-800',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide">{parasha.sharedTitle}</h4>
              <p className="text-xs opacity-70">{parasha.wholeRef}</p>
            </div>
            <button
              type="button"
              className={clsx(
                'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition',
                theme === 'dark'
                  ? 'border-emerald-300/60 text-emerald-200 hover:bg-emerald-300/20'
                  : 'border-emerald-500 text-emerald-600 hover:bg-emerald-500/10',
                isLoading ? 'cursor-wait opacity-60' : '',
              )}
              onClick={() => !isLoading && onSelectParasha(parasha)}
              disabled={isLoading}
            >
              Открыть парашу
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {parasha.aliyot.map((aliyah) => (
              <button
                key={aliyah.ref}
                type="button"
                onClick={() => !isLoading && onSelectAliyah(aliyah)}
                disabled={isLoading}
                className={clsx(
                  'rounded-full border px-3 py-1 text-xs transition',
                  theme === 'dark'
                    ? 'border-white/10 text-white/70 hover:bg-white/15'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100',
                  isLoading ? 'cursor-wait opacity-60' : '',
                )}
              >
                Али́я {aliyah.index + 1} · {aliyah.verses ?? '—'} стихов
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ParashaList;
