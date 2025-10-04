import { memo, useRef, useEffect, forwardRef, useState } from 'react';
import { FocusReaderProps, TextSegment } from '../../types/text';
import { getTextDirection } from '../../utils/textUtils';
import { containsHebrew } from '../../utils/hebrewUtils';
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation';
import { useTranslation } from '../../hooks/useTranslation';
import NavigationPanel from './NavigationPanel';
import { 
  Languages, 
  Settings,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

const FocusReader = memo(({
  continuousText,
  isLoading,
  error,
  onSegmentClick,
  onNavigateToRef,
  onLexiconDoubleClick,
  fontSize = 'medium',
  lineHeight = 'normal',
  // Navigation props
  onBack,
  onForward,
  onExit,
  currentRef,
  canBack = false,
  canForward = false
}: FocusReaderProps) => {
  const focusRef = useRef<HTMLElement>(null);
  
  // Состояние панелей
  const [showSettings, setShowSettings] = useState(false);
  const [globalTranslation, setGlobalTranslation] = useState(false);

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

  // Отладочная информация
  console.log('FocusReader render:', {
    hasContinuousText: !!continuousText,
    segmentsCount: continuousText?.segments?.length || 0,
    focusIndex: continuousText?.focusIndex,
    currentRef,
    canBack,
    canForward
  });

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Навигационная панель */}
      <div className="flex-shrink-0 border-b panel-outer">
        <div className="flex items-center gap-3 p-3">
          {/* Кнопки навигации - слева */}
          <div className="flex items-center gap-1">
            <button
              onClick={onBack}
              disabled={isLoading || !canBack}
              className="flex items-center justify-center w-6 h-6 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
              title="Вверх"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              onClick={onForward}
              disabled={isLoading || !canForward}
              className="flex items-center justify-center w-6 h-6 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
              title="Вниз"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          
          {/* NavigationPanel - в центре */}
          <div className="flex-1">
            <NavigationPanel 
              currentRef={currentRef}
              onNavigate={onNavigateToRef || (() => {})}
            />
          </div>
          
          {/* Остальные кнопки - справа */}
          <div className="flex items-center gap-1">
            {/* Кнопка перевода */}
            <button
              onClick={() => setGlobalTranslation(!globalTranslation)}
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors text-xs ${
                globalTranslation 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }`}
              title={globalTranslation ? "Показать оригинал" : "Перевести"}
            >
              <Languages className="w-3 h-3" />
            </button>
            
            {/* Кнопка настроек */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors text-xs ${
                showSettings 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }`}
              title="Настройки"
            >
              <Settings className="w-3 h-3" />
            </button>
            
            {/* Кнопка выхода */}
            <button
              onClick={onExit}
              disabled={isLoading}
              className="flex items-center gap-1 px-2 py-1 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded transition-colors disabled:opacity-50 text-xs"
              title="Выход"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* Основной контент */}
      <div className="flex-1 flex overflow-hidden">
        {/* Текст */}
        <div className="flex-1 relative overflow-hidden">
          <ContinuousTextFlow
            segments={continuousText.segments}
            focusIndex={continuousText.focusIndex}
            onSegmentClick={onSegmentClick}
            onNavigateToRef={onNavigateToRef}
            onLexiconDoubleClick={onLexiconDoubleClick}
            fontSize={fontSize}
            lineHeight={lineHeight}
            focusRef={focusRef}
            globalTranslation={globalTranslation}
          />
        </div>
        
        {/* Панель настроек */}
        {showSettings && (
          <div className="w-64 border-l panel-outer bg-background">
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Настройки
              </h3>
            </div>
            <div className="p-4 space-y-4">
              {/* Размер шрифта */}
              <div>
                <label className="text-sm font-medium mb-2 block">Размер шрифта</label>
                <div className="flex items-center gap-2">
                  <button className="p-1 hover:bg-muted rounded">
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-sm px-2 py-1 bg-muted rounded">{fontSize}</span>
                  <button className="p-1 hover:bg-muted rounded">
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {/* Межстрочный интервал */}
              <div>
                <label className="text-sm font-medium mb-2 block">Интервал</label>
                <div className="flex items-center gap-2">
                  <button className="p-1 hover:bg-muted rounded">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <span className="text-sm px-2 py-1 bg-muted rounded">{lineHeight}</span>
                  <button className="p-1 hover:bg-muted rounded">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {/* Сброс */}
              <button className="w-full flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors">
                <RotateCcw className="w-4 h-4" />
                <span className="text-sm">Сбросить</span>
              </button>
            </div>
          </div>
        )}
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
  focusRef,
  globalTranslation = false
}: {
  segments: TextSegment[];
  focusIndex: number;
  onSegmentClick?: (segment: TextSegment) => void;
  onNavigateToRef?: (ref: string) => void;
  onLexiconDoubleClick?: () => void;
  fontSize: 'small' | 'medium' | 'large';
  lineHeight: 'compact' | 'normal' | 'relaxed';
  focusRef: React.RefObject<HTMLElement>;
  globalTranslation?: boolean;
}) => {
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

  // Отладочная информация
  console.log('ContinuousTextFlow render:', {
    segmentsCount: segments.length,
    focusIndex,
    firstSegment: segments[0] ? {
      ref: segments[0].ref,
      text: segments[0].text?.substring(0, 50) + '...',
      heText: segments[0].heText?.substring(0, 50) + '...'
    } : null
  });

  return (
    <div className="h-full overflow-y-auto px-8 py-6 scroll-smooth panel-inner">
      <article className={`max-w-4xl mx-auto ${lineHeightClass}`}>
        {segments.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p>Нет сегментов для отображения</p>
            <p className="text-xs mt-2 text-muted-foreground/70">Segments count: {segments.length}</p>
          </div>
        ) : (
          segments.map((segment, index) => {
          const isFocus = index === focusIndex;

          return (
            <TextSegmentComponent
              key={segment.ref}
              segment={segment}
              isFocus={isFocus}
              focusTextSize={focusTextSize}
              globalTranslation={globalTranslation}
              onClick={() => {
                console.log('Segment clicked:', segment.ref);
                onSegmentClick?.(segment);
                onNavigateToRef?.(segment.ref);
              }}
              onDoubleClick={onLexiconDoubleClick}
              ref={isFocus ? focusRef : undefined}
            />
          );
        })
        )}
      </article>
    </div>
  );
});

