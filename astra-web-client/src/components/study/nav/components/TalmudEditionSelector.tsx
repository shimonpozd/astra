import clsx from 'clsx';

import type { TalmudEdition } from '../types';

interface TalmudEditionSelectorProps {
  value: TalmudEdition;
  onChange: (edition: TalmudEdition) => void;
  theme: 'dark' | 'light' | 'system';
}

const EDITION_LABELS: Record<TalmudEdition, string> = {
  Bavli: 'Бавли',
  Yerushalmi: 'Иерушалми',
};

function TalmudEditionSelector({ value, onChange, theme }: TalmudEditionSelectorProps) {
  return (
    <div className="flex gap-2">
      {(['Bavli', 'Yerushalmi'] as const).map((edition) => (
        <button
          key={edition}
          type="button"
          onClick={() => onChange(edition)}
          className={clsx(
            'rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-wide transition',
            edition === value
              ? theme === 'dark'
                ? 'border border-amber-300 bg-amber-500/30 text-white shadow-[0_0_0_1px_rgba(251,191,36,0.35)]'
                : 'border border-amber-500 bg-amber-200/80 text-emerald-900 shadow-[0_0_0_1px_rgba(217,119,6,0.3)]'
              : theme === 'dark'
                ? 'border border-white/10 bg-white/10 text-white hover:bg-white/15'
                : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100',
          )}
        >
          {EDITION_LABELS[edition]}
        </button>
      ))}
    </div>
  );
}

export default TalmudEditionSelector;
