import React, { useState } from 'react';
import { Volume2, Loader2, Check, X } from 'lucide-react';
import { useAudioTTS } from '../../hooks/useAudioTTS';
import type { AudioMessage } from '../../types/text';

interface AudioTTSButtonProps {
  text: string;
  chatId?: string;
  voiceId?: string;
  language?: string;
  speed?: number;
  onAudioGenerated?: (audioMessage: AudioMessage) => void;
  onAudioSaved?: (audioMessage: AudioMessage) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outline' | 'ghost';
  disabled?: boolean;
}

export function AudioTTSButton({
  text,
  chatId,
  voiceId,
  language,
  speed,
  onAudioGenerated,
  onAudioSaved,
  className = '',
  size = 'md',
  variant = 'default',
  disabled = false,
}: AudioTTSButtonProps) {
  const [audioMessage, setAudioMessage] = useState<AudioMessage | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  
  const {
    isGenerating,
    error,
    generateAudioMessage,
    saveAudioMessage,
  } = useAudioTTS({
    voiceId,
    language,
    speed,
  });

  const handleGenerateAudio = async () => {
    try {
      const message = await generateAudioMessage(text, {
        voiceId,
        language,
        speed,
      });
      
      setAudioMessage(message);
      onAudioGenerated?.(message);
      
      // Auto-save if chatId is provided
      if (chatId) {
        await saveAudioMessage(message, chatId);
        setIsSaved(true);
        onAudioSaved?.(message);
      }
    } catch (err) {
      console.error('Failed to generate audio:', err);
    }
  };

  const handleSaveAudio = async () => {
    if (!audioMessage || !chatId) return;
    
    try {
      await saveAudioMessage(audioMessage, chatId);
      setIsSaved(true);
      onAudioSaved?.(audioMessage);
    } catch (err) {
      console.error('Failed to save audio:', err);
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'h-8 px-3 text-sm';
      case 'md':
        return 'h-10 px-4';
      case 'lg':
        return 'h-12 px-6 text-lg';
      default:
        return 'h-10 px-4';
    }
  };

  const getVariantClasses = () => {
    switch (variant) {
      case 'default':
        return 'bg-primary text-primary-foreground hover:bg-primary/90';
      case 'outline':
        return 'border border-input bg-background hover:bg-accent hover:text-accent-foreground';
      case 'ghost':
        return 'hover:bg-accent hover:text-accent-foreground';
      default:
        return 'bg-primary text-primary-foreground hover:bg-primary/90';
    }
  };

  const getIcon = () => {
    if (isGenerating) {
      return <Loader2 className="w-4 h-4 animate-spin" />;
    }
    
    if (error) {
      return <X className="w-4 h-4 text-red-500" />;
    }
    
    if (audioMessage) {
      if (isSaved) {
        return <Check className="w-4 h-4 text-green-500" />;
      }
      return <Volume2 className="w-4 h-4" />;
    }
    
    return <Volume2 className="w-4 h-4" />;
  };

  const getButtonText = () => {
    if (isGenerating) return 'Генерирую...';
    if (error) return 'Ошибка';
    if (audioMessage) {
      if (isSaved) return 'Сохранено';
      return 'Сохранить';
    }
    return 'Озвучить';
  };

  const isButtonDisabled = disabled || isGenerating || (audioMessage && isSaved);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleGenerateAudio}
        disabled={isButtonDisabled}
        className={`
          inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
          disabled:pointer-events-none disabled:opacity-50
          ${getSizeClasses()} ${getVariantClasses()} ${className}
        `}
        title={error ? `Ошибка: ${error}` : 'Создать аудио сообщение'}
      >
        {getIcon()}
        <span>{getButtonText()}</span>
      </button>

      {audioMessage && !isSaved && chatId && (
        <button
          onClick={handleSaveAudio}
          disabled={isGenerating}
          className="inline-flex items-center justify-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          title="Сохранить в чат"
        >
          <Check className="w-3 h-3" />
          Сохранить
        </button>
      )}

      {error && (
        <div className="text-xs text-red-500 max-w-xs">
          {error}
        </div>
      )}
    </div>
  );
}


