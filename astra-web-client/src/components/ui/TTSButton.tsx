import { Play, Pause, Square, Volume2, VolumeX } from 'lucide-react';
import { Button } from './button';
import { useTTS } from '../../hooks/useTTS';
import { useState } from 'react';

interface TTSButtonProps {
  text: string;
  voiceId?: string;
  language?: string;
  speed?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'ghost' | 'outline';
  className?: string;
  disabled?: boolean;
  showText?: boolean;
  autoPlay?: boolean;
}

export function TTSButton({
  text,
  voiceId,
  language,
  speed,
  size = 'sm',
  variant = 'ghost',
  className = '',
  disabled = false,
  showText = false,
  autoPlay = false,
}: TTSButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const {
    isPlaying,
    isPaused,
    currentText,
    isLoading,
    error,
    play,
    stop,
    pause,
    resume,
  } = useTTS({
    voiceId,
    language,
    speed,
    autoPlay,
  });

  const isCurrentText = currentText === text;
  const isActive = isCurrentText && (isPlaying || isPaused);

  const handleClick = async () => {
    if (disabled || isLoading) return;

    try {
      if (isActive) {
        if (isPlaying) {
          await pause();
        } else if (isPaused) {
          await resume();
        } else {
          await stop();
        }
      } else {
        // Stop any current playback first
        await stop();
        // Start new playback
        await play(text);
      }
    } catch (err) {
      console.error('TTS button error:', err);
    }
  };

  const getIcon = () => {
    if (isLoading) {
      return <VolumeX className="animate-pulse" />;
    }
    
    if (error) {
      return <VolumeX className="text-red-500" />;
    }
    
    if (isActive) {
      if (isPlaying) {
        return <Pause />;
      } else if (isPaused) {
        return <Play />;
      }
    }
    
    return <Play />;
  };

  const getButtonText = () => {
    if (isLoading) return 'Loading...';
    if (error) return 'Error';
    if (isActive) {
      if (isPlaying) return 'Pause';
      if (isPaused) return 'Resume';
    }
    return 'Play';
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'h-8 w-8 p-0';
      case 'md':
        return 'h-10 w-10 p-0';
      case 'lg':
        return 'h-12 w-12 p-0';
      default:
        return 'h-8 w-8 p-0';
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'sm':
        return 'h-4 w-4';
      case 'md':
        return 'h-5 w-5';
      case 'lg':
        return 'h-6 w-6';
      default:
        return 'h-4 w-4';
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={`
        ${getSizeClasses()}
        ${isActive ? 'bg-primary text-primary-foreground' : ''}
        ${isHovered ? 'scale-105' : ''}
        transition-all duration-200
        ${className}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={
        isActive
          ? isPlaying
            ? 'Pause audio'
            : isPaused
            ? 'Resume audio'
            : 'Stop audio'
          : 'Play audio'
      }
    >
      <div className="flex items-center gap-1">
        <span className={getIconSize()}>
          {getIcon()}
        </span>
        {showText && (
          <span className="text-xs">
            {getButtonText()}
          </span>
        )}
      </div>
    </Button>
  );
}

export default TTSButton;








