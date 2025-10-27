import React, { useState, useRef, useEffect } from 'react';
import { Volume2, Play, Pause, Download, MessageSquare, Zap } from 'lucide-react';
import { SimpleStreamingTTS } from '../SimpleStreamingTTS';
import { StreamingAudioMessage } from '../StreamingAudioMessage';
import { AudioTTSButton } from '../ui/AudioTTSButton';

interface AudioContextMenuProps {
  text: string;
  chatId?: string;
  isVisible: boolean;
  onClose: () => void;
  position: { x: number; y: number };
  className?: string;
}

export function AudioContextMenu({ 
  text, 
  chatId, 
  isVisible, 
  onClose, 
  position,
  className = '' 
}: AudioContextMenuProps) {
  const [selectedMode, setSelectedMode] = useState<'quick' | 'streaming' | 'message' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isVisible, onClose]);

  const handleModeSelect = (mode: 'quick' | 'streaming' | 'message') => {
    setSelectedMode(mode);
  };

  const handleAudioSaved = (message: any) => {
    console.log('Audio message saved:', message);
    onClose();
  };

  if (!isVisible) return null;

  return (
    <div
      ref={menuRef}
      className={`fixed z-50 bg-background border border-border rounded-lg shadow-lg p-4 min-w-80 ${className}`}
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%)'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Озвучить текст</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-muted rounded transition-colors"
          title="Закрыть"
        >
          ×
        </button>
      </div>

      {/* Text preview */}
      <div className="text-sm text-muted-foreground mb-3 p-2 bg-muted/50 rounded border-l-2 border-primary/20">
        {text.length > 100 ? `${text.substring(0, 100)}...` : text}
      </div>

      {!selectedMode ? (
        /* Mode selection */
        <div className="space-y-2">
          <button
            onClick={() => handleModeSelect('quick')}
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted rounded transition-colors"
          >
            <Zap className="w-4 h-4 text-yellow-500" />
            <div>
              <div className="font-medium">Быстрое воспроизведение</div>
              <div className="text-xs text-muted-foreground">Мгновенное воспроизведение без сохранения</div>
            </div>
          </button>

          <button
            onClick={() => handleModeSelect('streaming')}
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted rounded transition-colors"
          >
            <Play className="w-4 h-4 text-blue-500" />
            <div>
              <div className="font-medium">Стриминг + сохранение</div>
              <div className="text-xs text-muted-foreground">С контролем воспроизведения и возможностью сохранения</div>
            </div>
          </button>

          <button
            onClick={() => handleModeSelect('message')}
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted rounded transition-colors"
          >
            <MessageSquare className="w-4 h-4 text-green-500" />
            <div>
              <div className="font-medium">Сообщение в чат</div>
              <div className="text-xs text-muted-foreground">Создать аудио сообщение для переслушивания</div>
            </div>
          </button>
        </div>
      ) : (
        /* Audio component based on selected mode */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {selectedMode === 'quick' && 'Быстрое воспроизведение'}
              {selectedMode === 'streaming' && 'Стриминг с сохранением'}
              {selectedMode === 'message' && 'Создание аудио сообщения'}
            </span>
            <button
              onClick={() => setSelectedMode(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← Назад
            </button>
          </div>

          {selectedMode === 'quick' && (
            <SimpleStreamingTTS
              text={text}
              language="ru"
              voiceId="yandex-oksana"
              className="w-full"
            />
          )}

          {selectedMode === 'streaming' && (
            <StreamingAudioMessage
              text={text}
              chatId={chatId}
              language="ru"
              voiceId="yandex-oksana"
              onAudioSaved={handleAudioSaved}
            />
          )}

          {selectedMode === 'message' && (
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


