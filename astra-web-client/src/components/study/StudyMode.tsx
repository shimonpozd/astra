import { useState, useEffect } from 'react';
import { StudySnapshot } from '../../types/study';
import { ContinuousText } from '../../types/text';
import FocusReader from './FocusReader';
import StudyToolbar from './StudyToolbar';
import ChatViewport from '../chat/ChatViewport';
import MessageComposer from '../chat/MessageComposer';
import WorkbenchPanelInline from './WorkbenchPanelInline';
import { api } from '../../services/api';
import { useLexiconStore } from '../../store/lexiconStore';
import { Message } from '../../services/api';

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
  onWorkbenchSet: (side: 'left' | 'right', ref: string) => void;
  onWorkbenchFocus: (side: 'left' | 'right') => void;
  onWorkbenchDrop?: (side: 'left' | 'right', ref: string) => void;
  onFocusClick?: () => void;
  onNavigateToRef?: (ref: string) => void;
  // onLexiconLookup removed - now using global lexicon store
  refreshStudySnapshot: () => void;
  // Panel selection props
  selectedPanelId?: string | null;
  onSelectedPanelChange?: (panelId: string | null) => void;
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
  onWorkbenchFocus,
  onWorkbenchDrop,
  onFocusClick,
  onNavigateToRef,
  // onLexiconLookup removed
  refreshStudySnapshot,
  selectedPanelId: propSelectedPanelId,
  onSelectedPanelChange,
}: StudyModeProps) {
  // Use props if provided, otherwise fall back to local state
  const [localSelectedPanelId, setLocalSelectedPanelId] = useState<string | null>(null);
  const selectedPanelId = propSelectedPanelId !== undefined ? propSelectedPanelId : localSelectedPanelId;
  const setSelectedPanelId = onSelectedPanelChange || setLocalSelectedPanelId;
  
  // New lexicon system using global store
  const { setSelection, fetchExplanation } = useLexiconStore();

  // Panel selection handlers
  const handlePanelClick = (panelId: string) => {
    if (selectedPanelId === panelId) {
      // Deselect if clicking the same panel
      setSelectedPanelId(null);
    } else {
      // Select the clicked panel
      setSelectedPanelId(panelId);
    }
  };

  // Get current study mode
  const studyMode = selectedPanelId ? 'iyun' : 'girsa';

  // New lexicon double-click handler using global store
  const handleLexiconDoubleClick = async () => {
    const selected = (window.getSelection()?.toString() || '').trim();
    if (!selected) return;

    // Clean up the selected text
    const cleanText = selected
      .replace(/[֑-ׇ]/g, '') // Remove Hebrew punctuation
      .replace(/["'""().,!?;:\-\[\]{}]/g, '') // Remove general punctuation
      .trim();

    if (!cleanText) return;

    // Use the new lexicon system
    setSelection(cleanText, null);
    await fetchExplanation();
  };

  // Listen for lexicon lookup events from Workbench
  useEffect(() => {
    const handleLexiconLookup = (event: CustomEvent) => {
      const text = event.detail?.text;
      if (text) {
        const cleanText = text
          .replace(/[֑-ׇ]/g, '') // Remove Hebrew punctuation
          .replace(/["'""().,!?;:\-\[\]{}]/g, '') // Remove general punctuation
          .trim();
        
        if (cleanText) {
          setSelection(cleanText, null);
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
    segments: snapshot.segments,
    focusIndex: snapshot.focusIndex,
    totalLength: snapshot.segments.length,
    title: snapshot.ref,
    collection: '' // This field is not critical for the reader component
  } : null;

  return (
    <div className="flex flex-col h-full panel-inner">
      <StudyToolbar
        onBack={onNavigateBack}
        onForward={onNavigateForward}
        onExit={onExit}
        isLoading={isLoading}
        canBack={canNavigateBack}
        canForward={canNavigateForward}
      />
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Upper flexible height - Workbench and Focus */}
        <div className="flex-1 min-h-0 panel-padding">
          <div className="h-full grid grid-cols-[300px_1fr_300px] gap-spacious min-h-0">
            {/* Left Workbench */}
            <div className="min-h-0">
              <WorkbenchPanelInline
                title="Левая панель"
                item={snapshot?.workbench?.left || null}
                active={snapshot?.discussion_focus_ref === snapshot?.workbench?.left?.ref}
                selected={selectedPanelId === 'left_workbench'}
                onDropRef={(ref: string) => onWorkbenchDrop ? onWorkbenchDrop('left', ref) : onWorkbenchSet('left', ref)}
                onClick={() => {
                  handlePanelClick('left_workbench');
                  onWorkbenchFocus('left');
                }}
              />
            </div>

            {/* Focus Reader */}
            <div
              className={`bg-card/60 rounded-lg border overflow-hidden transition-all min-h-0 cursor-pointer ${
                selectedPanelId === 'focus' ? 'focus-reader-selected' : 
                snapshot?.discussion_focus_ref === snapshot?.ref ? 'focus-reader-active' : ''
              }`}
              onClick={() => {
                handlePanelClick('focus');
                onFocusClick && onFocusClick();
              }}
            >
              <FocusReader
                continuousText={continuousText}
                onSegmentClick={(segment) => onNavigateToRef && onNavigateToRef(segment.ref)}
                onNavigateToRef={onNavigateToRef}
                onLexiconDoubleClick={handleLexiconDoubleClick}
              />
            </div>

            {/* Right Workbench */}
            <div className="min-h-0">
              <WorkbenchPanelInline
                title="Правая панель"
                item={snapshot?.workbench?.right || null}
                active={snapshot?.discussion_focus_ref === snapshot?.workbench?.right?.ref}
                selected={selectedPanelId === 'right_workbench'}
                onDropRef={(ref: string) => onWorkbenchDrop ? onWorkbenchDrop('right', ref) : onWorkbenchSet('right', ref)}
                onClick={() => {
                  handlePanelClick('right_workbench');
                  onWorkbenchFocus('right');
                }}
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
