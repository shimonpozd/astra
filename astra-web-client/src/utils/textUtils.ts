// utils/textUtils.ts
import { containsHebrew } from './hebrewUtils';

export function getTextDirection(text?: string): 'ltr' | 'rtl' {
  if (!text) return 'ltr';

  // Проверяем первые значимые символы
  const significantChars = text.replace(/[\s\d\p{P}]/gu, '').slice(0, 10);
  return containsHebrew(significantChars) ? 'rtl' : 'ltr';
}

export function normalizeTextForDisplay(text: string): string {
  return text
    .replace(/\u200F/g, '') // Remove RTL marks
    .replace(/\u200E/g, '') // Remove LTR marks
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Вычисление позиции сегмента в тексте
export function calculateSegmentPosition(
  segments: any[],
  currentIndex: number
): number {
  if (segments.length === 0) return 0;
  return currentIndex / (segments.length - 1);
}