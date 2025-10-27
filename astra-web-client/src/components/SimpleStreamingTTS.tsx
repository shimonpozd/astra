import React, { useState, useRef } from 'react';
import { Play, Pause, Volume2, Loader2 } from 'lucide-react';

interface SimpleStreamingTTSProps {
  text: string;
  language?: string;
  voiceId?: string;
  speed?: number;
  className?: string;
}

export function SimpleStreamingTTS({ 
  text, 
  language = 'en', 
  voiceId, 
  speed = 1.0,
  className = ''
}: SimpleStreamingTTSProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = async () => {
    try {
      if (isPlaying) {
        // Pause current playback
        if (audioRef.current) {
          audioRef.current.pause();
          setIsPlaying(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      // Start streaming from TTS service
      const response = await fetch('/api/tts/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          language,
          voice_id: voiceId,
          speed,
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS streaming failed: ${response.statusText}`);
      }

      // Create audio element with streaming URL
      const audio = new Audio();
      audioRef.current = audio;

      // Set up event listeners
      audio.addEventListener('loadstart', () => {
        setIsLoading(true);
      });

      audio.addEventListener('canplay', () => {
        setIsLoading(false);
        audio.play();
        setIsPlaying(true);
      });

      audio.addEventListener('play', () => {
        setIsPlaying(true);
      });

      audio.addEventListener('pause', () => {
        setIsPlaying(false);
      });

      audio.addEventListener('ended', () => {
        setIsPlaying(false);
      });

      audio.addEventListener('error', (e) => {
        console.error('Audio error:', e);
        setError('Ошибка воспроизведения аудио');
        setIsLoading(false);
        setIsPlaying(false);
      });

      // Start streaming
      audio.src = URL.createObjectURL(await response.blob());
      
    } catch (error) {
      console.error('Streaming error:', error);
      setError(error instanceof Error ? error.message : 'Ошибка стриминга');
      setIsLoading(false);
    }
  };

  const getIcon = () => {
    if (isLoading) {
      return <Loader2 className="w-4 h-4 animate-spin" />;
    }
    
    if (error) {
      return <Volume2 className="w-4 h-4 text-red-500" />;
    }
    
    return isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />;
  };

  const getButtonText = () => {
    if (isLoading) return 'Загрузка...';
    if (error) return 'Ошибка';
    if (isPlaying) return 'Пауза';
    return 'Слушать';
  };

  return (
    <div className={`simple-streaming-tts ${className}`}>
      <button
        onClick={handlePlay}
        disabled={isLoading}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        title={error ? `Ошибка: ${error}` : 'Стриминг TTS'}
      >
        {getIcon()}
        <span className="text-sm">{getButtonText()}</span>
      </button>
      
      {error && (
        <div className="mt-1 text-xs text-red-500">
          {error}
        </div>
      )}
    </div>
  );
}


