import { useState, memo, useMemo, useEffect, useRef } from "react";
import { BookOpen, ChevronDown, ChevronUp, Languages } from "lucide-react";
import { containsHebrew } from "../../utils/hebrewUtils";
import { useTranslation } from "../../hooks/useTranslation";
// Note: Tooltip import would be added if using shadcn/ui

// Типы
interface WorkbenchItem {
  ref: string;
  title?: string;
  heTitle?: string;
  commentator?: string;
  heCommentator?: string;
  category?: string;
  heCategory?: string;
  preview?: string;
  hePreview?: string;
  text_full?: string;
  heTextFull?: string;
  language?: 'hebrew' | 'english' | 'aramaic' | 'mixed';
  // Новые поля из Bookshelf v2
  heRef?: string;
  indexTitle?: string;
  score?: number;
}

interface WorkbenchPanelProps {
  title: string;
  item: WorkbenchItem | null;
  active: boolean;
  onDropRef: (ref: string) => void;
  onClick: () => void;
  className?: string;
  size?: 'compact' | 'normal' | 'expanded';
  hebrewScale?: number;           // default 1.35
  hebrewLineHeight?: 'compact' | 'normal' | 'relaxed'; // default 'relaxed'
  headerVariant?: 'hidden' | 'mini' | 'default'; // default 'mini'
  maxWidth?: 'narrow' | 'normal' | 'wide'; // default 'normal'
}

// Утилиты
const isDragDataValid = (dataTransfer: DataTransfer): boolean => {
  return dataTransfer.types.includes('text/astra-commentator-ref') ||
         dataTransfer.types.includes('text/plain');
};

const extractRefFromTransfer = (dataTransfer: DataTransfer): string | null => {
  return dataTransfer.getData('text/astra-commentator-ref') ||
         dataTransfer.getData('text/plain') ||
         null;
};

const getTextDirection = (text?: string): 'ltr' | 'rtl' => {
  if (!text) return 'ltr';
  return containsHebrew(text.slice(0, 50)) ? 'rtl' : 'ltr';
};

// Компоненты
const WorkbenchContainer = memo(({
  children,
  isOver,
  active,
  onDragHandlers,
  onClick,
  className
}: {
  children: React.ReactNode;
  isOver: boolean;
  active: boolean;
  onDragHandlers: any;
  onClick: () => void;
  className: string;
}) => {
  const stateClasses = useMemo(() => {
    if (isOver) return 'border-primary bg-primary/5 scale-[1.01] shadow-lg';
    if (active) return 'border-primary/60 bg-primary/8 shadow-md';
    return 'border-border/60 bg-card/60 hover:bg-card/80 hover:border-border/40';
  }, [isOver, active]);

  return (
    <div
      className={`
        h-full flex flex-col rounded-xl border transition-all duration-300 ease-in-out
        ${stateClasses} ${className}
      `}
      {...onDragHandlers}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="Workbench panel"
    >
      {children}
    </div>
  );
});

