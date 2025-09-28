import React from 'react';
import { ReaderWindow } from '../types/study';

interface MiniTimelineProps {
  window: ReaderWindow;
  onJumpTo: (index: number) => void;
}

export function MiniTimeline({ window, onJumpTo }: MiniTimelineProps) {
  return (
    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 w-2 h-64 bg-muted/50 rounded-full overflow-hidden">
      {window.items.map((item, index) => (
        <div
          key={item.id}
          className={`w-full h-2 cursor-pointer transition-colors ${
            index === window.focusIndex
              ? 'bg-primary'
              : item.role === 'prev'
              ? 'bg-muted-foreground/30'
              : item.role === 'next'
              ? 'bg-muted-foreground/50'
              : 'bg-muted-foreground/70'
          }`}
          onClick={() => onJumpTo(index)}
          title={item.ref}
        />
      ))}
    </div>
  );
}