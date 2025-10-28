import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Compass, Languages, Loader2, Play, Pause, Settings, X } from 'lucide-react';

import { FocusReaderProps, TextSegment } from '../../types/text';
import { normalizeRefForAPI, parseRefSmart } from '../../utils/refUtils';
import ContinuousTextFlow from './ContinuousTextFlow';
import FocusNavOverlay from './nav/FocusNavOverlay';
import { useTranslation } from '../../hooks/useTranslation';
import { useSpeechify } from '../../hooks/useSpeechify';
import { useTTS } from '../../hooks/useTTS';
// import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation';

const FONT_SIZE_VALUES: Record<string, string> = {
  small: '0.95rem',
  medium: '1.05rem',
  large: '1.15rem',
};

const FOCUS_READER_SETTINGS_KEY = 'focus-reader-font-settings';

function formatDisplayRef(ref?: string | null): string {
  if (!ref) return '—';
  const dotMatch = ref.match(/^(?<book>.+?)\s+(?<chapter>\d+)\.(?<verse>\d+)$/);
  if (dotMatch?.groups) {
    return `${dotMatch.groups.book} ${dotMatch.groups.chapter}:${dotMatch.groups.verse}`;
  }
  const parsed = parseRefSmart(ref);
  if (parsed?.type === 'tanakh') {
    if (parsed.chapter != null && parsed.verse != null) {
      return `${parsed.book} ${parsed.chapter}:${parsed.verse}`;
    }
    if (parsed.chapter != null) {
      return `${parsed.book} ${parsed.chapter}`;
    }
    return parsed.book;
  }
  if (parsed?.type === 'talmud' && parsed.daf != null) {
    const amud = parsed.amud ?? 'a';
    if (parsed.segment != null) {
      return `${parsed.book} ${parsed.daf}${amud}:${parsed.segment}`;
    }
    return `${parsed.book} ${parsed.daf}${amud}`;
  }
  return normalizeRefForAPI(ref);
}

