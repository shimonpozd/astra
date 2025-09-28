// utils/hebrewUtils.ts
export const HEBREW_REGEX = /[\u0590-\u05FF\u200F\u200E]/;
export const ARAMAIC_REGEX = /[\u0590-\u05FF]/; // Можно уточнить

export function containsHebrew(text?: string): boolean {
  return !!text && HEBREW_REGEX.test(text);
}

export function getTextDirection(text?: string): 'ltr' | 'rtl' {
  if (!text) return 'ltr';
  return containsHebrew(text) ? 'rtl' : 'ltr';
}

export function formatHebrewText(text: string): string {
  // Обработка специальных случаев для иврита
  return text
    .replace(/\u200F/g, '') // Удаляем RLM
    .replace(/\u200E/g, '') // Удаляем LRM
    .trim();
}