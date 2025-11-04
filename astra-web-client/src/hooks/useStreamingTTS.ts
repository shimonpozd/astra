import { useState, useRef, useCallback } from 'react';
import { authorizedFetch } from '../lib/authorizedFetch';

interface UseStreamingTTSOptions {
  voiceId?: string;
  language?: string;
  speed?: number;
}

interface UseStreamingTTSReturn {
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  currentTime: number;
  duration: number;
  play: (text: string) => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
}

export function useStreamingTTS(options: UseStreamingTTSOptions = {}): UseStreamingTTSReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);

  const play = useCallback(async (text: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // Stop current playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      // Start streaming from TTS service
      const response = await authorizedFetch('/api/tts/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          language: options.language || 'en',
          voice_id: options.voiceId,
          speed: options.speed || 1.0,
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS streaming failed: ${response.statusText}`);
      }

      // Create MediaSource for streaming
      if (!MediaSource.isTypeSupported('audio/mpeg')) {
        throw new Error('MediaSource not supported for audio streaming');
      }

      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;
      
      const audioUrl = URL.createObjectURL(mediaSource);
      
      // Create audio element
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // Set up event listeners
      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime);
      });

      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration);
      });

      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentTime(0);
      });

      audio.addEventListener('play', () => {
        setIsPlaying(true);
      });

      audio.addEventListener('pause', () => {
        setIsPlaying(false);
      });

      // Set up MediaSource
      mediaSource.addEventListener('sourceopen', () => {
        try {
          const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
          sourceBufferRef.current = sourceBuffer;
          
          // Start reading the stream
          readStream(response, sourceBuffer);
        } catch (err) {
          console.error('Error setting up source buffer:', err);
          setError('Ошибка настройки аудио потока');
        }
      });

      mediaSource.addEventListener('error', (e) => {
        console.error('MediaSource error:', e);
        setError('Ошибка медиа потока');
      });

    } catch (error) {
      console.error('Streaming error:', error);
      setError(error instanceof Error ? error.message : 'Ошибка стриминга');
    } finally {
      setIsLoading(false);
    }
  }, [options.language, options.voiceId, options.speed]);

  const readStream = async (response: Response, sourceBuffer: SourceBuffer) => {
    const reader = response.body?.getReader();
    if (!reader) return;

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          if (mediaSourceRef.current?.readyState === 'open') {
            mediaSourceRef.current.endOfStream();
          }
          break;
        }

        // Append audio data to source buffer
        if (sourceBuffer.updating) {
          await new Promise(resolve => {
            sourceBuffer.addEventListener('updateend', resolve, { once: true });
          });
        }
        
        sourceBuffer.appendBuffer(value);
      }
    } catch (error) {
      console.error('Error reading stream:', error);
      setError('Ошибка чтения аудио потока');
    }
  };

  const pause = useCallback(() => {
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  return {
    isPlaying,
    isLoading,
    error,
    currentTime,
    duration,
    play,
    pause,
    stop,
    seek,
  };
}

