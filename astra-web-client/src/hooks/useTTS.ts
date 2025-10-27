import { useState, useEffect, useCallback, useRef } from 'react';
import { getTTSService, TTSConfig, Voice } from '../services/ttsService';

interface UseTTSOptions {
  autoPlay?: boolean;
  voiceId?: string;
  language?: string;
  speed?: number;
}

interface UseTTSReturn {
  isPlaying: boolean;
  isPaused: boolean;
  currentText: string;
  voices: Voice[];
  selectedVoice: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  play: (text: string, options?: Partial<UseTTSOptions>) => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  
  // Voice management
  setVoice: (voiceId: string) => void;
  refreshVoices: () => Promise<void>;
  
  // Configuration
  setConfig: (config: Partial<TTSConfig>) => void;
}

export function useTTS(options: UseTTSOptions = {}): UseTTSReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(options.voiceId || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const ttsServiceRef = useRef(getTTSService());
  const ttsService = ttsServiceRef.current;

  // Initialize TTS service
  useEffect(() => {
    const initializeTTS = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Fetch provider from admin config
        let provider: any = 'xtts';
        try {
          const res = await fetch('/admin/config', { headers: { 'X-Admin-Token': 'super-secret-token' } });
          if (res.ok) {
            const cfg = await res.json();
            provider = cfg?.voice?.tts?.provider || provider;
          }
        } catch (_) {}

        // Set initial configuration based on admin config
        console.log('🎵 useTTS: Setting provider from admin config:', provider);
        ttsService.setConfig({ provider, voiceId: options.voiceId, language: options.language || 'en', speed: options.speed || 1.0 });

        // Load voices
        const availableVoices = await ttsService.getVoices();
        setVoices(availableVoices);
        
        // Set default voice if not selected
        if (!selectedVoice && availableVoices.length > 0) {
          const defaultVoice = availableVoices.find(v => v.language === (options.language || 'en')) || availableVoices[0];
          setSelectedVoice(defaultVoice.id);
          ttsService.setConfig({ voiceId: defaultVoice.id });
        }
        
        console.log('🎵 TTS service initialized:', { voices: availableVoices.length });
      } catch (err) {
        console.error('Failed to initialize TTS service:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize TTS');
      } finally {
        setIsLoading(false);
      }
    };

    initializeTTS();
  }, [options.voiceId, options.language, options.speed, selectedVoice]);

  // Play text
  const play = useCallback(async (text: string, playOptions?: Partial<UseTTSOptions>) => {
    try {
      setError(null);
      setIsLoading(true);
      
      const voiceId = playOptions?.voiceId || selectedVoice;
      const language = playOptions?.language || options.language || 'en';
      const speed = playOptions?.speed || options.speed || 1.0;
      
      await ttsService.play(text, {
        voiceId,
        language,
        speed,
      });
      
      setIsPlaying(true);
      setIsPaused(false);
      setCurrentText(text);
      
      console.log('🎵 TTS playing:', { text: text.substring(0, 50) + '...', voiceId, language, speed });
    } catch (err) {
      console.error('TTS play error:', err);
      setError(err instanceof Error ? err.message : 'Failed to play text');
    } finally {
      setIsLoading(false);
    }
  }, [selectedVoice, options.language, options.speed]);

  // Stop playback
  const stop = useCallback(async () => {
    try {
      await ttsService.stop();
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentText('');
      console.log('⏹️ TTS stopped');
    } catch (err) {
      console.error('TTS stop error:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop playback');
    }
  }, []);

  // Pause playback
  const pause = useCallback(async () => {
    try {
      await ttsService.pause();
      setIsPaused(true);
      console.log('⏸️ TTS paused');
    } catch (err) {
      console.error('TTS pause error:', err);
      setError(err instanceof Error ? err.message : 'Failed to pause playback');
    }
  }, []);

  // Resume playback
  const resume = useCallback(async () => {
    try {
      await ttsService.resume();
      setIsPaused(false);
      console.log('▶️ TTS resumed');
    } catch (err) {
      console.error('TTS resume error:', err);
      setError(err instanceof Error ? err.message : 'Failed to resume playback');
    }
  }, []);

  // Set voice
  const setVoice = useCallback((voiceId: string) => {
    setSelectedVoice(voiceId);
    ttsService.setConfig({ voiceId });
    console.log('🎵 Voice changed to:', voiceId);
  }, []);

  // Refresh voices
  const refreshVoices = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const availableVoices = await ttsService.getVoices();
      setVoices(availableVoices);
      
      console.log('🎵 Voices refreshed:', availableVoices.length);
    } catch (err) {
      console.error('Failed to refresh voices:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh voices');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Set configuration
  const setConfig = useCallback((config: Partial<TTSConfig>) => {
    ttsService.setConfig(config);
    console.log('🎵 TTS config updated:', config);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ttsService.stop().catch(console.error);
    };
  }, []);

  return {
    isPlaying,
    isPaused,
    currentText,
    voices,
    selectedVoice,
    isLoading,
    error,
    play,
    stop,
    pause,
    resume,
    setVoice,
    refreshVoices,
    setConfig,
  };
}

export type { UseTTSOptions, UseTTSReturn };




