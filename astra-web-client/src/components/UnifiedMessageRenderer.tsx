// React импорт не нужен в новых версиях
import { MessageRenderer } from './MessageRenderer';
import type { DocV1 } from '../types/text';
import { coerceDoc, coerceText } from '../lib/text/normalize';

/**
 * UnifiedMessageRenderer - тонкий адаптер для приведения любого входа к doc.v1
 * 
 * Цель: свести все форматы входящих сообщений к единому каноническому формату doc.v1
 * и делегировать реальный рендер компоненту MessageRenderer, который уже умеет:
 * - md-lite (bold/italic/code, ссылки с валидацией)
 * - безопасный HTML, нормальную типографику
 * - поддержку RTL/иврита/dir="auto"
 * - "Claude-style" типографику и стили из .doc (index.css)
 * - экзотические/наследованные форматы StudyChat (old/new/direct/raw)
 */
export default function UnifiedMessageRenderer({ input }: { input: unknown }) {
  if (process.env.NODE_ENV === 'development') {
    console.debug('[UnifiedMessageRenderer] input sample:', String(input).slice(0, 400));
  }

  // Пытаемся нормализовать в doc.v1
  const doc = coerceDoc(input);
  
  // Если не получилось - создаем безопасный doc из одного абзаца
  const safeDoc: DocV1 = doc ?? {
    version: '1.0',
    blocks: [{ type: 'paragraph', text: coerceText(input) }],
  };

  // Показываем ВСЕГДА единый рендерер + единый контейнер стилей
  // Убираем dir="auto" с контейнера - пусть каждый блок сам определяет направление
  return (
    <article className="doc">
      <MessageRenderer doc={safeDoc} />
    </article>
  );
}