const WorkbenchHeader = memo(({
  item,
  isExpanded,
  onToggleExpanded,
  active,
  headerVariant
}: {
  item: WorkbenchItem;
  isExpanded: boolean;
  onToggleExpanded: (e: React.MouseEvent) => void;
  active: boolean;
  headerVariant: 'hidden' | 'mini' | 'default';
}) => {
  if (headerVariant === 'hidden') {
    return null;
  }

  const displayTitle = item.commentator || item.indexTitle || item.title || 'Источник';

  return (
    <header className="flex-shrink-0 flex items-center justify-between px-2 py-2 border-b border-border/20">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onToggleExpanded}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title={isExpanded ? "Свернуть" : "Развернуть"}
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        <div className="min-w-0">
          {headerVariant === 'mini' ? (
            // Мини-режим: только ref мелким шрифтом
            <div className="text-xs font-mono text-muted-foreground truncate max-w-[220px]">
              {item.ref}
            </div>
          ) : (
            // Дефолтный режим: полная информация с даунскейлом
            <>
              <div className="text-sm font-medium truncate max-w-[240px]">
                {displayTitle}
              </div>
              <div className="text-xs font-mono text-muted-foreground truncate max-w-[220px]">
                {item.ref}
              </div>
              {active && (
                <div className="text-xs text-muted-foreground">
                  Активная панель
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
});

const WorkbenchContent = memo(({
  item,
  sizeConfig,
  size,
  active,
  hebrewScale,
  hebrewLineHeight,
  maxWidth
}: {
  item: WorkbenchItem;
  sizeConfig: { minHeight: string; baseTextSize: string };
  size: 'compact' | 'normal' | 'expanded';
  active: boolean;
  hebrewScale: number;
  hebrewLineHeight: 'compact' | 'normal' | 'relaxed';
  maxWidth: 'narrow' | 'normal' | 'wide';
}) => {
  const articleRef = useRef<HTMLElement>(null);

  // Автоцентрирование при активации
  useEffect(() => {
    if (active && articleRef.current) {
      articleRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [active]);

  // Поддержка как старого, так и нового формата данных
  const displayText = item.preview || item.hePreview || '';
  const fullText = item.heTextFull || item.text_full || displayText;

  const { translatedText, isTranslating, error, translate } = useTranslation({
    hebrewText: item.heTextFull || '',
    englishText: item.text_full || '',
  });

  const textToDisplay = translatedText || fullText;

  // Определяем язык и направление на основе полного текста
  const textForDetection = textToDisplay;
  const direction = translatedText ? 'ltr' : getTextDirection(textForDetection); // Translations are left-to-right
  const isHebrew = translatedText ? false : containsHebrew(textForDetection); // Translations are not Hebrew

  // Вычисление итоговых классов типографики
  const baseLatin = sizeConfig.baseTextSize; // text-lg, text-xl, text-2xl

  // Жёсткий минимум для иврита
  const minHebrew = size === 'compact' ? 'text-2xl'
                  : size === 'normal'  ? 'text-3xl'
                  :                      'text-4xl';

  // Дополнительный масштаб поверх минимума
  const heScale = Math.max(1.0, hebrewScale ?? 1.35);
  const heScaleClass = isHebrew
    ? heScale >= 2.1 ? 'text-5xl'
    : heScale >= 1.7 ? 'text-4xl'
    : heScale >= 1.4 ? 'text-3xl'
    :                 minHebrew
    : baseLatin;

  // Межстрочный интервал для иврита
  const lineHeightClass = isHebrew
    ? (hebrewLineHeight === 'compact' ? 'leading-relaxed' : hebrewLineHeight === 'normal' ? 'leading-loose' : 'leading-[1.9]')
    : 'leading-relaxed';

  // Ширина колонки
  const maxWClass = maxWidth === 'narrow' ? 'max-w-2xl' : maxWidth === 'wide' ? 'max-w-4xl' : 'max-w-3xl';

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 scroll-smooth scrollbar-thin scrollbar-thumb-muted/50 hover:scrollbar-thumb-muted">
      <article
        ref={articleRef}
        className={`${maxWClass} mx-auto ${lineHeightClass} transition-all duration-500`}
        dir={direction}
        aria-current={active ? 'true' : undefined}
      >
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={translate}
            disabled={isTranslating}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors disabled:opacity-50"
            title={translatedText ? "Show Original" : "Translate"}
          >
            <Languages className="w-3 h-3" />
            {isTranslating ? '...' : translatedText ? 'Original' : 'Translate'}
          </button>
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
        <div className={`
          ${heScaleClass}
          ${direction === 'rtl' ? 'text-right font-hebrew' : 'text-left'}
          rounded-md
        `}>
          {textToDisplay || 'Комментарий не загружен.'}
        </div>
      </article>
    </div>
  );
});

const EmptyWorkbenchPanel = memo(({
  title,
  onDrop
}: {
  title: string;
  onDrop: (ref: string) => void;
}) => {
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      className={`
        h-full flex flex-col items-center justify-center rounded-xl border-2 border-dashed
        transition-all duration-300 text-muted-foreground/60
        ${isOver
          ? 'border-primary bg-primary/5 text-primary/70'
          : 'border-border/40 bg-card/20 hover:border-border/60'
        }
      `}
      onDragOver={(e) => {
        if (isDragDataValid(e.dataTransfer)) {
          e.preventDefault();
          setIsOver(true);
        }
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const ref = extractRefFromTransfer(e.dataTransfer);
        if (ref) onDrop(ref);
      }}
    >
      <div className="w-16 h-16 rounded-full border border-current/20 flex items-center justify-center mb-4">
        <BookOpen className="w-8 h-8" />
      </div>

      <h3 className="font-medium mb-2">{title}</h3>

      <p className="text-sm text-center max-w-32 leading-relaxed">
        Перетащите источник или комментарий сюда
      </p>

      {isOver && (
        <div className="absolute inset-2 rounded-lg border-2 border-primary/50 pointer-events-none" />
      )}
    </div>
  );
});

const WorkbenchPanelInline = memo(({
  title,
  item,
  active,
  onDropRef,
  onClick,
  size = 'normal',
  hebrewScale = 1.35,
  hebrewLineHeight = 'relaxed',
  headerVariant = 'mini',
  maxWidth = 'normal'
}: WorkbenchPanelProps) => {
  const [isOver, setIsOver] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Размеры для разных режимов - только каркас панели
  const sizeConfig = {
    compact: {
      minHeight: 'min-h-[220px]',
      baseTextSize: 'text-lg' // для латиницы/английского
    },
    normal: {
      minHeight: 'min-h-[320px]',
      baseTextSize: 'text-xl'
    },
    expanded: {
      minHeight: 'min-h-[460px]',
      baseTextSize: 'text-2xl'
    }
  }[size];

  const handleToggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  if (!item) {
    return <EmptyWorkbenchPanel title={title} onDrop={onDropRef} />;
  }

  return (
    <WorkbenchContainer
      isOver={isOver}
      active={active}
      onDragHandlers={{
        onDragOver: (e: React.DragEvent) => {
          if (isDragDataValid(e.dataTransfer)) {
            e.preventDefault();
            setIsOver(true);
          }
        },
        onDragLeave: () => setIsOver(false),
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          setIsOver(false);
          const ref = extractRefFromTransfer(e.dataTransfer);
          if (ref) onDropRef(ref);
        }
      }}
      onClick={onClick}
      className={sizeConfig.minHeight}
    >
      <WorkbenchHeader
        item={item}
        isExpanded={isExpanded}
        onToggleExpanded={handleToggleExpanded}
        active={active}
        headerVariant={headerVariant}
      />

      <WorkbenchContent
        item={item}
        sizeConfig={sizeConfig}
        size={size}
        active={active}
        hebrewScale={hebrewScale}
        hebrewLineHeight={hebrewLineHeight}
        maxWidth={maxWidth}
      />
    </WorkbenchContainer>
  );
});

export default WorkbenchPanelInline;
