import type { TalmudSeder } from './types';

export const TALMUD_SEDER_ORDER_BAVLI: TalmudSeder[] = [
  'Zeraim',
  'Moed',
  'Nashim',
  'Nezikin',
  'Kodashim',
  'Tahorot',
];

export const TALMUD_SEDER_ORDER_YERUSHALMI: TalmudSeder[] = [
  'Zeraim',
  'Moed',
  'Nashim',
  'Nezikin',
  'Tahorot',
];

export const TALMUD_SEDER_LABELS: Record<TalmudSeder, string> = {
  Zeraim: 'Зраим',
  Moed: 'Моэд',
  Nashim: 'Нашим',
  Nezikin: 'Незикин',
  Kodashim: 'Кодашим',
  Tahorot: 'Тахорот',
};
