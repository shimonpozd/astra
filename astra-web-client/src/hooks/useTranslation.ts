import { useState } from 'react';

// Cache store for translations - persists across component re-renders
const translationCache = new Map<string, string>();

interface UseTranslationProps {
  hebrewText: string;
  englishText: string;
}

interface UseTranslationReturn {
  translatedText: string | null;
  isTranslating: boolean;
  error: string | null;
  translate: () => Promise<void>;
  revert: () => void;
}

export const useTranslation = ({ hebrewText, englishText }: UseTranslationProps): UseTranslationReturn => {
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translate = async () => {
    if (translatedText) {
      // If already translated, revert
      revert();
      return;
    }

    // Create cache key
    const cacheKey = `${hebrewText}::${englishText}`;

    // Check cache first
    if (translationCache.has(cacheKey)) {
      setTranslatedText(translationCache.get(cacheKey)!);
      return; // Skip API call
    }

    setIsTranslating(true);
    setError(null);

    try {
      const response = await fetch('/api/actions/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hebrew_text: hebrewText,
          english_text: englishText || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Translation failed');
      }

      if (!response.body) {
        throw new Error("Response body is empty");
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let fullTranslation = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          try {
            const event = JSON.parse(value) as { type: string; data?: any };
            if (event.type === 'llm_chunk' && typeof event.data === 'string') {
              fullTranslation = event.data; // Expecting a single chunk with final translation
            }
          } catch (e) {
            console.error('[Translation] Failed to parse final stream event:', value, e);
          }
        }
      }

      console.log('[Translation] Stream complete, final translation:', fullTranslation);
      if (fullTranslation) {
        setTranslatedText(fullTranslation);
        translationCache.set(cacheKey, fullTranslation);
      } else {
        setError('No translation received.');
      }
      setIsTranslating(false);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
      setIsTranslating(false);
    }
  };

  const revert = () => {
    setTranslatedText(null);
    setError(null);
  };

  return {
    translatedText,
    isTranslating,
    error,
    translate,
    revert,
  };
};
