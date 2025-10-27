import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface FontSettings {
  fontSize: 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge' | 'xxxlarge';
  lineHeight: 'compact' | 'normal' | 'relaxed';
  hebrewScale: number;
}

interface FontSettingsContextType {
  fontSettings: FontSettings;
  updateFontSettings: (settings: Partial<FontSettings>) => void;
  fontSizeValues: Record<string, string>;
  lineHeightValues: Record<string, string>;
}

const FontSettingsContext = createContext<FontSettingsContextType | undefined>(undefined);

const defaultFontSettings: FontSettings = {
  fontSize: 'large',
  lineHeight: 'normal',
  hebrewScale: 1.9
};

const fontSizeValues: Record<string, string> = {
  small: '12px',
  medium: '14px',
  large: '16px',
  xlarge: '18px',
  xxlarge: '20px',
  xxxlarge: '22px'
};

const lineHeightValues: Record<string, string> = {
  compact: '1.4',
  normal: '1.6',
  relaxed: '1.8'
};

export function FontSettingsProvider({ children }: { children: ReactNode }) {
  const [fontSettings, setFontSettings] = useState<FontSettings>(() => {
    // Загружаем из localStorage при инициализации
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('font-settings');
      if (saved) {
        try {
          return { ...defaultFontSettings, ...JSON.parse(saved) };
        } catch (e) {
          console.warn('Failed to parse font settings from localStorage:', e);
        }
      }
    }
    return defaultFontSettings;
  });

  // Сохраняем в localStorage при изменении
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('font-settings', JSON.stringify(fontSettings));
    }
  }, [fontSettings]);

  const updateFontSettings = (newSettings: Partial<FontSettings>) => {
    setFontSettings(prev => ({ ...prev, ...newSettings }));
  };

  const value: FontSettingsContextType = {
    fontSettings,
    updateFontSettings,
    fontSizeValues,
    lineHeightValues
  };

  return (
    <FontSettingsContext.Provider value={value}>
      {children}
    </FontSettingsContext.Provider>
  );
}

export function useFontSettings() {
  const context = useContext(FontSettingsContext);
  if (context === undefined) {
    throw new Error('useFontSettings must be used within a FontSettingsProvider');
  }
  return context;
}
