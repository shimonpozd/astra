import { useState, useEffect, useCallback } from 'react';
import { StudySnapshot } from '../../types/study';
import { ContinuousText, TextSegment } from '../../types/text';
import FocusReader from './FocusReader';
import ChatViewport from '../chat/ChatViewport';
import MessageComposer from '../chat/MessageComposer';
import WorkbenchPanelInline from './WorkbenchPanelInline';
import { api } from '../../services/api';
import { useLexiconStore } from '../../store/lexiconStore';
import { Message } from '../../services/api';
import { debugLog } from '../../utils/debugLogger';

interface StudyModeProps {
  snapshot: StudySnapshot | null;
  onExit: () => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  isLoading: boolean;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  messages: Message[];
  isLoadingMessages: boolean;
  isSending: boolean;
  studySessionId: string | null;
  setIsSending: (sending: boolean) => void;
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  agentId: string;
  onWorkbenchSet: (side: 'left' | 'right', ref: string, dragData?: {
    type: 'single' | 'group' | 'part';
    data?: any;
  }) => void;
  onWorkbenchClear?: (side: 'left' | 'right') => void;
  onWorkbenchFocus: (side: 'left' | 'right') => void;
  onWorkbenchDrop?: (side: 'left' | 'right', ref: string, dragData?: {
    type: 'single' | 'group' | 'part';
    data?: any;
  }) => void;
  onFocusClick?: () => void;
  onNavigateToRef?: (ref: string, segment?: TextSegment) => void;
  // onLexiconLookup removed - now using global lexicon store
  refreshStudySnapshot: () => void;
  // Panel selection props
  selectedPanelId?: string | null;
  onSelectedPanelChange?: (panelId: string | null) => void;
  // Background loading prop
  isBackgroundLoading?: boolean;
}

