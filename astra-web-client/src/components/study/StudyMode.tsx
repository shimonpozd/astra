import { useState } from 'react';
import { StudySnapshot } from '../../types/study';
import { ContinuousText, TextSegment } from '../../types/text';
import FocusReader from './FocusReader';
import StudyToolbar from './StudyToolbar';
import ChatViewport from '../chat/ChatViewport';
import MessageComposer from '../chat/MessageComposer';
import WorkbenchPanelInline from './WorkbenchPanelInline';
import { api } from '../../services/api';
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
  onSendMessage: (message: string) => void;
  isSending: boolean;
  studySessionId: string | null;
  setIsSending: (sending: boolean) => void;
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  onWorkbenchSet: (side: 'left' | 'right', ref: string) => void;
  onWorkbenchFocus: (side: 'left' | 'right') => void;
  onWorkbenchDrop?: (side: 'left' | 'right', ref: string) => void;
  onFocusClick?: () => void;
  onNavigateToRef?: (ref: string) => void;
  onLexiconLookup?: (word: string, entries: any[]) => void;
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
  onSendMessage,
  isSending,
  studySessionId,
  setIsSending,
  setMessages,
  onWorkbenchSet,
  onWorkbenchFocus,
  onWorkbenchDrop,
  onFocusClick,
  onNavigateToRef,
  onLexiconLookup,
}: StudyModeProps) {
  // Lexicon state
  const [lexWord, setLexWord] = useState<string | null>(null);
  const [lexEntries, setLexEntries] = useState<any[] | null>(null);
  const [lexError, setLexError] = useState<string | null>(null);

  // Lexicon double-click handler
  const handleLexiconDoubleClick = async () => {
    const selected = (window.getSelection()?.toString() || '').trim();
    if (!selected) return;

    const query = selected
      .replace(/[֑-ׇ]/g, '') // Remove Hebrew punctuation
      .replace(/["'""().,!?;:\-\[\]{}]/g, '') // Remove general punctuation
      .trim();

    if (!query) return;

    setLexWord(selected);
    setLexError(null);
    setLexEntries(null);

    try {
      const entries = await api.getLexicon(query);
      setLexEntries(Array.isArray(entries) ? entries : []);
      onLexiconLookup?.(selected, Array.isArray(entries) ? entries : []);
    } catch (err: any) {
      setLexError(err?.message || 'Не удалось получить определение');
    }
  };
  // Конвертация snapshot в continuousText для нового FocusReader
  const continuousText: ContinuousText | null = snapshot && snapshot.focus ? {
    segments: [
      ...snapshot.window.prev.map((item, index) => ({
        ref: item.ref,
        text: item.preview || '',
        heText: '',
        position: (index + 1) / (snapshot.window.prev.length + snapshot.window.next.length + 1),
        type: 'context' as const,
        metadata: {}
      })),
      {
        ref: snapshot.focus.ref,
        text: snapshot.focus.text_full || '',
        heText: snapshot.focus.he_text_full || '',
        position: 0.5,
        type: 'focus' as const,
        metadata: {}
      },
      ...snapshot.window.next.map((item, index) => ({
        ref: item.ref,
        text: item.preview || '',
        heText: '',
        position: (snapshot.window.prev.length + 1 + index + 1) / (snapshot.window.prev.length + snapshot.window.next.length + 1),
        type: 'context' as const,
        metadata: {}
      }))
    ],
    focusIndex: snapshot.window.prev.length,
    totalLength: snapshot.window.prev.length + snapshot.window.next.length + 1,
    title: snapshot.focus.title || snapshot.focus.ref,
    collection: snapshot.focus.collection || ''
  } : null;

  return (
    <div className="flex flex-col h-full bg-muted/20">
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
        <div className="flex-1 min-h-0 p-4">
          <div className="h-full grid grid-cols-[300px_1fr_300px] gap-4 min-h-0">
            {/* Left Workbench */}
            <div className="min-h-0">
              <WorkbenchPanelInline
                title="Левая панель"
                item={snapshot?.workbench?.left || null}
                active={snapshot?.discussion_focus_ref === snapshot?.workbench?.left?.ref}
                onDropRef={(ref: string) => onWorkbenchDrop ? onWorkbenchDrop('left', ref) : onWorkbenchSet('left', ref)}
                onClick={() => onWorkbenchFocus('left')}
              />
            </div>

            {/* Focus Reader */}
            <div
              className={`bg-card/60 rounded-lg border overflow-hidden transition-colors min-h-0 cursor-pointer ${
                snapshot?.discussion_focus_ref === snapshot?.focus?.ref ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => onFocusClick && onFocusClick()}
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
                onDropRef={(ref: string) => onWorkbenchDrop ? onWorkbenchDrop('right', ref) : onWorkbenchSet('right', ref)}
                onClick={() => onWorkbenchFocus('right')}
              />
            </div>
          </div>
        </div>

        {/* Lower fixed height - Chat */}
        <div className="h-[700px] min-h-0 flex flex-col border-t border-border/20">
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
            <ChatViewport messages={messages} isLoading={isLoadingMessages} />
          </div>
          <div className="flex-shrink-0 px-4 pb-4">
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
                });
              }}
              disabled={isSending}
              discussionFocusRef={snapshot?.discussion_focus_ref}
            />
          </div>
        </div>
      </div>

      {/* Lexicon Modal */}
      {lexWord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setLexWord(null); setLexEntries(null); setLexError(null); }}></div>
          <div className="relative z-10 w-full max-w-xl bg-card border rounded-lg shadow-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold">{lexWord}</div>
              <button className="text-sm px-2 py-1 border rounded" onClick={() => { setLexWord(null); setLexEntries(null); setLexError(null); }}>Закрыть</button>
            </div>
            {lexError && <div className="text-red-500 text-sm">{lexError}</div>}
            {!lexError && !lexEntries && (
              <div className="text-sm text-muted-foreground">Загрузка…</div>
            )}
            {!lexError && lexEntries && lexEntries.length === 0 && (
              <div className="text-sm text-muted-foreground">Определение не найдено</div>
            )}
            {!lexError && Array.isArray(lexEntries) && lexEntries.length > 0 && (
              <div className="space-y-3 max-h-[50vh] overflow-auto pr-2">
                {lexEntries.map((entry: any, idx: number) => {
                  const title = entry?.headword || entry?.word || lexWord;
                  const sense = entry?.content?.senses?.[0]?.definition || entry?.definition || '';
                  const rendered = typeof sense === 'string' ? sense : JSON.stringify(sense);

                  return (
                    <div key={idx} className="border rounded p-3 bg-card/60 space-y-2">
                      <div className="text-sm font-medium">{title}</div>
                      <div
                        className="text-sm leading-relaxed text-muted-foreground [&_i]:italic [&_b]:font-semibold [&_a]:underline"
                        dangerouslySetInnerHTML={{ __html: rendered }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
