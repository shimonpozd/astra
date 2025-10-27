import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Volume2, Clock } from 'lucide-react';
import type { AudioMessage } from '../types/text';

interface AudioMessageRendererProps {
  message: AudioMessage;
}

export function AudioMessageRenderer({ message }: AudioMessageRendererProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(message.content.duration || 0);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const { content } = message;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

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
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Audio playback error:', error);
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

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = content.audioUrl;
    link.download = `tts-${message.id}.${content.format || 'mp3'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  return (
    <div className="audio-message bg-muted/30 border border-border/50 rounded-lg p-4 max-w-md">
      {/* Header with provider info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Volume2 className="w-4 h-4" />
          <span className="capitalize">{content.provider}</span>
          {content.voiceId && (
            <span className="text-xs bg-muted px-2 py-1 rounded">
              {content.voiceId}
            </span>
          )}
        </div>
        <button
          onClick={handleDownload}
          className="p-1 hover:bg-muted rounded transition-colors"
          title="Скачать аудио"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Text preview */}
      <div className="text-sm text-muted-foreground mb-3 line-clamp-2">
        {content.text}
      </div>

      {/* Audio controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePlay}
          disabled={isLoading}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center transition-colors"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
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

      {/* Audio element */}
      <audio
        ref={audioRef}
        src={content.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onLoadStart={handleLoadStart}
        onCanPlay={handleCanPlay}
        preload="metadata"
      />

      {/* File info */}
      {content.size && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
          <Clock className="w-3 h-3" />
          <span>
            {formatTime(duration)} • {(content.size / 1024).toFixed(1)} KB
          </span>
        </div>
      )}
    </div>
  );
}


