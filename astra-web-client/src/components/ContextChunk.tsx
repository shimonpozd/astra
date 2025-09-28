import React from 'react';
import { ReaderItem } from '../types/study';

interface ContextChunkProps {
  item: ReaderItem;
  collapsed?: boolean;
  onClick?: () => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
}

export function ContextChunk({ item, collapsed = false, onClick, onDoubleClick }: ContextChunkProps) {
  const containsHebrew = (t?: string) => !!t && /[\u0590-\u05FF]/.test(t);
  const hebrewClass = 'hebrew-text';
  const hebrewMuted = 'hebrew-muted';

  const displayText = collapsed && item.text.length > 800 ? item.preview || item.text.slice(0, 200) + '...' : item.text;

  return (
    <div
      className={`px-6 py-3 select-text ${containsHebrew(displayText) ? hebrewClass : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{ textAlign: 'justify' }}
    >
      {item.commentator && (
        <div className="text-xs text-muted-foreground mb-1">{item.commentator}</div>
      )}
      <div className="text-base leading-7">
        {displayText}
      </div>
      {collapsed && item.text.length > 800 && (
        <div className="text-xs text-muted-foreground mt-1">Нажмите для развертывания</div>
      )}
    </div>
  );
}