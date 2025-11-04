import type { DocV1 } from '../../types/text';
import { debugWarn } from '../../utils/debugLogger';

// Валидные типы блоков
const VALID_BLOCK_TYPES = [
  'paragraph', 'heading', 'list', 'quote', 'code', 'table', 'hr', 'image', 'callout', 'term'
] as const;

/**
 * Безопасное преобразование в текст
 */
export function coerceText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (payload == null) return '';
  if (typeof payload === 'object') {
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }
  return String(payload);
}

/**
 * Ограничение числа в диапазоне
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Санитизация блока
 */
export function sanitizeBlock(block: any): any {
  if (!block || typeof block !== 'object') return null;
  
  const type = block.type;
  if (!VALID_BLOCK_TYPES.includes(type)) return null;

  // Базовая структура
  const sanitized: any = { type };

  // Копируем безопасные поля
  const safeFields = ['text', 'content', 'level', 'items', 'lang', 'dir', 'source', 'context', 'he', 'ru', 'en', 'term', 'definition'];
  for (const field of safeFields) {
    if (block[field] !== undefined) {
      sanitized[field] = block[field];
    }
  }

  return sanitized;
}

/**
 * Извлечение doc.v1 из различных форматов
 */
function tryExtract(payload: any): any {
  if (!payload || typeof payload !== 'object') return null;

  // 1. Уже doc.v1 с blocks
  if (Array.isArray(payload.blocks)) {
    return payload;
  }

  // 2. StudyChat: {"version": "doc.v1", "content": [...]}
  if (payload.version === 'doc.v1' && Array.isArray(payload.content)) {
    return {
      version: payload.version,
      blocks: payload.content
    };
  }

  // 3. StudyChat: {"version": "doc.v1", "explanation": {"content": [...]}}
  if (payload.version === 'doc.v1' && payload.explanation?.content && Array.isArray(payload.explanation.content)) {
    return {
      version: payload.version,
      blocks: payload.explanation.content
    };
  }

  // 4. StudyChat: {"doc": {"version": "v1", "content": [...]}}
  if (payload.doc?.version === 'v1' && Array.isArray(payload.doc.content)) {
    return {
      version: '1.0',
      blocks: payload.doc.content
    };
  }

  // 5. StudyChat: {"doc": {"version": "v1", "paragraphs": [...], "quotes": [...], "terms": [...]}}
  if (payload.doc?.version === 'v1' && (payload.doc.paragraphs || payload.doc.quotes || payload.doc.terms)) {
    const blocks: any[] = [];
    
    if (Array.isArray(payload.doc.paragraphs)) {
      payload.doc.paragraphs.forEach((para: any) => {
        blocks.push({ type: 'paragraph', text: para.content || para });
      });
    }
    
    if (Array.isArray(payload.doc.quotes)) {
      payload.doc.quotes.forEach((quote: any) => {
        blocks.push({ 
          type: 'quote', 
          text: quote.text,
          source: quote.source,
          context: quote.context
        });
      });
    }
    
    if (Array.isArray(payload.doc.terms)) {
      payload.doc.terms.forEach((term: any) => {
        blocks.push({ 
          type: 'term', 
          he: term.term,
          ru: term.definition
        });
      });
    }
    
    return { version: '1.0', blocks };
  }

  // 6. StudyChat старый формат: {"explanation": {"paragraphs": [...], "terms": [...]}}
  if (payload.explanation && (payload.explanation.paragraphs || payload.explanation.terms)) {
    const blocks: any[] = [];
    
    if (Array.isArray(payload.explanation.paragraphs)) {
      payload.explanation.paragraphs.forEach((para: string) => {
        blocks.push({ type: 'paragraph', text: para });
      });
    }
    
    if (Array.isArray(payload.explanation.terms)) {
      payload.explanation.terms.forEach((term: any) => {
        blocks.push({ 
          type: 'term', 
          he: term.term,
          ru: term.definition
        });
      });
    }
    
    return { version: '1.0', blocks };
  }

  // 7. Raw формат: {"paragraph": "...", "quote": "...", "term": {...}}
  if (payload.paragraph || payload.quote || payload.term) {
    const blocks: any[] = [];
    
    if (payload.paragraph) {
      blocks.push({ type: 'paragraph', text: payload.paragraph });
    }
    
    if (payload.quote) {
      blocks.push({ type: 'quote', text: payload.quote });
    }
    
    if (payload.term) {
      blocks.push({ 
        type: 'term', 
        he: payload.term.term,
        ru: payload.term.definition
      });
    }
    
    return { version: '1.0', blocks };
  }

  // 8. Неправильный формат: массив с type="text" и type="action"
  if (Array.isArray(payload)) {
    const blocks: any[] = [];
    
    for (const item of payload) {
      if (item && typeof item === 'object') {
        if (item.type === 'text' && item.text) {
          blocks.push({ type: 'paragraph', text: item.text });
        } else if (item.type === 'action' && item.action) {
          // Преобразуем действия в информационные блоки
          const actionText = `Выполняется действие: ${item.action}`;
          if (item.action_input && item.action_input.tref) {
            blocks.push({ 
              type: 'callout', 
              variant: 'info', 
              text: `${actionText} для ссылки: ${item.action_input.tref}` 
            });
          } else {
            blocks.push({ 
              type: 'callout', 
              variant: 'info', 
              text: actionText 
            });
          }
        }
      }
    }
    
    if (blocks.length > 0) {
      return { version: '1.0', blocks };
    }
  }

  return null;
}

