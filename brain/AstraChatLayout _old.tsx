import React, { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Plus,
  Search,
  Paperclip,
  Mic,
  Send,
  FolderPlus,
  Import,
} from "lucide-react";
import { api } from "../services/api";
import { ChatRequest } from "../types";
import { StudySnapshot } from "../types/study";
import RightSidePanel from "./RightSidePanel";
import { ThinkingEvent } from "./ThinkingProcessPanel";
import { Link } from "react-router-dom";

/**
 * AstraChatLayout — однофайловый шаблон трёхпанельного интерфейса
 * Слева — список чатов, по центру — чат, справа — настройки модели
 * Зависимости: TailwindCSS, shadcn/ui, lucide-react
 * Дизайн близок к ChatGPT (dark), с настраиваемыми CSS-переменными
 */

interface ResearchState {
  currentStatus: string;
  currentPlan: any;
  currentDraft: string;
  currentCritique: string[];
  isResearching: boolean;
  error: string | null;
  notesFeed: Array<{
    ref: string;
    commentator: string | null;
    type: string;
    point: string;
  }>;
}

// --- Study Mode lightweight components ---
function StudyToolbar({
  trail,
  onBack,
  onForward,
  onExit,
  loading,
  canBack = true,
  canForward = true,
}: {
  trail: string[];
  onBack: () => void;
  onForward: () => void;
  onExit: () => void;
  loading?: boolean;
  canBack?: boolean;
  canForward?: boolean;
}) {
  return (<>
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-card/60">
      <button onClick={onBack} disabled={!canBack} className="px-2 py-1 text-xs border rounded disabled:opacity-50">←</button>
      <button onClick={onForward} disabled={!canForward} className="px-2 py-1 text-xs border rounded disabled:opacity-50">→</button>
      <div className="text-xs text-muted-foreground flex-1 truncate">
        {loading ? 'Загрузка…' : trail.join(' › ')}
      </div>
      <button onClick={onExit} className="px-2 py-1 text-xs border rounded">Закрыть</button>
    </div>
  </>);
}

