import { debugLog } from './debugLogger';
// ---------- REF utils: универсальные утилиты для работы со ссылками ----------

const normalizeBookName = (book: string): string => book.replace(/[\s]*[,:;]+$/g, '').trim();


export interface ParsedRef {
  type: 'talmud' | 'tanakh' | 'other';
  book: string;
  daf?: number;
  amud?: 'a' | 'b';
  segment?: number;
  chapter?: number;
  verse?: number;
  fullRef: string;
}

// Универсальный парсер для Талмуда и Танаха
export function parseRefSmart(ref: string): ParsedRef | null {
  if (!ref) return null;

  const parts = ref.trim().split(/\s+/);
  const tail = parts[parts.length - 1].toLowerCase();
  const book = normalizeBookName(parts.slice(0, -1).join(' '));

  // --- 1. Талмудический формат: 29a, 29b:3, 29a.5
  const mTalmud = tail.match(/^(\d+)\s*([ab])?(?:[:.]\s*(\d+))?$/);
  if (mTalmud) {
    const result: ParsedRef = {
      type: 'talmud',
      book,
      daf: parseInt(mTalmud[1], 10),
      amud: (mTalmud[2] as 'a' | 'b') ?? undefined,
      segment: mTalmud[3] ? parseInt(mTalmud[3], 10) : undefined,
      fullRef: ref,
    };
    if (process.env.NODE_ENV !== 'production') {
      debugLog('📖 Parsed Talmud ref:', { ref, result });
    }
    return result;
  }

  // --- 2. Библейский формат: Genesis 1:1, 2 Kings 3:14, etc.
  const mBible = tail.match(/^(\d+):(\d+)$/);
  if (mBible) {
    const result: ParsedRef = {
      type: 'tanakh',
      book,
      chapter: parseInt(mBible[1], 10),
      verse: parseInt(mBible[2], 10),
      fullRef: ref,
    };
    if (process.env.NODE_ENV !== 'production') {
      debugLog('📖 Parsed Tanakh ref:', { ref, result });
    }
    return result;
  }

  // --- 3. Альтернативный упрощённый формат: Genesis 1 (глава без стиха)
  const mBibleCh = tail.match(/^(\d+)$/);
  if (mBibleCh) {
    const result: ParsedRef = {
      type: 'tanakh',
      book,
      chapter: parseInt(mBibleCh[1], 10),
      verse: undefined,
      fullRef: ref,
    };
    if (process.env.NODE_ENV !== 'production') {
      debugLog('📖 Parsed Tanakh chapter ref:', { ref, result });
    }
    return result;
  }

  const result: ParsedRef = { type: 'other', book, fullRef: ref };
  if (process.env.NODE_ENV !== 'production') {
    debugLog('📖 Parsed other ref:', { ref, result });
  }
  return result;
}

// Умное сравнение ссылок по структуре
export function refEquals(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const pa = parseRefSmart(a);
  const pb = parseRefSmart(b);
  if (!pa || !pb || pa.type !== pb.type) return a === b;
  if (pa.type === 'talmud' && pb.type === 'talmud') {
    return pa.book === pb.book && pa.daf === pb.daf && (pa.amud || 'a') === (pb.amud || 'a') && (pa.segment ?? 0) === (pb.segment ?? 0);
  }
  if (pa.type === 'tanakh' && pb.type === 'tanakh') {
    return pa.book === pb.book && pa.chapter === pb.chapter && (pa.verse ?? 0) === (pb.verse ?? 0);
  }
  return a === b;
}

// Нормализация ссылок для API
export function normalizeRefForAPI(ref: string): string {
  if (!ref) return ref;
  
  const p = parseRefSmart(ref);
  if (!p) return ref;
  
  if (p.type === 'talmud' && p.segment != null) {
    const amud = p.amud ? `${p.daf}${p.amud}` : String(p.daf);
    return `${p.book} ${amud}.${p.segment}`;
  }
  
  if (p.type === 'tanakh' && p.verse != null) {
    return `${p.book} ${p.chapter}:${p.verse}`;
  }
  
  return ref;
}