const TextSegmentComponent = forwardRef<HTMLElement, {
  segment: TextSegment;
  isFocus: boolean;
  focusTextSize: string;
  globalTranslation: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}>(({
  segment,
  isFocus,
  focusTextSize,
  globalTranslation,
  onClick,
  onDoubleClick
}, ref) => {
  const { translatedText, translate, isTranslating } = useTranslation({
    tref: segment.ref
  });

  // Автоматически запускаем перевод только для фокусного сегмента
  useEffect(() => {
    if (globalTranslation && isFocus && !translatedText && !isTranslating) {
      console.log('[FocusReader] Starting translation for focus segment:', segment.ref);
      translate();
    }
  }, [globalTranslation, isFocus, translatedText, isTranslating, translate, segment.ref]);

  const originalText = segment.heText || '';
  const textToRender = globalTranslation && translatedText ? translatedText : originalText;
  const isHebrew = globalTranslation && translatedText ? false : containsHebrew(textToRender);
  const direction = globalTranslation && translatedText ? 'ltr' : getTextDirection(textToRender);
  
  // Убираем индикатор загрузки - просто показываем оригинал пока перевод не готов

  return (
    <section
      ref={ref}
      className={`
        transition-all duration-500 ease-in-out cursor-pointer relative
        ${focusTextSize}
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
      {/* Метаданные сегмента - только для фокуса */}
      {isFocus && segment.metadata && (
        <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
          {segment.metadata.chapter && (
            <span className="bg-muted px-2 py-1 rounded text-xs">
              Глава {segment.metadata.chapter}
            </span>
          )}
          {segment.metadata.verse && (
            <span className="bg-muted px-2 py-1 rounded text-xs">
              Стих {segment.metadata.verse}
            </span>
          )}
        </div>
      )}

      {/* Основной текст */}
      <div
        className={`
            whitespace-pre-wrap select-text leading-relaxed
            ${direction === 'rtl' ? 'text-right' : 'text-left'}
            ${isHebrew ? 'font-feature-settings: "kern" 1, "liga" 1' : ''}
            ${isFocus ? 'text-foreground' : 'text-muted-foreground'}
          `}
        style={{
          unicodeBidi: 'plaintext',
          wordBreak: isHebrew ? 'keep-all' : 'normal',
          lineHeight: isFocus ? '1.8' : '1.6'
        }}
      >
        {textToRender}
      </div>

    </section>
  );
});