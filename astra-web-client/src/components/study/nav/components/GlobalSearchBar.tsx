import type { ChangeEvent } from 'react';

import clsx from 'clsx';
import { Search } from 'lucide-react';

interface GlobalSearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  theme: 'dark' | 'light' | 'system';
}

function GlobalSearchBar({ query, onQueryChange, theme }: GlobalSearchBarProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onQueryChange(event.target.value);
  };

  return (
    <label
      className={clsx(
        'flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition',
        theme === 'dark'
          ? 'border-white/15 bg-white/5 text-white/80 focus-within:border-amber-300/60'
          : 'border-gray-300 bg-white text-gray-600 focus-within:border-emerald-500/60',
      )}
    >
      <Search className="h-4 w-4 opacity-70" />
      <input
        value={query}
        onChange={handleChange}
        className={clsx(
          'w-48 bg-transparent text-sm outline-none placeholder:text-xs placeholder:uppercase placeholder:tracking-wide',
          theme === 'dark' ? 'placeholder:text-white/50 text-white' : 'placeholder:text-gray-400 text-gray-900',
        )}
        placeholder="поиск по библиотеке"
        type="search"
      />
    </label>
  );
}

export default GlobalSearchBar;
