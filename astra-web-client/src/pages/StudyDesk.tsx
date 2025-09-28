import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { StudySnapshot, BookshelfItem, ReaderWindow, ChatEntry } from '../types/study';
import { studySnapshotToReaderWindow } from '../utils/readerAdapter';
import { FocusScroller } from '../components/FocusScroller';
import { ReaderToolbar } from '../components/ReaderToolbar';
import { MiniTimeline } from '../components/MiniTimeline';
import ChatList from '../components/ChatList';
import RightSidePanel from '../components/RightSidePanel';

function useSessionId(): string {
  const { sessionId } = useParams();
  return decodeURIComponent(sessionId || '');
}

function StudyBreadcrumbs({ items, onBack, onForward, canBack, canForward }: { items: string[]; onBack: () => void; onForward: () => void; canBack: boolean; canForward: boolean; }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <button onClick={onBack} disabled={!canBack} className="px-2 py-1 border rounded disabled:opacity-50">← Back</button>
      <button onClick={onForward} disabled={!canForward} className="px-2 py-1 border rounded disabled:opacity-50">Forward →</button>
      <div className="text-muted-foreground">{items.join(' › ')}</div>
    </div>
  );
}

function FocusViewer({ snapshot, onSelectRef, onLexiconDoubleClick }: { snapshot: StudySnapshot | null; onSelectRef: (ref: string) => void; onLexiconDoubleClick?: (e: React.MouseEvent) => void; }) {
  const containsHebrew = (t?: string) => !!t && /[\u0590-\u05FF]/.test(t);
  const hebrewClass = 'hebrew-text';
  const hebrewMuted = 'hebrew-muted';
  const focus = snapshot?.focus;
  const prev = snapshot?.window?.prev || [];
  const next = snapshot?.window?.next || [];
  const prev5 = prev.slice(Math.max(prev.length - 5, 0));
  const next5 = next.slice(0, 5);
  const wheelCooldownRef = React.useRef<number>(0);
  const onWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - wheelCooldownRef.current < 300) return;
    wheelCooldownRef.current = now;
    if (e.deltaY > 0 && next5[0]?.ref) {
      onSelectRef(next5[0].ref);
    } else if (e.deltaY < 0 && prev5[prev5.length - 1]?.ref) {
      onSelectRef(prev5[prev5.length - 1].ref);
    }
  };
  return (
    <div className="w-full">
      <div className="relative h-[33vh] overflow-hidden" onWheel={onWheel}>
        <div className="h-full grid grid-rows-[1fr_12vh_1fr]">
          <div className="overflow-hidden">
            <div className="max-w-3xl mx-auto px-6 py-2 flex flex-col justify-end space-y-1">
              {[...prev5].reverse().map((p) => (
                <div
                  key={p.ref}
                  className={`text-base leading-7 text-muted-foreground/60 cursor-pointer hover:text-muted-foreground transition-colors select-text ${containsHebrew(p.preview) ? hebrewMuted : ''}`}
                  onClick={() => onSelectRef(p.ref)}
                  onDoubleClick={onLexiconDoubleClick}
                  style={{ textAlign: 'justify' }}
                >
                  {p.preview || p.ref}
                </div>
              ))}
            </div>
          </div>
          <div className="px-6">
            <div className="max-w-3xl mx-auto">
              <div className="rounded-lg border-2 border-primary/20 bg-background shadow-lg ring-1 ring-primary/10">
                <div className={`text-xl leading-relaxed text-foreground px-6 py-4 whitespace-pre-wrap select-text ${containsHebrew(focus?.text_full) ? hebrewClass : ''}`} style={{ textAlign: 'justify' }} onDoubleClick={onLexiconDoubleClick}>
                  {focus?.text_full || 'Нет текста'}
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-hidden">
            <div className="max-w-3xl mx-auto px-6 py-2 flex flex-col justify-start space-y-1">
              {next5.map((n) => (
                <div
                  key={n.ref}
                  className={`text-base leading-7 text-muted-foreground/60 cursor-pointer hover:text-muted-foreground transition-colors select-text ${containsHebrew(n.preview) ? hebrewMuted : ''}`}
                  onClick={() => onSelectRef(n.ref)}
                  onDoubleClick={onLexiconDoubleClick}
                  style={{ textAlign: 'justify' }}
                >
                  {n.preview || n.ref}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BookshelfPanel({ items, onOpen }: { items: BookshelfItem[]; onOpen: (ref: string) => void; }) {
  return (
    <div className="border-l pl-4 h-full overflow-y-auto">
      <div className="font-semibold mb-3 sticky top-0 bg-card/80 backdrop-blur-sm py-2 pr-2">📚 Комментаторы</div>
      <div className="space-y-2 pr-2">
        {items.length === 0 && (
          <div className="text-xs text-muted-foreground">Нет комментариев для этого места</div>
        )}
        {items.map((it) => (
          <div
            key={it.ref}
            className="group p-3 border rounded-lg hover:bg-accent/50 cursor-pointer transition-all duration-200 hover:shadow-sm"
            onClick={() => onOpen(it.ref)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/astra-commentator-ref', String(it.ref));
              e.dataTransfer.setData('text/plain', String(it.ref));
              const dragImg = document.createElement('div');
              dragImg.textContent = String(it.title || it.ref);
              dragImg.style.cssText = 'position:absolute;top:-1000px;padding:8px 10px;background:#2a2a2a;color:#fff;border:1px solid #555;border-radius:6px;font-size:12px;';
              document.body.appendChild(dragImg);
              e.dataTransfer.setDragImage(dragImg, 0, 0);
              (e.currentTarget as HTMLElement).addEventListener('dragend', () => {
                if (dragImg && dragImg.parentNode) dragImg.parentNode.removeChild(dragImg);
              }, { once: true });
            }}
          >
            <div className="flex items-start gap-2">
              <div className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors select-none">⋮⋮</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{it.title || it.commentator || it.ref}</div>
                <div className="text-xs text-muted-foreground">{it.category}</div>
                {it.preview && (
                  <div className="text-xs mt-1 text-muted-foreground/80 line-clamp-2">{it.preview}</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkbenchPanel({
  title,
  item,
  active,
  onDropRef,
  onClick,
}: {
  title: string;
  item: BookshelfItem | null | undefined;
  active: boolean;
  onDropRef: (ref: string) => void;
  onClick: () => void;
}) {
  const [isOver, setIsOver] = React.useState(false);
  return (
    <div
      className={`h-full border-2 ${isOver ? 'border-primary/60' : 'border-dashed border-border'} rounded-lg p-3 bg-card/30 ${active ? 'ring-2 ring-primary' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/astra-commentator-ref') || e.dataTransfer.types.includes('text/plain')) {
          e.preventDefault();
        }
      }}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('text/astra-commentator-ref') || e.dataTransfer.types.includes('text/plain')) {
          setIsOver(true);
        }
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        const ref = e.dataTransfer.getData('text/astra-commentator-ref') || e.dataTransfer.getData('text/plain');
        setIsOver(false);
        if (ref) onDropRef(ref);
      }}
      onClick={onClick}
    >
      <div className="text-xs text-muted-foreground mb-2">{title}</div>
      {!item && (
        <div className="text-xs text-muted-foreground/70 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary/50" />
          Перетащите комментарий сюда
        </div>
      )}
      {item && (
        <div>
          <div className="text-sm font-medium">{item.title || item.commentator || item.ref}</div>
          <div className="text-xs text-muted-foreground mb-1">{item.category}</div>
          {item.preview && <div className="text-xs whitespace-pre-wrap text-muted-foreground/80 max-h-40 overflow-auto">{item.preview}</div>}
        </div>
      )}
    </div>
  );
}

function FocusChat({ onSend, chatHistory }: { onSend: (text: string) => void; chatHistory: ChatEntry[]; }) {
  const [text, setText] = useState('');
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatHistory.map((entry, idx) => (
          <div key={idx} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-lg ${
              entry.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted'
            }`}>
              <div className="whitespace-pre-wrap">{entry.content}</div>
            </div>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onSend(text); setText(''); } }}
        className="flex gap-2 p-4 border-t"
      >
        <input
          className="flex-1 border rounded px-3 py-2 bg-background"
          placeholder="Задайте вопрос по текущему тексту…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="px-3 py-2 rounded bg-primary text-primary-foreground">Отправить</button>
      </form>
    </div>
  );
}

export default function StudyDesk() {
  const sessionId = useSessionId();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<StudySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trail, setTrail] = useState<string[]>([]);
  const [canBack, setCanBack] = useState<boolean>(true);
  const [canForward, setCanForward] = useState<boolean>(true);
  const [lexiconWord, setLexiconWord] = useState<string | null>(null);
  const [lexiconQueryWord, setLexiconQueryWord] = useState<string | null>(null);
  const [lexiconEntries, setLexiconEntries] = useState<any[] | null>(null);
  const [lexiconError, setLexiconError] = useState<string | null>(null);

  const [chats, setChats] = useState<Array<{ session_id: string; name: string; last_modified: string }>>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [commentatorsLists, setCommentatorsLists] = useState<Array<{ reference: string; commentators: any[] }>>([]);
  const researchState = { currentStatus: '', currentPlan: null, currentDraft: '', currentCritique: [], isResearching: false, error: null, notesFeed: [] };

  const readerWindow = useMemo(() => studySnapshotToReaderWindow(snapshot), [snapshot]);

  const bookshelfItems = useMemo(() => (snapshot?.bookshelf?.items || []).map((it: any) => ({
    ref: it.ref,
    heRef: it.ref,
    indexTitle: it.title || it.commentator || it.ref,
    category: it.category || '',
    heCategory: it.category || '',
    isRead: false,
  })), [snapshot?.bookshelf?.items]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await api.getStudyState(sessionId);
      setSnapshot(state);
      if (state?.focus?.ref) setTrail((t) => (t[t.length - 1] === state.focus!.ref ? t : [...t, state.focus!.ref]));
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки состояния');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { if (sessionId) { refresh(); } else { navigate('/'); } }, [sessionId]);

  useEffect(() => {
    const loadChats = async () => {
      setIsLoadingChats(true);
      setChatError(null);
      try {
        const data = await api.getChatList();
        setChats(data.chats || []);
        if (!selectedChatId && data.chats && data.chats.length > 0) {
          setSelectedChatId(data.chats[0].session_id);
        }
      } catch (e) {
        setChatError(e instanceof Error ? e.message : "Failed to load chats");
      } finally {
        setIsLoadingChats(false);
      }
    };
    loadChats();
  }, []);

  const onSelectRef = async (ref: string) => {
    try {
      const state = await api.setFocus(sessionId, ref);
      setSnapshot(state);
      if (state?.focus?.ref) setTrail((t) => [...t, state.focus!.ref]);
      setCanBack(true); setCanForward(true);
    } catch (e: any) {
      setError(e?.message || 'Ошибка set_focus');
    }
  };

  const onBack = async () => {
    try {
      const state = await api.back(sessionId);
      setSnapshot(state);
      if (state?.focus?.ref) setTrail((t) => (t[t.length - 1] === state.focus!.ref ? t : [...t, state.focus!.ref]));
      setCanBack(true);
      setCanForward(true);
    } catch {
      setCanBack(false);
    }
  };
  const onForward = async () => {
    try {
      const state = await api.forward(sessionId);
      setSnapshot(state);
      if (state?.focus?.ref) setTrail((t) => (t[t.length - 1] === state.focus!.ref ? t : [...t, state.focus!.ref]));
      setCanBack(true);
      setCanForward(true);
    } catch {
      setCanForward(false);
    }
  };

  const onSendChat = async (text: string) => {
    await api.studyChatStream(sessionId, text, {
      onStatus: (m) => console.log('status:', m),
      onDraft: (d) => console.log('chunk:', d),
      onFinalDraft: (d) => console.log('final:', d),
      onError: (e) => console.warn('chat error', e),
      onComplete: async () => {
        try { const st = await api.getStudyState(sessionId); setSnapshot(st); } catch {}
      }
    });
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!readerWindow) return;
      const { focusIndex, items } = readerWindow;
      switch (e.key) {
        case 'j':
        case 'ArrowDown':
        case 'PageDown':
          e.preventDefault();
          if (focusIndex < items.length - 1) {
            onSelectRef(items[focusIndex + 1].ref);
          } else if (canForward) {
            onForward();
          }
          break;
        case 'k':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          if (focusIndex > 0) {
            onSelectRef(items[focusIndex - 1].ref);
          } else if (canBack) {
            onBack();
          }
          break;
        case 'Home':
          e.preventDefault();
          if (items.length > 0) onSelectRef(items[0].ref);
          break;
        case 'End':
          e.preventDefault();
          if (items.length > 0) onSelectRef(items[items.length - 1].ref);
          break;
        case 'Enter':
          e.preventDefault();
          // Toggle expand for focus
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readerWindow, canBack, canForward, onSelectRef, onBack, onForward]);

  const handleDoubleClickLexicon = async (e: React.MouseEvent) => {
    try {
      // 1) Try selection-based
      let selected = (window.getSelection()?.toString() || '').trim();
      let word = selected;

      // 2) Fallback: detect word under cursor using caret range
      if (!word) {
        const anyEvt = e as any;
        const x = anyEvt.clientX ?? anyEvt.nativeEvent?.clientX;
        const y = anyEvt.clientY ?? anyEvt.nativeEvent?.clientY;
        const range = (document as any).caretRangeFromPoint
          ? (document as any).caretRangeFromPoint(x, y)
          : ((document as any).caretPositionFromPoint && (() => {
              const pos = (document as any).caretPositionFromPoint(x, y);
              if (!pos) return null;
              const r = document.createRange();
              r.setStart(pos.offsetNode, pos.offset);
              r.setEnd(pos.offsetNode, pos.offset);
              return r;
            })());
        if (range && range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
          const text = range.startContainer.textContent || '';
          let idx = range.startOffset ?? 0;
          if (idx < 0) idx = 0;
          if (idx >= text.length) idx = text.length - 1;
          // Expand to word boundaries (Hebrew + Latin + apostrophes)
          const isWordChar = (ch: string) => /[\u0590-\u05FF\u05B0-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C7A-Za-z'’\-]/.test(ch);
          let start = idx;
          let end = idx;
          while (start > 0 && isWordChar(text[start - 1])) start--;
          while (end < text.length && isWordChar(text[end])) end++;
          word = text.slice(start, end).trim();
        }
      }

      if (!word) return;
      // Normalize query: strip niqqud/punct
      const query = word.replace(/[\u0591-\u05C7]/g, '').replace(/[\"'’“”\(\)\[\]{}.,;:!?]/g, '').trim();
      console.log('Lexicon dblclick:', { selected, word, query });
      setLexiconWord(word);
      setLexiconQueryWord(query || word);
      setLexiconError(null);
      setLexiconEntries(null);
      const entries = await api.getLexicon(query || word);
      setLexiconEntries(Array.isArray(entries) ? entries : []);
    } catch (err: any) {
      setLexiconError(err?.message || 'Не удалось получить определение');
    }
  };

  if (loading) return <div className="p-6">Загрузка…</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;
  if (!snapshot) return <div className="p-6">Инициализация сессии…</div>;
  if (!readerWindow) return <div className="p-6">Подготовка данных чтения…</div>;

  return (
    <div className="h-screen w-full grid gap-4 p-4 overflow-hidden" style={{ gridTemplateColumns: '280px 1fr 360px' }}>
      {/* Left: Chat List */}
      <div className="border-r bg-card/50 backdrop-blur-sm rounded overflow-hidden">
        <ChatList
          selectedChatId={selectedChatId || undefined}
          onChatSelect={(id) => {
            setSelectedChatId(id);
            navigate(`/chat/${id}`);
          }}
          onNewChat={() => {
            const newId = `chat_${Date.now()}`;
            navigate(`/chat/${newId}`);
          }}
        />
      </div>

      {/* Middle: Reader area */}
      <div className="flex flex-col gap-4 overflow-hidden">
        {/* Breadcrumbs */}
        <div className="flex-shrink-0">
          <ReaderToolbar
            trail={trail}
            canBack={canBack}
            canForward={canForward}
            onBack={onBack}
            onForward={onForward}
            progress={readerWindow ? readerWindow.focusIndex / readerWindow.items.length : 0}
          />
        </div>

        {/* Top half: Workbenches + Reader */}
        <div className="flex-1 grid gap-4 overflow-hidden" style={{ gridTemplateColumns: '280px 1fr 280px' }}>
          {/* Left workbench */}
          <div className="bg-card/20 rounded overflow-hidden">
            <WorkbenchPanel
              title="Левая панель"
              item={snapshot?.workbench?.left || null}
              active={snapshot?.discussion_focus_ref === (snapshot?.workbench?.left?.ref || '')}
              onDropRef={async (ref) => {
                try { const st = await api.workbenchSet(sessionId, 'left', ref); setSnapshot(st); } catch {}
              }}
              onClick={async () => {
                const ref = snapshot?.workbench?.left?.ref; if (!ref) return;
                try { const st = await api.chatSetFocus(sessionId, ref); setSnapshot(st); } catch {}
              }}
            />
          </div>

          {/* Reader */}
          <div className="flex flex-col overflow-hidden relative">
            <div className="flex-1 overflow-hidden">
              {readerWindow && (
                <FocusScroller
                  window={readerWindow}
                  onSelect={onSelectRef}
                  onNeedPrev={(count) => {
                    // Placeholder: load more prev
                    if (canBack) onBack();
                  }}
                  onNeedNext={(count) => {
                    // Placeholder: load more next
                    if (canForward) onForward();
                  }}
                  onFocusChange={onSelectRef}
                  onLexiconDoubleClick={handleDoubleClickLexicon}
                />
              )}
            </div>
            {readerWindow && (
              <MiniTimeline
                window={readerWindow}
                onJumpTo={(index) => onSelectRef(readerWindow.items[index].ref)}
              />
            )}
          </div>

          {/* Right workbench */}
          <div className="bg-card/20 rounded overflow-hidden">
            <WorkbenchPanel
              title="Правая панель"
              item={snapshot?.workbench?.right || null}
              active={snapshot?.discussion_focus_ref === (snapshot?.workbench?.right?.ref || '')}
              onDropRef={async (ref) => {
                try { const st = await api.workbenchSet(sessionId, 'right', ref); setSnapshot(st); } catch {}
              }}
              onClick={async () => {
                const ref = snapshot?.workbench?.right?.ref; if (!ref) return;
                try { const st = await api.chatSetFocus(sessionId, ref); setSnapshot(st); } catch {}
              }}
            />
          </div>
        </div>

        {/* Bottom half: Chat */}
        <div className="flex-1 overflow-hidden">
          <FocusChat onSend={onSendChat} chatHistory={snapshot?.chat_local || []} />
        </div>
      </div>

      {/* Right: Bookshelf */}
      <div className="overflow-hidden">
        <BookshelfPanel items={snapshot?.bookshelf?.items || []} onOpen={onSelectRef} />
      </div>

      {lexiconWord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setLexiconWord(null); setLexiconEntries(null); setLexiconError(null); }} />
          <div className="relative z-10 w-full max-w-xl bg-card border rounded-lg shadow-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold">{lexiconWord}</div>
              <button className="text-sm px-2 py-1 border rounded" onClick={() => { setLexiconWord(null); setLexiconEntries(null); setLexiconError(null); }}>Закрыть</button>
            </div>
            {lexiconError && <div className="text-red-500 text-sm">{lexiconError}</div>}
            {!lexiconError && !lexiconEntries && (
              <div className="text-sm text-muted-foreground">Загрузка…</div>
            )}
            {!lexiconError && lexiconEntries && lexiconEntries.length === 0 && (
              <div className="text-sm text-muted-foreground">Определение не найдено</div>
            )}
            {!lexiconError && Array.isArray(lexiconEntries) && lexiconEntries.length > 0 && (
              <div className="space-y-3 max-h-[50vh] overflow-auto pr-2">
                {lexiconEntries.map((entry: any, idx: number) => {
                  const title = entry?.headword || entry?.word || lexiconWord;
                  const sense = entry?.content?.senses?.[0]?.definition || entry?.definition || '';
                  return (
                    <div key={idx} className="border rounded p-2 bg-card/60">
                      <div className="text-sm font-medium mb-1">{title}</div>
                      <div className="text-sm whitespace-pre-wrap text-muted-foreground">{sense || JSON.stringify(entry)}</div>
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
