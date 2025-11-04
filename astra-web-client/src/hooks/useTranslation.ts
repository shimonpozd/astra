import { useState, useEffect, useCallback } from 'react';
import { debugLog, debugWarn } from '../utils/debugLogger';
import { authorizedFetch } from '../lib/authorizedFetch';

// Cache store for translations - persists across component re-renders
const translationCache = new Map<string, string>();

interface UseTranslationProps {
  tref: string;  // Text reference (e.g., "Genesis 1:1" or "Rashi on Genesis 1:1:1")
}

interface UseTranslationReturn {
  translatedText: string | null;
  isTranslating: boolean;
  error: string | null;
  translate: () => Promise<string | null>;
  clear: () => void;
}

export const useTranslation = ({ tref }: UseTranslationProps): UseTranslationReturn => {
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTranslatedText(null);
    setError(null);
    setIsTranslating(false);

    if (translationCache.has(tref)) {
      setTranslatedText(translationCache.get(tref)!);
    }
  }, [tref]);

  const translate = useCallback(async (): Promise<string | null> => {
    const cacheKey = tref;

    if (translationCache.has(cacheKey)) {
      const cached = translationCache.get(cacheKey)!;
      setTranslatedText(cached);
      return cached;
    }

    if (isTranslating) {
      return translatedText;
    }

    debugLog('[Translation] Starting translation for tref:', tref);
    setIsTranslating(true);
    setError(null);

    try {
      const response = await authorizedFetch('/api/actions/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tref }),
      });

      debugLog('[Translation] Response status:', response.status, 'for tref:', tref);

      if (!response.ok) {
        let errorMsg = 'Translation failed';
        try {
          const errorData = await response.json();
          errorMsg = errorData.detail || JSON.stringify(errorData);
        } catch {
          /* ignore */
        }
        console.error('[Translation] API error:', errorMsg);
        throw new Error(errorMsg);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let fullTranslation = '';
      let chunkCount = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        try {
          const event = JSON.parse(value) as { type: string; data?: any };
          debugLog('[Translation] Received event:', event.type, 'for tref:', tref);
          
          if (event?.type === 'llm_chunk' && typeof event.data === 'string') {
            fullTranslation += event.data; // Накопляем данные вместо перезаписи
            chunkCount++;
            debugLog('[Translation] Chunk', chunkCount, 'length:', event.data.length, 'total length:', fullTranslation.length);
          } else if (event?.type === 'error') {
            console.error('[Translation] backend error:', event.data?.message);
            setError(event.data?.message ?? 'Translation failed');
          }
        } catch (err) {
          console.error('[Translation] Failed to parse stream event:', value, err);
        }
      }

      debugLog('[Translation] Stream completed. Total chunks:', chunkCount, 'Final length:', fullTranslation.length);

      if (fullTranslation && fullTranslation.trim()) {
        translationCache.set(cacheKey, fullTranslation);
        setTranslatedText(fullTranslation);
        return fullTranslation;
      }

      debugWarn('[Translation] No translation received for tref:', tref, 'fullTranslation:', fullTranslation);
      setError('No translation received.');
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Translation failed';
      setError(message);
      return null;
    } finally {
      setIsTranslating(false);
    }
  }, [tref, isTranslating, translatedText]);

  const clear = useCallback(() => {
    setTranslatedText(null);
    setError(null);
  }, []);

  return {
    translatedText,
    isTranslating,
    error,
    translate,
    clear,
  };
};