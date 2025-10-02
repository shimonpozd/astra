import { memo, useRef, useEffect, forwardRef } from 'react';
import { FocusReaderProps, TextSegment } from '../../types/text';
import { getTextDirection } from '../../utils/textUtils';
import { containsHebrew } from '../../utils/hebrewUtils';
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation';
import { useTranslation } from '../../hooks/useTranslation';
import { Languages } from 'lucide-react';

const FocusReader = memo(({
  continuousText,
  isLoading,
  error,
  onSegmentClick,
  onNavigateToRef,
  onLexiconDoubleClick,
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
    <div className="h-full relative">
      {/* Overlay Navigation Buttons */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1">
        <button
          onClick={() => {
            const newIndex = Math.max(0, continuousText.focusIndex - 1);
            onNavigateToRef?.(continuousText.segments[newIndex].ref);
          }}
          disabled={continuousText.focusIndex <= 0}
          className="w-8 h-8 rounded-full bg-card/80 hover:bg-card border shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-sm"
          title="Previous segment (↑)"
        >
          ↑
        </button>
        <button
          onClick={() => {
            const newIndex = Math.min(continuousText.segments.length - 1, continuousText.focusIndex + 1);
            onNavigateToRef?.(continuousText.segments[newIndex].ref);
          }}
          disabled={continuousText.focusIndex >= continuousText.segments.length - 1}
          className="w-8 h-8 rounded-full bg-card/80 hover:bg-card border shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-sm"
          title="Next segment (↓)"
        >
          ↓
        </button>
      </div>

      {/* Text Content */}
      <div className="h-full overflow-hidden">
        <ContinuousTextFlow
          segments={continuousText.segments}
          focusIndex={continuousText.focusIndex}
          onSegmentClick={onSegmentClick}
          onNavigateToRef={onNavigateToRef}
          onLexiconDoubleClick={onLexiconDoubleClick}
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
  onNavigateToRef,
  onLexiconDoubleClick,
  fontSize,
  lineHeight,
  focusRef
}: {
  segments: TextSegment[];
  focusIndex: number;
  onSegmentClick?: (segment: TextSegment) => void;
  onNavigateToRef?: (ref: string) => void;
  onLexiconDoubleClick?: () => void;
  fontSize: 'small' | 'medium' | 'large';
  lineHeight: 'compact' | 'normal' | 'relaxed';
  focusRef: React.RefObject<HTMLElement>;
}) => {
  const baseTextSize = {
    small: 'text-lg',
    medium: 'text-xl',
    large: 'text-2xl'
  }[fontSize];

  const focusTextSize = {
    small: 'text-xl',
    medium: 'text-2xl',
    large: 'text-3xl'
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

          return (
            <TextSegmentComponent
              key={segment.ref}
              segment={segment}
              isFocus={isFocus}
              baseTextSize={baseTextSize}
              focusTextSize={focusTextSize}
              onClick={() => {
                console.log('Segment clicked:', segment.ref);
                onSegmentClick?.(segment);
                onNavigateToRef?.(segment.ref);
              }}
              onDoubleClick={onLexiconDoubleClick}
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
  onClick: () => void;
  onDoubleClick?: () => void;
}>(({
  segment,
  isFocus,
  baseTextSize,
  focusTextSize,
  onClick,
  onDoubleClick
}, ref) => {
  const { translatedText, isTranslating, translate } = useTranslation({
    tref: segment.ref,
  });

  const originalText = segment.heText || segment.text || '';

  const textToRender = translatedText || originalText;

  const isHebrew = translatedText ? false : containsHebrew(textToRender);
  const direction = translatedText ? 'ltr' : getTextDirection(textToRender);

  return (
    <section
      ref={ref}
      className={`
        transition-all duration-500 ease-in-out cursor-pointer relative select-text
        ${translatedText ? baseTextSize : focusTextSize}
        ${isFocus
          ? 'opacity-100 my-4 px-4 py-6 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border-l-4 border-primary shadow-sm'
          : 'opacity-70 hover:opacity-90 my-2 px-2 py-2 hover:bg-accent/20 rounded-md'
        }
        ${isHebrew ? 'font-serif text-hebrew' : 'font-serif'}
      `}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
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
          <div className="flex items-center gap-2">
            {isFocus && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  translate();
                }}
                disabled={isTranslating}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors disabled:opacity-50"
                title={translatedText ? "Show Original" : "Translate"}
              >
                <Languages className="w-3 h-3" />
                {isTranslating ? '...' : translatedText ? 'Original' : 'Translate'}
              </button>
            )}
            {segment.metadata && (
              <span className="opacity-60">
                {segment.metadata.chapter && `Chapter ${segment.metadata.chapter}`}
                {segment.metadata.verse && ` • Verse ${segment.metadata.verse}`}
              </span>
            )}
          </div>
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
        {textToRender}
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