export default function StudyMode({
  snapshot,
  onExit,
  onNavigateBack,
  onNavigateForward,
  isLoading,
  canNavigateBack,
  canNavigateForward,
  messages,
  isLoadingMessages,
  isSending,
  studySessionId,
  setIsSending,
  setMessages,
  agentId,
  onWorkbenchSet,
  onWorkbenchClear,
  onWorkbenchFocus,
  onWorkbenchDrop,
  onFocusClick,
  onNavigateToRef,
  // onLexiconLookup removed
  refreshStudySnapshot,
  selectedPanelId: propSelectedPanelId,
  onSelectedPanelChange,
  isBackgroundLoading = false,
}: StudyModeProps) {
  // Use props if provided, otherwise fall back to local state
  const [localSelectedPanelId, setLocalSelectedPanelId] = useState<string | null>(null);
  const selectedPanelId = propSelectedPanelId !== undefined ? propSelectedPanelId : localSelectedPanelId;
  const setSelectedPanelId = onSelectedPanelChange || setLocalSelectedPanelId;
  
  // New lexicon system using global store
  const { setSelection, fetchExplanation } = useLexiconStore();

  // Panel selection handlers (с защитой от множественных кликов)
  const handlePanelClick = useCallback((panelId: string) => {
    // Предотвращаем множественные клики
    if (selectedPanelId === panelId) {
      // Deselect if clicking the same panel
      setSelectedPanelId(null);
    } else {
      // Select the clicked panel
      setSelectedPanelId(panelId);
    }
  }, [selectedPanelId, setSelectedPanelId]);

  // Get current study mode
  const studyMode = selectedPanelId ? 'iyun' : 'girsa';

  // New lexicon double-click handler using global store
  const handleLexiconDoubleClick = async (segment?: TextSegment) => {
    const selected = (window.getSelection()?.toString() || '').trim();
    const fallback = segment?.heText || segment?.text || '';
    const contextRaw = fallback || selected || '';
    const context = contextRaw
      ? contextRaw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : '';

    const rawText = selected || fallback;
    if (!rawText) return;

    const cleanText = rawText
      .replace(/[֑-ׇ]/g, '')
      .replace(/["'""().,!?;:\-\[\]{}]/g, '')
      .trim();

    if (!cleanText) return;

    setSelection(cleanText, context || null);
    await fetchExplanation();
  };

  // Listen for lexicon lookup events from Workbench
  useEffect(() => {
    const handleLexiconLookup = (event: CustomEvent<{ text?: string; context?: string }>) => {
      const text = event.detail?.text;
      if (text) {
        const cleanText = text
          .replace(/[֑-ׇ]/g, '') // Remove Hebrew punctuation
          .replace(/["'""().,!?;:\-\[\]{}]/g, '') // Remove general punctuation
          .trim();
        const context = event.detail?.context
          ?.replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim() || null;
        
        if (cleanText) {
          setSelection(cleanText, context);
          fetchExplanation();
        }
      }
    };

    window.addEventListener('lexicon-lookup', handleLexiconLookup as EventListener);
    return () => {
      window.removeEventListener('lexicon-lookup', handleLexiconLookup as EventListener);
    };
  }, [setSelection, fetchExplanation]);
  // Конвертация snapshot в continuousText для нового FocusReader
  const continuousText: ContinuousText | null = snapshot ? {
    segments: snapshot.segments || [],
    focusIndex: snapshot.focusIndex ?? 0,
    totalLength: snapshot.segments?.length || 0,
    title: snapshot.ref || '',
    collection: '' // This field is not critical for the reader component
  } : null;

  // Debug logging for segments
  debugLog('📖 StudyMode segments:', {
    hasSnapshot: !!snapshot,
    segmentsCount: snapshot?.segments?.length || 0,
    focusIndex: snapshot?.focusIndex,
    ref: snapshot?.ref,
    firstSegment: snapshot?.segments?.[0] ? {
      ref: snapshot.segments[0].ref,
      text: snapshot.segments[0].text?.substring(0, 50) + '...',
      heText: snapshot.segments[0].heText?.substring(0, 50) + '...'
    } : null,
    lastSegment: snapshot?.segments?.[snapshot.segments.length - 1]?.ref,
    continuousText: continuousText,
    navigationProps: {
      canBack: canNavigateBack,
      canForward: canNavigateForward,
      currentRef: snapshot?.ref
    }
  });

  return (
    <div className="flex flex-col h-full panel-inner">
      <div className="h-[calc(260vh-360px+160px)] min-h-0 flex flex-col">
        {/* Upper fixed height - Workbench and Focus (+160px) */}
        <div className="flex-1 min-h-0 panel-padding">
          <div className="h-full grid grid-cols-[300px_1fr_300px] gap-spacious min-h-0">
            {/* Left Workbench */}
            <div className="min-h-0 max-h-full overflow-hidden">
              <WorkbenchPanelInline
                title="Левая панель"
                item={snapshot?.workbench?.left || null}
                active={snapshot?.discussion_focus_ref === snapshot?.workbench?.left?.ref}
                selected={selectedPanelId === 'left_workbench'}
                onDropRef={(ref: string, dragData) => {
                  debugLog('StudyMode: Dropped on left workbench:', ref, dragData);
                  if (dragData?.type === 'group') {
                    debugLog('Group data:', dragData.data);
                    // TODO: Здесь можно добавить специальную обработку для групп
                    // Например, добавить все части группы в workbench или показать специальный UI
                  }
                  onWorkbenchDrop ? onWorkbenchDrop('left', ref, dragData) : onWorkbenchSet('left', ref, dragData);
                }}
                onPanelClick={() => {
                  handlePanelClick('left_workbench');
                }}
                onBorderClick={() => {
                  onWorkbenchFocus('left');
                }}
                onClear={snapshot?.workbench?.left ? () => onWorkbenchClear?.('left') : undefined}
              />
            </div>

            {/* Focus Reader */}
            <div
              className={`bg-card/60 rounded-lg overflow-hidden transition-all min-h-0 ${
                selectedPanelId === 'focus' ? 'focus-reader-selected' : 
                snapshot?.discussion_focus_ref === snapshot?.ref ? 'focus-reader-active' : 'border border-border/60'
              }`}
              onClick={(e) => {
                // Выделение панели - при любом клике (нужно для общения с LLM)
                handlePanelClick('focus');
                // Фокус чата - только при клике по границе (не по контенту)
                if (e.target === e.currentTarget) {
                  onFocusClick && onFocusClick();
                }
              }}
            >
              <FocusReader
                continuousText={continuousText}
                isLoading={isLoading}
                onSegmentClick={(segment) => {
                  if (segment) {
                    onNavigateToRef?.(segment.ref, segment);
                  } else if (snapshot?.ref) {
                    onNavigateToRef?.(snapshot.ref);
                  }
                }}
                onNavigateToRef={onNavigateToRef}
                onLexiconDoubleClick={handleLexiconDoubleClick}
                isDailyMode={studySessionId?.startsWith('daily-') || false}
                isBackgroundLoading={isBackgroundLoading}
                // Navigation props
                onBack={onNavigateBack}
                onForward={onNavigateForward}
                onExit={onExit}
                currentRef={snapshot?.ref}
                canBack={canNavigateBack}
                canForward={canNavigateForward}
              />
            </div>

            {/* Right Workbench */}
            <div className="min-h-0">
              <WorkbenchPanelInline
                title="Правая панель"
                item={snapshot?.workbench?.right || null}
                active={snapshot?.discussion_focus_ref === snapshot?.workbench?.right?.ref}
                selected={selectedPanelId === 'right_workbench'}
                onDropRef={(ref: string, dragData) => {
                  debugLog('StudyMode: Dropped on right workbench:', ref, dragData);
                  if (dragData?.type === 'group') {
                    debugLog('Group data:', dragData.data);
                    // TODO: Здесь можно добавить специальную обработку для групп
                    // Например, добавить все части группы в workbench или показать специальный UI
                  }
                  onWorkbenchDrop ? onWorkbenchDrop('right', ref, dragData) : onWorkbenchSet('right', ref, dragData);
                }}
                onPanelClick={() => {
                  handlePanelClick('right_workbench');
                }}
                onBorderClick={() => {
                  onWorkbenchFocus('right');
                }}
                onClear={snapshot?.workbench?.right ? () => onWorkbenchClear?.('right') : undefined}
              />
            </div>
          </div>
        </div>

        {/* Lower fixed height - Chat */}
        <div className="h-[700px] min-h-0 flex flex-col border-t border-border/20">
          <div className="flex-1 min-h-0 overflow-y-auto panel-padding-sm">
            <ChatViewport messages={messages.map(m => ({ ...m, id: String(m.id) }))} isLoading={isLoadingMessages} />
          </div>
          <div className="flex-shrink-0 panel-padding">
            <MessageComposer
              onSendMessage={async (message) => {
                if (!studySessionId) return;
                setIsSending(true);
                const assistantMessageId = crypto.randomUUID();
                const assistantMessage: any = {
                  id: assistantMessageId,
                  role: 'assistant',
                  content: '',
                  content_type: 'text.v1',
                  timestamp: Date.now(),
                };
                setMessages((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), role: 'user', content: message, content_type: 'text.v1', timestamp: Date.now() },
                  assistantMessage
                ]);

                await api.sendStudyMessage(studySessionId, message, {
                  onChunk: (chunk) => {
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? {
                              ...msg,
                              content: `${typeof msg.content === 'string' ? msg.content : ''}${chunk}`,
                              content_type: 'text.v1'
                            }
                          : msg
                      )
                    );
                  },
                  onDoc: (doc) => {
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, content: doc, content_type: 'doc.v1' }
                          : msg
                      )
                    );
                  },
                  onComplete: () => {
                    setIsSending(false);
                    refreshStudySnapshot();
                  },
                  onError: (error) => {
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, content: `Error: ${error.message}`, content_type: 'text.v1' }
                          : msg
                      )
                    );
                    setIsSending(false);
                  },
                }, agentId, selectedPanelId);
              }}
              disabled={isSending}
                discussionFocusRef={snapshot?.discussion_focus_ref}
                studyMode={studyMode}
                selectedPanelId={selectedPanelId}
              />
          </div>
        </div>
      </div>

      {/* Lexicon Modal removed - now using global LexiconPanel */}
    </div>
  );
}