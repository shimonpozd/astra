import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Volume2, Clock, Loader2 } from 'lucide-react';
import type { AudioMessage } from '../types/text';

interface StreamingAudioMessageProps {
  text: string;
  chatId?: string;
  voiceId?: string;
  language?: string;
  speed?: number;
  onAudioSaved?: (audioMessage: AudioMessage) => void;
}

export function StreamingAudioMessage({ 
  text, 
  chatId, 
  voiceId, 
  language = 'en', 
  speed = 1.0,
  onAudioSaved 
}: StreamingAudioMessageProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<AudioMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlay = async () => {
    if (!audioRef.current) return;

    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        if (!audioUrl) {
          await startStreaming();
        }
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Audio playback error:', error);
      setError('Ошибка воспроизведения');
    }
  };

  const startStreaming = async () => {
    try {
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

      // Create MediaSource for streaming
      if (!MediaSource.isTypeSupported('audio/mpeg')) {
        throw new Error('MediaSource not supported for audio streaming');
      }

      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;
      
      const audioUrl = URL.createObjectURL(mediaSource);
      setAudioUrl(audioUrl);

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
  };

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

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = (clickX / rect.width) * duration;
    
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleDownload = async () => {
    if (savedMessage?.content.audioUrl) {
      const link = document.createElement('a');
      link.href = savedMessage.content.audioUrl;
      link.download = `tts-${savedMessage.id}.${savedMessage.content.format || 'mp3'}`;
      link.click();
    } else {
      // If not saved yet, save first
      await handleSave();
    }
  };

  const handleSave = async () => {
    if (!chatId || savedMessage) return;

    try {
      // Create audio message from current stream
      const audioMessage: AudioMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content_type: 'audio.v1',
        content: {
          text,
          audioUrl: audioUrl || '',
          duration,
          provider: 'yandex', // TODO: Get from config
          voiceId,
          format: 'mp3',
        },
        timestamp: Date.now(),
      };

      // Save to backend
      const response = await fetch('/api/audio/synthesize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          chat_id: chatId,
          voice_id: voiceId,
          language,
          speed,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        audioMessage.content.audioUrl = result.audio_url;
        setSavedMessage(audioMessage);
        onAudioSaved?.(audioMessage);
      }
    } catch (error) {
      console.error('Save error:', error);
      setError('Ошибка сохранения');
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleLoadStart = () => setIsLoading(true);
  const handleCanPlay = () => setIsLoading(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="streaming-audio-message bg-muted/30 border border-border/50 rounded-lg p-4 max-w-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Volume2 className="w-4 h-4" />
          <span>Стриминг TTS</span>
          {voiceId && (
            <span className="text-xs bg-muted px-2 py-1 rounded">
              {voiceId}
            </span>
          )}
        </div>
        <button
          onClick={handleDownload}
          className="p-1 hover:bg-muted rounded transition-colors"
          title="Скачать аудио"
          disabled={!savedMessage}
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Text preview */}
      <div className="text-sm text-muted-foreground mb-3 line-clamp-2">
        {text}
      </div>

      {/* Audio controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePlay}
          disabled={isLoading}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center transition-colors"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          {/* Progress bar */}
          <div
            className="w-full h-2 bg-muted rounded-full cursor-pointer hover:h-3 transition-all"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Time display */}
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Save button */}
      {!savedMessage && chatId && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleSave}
            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
          >
            Сохранить в чат
          </button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-2 text-xs text-red-500">
          {error}
        </div>
      )}

      {/* Audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onLoadStart={handleLoadStart}
          onCanPlay={handleCanPlay}
          preload="none"
        />
      )}
    </div>
  );
}


