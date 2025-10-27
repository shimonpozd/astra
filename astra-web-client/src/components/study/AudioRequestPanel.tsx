import React, { useState } from 'react';
import { Volume2, Play, Pause, Download, X } from 'lucide-react';
import { SimpleStreamingTTS } from '../SimpleStreamingTTS';
import { StreamingAudioMessage } from '../StreamingAudioMessage';
import { AudioTTSButton } from '../ui/AudioTTSButton';

interface AudioRequestPanelProps {
  text: string;
  chatId?: string;
  onClose?: () => void;
  className?: string;
}

export function AudioRequestPanel({ 
  text, 
  chatId, 
  onClose,
  className = '' 
}: AudioRequestPanelProps) {
  const [audioMode, setAudioMode] = useState<'simple' | 'streaming' | 'message'>('simple');
  const [isExpanded, setIsExpanded] = useState(false);

  const handleModeChange = (mode: 'simple' | 'streaming' | 'message') => {
    setAudioMode(mode);
    setIsExpanded(true);
  };

  const handleAudioSaved = (message: any) => {
    console.log('Audio message saved:', message);
    // TODO: Add to chat messages
  };

  return (
    <div className={`audio-request-panel border border-border/50 rounded-lg p-4 bg-muted/30 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Озвучить текст</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded transition-colors"
            title="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Text preview */}
      <div className="text-sm text-muted-foreground mb-3 p-2 bg-muted/50 rounded border-l-2 border-primary/20">
        {text.length > 100 ? `${text.substring(0, 100)}...` : text}
      </div>

      {/* Mode selection */}
      {!isExpanded && (
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => handleModeChange('simple')}
            className="flex-1 px-3 py-2 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
          >
            Быстрое воспроизведение
          </button>
          <button
            onClick={() => handleModeChange('streaming')}
            className="flex-1 px-3 py-2 text-xs bg-muted hover:bg-muted/80 rounded transition-colors"
          >
            Стриминг + сохранение
          </button>
          <button
            onClick={() => handleModeChange('message')}
            className="flex-1 px-3 py-2 text-xs bg-muted hover:bg-muted/80 rounded transition-colors"
          >
            Сообщение в чат
          </button>
        </div>
      )}

      {/* Audio components */}
      {isExpanded && (
        <div className="space-y-3">
          {/* Mode indicator */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {audioMode === 'simple' && 'Быстрое воспроизведение'}
              {audioMode === 'streaming' && 'Стриминг с сохранением'}
              {audioMode === 'message' && 'Создание аудио сообщения'}
            </span>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Свернуть
            </button>
          </div>

          {/* Audio component based on mode */}
          {audioMode === 'simple' && (
            <SimpleStreamingTTS
              text={text}
              language="ru"
              voiceId="yandex-oksana"
              className="w-full"
            />
          )}

          {audioMode === 'streaming' && (
            <StreamingAudioMessage
              text={text}
              chatId={chatId}
              language="ru"
              voiceId="yandex-oksana"
              onAudioSaved={handleAudioSaved}
            />
          )}

          {audioMode === 'message' && (
            <div className="space-y-2">
              <AudioTTSButton
                text={text}
                chatId={chatId}
                voiceId="yandex-oksana"
                language="ru"
                size="sm"
                variant="outline"
                className="w-full"
                onAudioGenerated={handleAudioSaved}
                onAudioSaved={handleAudioSaved}
              />
              <p className="text-xs text-muted-foreground">
                Создаст аудио сообщение в чате для переслушивания
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


