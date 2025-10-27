import { memo, useRef, useEffect, forwardRef } from 'react';
import { FocusReaderProps, TextSegment } from '../../types/text';
import { getTextDirection } from '../../utils/textUtils';
import { containsHebrew } from '../../utils/hebrewUtils';
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation';

const FocusReader = memo(({
  continuousText,
  isLoading,
  error,
  onSegmentClick,
  onNavigateToRef,
  fontSize = 'medium',
  lineHeight = 'normal'
}: FocusReaderProps) => {
  const focusRef = useRef<HTMLElement>(null);

  // Автоскролл к фокусу при изменении
  useEffect(() => {
    if (focusRef.current) {
      focusRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [continuousText?.focusIndex]);

  // Keyboard navigation
  useKeyboardNavigation(
    continuousText?.segments || [],
    continuousText?.focusIndex || 0,
    onNavigateToRef || (() => {})
  );

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center">
        <div className="text-red-500 mb-2">⚠️</div>
        <h3 className="text-lg font-medium mb-2">Error</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!continuousText) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center">
        <div className="text-muted-foreground">
          <div className="text-4xl mb-4">📖</div>
          <h3 className="text-lg font-medium mb-2">No text selected</h3>
          <p className="text-sm">Choose a text to start reading</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden">
        <ContinuousTextFlow
          segments={continuousText.segments}
          focusIndex={continuousText.focusIndex}
          onSegmentClick={onSegmentClick}
          fontSize={fontSize}
          lineHeight={lineHeight}
          focusRef={focusRef}
        />
      </div>
    </div>
  );
});

export default FocusReader;


const ContinuousTextFlow = memo(({
  segments,
  focusIndex,
  onSegmentClick,
  fontSize,
  lineHeight,
  focusRef
}: {
  segments: TextSegment[];
  focusIndex: number;
  onSegmentClick?: (segment: TextSegment) => void;
  fontSize: 'small' | 'medium' | 'large';
  lineHeight: 'compact' | 'normal' | 'relaxed';
  focusRef: React.RefObject<HTMLElement>;
}) => {
  const baseTextSize = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg'
  }[fontSize];

  const focusTextSize = {
    small: 'text-base',
    medium: 'text-lg',
    large: 'text-xl'
  }[fontSize];

  const lineHeightClass = {
    compact: 'leading-tight',
    normal: 'leading-relaxed',
    relaxed: 'leading-loose'
  }[lineHeight];

  return (
    <div className="h-full overflow-y-auto px-8 py-6 scroll-smooth">
      <article className={`max-w-4xl mx-auto ${lineHeightClass}`}>
        {segments.map((segment, index) => {
          const isFocus = index === focusIndex;
          const direction = getTextDirection(segment.text || segment.heText);

          return (
            <TextSegmentComponent
              key={segment.ref}
              segment={segment}
              isFocus={isFocus}
              baseTextSize={baseTextSize}
              focusTextSize={focusTextSize}
              direction={direction}
              onClick={() => onSegmentClick?.(segment)}
              ref={isFocus ? focusRef : undefined}
            />
          );
        })}
      </article>
    </div>
  );
});

const TextSegmentComponent = forwardRef<HTMLElement, {
  segment: TextSegment;
  isFocus: boolean;
  baseTextSize: string;
  focusTextSize: string;
  direction: 'ltr' | 'rtl';
  onClick: () => void;
}>(({
  segment,
  isFocus,
  baseTextSize,
  focusTextSize,
  direction,
  onClick
}, ref) => {
  const text = segment.text || segment.heText || '';
  const isHebrew = containsHebrew(text);

  return (
    <section
      ref={ref}
      className={`
        transition-all duration-500 ease-in-out cursor-pointer
        ${isFocus
          ? `${focusTextSize} opacity-100 my-4 px-4 py-6 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border-l-4 border-primary`
          : `${baseTextSize} opacity-70 hover:opacity-90 my-2 px-2 py-2 hover:bg-accent/20 rounded-md`
        }
        ${isHebrew ? 'font-hebrew' : ''}
      `}
      dir={direction}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-current={isFocus ? 'true' : undefined}
      aria-label={`Text segment: ${segment.ref}`}
    >
      {/* Метка референса - только для фокуса */}
      {isFocus && (
        <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
          <span className="font-mono bg-muted px-2 py-1 rounded">
            {segment.ref}
          </span>
          {segment.metadata && (
            <span className="opacity-60">
              {segment.metadata.chapter && `Chapter ${segment.metadata.chapter}`}
              {segment.metadata.verse && ` • Verse ${segment.metadata.verse}`}
            </span>
          )}
        </div>
      )}

      {/* Основной текст */}
      <div
        className={`
          whitespace-pre-wrap select-text
          ${direction === 'rtl' ? 'text-right' : 'text-left'}
          ${isHebrew ? 'font-feature-settings: "kern" 1, "liga" 1' : ''}
        `}
        style={{
          unicodeBidi: 'plaintext',
          wordBreak: isHebrew ? 'keep-all' : 'normal'
        }}
      >
        {text}
      </div>

      {/* Индикатор позиции для контекста */}
      {!isFocus && (
        <div className="mt-2 h-1 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary/30 transition-all duration-300"
            style={{ width: `${segment.position * 100}%` }}
          />
        </div>
      )}
    </section>
  );
});