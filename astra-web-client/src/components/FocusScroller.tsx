import React, { useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { ReaderWindow } from '../types/study';
import { ContextChunk } from './ContextChunk';

interface FocusScrollerProps {
  window: ReaderWindow;
  onSelect: (ref: string) => void;
  onNeedPrev: (count: number) => void;
  onNeedNext: (count: number) => void;
  onFocusChange: (ref: string) => void;
  onLexiconDoubleClick?: (e: React.MouseEvent) => void;
}

export function FocusScroller({
  window,
  onSelect,
  onNeedPrev,
  onNeedNext,
  onFocusChange,
  onLexiconDoubleClick
}: FocusScrollerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Center focus on change
    if (window.items[window.focusIndex]) {
      const el = containerRef.current?.querySelector(`[data-id="${window.items[window.focusIndex].id}"]`) as HTMLElement;
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }, [window.focusIndex, window.items]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto scroll-smooth"
    >
      <div className="space-y-4 p-4">
        {window.items.map((item, index) => {
          const isFocus = index === window.focusIndex;
          return (
            <div
              key={item.id}
              data-id={item.id}
              className={clsx(
                'snap-center',
                isFocus && 'ring-1 ring-primary/30 bg-background rounded-lg shadow p-4'
              )}
            >
              <ContextChunk
                item={item}
                collapsed={!isFocus && item.text.length > 800}
                onClick={() => onSelect(item.ref)}
                onDoubleClick={onLexiconDoubleClick}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}