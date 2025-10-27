import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type StudyLayoutMode =
  | 'talmud_default'                 // left workbench + focus + right workbench (current)
  | 'focus_only'                     // focus only (hide both workbenches)
  | 'focus_with_bottom_commentary'   // focus top, single commentary bottom (no side workbenches)
  | 'vertical_three'; // chat left, focus+commentary center, bookshelf right

interface LayoutContextValue {
  mode: StudyLayoutMode;
  setMode: (m: StudyLayoutMode) => void;
}

const LayoutContext = createContext<LayoutContextValue | undefined>(undefined);

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<StudyLayoutMode>(() => {
    const saved = localStorage.getItem('astra_layout_mode') as StudyLayoutMode | null;
    return saved || 'talmud_default';
  });

  useEffect(() => {
    try {
      localStorage.setItem('astra_layout_mode', mode);
    } catch {}
  }, [mode]);

  const value = useMemo(() => ({ mode, setMode }), [mode]);
  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider');
  return ctx;
}