/**
 * Валидация и санитизация doc
 */
function validateAndSanitize(doc: any): DocV1 | null {
  if (!doc || typeof doc !== 'object') return null;
  if (!Array.isArray(doc.blocks)) return null;

  // Санитизация блоков
  const sanitizedBlocks = doc.blocks
    .map(sanitizeBlock)
    .filter((block: any) => block !== null);

  if (sanitizedBlocks.length === 0) return null;

  // Возвращаем только разрешенные поля верхнего уровня
  const result: DocV1 = { 
    version: '1.0',
    blocks: sanitizedBlocks 
  };
  
  if (typeof doc.version === 'string') result.version = doc.version;
  if (Array.isArray(doc.ops)) result.ops = doc.ops;

  return result;
}

/**
 * Основная функция нормализации в doc.v1
 */
export function coerceDoc(payload: unknown): DocV1 | null {
  if (process.env.NODE_ENV === 'development') {
    console.debug('[coerceDoc] input sample:', String(payload).slice(0, 400));
  }

  // 1. Уже объект?
  if (payload && typeof payload === 'object') {
    const extracted = tryExtract(payload as any);
    if (extracted) return validateAndSanitize(extracted);
  }

  // 2. Строка: снимаем fences и парсим 1-2 раза, ограничиваем размер до 1MB
  if (typeof payload === 'string') {
    if (payload.length > 1024 * 1024) {
      debugWarn('[coerceDoc] Payload too large for doc parsing');
      return null;
    }

    let s = payload.trim();

    // Снимаем тройные backticks ```json ... ```
    const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fence) s = fence[1];

    // Пытаемся распаковать максимум два раза
    for (let i = 0; i < 2; i++) {
      try {
        const parsed = JSON.parse(s);
        const extracted = tryExtract(parsed);
        if (extracted) return validateAndSanitize(extracted);

        // Иногда внутри есть еще одна JSON строка
        if (typeof parsed === 'string') {
          s = parsed;
          continue;
        }

        break;
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[coerceDoc] JSON parse failed:', e);
        }
        break;
      }
    }

    // Если не удалось распарсить как JSON, но это обычный текст - создаем простой doc
    if (s.length > 0 && !s.startsWith('[') && !s.startsWith('{')) {
      // Это обычный текст, создаем простой doc из одного абзаца
      return {
        version: '1.0',
        blocks: [{ type: 'paragraph', text: s }]
      };
    }
  }

  return null;
}