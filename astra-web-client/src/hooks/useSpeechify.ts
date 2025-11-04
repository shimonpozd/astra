import { useCallback, useState } from 'react';
import { authorizedFetch } from '../lib/authorizedFetch';

type SpeechifyParams = {
  hebrewText?: string;
  englishText?: string;
  text?: string;
};

export function useSpeechify() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const speechify = useCallback(async (params: SpeechifyParams): Promise<string> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authorizedFetch('/api/actions/speechify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hebrew_text: params.hebrewText || '',
          english_text: params.englishText || '',
          text: params.text || '',
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const speechText: string = data?.speech_text || '';
      if (!speechText) throw new Error('Empty speech_text');
      return speechText;
    } catch (e: any) {
      const msg = e?.message || 'Speechify failed';
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { speechify, isLoading, error } as const;
}





