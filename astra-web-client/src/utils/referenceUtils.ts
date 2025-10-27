// utils/referenceUtils.ts

const normalizeBookName = (book: string): string => book.replace(/[\s]*[,:;]+$/g, '').trim();

export interface ParsedReference {
  type: 'talmud' | 'tanakh' | 'other';
  book: string;
  page?: string;
  chapter?: string;
  verse?: string;
  amud?: 'a' | 'b';
  segment?: number;
  fullRef: string;
}

export interface NavigationContext {
  currentRef: string;
  segments: Array<{ ref: string; text: string; heText?: string }>;
  focusIndex: number;
}

/**
 * Парсит ссылку на текст
 */
export function parseReference(ref: string): ParsedReference | null {
  if (!ref) return null;
  const parts = ref.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const rest = parts[parts.length - 1];          // "29a:1" | "29b" | "29a.2" | "29:1"
  const book = normalizeBookName(parts.slice(0, -1).join(' '));     // "Bava Metzia" и т.п.

  // Талмуд: число + a/b (опц.) + разделитель : или . + сегмент (опц.)
  const talmudMatch = rest.toLowerCase().match(/^(\d+)\s*([ab])?(?:[:.]\s*(\d+))?$/);
  if (talmudMatch) {
    const pageNum = talmudMatch[1];
    const amud = (talmudMatch[2] as 'a'|'b') ?? undefined; // не форсим 'a'
    const segment = talmudMatch[3] ? parseInt(talmudMatch[3], 10) : undefined;
    return { type: 'talmud', book, page: pageNum, amud, segment, fullRef: ref };
  }

  // Танах: глава[:стих]
  const tanakhMatch = rest.match(/^(\d+)(?::(\d+))?$/);
  if (tanakhMatch) {
    const chapter = tanakhMatch[1];
    const verse = tanakhMatch[2] ? parseInt(tanakhMatch[2], 10) : undefined;
    return { type: 'tanakh', book, chapter, verse: verse?.toString(), fullRef: ref };
  }

  return { type: 'other', book, fullRef: ref };
}

/**
 * Генерирует следующую ссылку для навигации
 */
export function getNextReference(p: ParsedReference): string | null {
  if (p.type !== 'talmud' || !p.page) return null;
  if (!p.amud) return `${p.book} ${p.page}a:1`;
  if (p.segment) return `${p.book} ${p.page}${p.amud}:${p.segment + 1}`;
  if (p.amud === 'a') return `${p.book} ${p.page}b:1`;
  const nextPage = parseInt(p.page, 10) + 1;
  return `${p.book} ${nextPage}a:1`;
}

/**
 * Генерирует предыдущую ссылку для навигации
 */
export function getPrevReference(p: ParsedReference): string | null {
  if (p.type !== 'talmud' || !p.page) return null;
  if (p.segment && p.segment > 1) return `${p.book} ${p.page}${p.amud ?? 'a'}:${p.segment - 1}`;
  if (p.amud === 'b') return `${p.book} ${p.page}a:1`;
  const prevPage = parseInt(p.page, 10) - 1;
  if (prevPage > 0) return `${p.book} ${prevPage}b:1`;
  return null;
}

/**
 * Определяет, нужно ли показывать разделитель между сегментами
 */
export function shouldShowSeparator(
  currentSegment: { ref: string },
  nextSegment: { ref: string }
): boolean {
  const current = parseReference(currentSegment.ref);
  const next = parseReference(nextSegment.ref);

  if (!current || !next) return false;

  // Разные книги - всегда показываем разделитель
  if (current.book !== next.book) return true;

  if (current.type === 'talmud' && next.type === 'talmud') {
    // Переход между страницами (a->b или страница->страница)
    if (current.page !== next.page) return true;
    if (current.amud !== next.amud) return true;
  }

  if (current.type === 'tanakh' && next.type === 'tanakh') {
    // Переход между главами
    if (current.chapter !== next.chapter) return true;
  }

  return false;
}

/**
 * Определяет тип разделителя
 */
export function getSeparatorType(
  currentSegment: { ref: string },
  nextSegment: { ref: string }
): 'page' | 'chapter' | 'book' | null {
  const current = parseReference(currentSegment.ref);
  const next = parseReference(nextSegment.ref);

  if (!current || !next) return null;

  // Разные книги
  if (current.book !== next.book) return 'book';

  if (current.type === 'talmud' && next.type === 'talmud') {
    // Переход между страницами
    if (current.page !== next.page) return 'page';
    // Переход между сторонами (a->b)
    if (current.amud !== next.amud) return 'page';
  }

  if (current.type === 'tanakh' && next.type === 'tanakh') {
    // Переход между главами
    if (current.chapter !== next.chapter) return 'chapter';
  }

  return null;
}

/**
 * Генерирует текст для разделителя
 */
export function getSeparatorText(
  currentSegment: { ref: string },
  nextSegment: { ref: string }
): string {
  const separatorType = getSeparatorType(currentSegment, nextSegment);
  const next = parseReference(nextSegment.ref);

  if (!next) return '';

  switch (separatorType) {
    case 'page':
      if (next.type === 'talmud') {
        return `Страница ${next.page}${next.amud}`;
      }
      break;
    case 'chapter':
      if (next.type === 'tanakh') {
        return `Глава ${next.chapter}`;
      }
      break;
    case 'book':
      return next.book;
  }

  return '';
}
