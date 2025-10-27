import React, { useState } from 'react';
import { Volume2, X } from 'lucide-react';
import { AudioRequestPanel } from './AudioRequestPanel';

interface AudioRequestButtonProps {
  text: string;
  chatId?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outline' | 'ghost';
}

export function AudioRequestButton({ 
  text, 
  chatId,
  className = '',
  size = 'md',
  variant = 'outline'
}: AudioRequestButtonProps) {
  const [showPanel, setShowPanel] = useState(false);

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
        return 'border border-input bg-background hover:bg-accent hover:text-accent-foreground';
    }
  };

  const handleClose = () => {
    setShowPanel(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className={`
          inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
          disabled:pointer-events-none disabled:opacity-50
          ${getSizeClasses()} ${getVariantClasses()} ${className}
        `}
        title="Озвучить текст"
      >
        <Volume2 className="w-4 h-4" />
        <span>Озвучить</span>
      </button>

      {/* Audio panel */}
      {showPanel && (
        <div className="absolute top-full right-0 mt-2 w-96 z-50">
          <AudioRequestPanel
            text={text}
            chatId={chatId}
            onClose={handleClose}
          />
        </div>
      )}
    </div>
  );
}


