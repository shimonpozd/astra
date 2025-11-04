import { useState, useCallback } from 'react';
import { getTTSService } from '../services/ttsService';
import type { AudioMessage } from '../types/text';
import { debugLog } from '../utils/debugLogger';

interface UseAudioTTSOptions {
  voiceId?: string;
  language?: string;
  speed?: number;
  autoPlay?: boolean;
}

interface UseAudioTTSReturn {
  isGenerating: boolean;
  error: string | null;
  generateAudioMessage: (text: string, options?: Partial<UseAudioTTSOptions>) => Promise<AudioMessage>;
  saveAudioMessage: (audioMessage: AudioMessage, chatId: string) => Promise<void>;
}

export function useAudioTTS(options: UseAudioTTSOptions = {}): UseAudioTTSReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateAudioMessage = useCallback(async (
    text: string, 
    generateOptions?: Partial<UseAudioTTSOptions>
  ): Promise<AudioMessage> => {
    try {
      setIsGenerating(true);
      setError(null);

      const ttsService = getTTSService();
      
      // Merge options
      const finalOptions = {
        voiceId: generateOptions?.voiceId || options.voiceId,
        language: generateOptions?.language || options.language || 'en',
        speed: generateOptions?.speed || options.speed || 1.0,
      };

      debugLog('🎵 Generating audio message:', {
        text: text.substring(0, 50) + '...',
        options: finalOptions,
      });

      const audioMessage = await ttsService.synthesizeAndCreateMessage(text, finalOptions);
      
      debugLog('✅ Audio message generated:', {
        id: audioMessage.id,
        duration: audioMessage.content.duration,
        size: audioMessage.content.size,
      });

      return audioMessage;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate audio message';
      console.error('❌ Audio generation error:', errorMessage);
      setError(errorMessage);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  }, [options.voiceId, options.language, options.speed]);

  const saveAudioMessage = useCallback(async (
    audioMessage: AudioMessage, 
    chatId: string
  ): Promise<void> => {
    try {
      setError(null);
      
      const ttsService = getTTSService();
      await ttsService.saveAudioMessage(audioMessage, chatId);
      
      debugLog('💾 Audio message saved to chat:', {
        messageId: audioMessage.id,
        chatId,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save audio message';
      console.error('❌ Audio save error:', errorMessage);
      setError(errorMessage);
      throw err;
    }
  }, []);

  return {
    isGenerating,
    error,
    generateAudioMessage,
    saveAudioMessage,
  };
}