function FocusViewerInline({ snapshot, onSelectRef, onLexiconDoubleClick }: { snapshot: StudySnapshot | null; onSelectRef: (ref: string) => void; onLexiconDoubleClick?: (e: React.MouseEvent) => void; }) {
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
    <div className="h-full flex flex-col bg-card/20">
      <div className="relative h-[55vh] min-h-[340px] overflow-hidden" onWheel={onWheel}>
        <div className="h-full grid grid-rows-[1fr_12vh_1fr]">
          {/* Prev (top) */}
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
          {/* Focus (center) */}
          <div className="px-6">
            <div className="max-w-3xl mx-auto">
              <div className="rounded-lg border-2 border-primary/20 bg-background shadow-lg ring-1 ring-primary/10">
                <div className={`text-xl leading-relaxed text-foreground px-6 py-4 whitespace-pre-wrap select-text ${containsHebrew(focus?.text_full) ? hebrewClass : ''}`} style={{ textAlign: 'justify' }} onDoubleClick={onLexiconDoubleClick}>
                  {focus?.text_full || 'Нет текста'}
                </div>
              </div>
            </div>
          </div>
          {/* Next (bottom) */}
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

export default function AstraChatLayout() {
  const [userId, setUserId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>("default");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<
    Array<{ session_id: string; name: string; last_modified: string }>
  >([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [messages, setMessages] = useState<
    Array<{
      id?: number | string;
      role: "user" | "assistant" | "source";
      content: string;
      timestamp?: any;
      sourceData?: any; // For source messages
    }>
  >([]);
  const [researchState, setResearchState] = useState<ResearchState>({
    currentStatus: "",
    currentPlan: null,
    currentDraft: "",
    currentCritique: [],
    isResearching: false,
    error: null,
    notesFeed: [],
  });
  const [assistantThinking, setAssistantThinking] = useState<string>("");
  const [thinkingEvents, setThinkingEvents] = useState<ThinkingEvent[]>([]);

  const [sources, setSources] = useState<any[]>([]); // for RightSidePanel
  const [commentatorsLists, setCommentatorsLists] = useState<Array<{ reference: string; commentators: any[] }>>([]);
  const [bookshelfItems, setBookshelfItems] = useState<Array<{ ref: string; heRef: string; indexTitle: string; category: string; heCategory: string; isRead: boolean }>>([]);
  const [currentReference, setCurrentReference] = useState<string>('');

  // Study Mode state
  const [studyActive, setStudyActive] = useState<boolean>(false);
  const [studySetupOpen, setStudySetupOpen] = useState<boolean>(false);
  const [studySessionId, setStudySessionId] = useState<string | null>(null);
  const [studySnapshot, setStudySnapshot] = useState<StudySnapshot | null>(null);
  const [studyTrail, setStudyTrail] = useState<string[]>([]);
  const [studyLoading, setStudyLoading] = useState<boolean>(false);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [studyCanBack, setStudyCanBack] = useState<boolean>(true);
  const [studyCanForward, setStudyCanForward] = useState<boolean>(true);
  const [lexWord, setLexWord] = useState<string | null>(null);
  const [lexEntries, setLexEntries] = useState<any[] | null>(null);
  const [lexError, setLexError] = useState<string | null>(null);

  // Generate or retrieve user ID
  useEffect(() => {
    let storedUserId = localStorage.getItem("astra_user_id");
    if (!storedUserId) {
      storedUserId = "web_user"; // static to avoid Brain API warnings
      localStorage.setItem("astra_user_id", storedUserId);
    }
    setUserId(storedUserId);
  }, []);

  // Load chat list on mount
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // локально удаляем чат из списка при успешном DELETE
  useEffect(() => {
    const onDeleted = (e: any) => {
      const id = e?.detail?.sessionId;
      if (!id) return;
      setChats((prev) => prev.filter((c) => c.session_id !== id));
      if (selectedChatId === id) {
        setSelectedChatId(prev => (prev && prev !== id ? prev : (prev && chats.find(c => c.session_id !== id)?.session_id) || null));
      }
    };
    window.addEventListener('astra:chat_deleted', onDeleted as any);
    return () => window.removeEventListener('astra:chat_deleted', onDeleted as any);
  }, [selectedChatId, chats]);

  // Load chat history when selection changes
  useEffect(() => {
    const loadHistory = async () => {
      if (!selectedChatId) return;
      try {
        const data: any = await api.getChatHistory(selectedChatId);
        const msgs = (data.messages || data.history || data || []).map((m: any) => ({
          id: m.id,
          role: (m.role || m.sender) === "human" ? "user" : "assistant",
          content: m.content || m.text || "",
          timestamp: m.timestamp || m.time || Date.now(),
        }));
        setMessages(msgs);
      } catch {
        setMessages([]); // keep demo empty if history fails
      }
    };
    loadHistory();
  }, [selectedChatId]);

  const handleCreateChat = () => {
    const newId =
      typeof crypto !== "undefined" && (crypto as any).randomUUID
        ? (crypto as any).randomUUID()
        : `chat_${Date.now()}`;
    const newChat = {
      session_id: newId,
      name: "Новый чат",
      last_modified: new Date().toISOString(),
    };
    setChats((prev) => [newChat, ...prev]);
    setSelectedChatId(newId);
  };

  // Study setup bar (inline) when user clicks Study Mode
  const StudySetupBar = () => {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<string[]>([]);
    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setCandidates([]);
      setLoading(true);
      try {
        const res: any = await api.resolveRef(query);
        let ref: string | null = null;
        if (res.ok) {
          ref = res.ref;
        } else if (res.candidates && res.candidates.length > 0) {
          setCandidates(res.candidates);
          return;
        } else {
          setError('Не удалось определить ссылку');
          return;
        }
        const sid = (crypto as any)?.randomUUID?.() || `s_${Date.now()}`;
        const st = await api.setFocus(sid, ref!);
        setStudySessionId(sid);
        setStudySnapshot(st);
        setStudyTrail([st?.focus?.ref || ref!]);
        setCurrentReference(st?.focus?.ref || '');
        const mapped = (st?.bookshelf?.items || []).map((it: any) => ({
          ref: it.ref,
          heRef: it.ref,
          indexTitle: it.title || it.commentator || it.ref,
          category: it.category || '',
          heCategory: it.category || '',
          isRead: false,
        }));
        setBookshelfItems(mapped);
        setStudyActive(true);
        setStudySetupOpen(false);
      } catch (err: any) {
        setError(err?.message || 'Ошибка запроса');
      } finally { setLoading(false); }
    };
    return (
      <div className="px-4 py-2 border-b bg-card/70 flex-shrink-0">
        <form onSubmit={submit} className="flex gap-2 items-center">
          <input className="border rounded px-3 py-2 text-sm bg-background flex-1" placeholder="Введите ссылку (например, Shabbat 21a)" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="px-3 py-1 text-sm border rounded" disabled={loading || !query.trim()}>Открыть</button>
          <button type="button" className="px-2 py-1 text-sm border rounded" onClick={() => setStudySetupOpen(false)}>Отмена</button>
        </form>
        {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
        {candidates.length > 0 && (
          <div className="mt-2 flex gap-2 flex-wrap">
            {candidates.map((c) => (
              <button key={c} className="px-2 py-1 text-xs border rounded" onClick={async () => {
                try {
                  const sid = (crypto as any)?.randomUUID?.() || `s_${Date.now()}`;
                  const st = await api.setFocus(sid, c);
                  setStudySessionId(sid);
                  setStudySnapshot(st);
                  setStudyTrail([st?.focus?.ref || c]);
                  setCurrentReference(st?.focus?.ref || '');
                  const mapped = (st?.bookshelf?.items || []).map((it: any) => ({
                    ref: it.ref,
                    heRef: it.ref,
                    indexTitle: it.title || it.commentator || it.ref,
                    category: it.category || '',
                    heCategory: it.category || '',
                    isRead: false,
                  }));
                  setBookshelfItems(mapped);
                  setStudyActive(true);
                  setStudySetupOpen(false);
                } catch (e) { /* ignore */ }
              }}>{c}</button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (<>
    <div className={`h-screen w-full overflow-hidden bg-background text-foreground grid ${studyActive ? 'grid-cols-[280px_minmax(0,1.9fr)_minmax(240px,0.8fr)]' : 'grid-cols-[280px_minmax(0,1fr)_minmax(240px,0.8fr)]'}`}>
      {/* Sidebar — Chats */}
      <aside className="border-r bg-card/50 backdrop-blur-sm flex flex-col min-h-0">
        <div className="flex-shrink-0 p-3">
          <SidebarHeader onNewChat={handleCreateChat} />
        </div>
        <div className="flex-shrink-0 border-t mx-3 my-2" />
        <div className="flex-shrink-0 p-3">
          <SidebarSearch />
        </div>
        <div className="flex-shrink-0 border-t mx-3 my-2" />
        <div className="flex-1 min-h-0">
          <div className="h-full overflow-y-auto">
            <ChatList
              onChatSelect={setSelectedChatId}
              selectedChatId={selectedChatId}
              chats={chats}
              isLoading={isLoadingChats}
              error={chatError}
            />
          </div>
        </div>
        <div className="flex-shrink-0 border-t mx-3 my-2" />
        <div className="flex-shrink-0 p-3">
          <SidebarFooter />
        </div>
      </aside>

      {/* Center - Chat */}
      <div className="flex flex-col min-h-0">
        <div className="h-14 border-b bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 flex-shrink-0">
          <TopBar agentId={agentId} setAgentId={setAgentId} onOpenStudy={() => setStudySetupOpen(true)} />
        </div>
        {studySetupOpen && !studyActive && <StudySetupBar />}
        {studyActive && (
          <StudyToolbar
            trail={studyTrail}
            onBack={async () => {
              if (!studySessionId) return;
              try {
                setStudyLoading(true);
                const st = await api.back(studySessionId);
                setStudySnapshot(st);
                if (st?.focus?.ref) setStudyTrail((t) => (t[t.length - 1] === st.focus!.ref ? t : [...t, st.focus!.ref]));
                setCurrentReference(st?.focus?.ref || '');
                setStudyCanBack(true); setStudyCanForward(true);
                // map bookshelf for RightSidePanel
                const mapped = (st?.bookshelf?.items || []).map((it: any) => ({
                  ref: it.ref,
                  heRef: it.ref,
                  indexTitle: it.title || it.commentator || it.ref,
                  category: it.category || '',
                  heCategory: it.category || '',
                  isRead: false,
                }));
                setBookshelfItems(mapped);
              } catch { setStudyCanBack(false); }
              finally { setStudyLoading(false); }
            }}
            onForward={async () => {
              if (!studySessionId) return;
              try {
                setStudyLoading(true);
                const st = await api.forward(studySessionId);
                setStudySnapshot(st);
                if (st?.focus?.ref) setStudyTrail((t) => (t[t.length - 1] === st.focus!.ref ? t : [...t, st.focus!.ref]));
                setCurrentReference(st?.focus?.ref || '');
                setStudyCanBack(true); setStudyCanForward(true);
                const mapped = (st?.bookshelf?.items || []).map((it: any) => ({
                  ref: it.ref,
                  heRef: it.ref,
                  indexTitle: it.title || it.commentator || it.ref,
                  category: it.category || '',
                  heCategory: it.category || '',
                  isRead: false,
                }));
                setBookshelfItems(mapped);
              } catch { setStudyCanForward(false); }
              finally { setStudyLoading(false); }
            }}
            onExit={() => { setStudyActive(false); setStudySnapshot(null); setStudyTrail([]); setStudySessionId(null); setBookshelfItems([]); setCurrentReference(''); }}
            loading={studyLoading}
            canBack={studyCanBack}
            canForward={studyCanForward}
          />
        )}
        {studyActive && (
          <div className="mt-2 grid grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(280px,320px)] gap-4">
            <div className="min-h-0 h-full">
              <WorkbenchPanelInline
                title="Левая панель"
                item={studySnapshot?.workbench?.left || null}
                active={studySnapshot?.discussion_focus_ref === (studySnapshot?.workbench?.left?.ref || '')}
                onDropRef={async (ref) => { if (!studySessionId) return; try { const st = await api.workbenchSet(studySessionId, 'left', ref); setStudySnapshot(st); } catch {} }}
                onClick={async () => { if (!studySessionId) return; const ref = studySnapshot?.workbench?.left?.ref; if (!ref) return; try { const st = await api.chatSetFocus(studySessionId, ref); setStudySnapshot(st); } catch {} }}
              />
            </div>
            <div
              className="min-h-0 h-full rounded-lg border border-border/60 bg-card/30 overflow-hidden"
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('text/astra-commentator-ref') || e.dataTransfer.types.includes('text/plain')) {
                  e.preventDefault();
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const ref = e.dataTransfer.getData('text/astra-commentator-ref') || e.dataTransfer.getData('text/plain');
                if (!ref || !studySessionId) return;
                (async () => {
                  try {
                    setStudyLoading(true);
                    const st = await api.setFocus(studySessionId, ref);
                    setStudySnapshot(st);
                    if (st?.focus?.ref) setStudyTrail((t) => [...t, st.focus!.ref]);
                    setCurrentReference(st?.focus?.ref || '');
                    setStudyCanBack(true); setStudyCanForward(true);
                    const mapped = (st?.bookshelf?.items || []).map((it: any) => ({
                      ref: it.ref,
                      heRef: it.ref,
                      indexTitle: it.title || it.commentator || it.ref,
                      category: it.category || '',
                      heCategory: it.category || '',
                      isRead: false,
                    }));
                    setBookshelfItems(mapped);
                  } finally { setStudyLoading(false); }
                })();
              }}
            >
              <FocusViewerInline
                snapshot={studySnapshot}
                onSelectRef={async (ref) => {
                if (!studySessionId) return;
                try {
                  setStudyLoading(true);
                  const st = await api.setFocus(studySessionId, ref);
                  setStudySnapshot(st);
                  if (st?.focus?.ref) setStudyTrail((t) => [...t, st.focus!.ref]);
                  setCurrentReference(st?.focus?.ref || '');
                  setStudyCanBack(true); setStudyCanForward(true);
                  const mapped = (st?.bookshelf?.items || []).map((it: any) => ({
                    ref: it.ref,
                    heRef: it.ref,
                    indexTitle: it.title || it.commentator || it.ref,
                    category: it.category || '',
                    heCategory: it.category || '',
                    isRead: false,
                  }));
                  setBookshelfItems(mapped);
                } finally { setStudyLoading(false); }
                }}
                onLexiconDoubleClick={async (_e) => {
                  const selected = (window.getSelection()?.toString() || '').trim();
                  if (!selected) return;
                  const query = selected.replace(/[\u0591-\u05C7]/g, '').replace(/["'’“”().,!?;:\-\[\]{}]/g, '').trim();
                  if (!query) return;
                  setLexWord(selected); setLexError(null); setLexEntries(null);
                  try { const entries = await api.getLexicon(query); setLexEntries(Array.isArray(entries) ? entries : []); } catch (err: any) { setLexError(err?.message || 'Не удалось получить определение'); }
                }}
              />
            </div>
            <div className="min-h-0">
              <WorkbenchPanelInline
                title="Правая панель"
                item={studySnapshot?.workbench?.right || null}
                active={studySnapshot?.discussion_focus_ref === (studySnapshot?.workbench?.right?.ref || '')}
                onDropRef={async (ref) => { if (!studySessionId) return; try { const st = await api.workbenchSet(studySessionId, 'right', ref); setStudySnapshot(st); } catch {} }}
                onClick={async () => { if (!studySessionId) return; const ref = studySnapshot?.workbench?.right?.ref; if (!ref) return; try { const st = await api.chatSetFocus(studySessionId, ref); setStudySnapshot(st); } catch {} }}
              />
            </div>
          </div>
        )}
        <div
          className="flex-1 min-h-0 overflow-y-auto relative"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('text/astra-commentator-ref') || e.dataTransfer.types.includes('text/plain')) {
              e.preventDefault();
              // Add visual feedback for drag over
              e.currentTarget.classList.add('bg-accent/10');
            }
          }}
          onDragLeave={(e) => {
            // Remove visual feedback when drag leaves
            e.currentTarget.classList.remove('bg-accent/10');
          }}
          onDrop={(e) => {
            e.preventDefault(); // Prevent default browser behavior
            const ref = e.dataTransfer.getData('text/astra-commentator-ref') || e.dataTransfer.getData('text/plain');
            if (!ref) return;

            console.log('📥 Source dropped:', ref);

            // If Study Mode is active, treat drop as set_focus navigation
            if (studyActive && studySessionId) {
              (async () => {
                try {
                  setStudyLoading(true);
                  const st = await api.setFocus(studySessionId, ref);
                  setStudySnapshot(st);
                  if (st?.focus?.ref) setStudyTrail((t) => [...t, st.focus!.ref]);
                  setCurrentReference(st?.focus?.ref || '');
                  setStudyCanBack(true); setStudyCanForward(true);
                  const mapped = (st?.bookshelf?.items || []).map((it: any) => ({
                    ref: it.ref,
                    heRef: it.ref,
                    indexTitle: it.title || it.commentator || it.ref,
                    category: it.category || '',
                    heCategory: it.category || '',
                    isRead: false,
                  }));
                  setBookshelfItems(mapped);
                } catch (err) {
                  console.warn('Failed to set_focus from drop, falling back to chat flow', err);
                } finally {
                  setStudyLoading(false);
                }
              })();
              return;
            }

            // OPTIMISTIC UI: Immediately display the source in chat
            const sourceMessage = {
              id: `source_${Date.now()}`,
              role: 'source' as const,
              content: `Источник: ${ref}`,
              timestamp: Date.now(),
              sourceData: {
                reference: ref,
                text: 'Загрузка текста источника...',
                book: ref.split('.')[0] || 'Источник'
              }
            };

            setMessages((prev) => [...prev, sourceMessage]);

            // Отправляем скрытый запрос на изучение комментария
            const hidden = `Изучаем комментарий: ${ref}`;
            const handleDropRequest = async () => {
              try {
                console.log('📤 Sending hidden command:', hidden);
                const request: ChatRequest = {
                  text: hidden,
                  agent_id: 'default', // Use default agent for drag-and-drop to avoid research mode
                  user_id: userId || 'web_user',
                  session_id: selectedChatId || undefined,
                };
                await api.sendMessageStreamNDJSON(request, {
                  onStatus: (m: string) => {
                    console.log('📊 Status update:', m);
                    setResearchState((p) => ({ ...p, currentStatus: m || p.currentStatus }));
                  },
                  onDraft: (d: any) => setResearchState((p) => ({ ...p, currentDraft: d?.draft ?? d ?? p.currentDraft })),
                  onFinalDraft: (fd: any) => {
                    const text: string = fd?.draft || fd?.content || '';
                    if (!text) return;
                    console.log('🎯 Final draft received:', text);
 
                    // Add the assistant response to messages
                    setMessages((prev) => {
                      // Check if we already have an assistant message with the same content
                      const hasDuplicate = prev.some(msg =>
                        msg.role === 'assistant' && msg.content === text
                      );
                      if (hasDuplicate) {
                        return prev; // Don't duplicate
                      }
                      return [...prev, { id: Date.now(), role: 'assistant', content: text, timestamp: Date.now() }];
                    });
 
                    // Reset research state
                    setResearchState((prev) => ({ ...prev, isResearching: false, currentStatus: 'Ответ готов' }));
 
                    // If we don't have a selectedChatId, the backend created a new session
                    // We should refresh the chat list to show the new session
                    if (!selectedChatId) {
                      console.log('🔄 No selectedChatId found, refreshing chat list...');
                      const loadChats = async () => {
                        try {
                          const data = await api.getChatList();
                          setChats(data.chats || []);
                          // Select the most recent chat (likely the one just created)
                          if (data.chats && data.chats.length > 0) {
                            const newSessionId = data.chats[0].session_id;
                            setSelectedChatId(newSessionId);
                            console.log('✅ Selected new session:', newSessionId);
                          }
                        } catch (e) {
                          console.error('Failed to refresh chat list:', e);
                          // Fallback: create a new chat if refresh fails
                          handleCreateChat();
                        }
                      };
                      loadChats();
                    }
                  },
                  onSource: (s: any) => {
                    console.log('📚 Source received:', s);
                    setSources((prev) => [...prev, s]);
                    // Mark bookshelf item as read if it matches
                    if (s.ref) {
                      setBookshelfItems(prev =>
                        prev.map(item =>
                          item.ref === s.ref ? { ...item, isRead: true } : item
                        )
                      );
                    }
                    // Update the optimistic source message with real data
                    setMessages((prev) => prev.map(msg =>
                      msg.id === sourceMessage.id && msg.role === 'source'
                        ? { ...msg, sourceData: { ...msg.sourceData, ...s } }
                        : msg
                    ));
                  },
                  onSourceText: (st: any) => {
                    console.log('📝 Source text received:', st);
                    setSources((prev) => {
                      const idx = prev.findIndex((x: any) => x.id === st.id);
                      if (idx >= 0) { const up = [...prev]; up[idx] = { ...up[idx], ...st }; return up; }
                      return [...prev, st];
                    });
                    // Update the optimistic source message with text
                    setMessages((prev) => prev.map(msg =>
                      msg.id === sourceMessage.id && msg.role === 'source'
                        ? { ...msg, sourceData: { ...msg.sourceData, ...st } }
                        : msg
                    ));
                  },
                  onError: (err: any) => {
                    console.error('❌ Drop request error:', err);
                    setResearchState((p) => ({ ...p, error: err?.message || 'Unknown error', isResearching: false }));
                    // Update the optimistic message to show error
                    setMessages((prev) => prev.map(msg =>
                      msg.id === sourceMessage.id && msg.role === 'source'
                        ? { ...msg, sourceData: { ...msg.sourceData, text: 'Ошибка загрузки источника' } }
                        : msg
                    ));
                  },
                  onCommentatorsList: (data: { reference: string; commentators: any[] }) => {
                    console.log('🧑‍🏫 Commentators list received for drop:', data);
                    setCommentatorsLists((prev) => [...prev, data]);
                  },
                  onComplete: () => {
                    console.log('✅ Drop request completed');
                    setResearchState((p) => ({ ...p, isResearching: false }));
                  },
                } as any);
              } catch (err) {
                console.error('❌ Drop request failed:', err);
                // Update the optimistic message to show error
                setMessages((prev) => prev.map(msg =>
                  msg.id === sourceMessage.id && msg.role === 'source'
                    ? { ...msg, sourceData: { ...msg.sourceData, text: 'Ошибка загрузки источника' } }
                    : msg
                ));
              }
            };

            // Execute the async function without await to prevent blocking
            handleDropRequest().catch((error) => {
              console.error('❌ Drag request failed:', error);
              // Update the optimistic message to show error
              setMessages((prev) => prev.map(msg =>
                msg.id === sourceMessage.id && msg.role === 'source'
                  ? { ...msg, sourceData: { ...msg.sourceData, text: 'Ошибка загрузки источника' } }
                  : msg
              ));
              // Reset research state on error
              setResearchState((p) => ({ ...p, isResearching: false, error: error?.message || 'Unknown error' }));
            });
          }}
        >
          {/* Center, subtle status overlay */}
          {researchState.currentStatus && (
            <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-10">
              <div className="px-3 py-1 rounded-full text-[11px] bg-muted/40 text-muted-foreground border border-border/60 shadow-sm">
                {researchState.currentStatus}
              </div>
            </div>
          )}
          <ChatViewport
            researchState={{ ...researchState, currentPlan: null, currentCritique: [], notesFeed: [], currentDraft: researchState.isResearching ? '' : researchState.currentDraft }}
            messages={messages}
            assistantThinking={assistantThinking}
          />
      </div>
        <Composer
          userId={userId}
          researchState={researchState}
          setResearchState={setResearchState}
          setSources={setSources}
          selectedChatId={selectedChatId}
          studyActive={studyActive}
          studySessionId={studySessionId}
          setMessages={setMessages}
          setAssistantThinking={setAssistantThinking}
          messages={messages}
          agentId={agentId}
          pushThinkingEvent={(type, data) => {
            const id = (crypto as any)?.randomUUID?.() ?? `think_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
            setThinkingEvents(prev => [...prev, { id, type: type as any, data, timestamp: Date.now() }]);
          }}
          addCommentatorsList={(data) => setCommentatorsLists(prev => [...prev, data])}
          handleCommentatorsPanelUpdate={(data) => {
            console.log('🧑‍🏫 Commentators panel update received:', data);
            setCurrentReference(data.reference);
            setBookshelfItems(data.commentators.map(c => ({ ...c, isRead: false })));
          }}
        />
      </div>

      {/* Right Panel - Sources */}
      <aside className="border-l bg-card/50 backdrop-blur-sm flex flex-col min-h-0">
        <div className="flex-1 min-h-0">
          <RightSidePanel
            sources={sources}
            commentatorsLists={commentatorsLists}
            bookshelfItems={bookshelfItems}
            currentReference={currentReference}
            isResearching={researchState.isResearching}
            researchState={{
              currentStatus: researchState.currentStatus,
              currentPlan: researchState.currentPlan,
              currentDraft: researchState.currentDraft,
              currentCritique: researchState.currentCritique,
              error: researchState.error,
            }}
          />
        </div>
      </aside>

      {/* Remove floating panels in favor of unified panel; keep sources on the right */}

    </div>

    
    {studyActive && lexWord && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => { setLexWord(null); setLexEntries(null); setLexError(null); }} />
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
                const rendered = formatLexiconHtml(typeof sense === 'string' ? sense : JSON.stringify(sense));
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
  </>);
}

function WorkbenchPanelInline({
  title,
  item,
  active,
  onDropRef,
  onClick,
}: {
  title: string;
  item: any;
  active: boolean;
  onDropRef: (ref: string) => void;
  onClick: () => void;
}) {
  const [isOver, setIsOver] = useState(false);
  return (
    <div
      className={`h-full border-2 transition-all duration-200 ${
        isOver
          ? 'border-primary bg-primary/5 scale-105'
          : 'border-dashed border-border hover:border-border/60'
      } rounded-lg bg-card/30 ${active ? 'ring-2 ring-primary' : ''} flex flex-col p-3`}
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
      <div className="flex-1">
        {item ? (
          <div>
            <div className="text-sm font-medium">{item.title || item.commentator || item.ref}</div>
            <div className="text-xs text-muted-foreground mb-1">{item.category}</div>
            {item.preview && (
              <div className="text-xs whitespace-pre-wrap text-muted-foreground/80 max-h-40 overflow-auto">
                {item.preview}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full rounded-md border border-dashed border-border/60 bg-background/40" />
        )}
      </div>
    </div>
  );
}

function formatLexiconHtml(html: string): string {
  if (!html) return '';

  let output = html
    // normalize non-breaking spaces
    .replace(/&nbsp;/gi, ' ')
    // ensure spans with rtl direction render properly
    .replace(/<(span|div)\s+dir="rtl"/gi, '<$1 dir="rtl" style="direction:rtl;text-align:right;"');

  output = output.replace(/<a\s+([^>]*?)>/gi, (_match, attrs) => {
    const cleaned = attrs
      .replace(/\s?class="[^"]*"/gi, '')
      .replace(/\s?data-[^=]+="[^"]*"/gi, '')
      .replace(/\s?target="[^"]*"/gi, '')
      .replace(/\s?rel="[^"]*"/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const prefix = cleaned.length ? ` ${cleaned}` : '';
    return `<a${prefix} class="text-primary underline" target="_blank" rel="noopener noreferrer">`;
  });

  return output;
}
function SidebarHeader({ onNewChat }: { onNewChat: () => void }) {
  return (
    <div className="p-3 flex items-center gap-2">
      <Button className="w-full" size="sm" onClick={onNewChat}>
        <Plus className="w-4 h-4 mr-2" /> Новый чат
      </Button>
    </div>
  );
}

function SidebarSearch() {
  return (
    <div className="p-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Поиск по чатам…" />
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" className="w-full">
          <FolderPlus className="w-4 h-4 mr-2" /> Папка
        </Button>
        <Button variant="secondary" size="sm" className="w-10 px-0" title="Импорт истории">
          <Import className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

interface ChatListProps {
  onChatSelect: (chatId: string) => void;
  selectedChatId: string | null;
  chats: Array<{ session_id: string; name: string; last_modified: string }>;
  isLoading: boolean;
  error: string | null;
}

function ChatList({ onChatSelect, selectedChatId, chats, isLoading, error }: ChatListProps) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-2 space-y-1">
        {isLoading && <div className="text-xs text-muted-foreground px-3 py-2">Загрузка чатов…</div>}
        {error && <div className="text-xs text-red-400 px-3 py-2">Ошибка: {error}</div>}
        {chats.map((chat) => (
          <div key={chat.session_id} className="group flex items-center gap-2">
            <button
              onClick={() => onChatSelect(chat.session_id)}
              className={`flex-1 p-3 text-left rounded-lg border transition-colors ${
                selectedChatId === chat.session_id
                  ? "bg-accent/60 border-accent/60"
                  : "bg-card/50 hover:bg-accent/50 border-transparent"
              }`}
            >
              <div className="font-medium text-sm truncate">{chat.name || `Чат ${chat.session_id.slice(0, 8)}...`}</div>
              <div className="text-xs text-muted-foreground truncate mt-1">
                {isFinite(Date.parse(chat.last_modified))
                  ? new Date(chat.last_modified).toLocaleDateString()
                  : "—"}
              </div>
            </button>
            <DeleteChatButton sessionId={chat.session_id} />
          </div>
        ))}
        {!isLoading && !error && chats.length === 0 && (
          <div className="text-xs text-muted-foreground px-3 py-2">Нет чатов</div>
        )}
      </div>
    </div>
  );
}

function DeleteChatButton({ sessionId }: { sessionId: string }) {
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteChat(sessionId);
      // локально удаляем элемент из списка без повторного GET
      // В рамках этого файла нет прямого доступа к setChats; упрощённый подход — эмитить кастомное событие
      window.dispatchEvent(new CustomEvent('astra:chat_deleted', { detail: { sessionId } }));
    } catch (err) {
      console.error('Не удалось удалить чат', err);
      alert('Не удалось удалить чат');
    }
  };

  return (
    <button
      title="Удалить чат"
      onClick={handleDelete}
      className="opacity-60 hover:opacity-100 text-xs px-2 py-1 rounded border bg-transparent hover:bg-red-500/10 text-red-400 border-red-400/40"
    >
      Удалить
    </button>
  );
}

function SidebarFooter() {
  return (
    <div className="p-3">
      <div className="text-xs text-muted-foreground">Astra Chat v1.0</div>
    </div>
  );
}

function TopBar({ agentId, setAgentId, onOpenStudy }: { agentId: string; setAgentId: (v: string) => void; onOpenStudy: () => void }) {
  return (
    <div className="h-14 border-b bg-card/50 backdrop-blur-sm flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <h1 className="font-semibold">Astra Chat</h1>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onOpenStudy} className="h-8 text-xs rounded border px-2 flex items-center hover:bg-accent" title="Открыть Study Mode">
          Study Mode
        </button>
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          className="h-8 text-xs rounded border bg-background px-2"
          title="Выбор ассистента"
        >
          <option value="default">default</option>
          <option value="chevruta_deepresearch">chevruta_deepresearch</option>
          <option value="chevruta_study_bimodal">chevruta_study_bimodal</option>
        </select>
        <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Демо режим</div>
      </div>
    </div>
  );
}

interface ChatViewportProps {
  researchState: ResearchState;
  messages: Array<{
    id?: number | string;
    role: "user" | "assistant" | "source";
    content: string;
    timestamp?: any;
    sourceData?: any;
  }>;
  assistantThinking: string;
}

function ChatViewport({ researchState, messages, assistantThinking }: ChatViewportProps) {
  console.log("🔄 ChatViewport render:", {
    isResearching: researchState.isResearching,
    currentStatus: researchState.currentStatus,
    notesCount: researchState.notesFeed.length,
    currentDraftLength: researchState.currentDraft.length,
  });

  const getNoteIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "primary":
        return "📖";
      case "commentary":
        return "💬";
      case "analysis":
        return "🔍";
      case "summary":
        return "📝";
      case "insight":
        return "💡";
      default:
        return "📌";
    }
  };

  const formatRef = (ref: string) => {
    return ref.replace(/\./g, " ").replace(/(\d+):(\d+)/, "$1:$2");
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Research Process Messages */}
        {researchState.isResearching && (
          <div className="space-y-3">
            {/* Status Messages */}
            {researchState.currentStatus && (
              <div className="bg-muted/20 rounded-lg p-2 border border-muted/40">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {researchState.currentStatus.includes("error") ||
                    researchState.currentStatus.includes("Error")
                      ? "❌"
                      : researchState.currentStatus.includes("complete") ||
                        researchState.currentStatus.includes("Complete")
                      ? "✅"
                      : researchState.currentStatus.includes("processing") ||
                        researchState.currentStatus.includes("working")
                      ? "🔄"
                      : researchState.currentStatus.includes("planning")
                      ? "📋"
                      : researchState.currentStatus.includes("drafting")
                      ? "📝"
                      : researchState.currentStatus.includes("critique")
                      ? "🔍"
                      : "⏳"}
                  </span>
                  <span>{researchState.currentStatus}</span>
                </div>
              </div>
            )}

            {/* Plan Message */}
            {researchState.currentPlan && (
              <div className="bg-muted/10 rounded-lg p-2 border border-muted/30">
                <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                  <span className="text-sm">📋</span>
                  <span className="text-xs font-medium">План исследования</span>
                </div>
                <pre className="text-[11px] text-muted-foreground/90 bg-muted/10 p-2 rounded overflow-x-auto">
                  {JSON.stringify(researchState.currentPlan, null, 2)}
                </pre>
              </div>
            )}

            {/* Notes Feed */}
            {researchState.notesFeed.map((note, index) => (
              <div key={index} className="bg-muted/10 rounded-lg p-2 border border-muted/30">
                <div className="flex items-start gap-2">
                  <span className="text-xs">{getNoteIcon(note.type)}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {formatRef(note.ref)}
                      </span>
                      {note.commentator && (
                        <span className="text-[11px] text-muted-foreground/70">by {note.commentator}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground/60">{note.type}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-relaxed">{note.point}</div>
                  </div>
                </div>
              </div>
            ))}

            {/* Draft Messages */}
            {researchState.currentDraft && (
              <div className="bg-muted/10 rounded-lg p-2 border border-muted/30">
                <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                  <span className="text-sm">📝</span>
                  <span className="text-xs font-medium">Черновик</span>
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed" style={{ whiteSpace: "pre-wrap" }}>
                  {researchState.currentDraft}
                </div>
              </div>
            )}

            {/* Critique Messages */}
            {researchState.currentCritique.map((critique, index) => (
              <div key={index} className="bg-muted/10 rounded-lg p-2 border border-muted/30">
                <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                  <span className="text-sm">🔍</span>
                  <span className="text-xs font-medium">Критика</span>
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">{critique}</div>
              </div>
            ))}

            {/* Error Messages */}
            {researchState.error && (
              <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">❌</span>
                  <span className="text-sm font-medium text-red-400">Ошибка</span>
                </div>
                <div className="text-sm text-red-300/90">{researchState.error}</div>
              </div>
            )}
          </div>
        )}

        {/* Final Research Result */}
        {researchState.currentDraft && !researchState.isResearching && (
          <div className="bg-card/80 backdrop-blur-sm rounded-lg p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🎯</span>
              <h3 className="font-semibold">Финальный результат исследования</h3>
            </div>
            <div className="prose prose-sm max-w-none text-sm">
              <div style={{ whiteSpace: "pre-wrap" }}>{researchState.currentDraft}</div>
            </div>
          </div>
        )}

        {/* Welcome Message */}
        {!researchState.isResearching &&
          !researchState.currentDraft &&
          !researchState.currentPlan &&
          messages.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-lg">Добро пожаловать в Astra Chat!</p>
              <p className="text-sm mt-2">Выберите чат из списка слева или создайте новый.</p>
              <p className="text-xs mt-4 opacity-70">
                Для исследования введите:{" "}
                <code className="bg-muted px-2 py-1 rounded">/research &lt;тема&gt;</code>
              </p>
            </div>
          )}

        {/* Chat Messages */}
        {messages.length > 0 && (
          <div className="space-y-3">
            {messages.map((m, index) => (
              <div key={m.id || `msg-${index}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "source" ? (
                  // Special source block styling
                  <div className="max-w-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-blue-600 dark:text-blue-400">📚</span>
                      <h4 className="font-semibold text-blue-900 dark:text-blue-100 text-sm">
                        Источник: {m.sourceData?.reference || m.sourceData?.heRef || m.sourceData?.book || 'Неизвестный источник'}
                      </h4>
                    </div>
                    {m.sourceData?.author && (
                      <div className="text-xs text-blue-700 dark:text-blue-300 mb-1">
                        Автор: {m.sourceData.author}
                      </div>
                    )}
                    {m.sourceData?.text && (
                      <div className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed bg-white/50 dark:bg-blue-900/20 rounded p-3 border border-blue-100 dark:border-blue-800">
                        {m.sourceData.text}
                      </div>
                    )}
                    {m.sourceData?.url && (
                      <a
                        href={m.sourceData.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
                      >
                        Открыть источник →
                      </a>
                    )}
                  </div>
                ) : (
                  <div
                    className={`max-w-2xl px-3 py-2 rounded-2xl text-sm ${
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/20 text-foreground"
                    }`}
                  >
                    {m.content}
                  </div>
                )}
              </div>
            ))}
            {assistantThinking && (
              <div key="assistant-thinking" className="flex justify-start">
                <div className="max-w-2xl px-3 py-2 rounded-2xl text-sm bg-muted/10 text-muted-foreground border border-muted/30 whitespace-pre-wrap">
                  {assistantThinking}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ComposerProps {
  userId: string | null;
  selectedChatId: string | null;
  studyActive: boolean;
  studySessionId: string | null;
  messages: Array<{
    id?: number | string;
    role: "user" | "assistant" | "source";
    content: string;
    timestamp?: any;
    sourceData?: any;
  }>;
  setMessages: React.Dispatch<
    React.SetStateAction<Array<{
      id?: number | string;
      role: "user" | "assistant" | "source";
      content: string;
      timestamp?: any;
      sourceData?: any;
    }>>
  >;
  researchState: ResearchState;
  setResearchState: React.Dispatch<React.SetStateAction<ResearchState>>;
  setSources: React.Dispatch<React.SetStateAction<any[]>>;
  setAssistantThinking: React.Dispatch<React.SetStateAction<string>>;
  agentId: string;
  pushThinkingEvent: (type: string, data: any) => void;
  addCommentatorsList: (data: { reference: string; commentators: any[] }) => void;
  handleCommentatorsPanelUpdate: (data: { reference: string; commentators: Array<{ ref: string; heRef: string; indexTitle: string; category: string; heCategory: string }> }) => void;
}

function Composer({
  userId,
  selectedChatId,
  studyActive,
  studySessionId,
  messages,
  setMessages,
  researchState,
  setResearchState,
  setSources,
  setAssistantThinking,
  agentId,
  pushThinkingEvent,
  addCommentatorsList,
}: ComposerProps) {
  const [input, setInput] = useState("");
  // держим id последнего "частичного" ответа ассистента, чтобы не конфликтовать ключами
  const partialAssistantIdRef = useRef<string | null>(null);

  const handleSend = async () => {
    console.log("🚀 handleSend called with input:", input.trim());
    console.log("🔍 Conditions check:", {
      hasInput: !!input.trim(),
      isResearching: researchState.isResearching,
      inputValue: input.trim(),
    });

    if (!input.trim() || researchState.isResearching) {
      console.log("❌ Request blocked by conditions");
      return;
    }

    // сбрасываем мысли ассистента перед новым запросом
    setAssistantThinking("");
    partialAssistantIdRef.current = null;

    // Проверяем команду /research
    if (input.trim().startsWith("/research")) {
      console.log("🔬 Starting research mode");
      await startResearch(input.trim().substring(9).trim());
      return;
    }

    // Обычная отправка сообщения — показываем его сразу
    const textToSend = input;
    const userMsg = { id: Date.now(), role: "user" as const, content: textToSend, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      console.log("Отправляем сообщение:", textToSend, { studyActive, studySessionId });
      const baseRequest: ChatRequest = {
        text: textToSend,
        agent_id: agentId || "default",
        user_id: userId || "web_user",
        session_id: selectedChatId || undefined,
      };

      // Показываем статус отправки
      setResearchState((prev) => ({
        ...prev,
        currentStatus: "Отправляем сообщение...",
        isResearching: true,
      }));

      const streamHandler = {
        onStatus: (message: string) => {
          setResearchState((prev) => ({ ...prev, currentStatus: message }));
          pushThinkingEvent('status', { message });
        },

        onDraft: (draft: any) => {
          // Handle draft events for regular chat
          const textChunk = draft?.chunk || draft?.draft || draft;
          if (!textChunk) return;

          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant") {
              const updated = { ...last, content: (last.content || "") + textChunk };
              return [...prev.slice(0, -1), updated];
            }
            // создаём уникальный id для частичного сообщения
            const id =
              (crypto as any)?.randomUUID?.() ??
              `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            partialAssistantIdRef.current = id;
            return [...prev, { id, role: "assistant" as const, content: textChunk, timestamp: Date.now() }];
          });

          setResearchState((prev) => ({ ...prev, currentStatus: "Печатаю ответ..." }));
        },

        onThought: (chunk: string) => {
          setAssistantThinking((prev) => prev + chunk);
          pushThinkingEvent('thought_chunk', { text: chunk });
        },

        onFinalDraft: (finalDraft: any) => {
          const text = finalDraft?.draft || finalDraft?.content || "";
          if (!text) return;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant") {
              const updated = { ...last, content: text };
              return [...prev.slice(0, -1), updated];
            }
            return [...prev, { id: Date.now(), role: "assistant" as const, content: text, timestamp: Date.now() }];
          });
          setResearchState((prev) => ({ ...prev, isResearching: false, currentStatus: "Ответ готов" }));
          setAssistantThinking("");
          partialAssistantIdRef.current = null;
        },

        // NEW: handle sources in regular chat too
        onSource: (source: any) => {
          setSources((prev) => [...prev, source]);
          // Mark bookshelf item as read if it matches
          if (source.ref) {
            setBookshelfItems(prev =>
              prev.map(item =>
                item.ref === source.ref ? { ...item, isRead: true } : item
              )
            );
          }
        },

        onSourceText: (sourceText: any) => {
          setSources((prev) => {
            const idx = prev.findIndex((s: any) => s.id === sourceText.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], ...sourceText };
              return updated;
            }
            return [...prev, sourceText];
          });
        },

        onCommentatorsList: (data: { reference: string; commentators: any[] }) => {
          console.log("🧑‍🏫 Commentators list callback called:", data);
          addCommentatorsList(data);
          pushThinkingEvent('commentators_list', data);
        },

        onError: (error: any) => {
          console.error("❌ Ошибка:", error);
          setResearchState((prev) => ({
            ...prev,
            error: error?.message ?? "Unknown error",
            isResearching: false,
          }));
          pushThinkingEvent('status', { message: `Error: ${error?.message || 'Unknown error'}` });
        },

        onComplete: () => {
          console.log("✅ Сообщение обработано");
          setResearchState((prev) => ({ ...prev, isResearching: false }));
        },
      };

      if (studyActive && studySessionId) {
        await api.sendMessageStreamNDJSON(
          { ...baseRequest, session_id: studySessionId },
          streamHandler as any,
          true
        );
      } else {
        await api.sendMessageStreamNDJSON(baseRequest, streamHandler as any);
      }
    } catch (error) {
      console.error("Ошибка при отправке сообщения:", error);
      setResearchState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Unknown error",
        isResearching: false,
      }));
    }
  };

  const startResearch = async (topic: string) => {
    console.log("🔬 startResearch called with topic:", topic);
    console.log("🔍 Research conditions:", {
      hasTopic: !!topic.trim(),
      hasUserId: !!userId,
      userId: userId,
    });

    if (!topic.trim() || !userId) {
      console.log("❌ Research blocked by conditions");
      return;
    }

    // сбросим мысли ассистента для чистоты UI
    setAssistantThinking("");
    partialAssistantIdRef.current = null;

    console.log("🔄 Setting research state...");
    // Сброс состояния исследования
    setResearchState({
      currentStatus: "Подключение к серверу...",
      currentPlan: null,
      currentDraft: "",
      currentCritique: [],
      isResearching: true,
      error: null,
      notesFeed: [],
    });

    try {
      console.log(`🔬 Запускаем исследование:`, topic);
      console.log(`📡 API_BASE:`, (import.meta as any).env?.VITE_API_BASE || "/api");
      const request: ChatRequest = {
        text: `/research ${topic}`,
        agent_id: agentId || "chevruta_deepresearch", // выбор ассистента из шапки
        user_id: userId, // dynamic user ID
        // session_id не указываем - бэкенд создаст автоматически
      };
      console.log("📤 Отправляем запрос:", request);

      // Показываем что запрос отправлен
      setResearchState((prev) => ({
        ...prev,
        currentStatus: "Запрос отправлен, ждем ответа...",
      }));

      const streamHandler = {
        onStatus: (message: string) => {
          console.log("📊 Status callback called:", message);
          setResearchState((prev) => ({ ...prev, currentStatus: message }));
          pushThinkingEvent('status', { message });
        },

        onPlan: (plan: any) => {
          console.log("📋 Plan callback called:", plan);
          setResearchState((prev) => ({ ...prev, currentPlan: plan }));
          pushThinkingEvent('plan', plan);
        },

        onDraft: (draft: any) => {
          console.log("📝 Draft callback called:", draft);
          setResearchState((prev) => ({
            ...prev,
            currentDraft: draft?.draft ?? draft ?? "",
          }));
        },

        onCritique: (critique: any) => {
          console.log("🔍 Critique callback called:", critique);
          const feedback = Array.isArray(critique?.feedback) ? critique.feedback : [String(critique)];
          setResearchState((prev) => ({
            ...prev,
            currentCritique: [...prev.currentCritique, ...feedback],
          }));
          pushThinkingEvent('critique', { feedback });
        },

        onCompletenessCheck: (_data: any) => {
          console.log("📊 Completeness check callback called");
          pushThinkingEvent('completeness_check', _data);
        },

        onInternalQuestions: (_data: any) => {
          console.log("❓ Internal questions callback called");
          pushThinkingEvent('internal_questions', _data);
        },

        onError: (error: any) => {
          console.error("❌ Error callback called:", error);
          setResearchState((prev) => ({
            ...prev,
            error: error?.message ?? "Unknown error",
            isResearching: false,
          }));
        },

        onFinalDraft: (draft: any) => {
          console.log("🎯 Final draft callback called:", draft);
          setResearchState((prev) => ({
            ...prev,
            currentDraft: draft?.draft || draft?.content || "Финальный черновик получен",
          }));
        },

        onNoteCreated: (note: { ref: string; commentator: string | null; type: string; point: string }) => {
          console.log("📝 Note created callback called:", note);
          setResearchState((prev) => ({
            ...prev,
            notesFeed: [...prev.notesFeed, note],
          }));
          pushThinkingEvent('note_created', note);
        },

        onSource: (source: any) => {
          console.log("📚 Source callback called:", source);
          setSources((prev) => [...prev, source]);
          // Mark bookshelf item as read if it matches
          if (source.ref) {
            setBookshelfItems(prev =>
              prev.map(item =>
                item.ref === source.ref ? { ...item, isRead: true } : item
              )
            );
          }
          pushThinkingEvent('source', source);
        },

        onSourceText: (sourceText: any) => {
          console.log("📝 Source text callback called:", sourceText);
          setSources((prev) => {
            const idx = prev.findIndex((s: any) => s.id === sourceText.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], ...sourceText };
              return updated;
            }
            return [...prev, sourceText];
          });
        },

        onCommentatorsList: (data: { reference: string; commentators: any[] }) => {
          console.log("🧑‍🏫 Commentators list callback called:", data);
          addCommentatorsList(data);
          pushThinkingEvent('commentators_list', data);
        },

        onComplete: () => {
          console.log("✅ Complete callback called");
          setResearchState((prev) => ({ ...prev, isResearching: false }));
        },
      };

      await api.sendMessageStreamNDJSON(request, streamHandler);
    } catch (error: any) {
      console.error("❌ Error starting research:", error);

      // Fallback демо-режим
      if (error instanceof Error && error.message.includes("Failed to fetch")) {
        console.log("🔄 Запускаем демо режим...");
        setResearchState((prev) => ({
          ...prev,
          currentStatus: "Демо режим: симуляция исследования",
        }));

        const demoSteps = [
          "Анализ запроса...",
          "Планирование исследования...",
          "Сбор информации...",
          "Обработка данных...",
          "Генерация ответа...",
        ];

        demoSteps.forEach((step, i) => {
          setTimeout(() => {
            setResearchState((prev) => ({ ...prev, currentStatus: step }));
          }, (i + 1) * 1000);
        });

        setTimeout(() => {
          const demoNotes = [
            {
              ref: "Genesis.1.1",
              commentator: "Rashi",
              type: "commentary",
              point: "В начале сотворил Бог небо и землю — объяснение создания мира",
            },
            {
              ref: "Genesis.1.2",
              commentator: "Ibn Ezra",
              type: "analysis",
              point: "Земля была безвидна и пуста — анализ состояния мира до творения",
            },
            { ref: "Genesis.1.3", commentator: null, type: "insight", point: "Да будет свет — первый акт творения" },
          ];

          demoNotes.forEach((note, index) => {
            setTimeout(() => {
              setResearchState((prev) => ({ ...prev, notesFeed: [...prev.notesFeed, note] }));
            }, (demoSteps.length + index + 1) * 1000);
          });
        }, demoSteps.length * 1000);

        setTimeout(() => {
          setResearchState((prev) => ({
            ...prev,
            currentDraft: `# Исследование: ${topic}

## Введение
Это демо-результат исследования по теме "${topic}". В реальном режиме здесь будет полный анализ с использованием различных источников.

## Основные выводы
- Тема исследования: ${topic}
- Количество обработанных источников: 3
- Время исследования: ${new Date().toLocaleTimeString()}

## Заключение
Демо режим завершен. Для реального исследования запустите Brain API сервер.`,
            isResearching: false,
            currentStatus: "Демо завершено",
          }));
        }, (demoSteps.length + 4) * 1000);

        return;
      }

      setResearchState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Unknown error",
        isResearching: false,
      }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t bg-card/80 backdrop-blur-sm p-4 flex-shrink-0 shadow-lg">
      <div className="max-w-4xl mx-auto">
        <div className="flex gap-3 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Введите сообщение или /research <тема> для исследования..."
            className="flex-1 min-h-[44px] max-h-24 resize-none border-0 shadow-none focus-visible:ring-0 bg-background"
            rows={1}
            disabled={researchState.isResearching}
          />
          <div className="flex gap-2">
            <Button size="icon" variant="ghost" className="h-[44px] w-[44px]">
              <Paperclip className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-[44px] w-[44px]">
              <Mic className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              className="h-[44px] w-[44px] bg-primary hover:bg-primary/90"
              onClick={() => {
                console.log("🖱️ Send button clicked, input:", input.trim());
                console.log(
                  "🖱️ Button disabled state:",
                  !input.trim() || researchState.isResearching
                );
                handleSend();
              }}
              disabled={!input.trim() || researchState.isResearching}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-2 flex justify-between items-center">
          <span>
            Enter для отправки • Shift+Enter для новой строки • /research &lt;тема&gt; для исследования
          </span>
          {researchState.isResearching && (
            <button
              onClick={() => {
                console.log("🔄 Force reset research state");
                setResearchState((prev) => ({
                  ...prev,
                  isResearching: false,
                  error: "Исследование прервано пользователем",
                }));
              }}
              className="text-xs text-red-400 hover:text-red-300 underline"
            >
              Прервать
            </button>
          )}
        </div>
      </div>
    </div>
  );
}




