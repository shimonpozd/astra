import { useEffect, useMemo, useState } from 'react';

import clsx from 'clsx';

import { loadShape } from '../../../../lib/sefariaCatalog';
import type { CatalogWork, WorkShape } from '../../../../lib/sefariaCatalog';

interface TalmudDafGridProps {
  tractate: CatalogWork;
  onSelect: (dafLabel: string) => void;
  theme: 'dark' | 'light' | 'system';
}

const GRID_COLUMNS = 10;

function TalmudDafGrid({ tractate, onSelect, theme }: TalmudDafGridProps) {
  const [shape, setShape] = useState<WorkShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!tractate.path) {
      setError('Не удалось определить путь к трактату.');
      setShape(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setShape(null);

    loadShape('/sefaria-cache/', tractate.path)
      .then((result) => {
        if (cancelled) return;
        setShape(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Не удалось загрузить структуру трактата.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tractate]);

  const dafLabels = useMemo(() => {
    if (!shape) return [];
    return buildDafLabelsFromShape(shape);
  }, [shape]);

  const rows = Math.ceil(dafLabels.length / GRID_COLUMNS);
  const cells = useMemo(
    () => Array.from({ length: rows * GRID_COLUMNS }, (_, index) => dafLabels[index] ?? ''),
    [rows, dafLabels],
  );

  return (
    <div
      className={clsx(
        'rounded-2xl border p-4',
        theme === 'dark'
          ? 'border-white/10 bg-white/10 text-white'
          : 'border-gray-300 bg-white text-gray-800',
      )}
    >
      <div className="mb-3 flex flex-col gap-1">
        <h4 className="text-sm font-semibold uppercase tracking-wide">{tractate.title}</h4>
        {tractate.primaryTitles?.he && (
          <span
            className={clsx(
              'text-base font-medium',
              theme === 'dark' ? 'text-amber-200/90' : 'text-amber-700',
            )}
            dir="rtl"
          >
            {tractate.primaryTitles.he}
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="flex items-center gap-3 text-sm">
            <div
              className={clsx(
                'h-5 w-5 animate-spin rounded-full border-2 border-transparent',
                theme === 'dark' ? 'border-t-amber-400' : 'border-t-emerald-600',
              )}
            />
            <span className={theme === 'dark' ? 'text-white/80' : 'text-gray-600'}>
              Загружаем структуру трактата…
            </span>
          </div>
        </div>
      )}

      {!loading && error && (
        <div
          className={clsx(
            'rounded-xl border px-4 py-3 text-sm',
            theme === 'dark'
              ? 'border-red-400/50 bg-red-500/10 text-red-200'
              : 'border-red-300 bg-red-50 text-red-700',
          )}
        >
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-10 gap-2">
            {cells.map((label, index) => (
              <button
                key={`${tractate.title}-${index}`}
                type="button"
                disabled={!label}
                onClick={() => label && onSelect(label)}
                className={clsx(
                  'rounded-xl border px-2 py-2 text-sm transition',
                  label
                    ? theme === 'dark'
                      ? 'border-white/10 bg-white/5 text-white hover:bg-amber-400/20'
                      : 'border-gray-300 bg-gray-50 text-gray-800 hover:bg-emerald-100'
                    : theme === 'dark'
                      ? 'cursor-default border-white/5 bg-white/5 text-white/30'
                      : 'cursor-default border-gray-200 bg-gray-100 text-gray-400',
                )}
              >
                {label || ''}
              </button>
            ))}
          </div>
          <p
            className={clsx(
              'mt-3 text-xs',
              theme === 'dark' ? 'text-white/60' : 'text-gray-600',
            )}
          >
            Выберите лист, чтобы перейти к адресу вида{' '}
            <span
              className={clsx(
                'font-mono',
                theme === 'dark' ? 'text-white' : 'text-gray-800',
              )}
            >
              daf:1
            </span>
            .
          </p>
        </>
      )}
    </div>
  );
}

function buildDafLabelsFromShape(shape: WorkShape): string[] {
  const labels: string[] = [];

  const chapters = (shape as unknown as { chapters?: unknown }).chapters;
  if (Array.isArray(chapters) && chapters.length) {
    let dafNumber = 2;

    chapters.forEach(() => {
      labels.push(`${dafNumber}a`);
      labels.push(`${dafNumber}b`);
      dafNumber += 1;
    });

    if (labels.length) {
      return labels;
    }
  }

  const rawShape = (shape as unknown as { shape?: unknown[] }).shape;
  const leafCount = Array.isArray(rawShape) ? rawShape.length : 0;

  let daf = 2;
  for (let index = 0; index < leafCount; index += 2) {
    labels.push(`${daf}a`);
    if (index + 1 < leafCount) {
      labels.push(`${daf}b`);
    }
    daf += 1;
  }

  return labels;
}

export default TalmudDafGrid;
