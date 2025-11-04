import clsx from 'clsx';

interface ChapterGridProps {
  chapterSizes: number[];
  onSelect: (chapter: number) => void;
  isLoading: boolean;
  theme: 'dark' | 'light' | 'system';
  activeChapter?: number | null;
}

function ChapterGrid({
  chapterSizes,
  onSelect,
  isLoading,
  theme,
  activeChapter = null,
}: ChapterGridProps) {
  const totalChapters = chapterSizes.length;
  const rows = Math.ceil(totalChapters / 10);

  const cells = Array.from({ length: rows * 10 }, (_, index) => {
    const chapterNumber = index + 1;
    const disabled = chapterNumber > totalChapters;
    const verses = !disabled ? chapterSizes[chapterNumber - 1] : null;
    return { chapterNumber, disabled, verses };
  });

  return (
    <div
      className={clsx(
        'rounded-2xl border p-4 shadow-inner',
        theme === 'dark'
          ? 'border-white/10 bg-white/10 shadow-black/20'
          : 'border-emerald-200/40 bg-emerald-50/60 shadow-emerald-100/40',
      )}
    >
      <div className="grid grid-cols-10 gap-2 text-xs text-emerald-900/70">
        {cells.map(({ chapterNumber, disabled, verses }) => {
          const isActive = !disabled && activeChapter === chapterNumber;
          const isDisabled = disabled || isLoading;

          return (
            <button
              key={chapterNumber}
              type="button"
              onClick={() => !disabled && onSelect(chapterNumber)}
              disabled={isDisabled}
              className={clsx(
                'flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 transition-all duration-200',
                theme === 'dark' ? 'border-white/10' : 'border-emerald-200/70',
                isActive
                  ? theme === 'dark'
                    ? 'border-emerald-300/80 bg-emerald-400/30 text-white shadow-lg shadow-emerald-400/30'
                    : 'border-emerald-500 bg-emerald-100 text-emerald-900 shadow-[0_8px_18px_rgba(16,185,129,0.18)]'
                  : isDisabled
                    ? 'opacity-40'
                    : theme === 'dark'
                      ? 'bg-white/10 text-white hover:bg-emerald-400/20 hover:text-white'
                      : 'bg-white text-emerald-700 hover:bg-emerald-100',
                isDisabled ? 'cursor-not-allowed' : 'cursor-pointer',
                isLoading && !disabled ? 'cursor-wait opacity-60' : '',
              )}
              aria-pressed={isActive}
              data-active={isActive ? 'true' : 'false'}
            >
              <span className="text-sm font-semibold">
                {chapterNumber <= totalChapters ? chapterNumber : ''}
              </span>
              {verses != null && (
                <span
                  className={clsx(
                    'text-[10px] uppercase tracking-wide',
                    theme === 'dark'
                      ? isActive
                        ? 'text-emerald-100'
                        : 'text-white/60'
                      : isActive
                        ? 'text-emerald-700'
                        : 'text-emerald-500',
                  )}
                >
                  {verses}
                  {' '}
                  стихов
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ChapterGrid;