const FocusReader = memo(({
  continuousText,
  isLoading,
  error,
  onSegmentClick,
  onNavigateToRef,
  onLexiconDoubleClick,
  onBack,
  onForward,
  onExit,
  currentRef,
  canBack = false,
  canForward = false,
}: FocusReaderProps) => {
  const focusRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const navOriginRef = useRef<'user' | 'data'>('data');
  const scrollLockRef = useRef(false);
  const scrollLockTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [stableTranslatedText, setStableTranslatedText] = useState('');
  const [readerFontSize, setReaderFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [hebrewScale, setHebrewScale] = useState(1.2);
  const [translationScale, setTranslationScale] = useState(1.2);
  const [activeTTSRef, setActiveTTSRef] = useState<string | null>(null);

  const activeSegment = useMemo(() => {
    const index = continuousText?.focusIndex ?? 0;
    return continuousText?.segments?.[index];
  }, [continuousText]);

  const activeSegmentRef = activeSegment?.ref ?? null;
  const hebrewText = activeSegment?.heText || '';
  const englishText = activeSegment?.text || '';

  const { translatedText, isTranslating, translate, clear } = useTranslation({
    tref: activeSegment?.ref || '',
  });

  // Стабилизируем переведенный текст
  useEffect(() => {
    if (translatedText && translatedText.trim()) {
      setStableTranslatedText(translatedText);
    }
  }, [translatedText]);

  // Очищаем стабильный текст при смене сегмента
  useEffect(() => {
    setStableTranslatedText('');
  }, [activeSegment?.ref]);

  const { speechify, isLoading: isSpeechifying } = useSpeechify();

  const {
    isPlaying: ttsIsPlaying,
    isPaused,
    play,
    stop,
    pause: pauseTTS,
    resume,
    isLoading: ttsIsLoading,
  } = useTTS({
    language: 'ru',
    speed: 1.0,
  });

  const hasHebrew = useMemo(() => hebrewText.trim().length > 0, [hebrewText]);
  const hasEnglish = useMemo(() => englishText.trim().length > 0, [englishText]);

  const sanitizeText = useCallback((value: string) => {
    return value
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  const sanitizedHebrew = useMemo(() => sanitizeText(hebrewText), [hebrewText, sanitizeText]);
  const sanitizedEnglish = useMemo(() => sanitizeText(englishText), [englishText, sanitizeText]);

  const isActiveTTS = activeTTSRef === activeSegmentRef && (ttsIsPlaying || isPaused);
  const isPlaybackLoading = isSpeechifying || ttsIsLoading;
  const isCurrentSegmentPlaying = isActiveTTS && ttsIsPlaying;

  const setScrollLock = useCallback(() => {
    scrollLockRef.current = true;
    if (scrollLockTimeoutRef.current) {
      clearTimeout(scrollLockTimeoutRef.current);
    }
    scrollLockTimeoutRef.current = setTimeout(() => {
      scrollLockRef.current = false;
    }, 1500);
  }, []);

  useEffect(() => {
    if (focusRef.current && !scrollLockRef.current) {
    focusRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
    });
    }
  }, [continuousText?.focusIndex]);

  useEffect(() => {
    clear();
    stop().catch(() => {});
    setActiveTTSRef(null);
  }, [activeSegmentRef, clear, stop]);

  // Убираем автоматический перевод - пользователь сам нажимает кнопку
  // useEffect(() => {
  //   if (showTranslation && activeSegment && !translatedText && !isTranslating) {
  //     translate().catch(() => {});
  //   }
  // }, [showTranslation, activeSegment, translatedText, isTranslating, translate]);

  useEffect(() => {
    return () => {
      if (scrollLockTimeoutRef.current) {
        clearTimeout(scrollLockTimeoutRef.current);
      }
      stop().catch(() => {});
      setActiveTTSRef(null);
    };
  }, [stop]);

  const handlePlayClick = useCallback(async () => {
    if (!hasHebrew && !hasEnglish) {
      return;
    }

    try {
      if (isActiveTTS) {
        if (ttsIsPlaying) {
          await pauseTTS();
        } else if (isPaused) {
          await resume();
        } else {
          await stop();
          setActiveTTSRef(null);
        }
        return;
      }

      await stop();
      setActiveTTSRef(null);

      let textToSpeak = '';
      let playbackLanguage: 'ru' | 'en' = 'ru';

      try {
        const response = await speechify({
          hebrewText: sanitizeText(hebrewText),
          englishText: sanitizeText(englishText),
        });
        const trimmed = typeof response === 'string' ? response.trim() : '';
        if (trimmed) {
          textToSpeak = trimmed;
        }
      } catch (err) {
        console.warn('[FocusReader] Speechify failed, fallback to direct text', err);
      }

      if (!textToSpeak) {
        const fallback = sanitizedEnglish || sanitizedHebrew;
        if (!fallback) {
          return;
        }
        textToSpeak = fallback;
        playbackLanguage = sanitizedEnglish ? 'en' : 'ru';
      }

      await play(textToSpeak, { language: playbackLanguage });
      setActiveTTSRef(activeSegmentRef);
    } catch (err) {
      console.warn('[FocusReader] TTS error:', err);
      setActiveTTSRef(null);
    }
  }, [
    activeSegmentRef,
    englishText,
    hasEnglish,
    hasHebrew,
    hebrewText,
    isActiveTTS,
    isPaused,
    pauseTTS,
    play,
    resume,
    speechify,
    stop,
    ttsIsPlaying,
    sanitizeText,
    sanitizedEnglish,
    sanitizedHebrew,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const raw = window.localStorage.getItem(FOCUS_READER_SETTINGS_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        readerFontSize?: 'small' | 'medium' | 'large';
        hebrewScale?: number;
        translationScale?: number;
      };
      if (parsed.readerFontSize && ['small', 'medium', 'large'].includes(parsed.readerFontSize)) {
        setReaderFontSize(parsed.readerFontSize);
      }
      if (typeof parsed.hebrewScale === 'number' && parsed.hebrewScale >= 1.0 && parsed.hebrewScale <= 2.0) {
        setHebrewScale(parsed.hebrewScale);
      }
      if (typeof parsed.translationScale === 'number' && parsed.translationScale >= 0.8 && parsed.translationScale <= 2.0) {
        setTranslationScale(parsed.translationScale);
      }
    } catch (err) {
      console.warn('[FocusReader] Failed to restore font settings', err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const payload = {
      readerFontSize,
      hebrewScale,
      translationScale,
    };
    try {
      window.localStorage.setItem(FOCUS_READER_SETTINGS_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('[FocusReader] Failed to persist font settings', err);
    }
  }, [readerFontSize, hebrewScale, translationScale]);

  const handleOverlayNavigate = useCallback(
    (ref: string) => {
      navOriginRef.current = 'data';
      onNavigateToRef?.(normalizeRefForAPI(ref));
    },
    [onNavigateToRef],
  );

  const handleSegmentNavigation = useCallback(
    (ref: string, segment: TextSegment) => {
      onSegmentClick?.(segment);
      if (navOriginRef.current === 'data') {
        onNavigateToRef?.(ref, segment);
      } else {
        navOriginRef.current = 'data';
      }
    },
    [onNavigateToRef, onSegmentClick],
  );

  const fontSizeValues = useMemo(() => FONT_SIZE_VALUES, []);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center">
        <div className="text-red-500 mb-2">⚠️</div>
        <h3 className="text-lg font-medium mb-2">Ошибка</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  // Убираем блокирующий спиннер загрузки - показываем контент сразу
  // if (isLoading) {
  //   return (
  //     <div className="h-full flex items-center justify-center">
  //       <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  //     </div>
  //   );
  // }

  if (!continuousText) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center">
        <div className="text-muted-foreground">
          <div className="text-4xl mb-4">📖</div>
          <h3 className="text-lg font-medium mb-2">Текст не выбран</h3>
          <p className="text-sm">Выберите отрывок, чтобы начать чтение</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col bg-background">
      <div className="flex-shrink-0 border-b panel-outer">
        <div className="flex items-center gap-3 p-3">
            <div className="flex items-center gap-1">
              <button
              onClick={onBack}
              disabled={isLoading || !canBack}
                className="flex items-center justify-center w-6 h-6 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
              title="Предыдущий сегмент"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
              onClick={onForward}
              disabled={isLoading || !canForward}
                className="flex items-center justify-center w-6 h-6 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
              title="Следующий сегмент"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          
          <button
            type="button"
            onClick={() => setIsNavOpen(true)}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-emerald-500/80 text-emerald-950 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
            title="Открыть навигацию"
          >
            <Compass className="w-3 h-3" />
            <span>Навигация</span>
          </button>

          <div className="flex-1">
            <div className="rounded-xl border border-white/10 bg-muted/20 px-3 py-2">
              <div className="font-mono text-sm text-foreground">
                {formatDisplayRef(currentRef || activeSegment?.ref)}
              </div>
            </div>
          </div>

               <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (showTranslation) {
                  setShowTranslation(false);
                  clear();
                } else {
                  setShowTranslation(true);
                  translate().catch(() => {});
                }
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors text-xs ${
                showTranslation ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }`}
              title={showTranslation ? 'Скрыть перевод' : 'Показать перевод'}
            >
              <Languages className="w-3 h-3" />
              <span>Перевод</span>
            </button>

            <button
              onClick={handlePlayClick}
              disabled={
                isLoading ||
                isPlaybackLoading ||
                (!hasHebrew && !hasEnglish)
              }
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors text-xs ${
                isActiveTTS ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              } ${isPlaybackLoading ? 'opacity-50 cursor-wait' : ''}`}
              title={isActiveTTS ? 'Остановить озвучку' : 'Озвучить текущий отрывок'}
            >
              {isPlaybackLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isActiveTTS ? (
                isCurrentSegmentPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              <span>Озвучка</span>
            </button>

                 <button
              onClick={() => setShowSettings((prev) => !prev)}
                   className={`flex items-center gap-1 px-2 py-1 rounded transition-colors text-xs ${
                showSettings ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                   }`}
              title="Настройки отображения"
                 >
                   <Settings className="w-3 h-3" />
                 </button>

            {onExit && (
              <button
                onClick={onExit}
                disabled={isLoading}
                className="flex items-center gap-1 px-2 py-1 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded transition-colors disabled:opacity-50 text-xs"
                title="Закрыть"
              >
                <X className="w-3 h-3" />
              </button>
            )}
               </div>
        </div>
      </div>

        <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative overflow-hidden">
        <ContinuousTextFlow
          segments={continuousText.segments}
            focusIndex={continuousText.focusIndex}
            onNavigateToRef={(ref, segment) => handleSegmentNavigation(ref, segment || continuousText.segments[continuousText.focusIndex])}
            onLexiconDoubleClick={onLexiconDoubleClick}
          focusRef={focusRef}
          showTranslation={showTranslation}
            translatedText={stableTranslatedText}
          isTranslating={isTranslating}
          navOriginRef={navOriginRef}
          scrollContainerRef={scrollContainerRef}
          fontSizeValues={fontSizeValues}
          readerFontSize={readerFontSize}
          hebrewScale={hebrewScale}
          translationScale={translationScale}
            translationRef={activeSegment?.ref || ''}
          setShowTranslation={setShowTranslation}
          translate={translate}
            currentTranslatedText={stableTranslatedText}
            isActive={isActiveTTS}
            ttsIsPlaying={isCurrentSegmentPlaying}
          handlePlayClick={handlePlayClick}
        />
          </div>
        
        {showSettings && (
          <div className="w-64 border-l panel-outer bg-background">
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Настройки отображения
              </h3>
            </div>
            <div className="p-4 space-y-4">
              {/* Размер шрифта */}
              <div>
                <label className="text-sm font-medium mb-2 block">Размер шрифта</label>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setReaderFontSize('small')}
                    className={`px-2 py-1 text-xs rounded ${readerFontSize === 'small' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                  >
                    Малый
                  </button>
                  <button 
                    onClick={() => setReaderFontSize('medium')}
                    className={`px-2 py-1 text-xs rounded ${readerFontSize === 'medium' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                  >
                    Средний
                  </button>
                  <button 
                    onClick={() => setReaderFontSize('large')}
                    className={`px-2 py-1 text-xs rounded ${readerFontSize === 'large' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                  >
                    Большой
                  </button>
                </div>
              </div>
              
              {/* Масштаб иврита */}
              <div>
                <label className="text-sm font-medium mb-2 block">Масштаб иврита: {hebrewScale.toFixed(1)}x</label>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setHebrewScale(Math.max(1.0, hebrewScale - 0.1))}
                    disabled={hebrewScale <= 1.0}
                    className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded disabled:opacity-50"
                  >
                    -
                  </button>
                  <span className="text-xs text-muted-foreground">{hebrewScale.toFixed(1)}x</span>
                  <button 
                    onClick={() => setHebrewScale(Math.min(2.0, hebrewScale + 0.1))}
                    disabled={hebrewScale >= 2.0}
                    className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded disabled:opacity-50"
                  >
                    +
                  </button>
                </div>
              </div>
              
              {/* Масштаб перевода */}
              <div>
                <label className="text-sm font-medium mb-2 block">Масштаб перевода: {translationScale.toFixed(1)}x</label>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setTranslationScale(Math.max(0.8, translationScale - 0.1))}
                    disabled={translationScale <= 0.8}
                    className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded disabled:opacity-50"
                  >
                    -
                  </button>
                  <span className="text-xs text-muted-foreground">{translationScale.toFixed(1)}x</span>
                  <button 
                    onClick={() => setTranslationScale(Math.min(2.0, translationScale + 0.1))}
                    disabled={translationScale >= 2.0}
                    className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded disabled:opacity-50"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <FocusNavOverlay
        open={isNavOpen}
        onClose={() => setIsNavOpen(false)}
        onSelectRef={handleOverlayNavigate}
        currentRef={currentRef || activeSegment?.ref}
      />
    </div>
  );
});

FocusReader.displayName = 'FocusReader';

export default FocusReader;


