// React импорт не нужен в новых версиях
import { MessageRenderer } from './MessageRenderer';
import type { DocV1 } from '../types/text';
import { coerceDoc, coerceText } from '../lib/text/normalize';
import { useSpeechify } from '../hooks/useSpeechify';
import { useTTS } from '../hooks/useTTS';
import { AudioTTSButton } from './ui/AudioTTSButton';
import { StreamingAudioMessage } from './StreamingAudioMessage';
import { SimpleStreamingTTS } from './SimpleStreamingTTS';
import { Volume2 } from 'lucide-react';
// Removed inline speechify button; rely on existing play controls elsewhere

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
  const { speechify, isLoading: isSpeechifying } = useSpeechify();
  const tts = useTTS({});
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
  // Добавляем кнопку Speechify c hover-появлением
  const rawTextForSpeech = coerceText(input);
  const handleSpeechify = async () => {
    try {
      const speechText = await speechify({ text: rawTextForSpeech });
      await tts.play(speechText, { language: 'en' });
    } catch (e) {
      console.error('Speechify (chat) failed', e);
    }
  };

  return (
    <div className="group">
      <article className="doc">
        <MessageRenderer doc={safeDoc} />
      </article>
      {rawTextForSpeech ? (
        <div className="flex justify-end mt-1 opacity-70 hover:opacity-100 transition-opacity">
          <button
            onClick={handleSpeechify}
            disabled={isSpeechifying}
            className="px-2 py-1 rounded bg-muted hover:bg-muted/80 text-xs"
            title="Озвучить сообщение"
            aria-label="Озвучить сообщение"
          >
            <span className="inline-flex items-center gap-1"><Volume2 className="w-3 h-3" /> Слушать</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}