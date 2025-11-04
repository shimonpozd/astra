import { Plus, X, Calendar, BookOpen, MessageSquare, ChevronLeft, ChevronRight as ChevronRightIcon, Bookmark } from 'lucide-react';
import { Chat } from '../../services/api';
import { useEffect, useState } from 'react';
import { useTheme } from '../theme-provider';

interface ChatSidebarProps {
  chats: Chat[];
  isLoading: boolean;
  error: string | null;
  selectedChatId: string | null;
  onSelectChat: (id: string, type: 'chat' | 'study' | 'daily') => void;
  onCreateChat: () => void;
  onCreateStudy?: () => void;
  onDeleteSession: (id: string, type: 'chat' | 'study' | 'daily') => void;
}

export default function ChatSidebar({
  chats,
  isLoading,
  error,
  selectedChatId,
  onSelectChat,
  onCreateChat,
  onCreateStudy,
  onDeleteSession,
}: ChatSidebarProps) {
  
  const [mode, setMode] = useState<'split' | 'compact'>(() => {
    try { return (localStorage.getItem('astra_sidebar_mode') as 'split' | 'compact') || 'split'; } catch { return 'split'; }
  });
  const [activeCategory, setActiveCategory] = useState<'daily' | 'study' | 'chat'>(() => {
    try { return (localStorage.getItem('astra_active_category') as 'daily'|'study'|'chat') || 'study'; } catch { return 'study'; }
  });
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const { theme } = useTheme();
  
  // Separate by category
  const dailyChats = chats.filter(chat => chat.type === 'daily');
  const studyChats = chats.filter(chat => chat.type === 'study');
  const simpleChats = chats.filter(chat => chat.type === 'chat');
  const categoryToList: Record<'daily'|'study'|'chat', Chat[]> = {
    daily: dailyChats,
    study: studyChats,
    chat: simpleChats,
  };
  const visibleChats = categoryToList[activeCategory];
  
  // reserved for future use: macOS squircle utility was removed to satisfy lint (unused)
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Minimal tokens
  const colorAccent = isDark ? '#b89d63' : '#c2a970';
  const colorFg = isDark ? 'rgba(255,255,255,0.88)' : '#1a1611';
  const colorFgMuted = isDark ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.45)';
  const colorHover = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const colorSelectedBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const colorSeparator = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  // Autofocus first list item on category change
  useEffect(() => {
    if (visibleChats.length === 0) {
      setFocusedIndex(-1);
    } else {
      setFocusedIndex(0);
    }
  }, [activeCategory]);

  // Subtle fade on category change
  const [isFading, setIsFading] = useState(false);

  const handleToggleMode = () => {
    const next = mode === 'split' ? 'compact' : 'split';
    setMode(next);
    try { localStorage.setItem('astra_sidebar_mode', next); } catch {}
  };

  const handleSelectCategory = (cat: 'daily'|'study'|'chat') => {
    setIsFading(true);
    window.setTimeout(() => {
      setActiveCategory(cat);
      setFocusedIndex(-1);
      setIsFading(false);
      try { localStorage.setItem('astra_active_category', cat); } catch {}
    }, 150);
  };

  const handleKeyDownList = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!visibleChats || visibleChats.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(i => Math.min(i + 1, visibleChats.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const idx = focusedIndex >= 0 ? focusedIndex : 0;
      const chat = visibleChats[idx];
      if (chat) onSelectChat(chat.session_id, chat.type);
    } else if (e.key === 'Delete') {
      const idx = focusedIndex >= 0 ? focusedIndex : 0;
      const chat = visibleChats[idx];
      if (chat) {
        // native confirm
        if (window.confirm('Delete this chat?')) onDeleteSession(chat.session_id, chat.type);
      }
    }
  };
  
  return (
    <aside className="border-r panel-outer flex flex-row min-h-0" style={{ color: colorFg }}>
      {/* Left Category Rail */}
      <div
        className={`flex flex-col border-r border-border/50 w-14 flex-none`}
        role="tablist"
        aria-orientation="vertical"
        style={{ background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', paddingTop: 20 }}
      >
        <div className="flex items-center justify-between px-2 pb-2">
          <button
            aria-label={mode === 'split' ? 'Collapse' : 'Expand'}
            className="h-8 w-8 grid place-items-center rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ color: colorFgMuted, borderRadius: 8, border: '1px solid transparent' }}
            onClick={handleToggleMode}
          >
            {mode === 'split' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
          </button>
        </div>

        {([
          { key: 'study', icon: <BookOpen className="w-5 h-5" />, label: 'Study' },
          { key: 'chat',  icon: <MessageSquare className="w-5 h-5" />, label: 'Chat'  },
          { key: 'daily', icon: <Calendar className="w-5 h-5" />, label: 'Daily' }
        ] as Array<{key: 'daily'|'study'|'chat'; icon: React.ReactNode; label: string}>).map(cat => {
          const selected = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              role="tab"
              aria-selected={selected}
              className={`mx-2 my-1.5 flex items-center justify-center h-11 rounded-md`}
              style={{
                color: selected ? colorFg : colorFgMuted,
                background: selected ? colorSelectedBg : 'transparent',
                transition: 'all 0.25s cubic-bezier(0.25, 1, 0.5, 1)'
              }}
              onClick={() => handleSelectCategory(cat.key)}
              title={cat.key === 'daily' ? `${cat.label} · в разработке` : cat.label}
            >
              {cat.icon}
            </button>
          );
        })}
      </div>

      {/* Right List (always visible for easy switching) */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col" style={{ width: 300, boxShadow: isDark ? '-1px 0 0 rgba(255,255,255,0.05)' : '-1px 0 0 rgba(0,0,0,0.05)' }}>
          <div className="panel-padding border-b border-[color:var(--color-separator,transparent)]" style={{ borderColor: colorSeparator }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-medium tracking-wide" style={{ color: colorFgMuted }}>
                {activeCategory[0].toUpperCase() + activeCategory.slice(1)}
                {activeCategory === 'daily' ? ' · в разработке' : ''}
              </h3>
              <button
                onClick={() => {
                  if (activeCategory === 'study') {
                    onCreateStudy && onCreateStudy();
                  } else if (activeCategory === 'chat') {
                    onCreateChat();
                  }
                }}
                className="h-8 w-8 grid place-items-center rounded-md"
                style={{ border: '1px solid transparent', color: colorAccent }}
                aria-label="New"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto panel-padding-sm" role="list" onKeyDown={handleKeyDownList} tabIndex={0}
               style={{ transition: 'all 200ms cubic-bezier(0.25,1,0.5,1)', transform: isFading ? 'translateX(8px)' : 'translateX(0)', opacity: isFading ? 0 : 1 }}>
        {isLoading && (
          <div className="space-y-2">
            {[0,1,2,3].map(i => (
              <div key={i} className="h-11 rounded-md animate-pulse" style={{ background: colorHover }} />
            ))}
          </div>
        )}

        {error && (
          <div className="text-sm flex items-center justify-between p-2 rounded-md" style={{ borderColor: colorSeparator, color: colorFgMuted }}>
            <span>Error loading. </span>
            <button className="text-xs rounded-md px-2 py-1" style={{ border: `1px solid ${colorAccent}`, color: colorAccent }} onClick={() => window.location.reload()}>Retry</button>
          </div>
        )}

        {!isLoading && !error && (
          <div className="flex flex-col gap-2" role="presentation">
            {visibleChats.length === 0 ? (
              <div className="flex items-center justify-start gap-2 text-sm p-2 rounded-md" style={{ color: colorFgMuted }}>
                <span className="w-4 h-4 rounded-full" style={{ background: colorSeparator }} />
                <span>No items</span>
              </div>
            ) : (
              visibleChats.map((chat, idx) => {
                const selected = selectedChatId === chat.session_id;
                return (
                  <div
                    key={chat.session_id}
                    role="listitem"
                    tabIndex={0}
                    aria-selected={selected}
                    onFocus={() => setFocusedIndex(idx)}
                    className="relative flex items-center justify-between h-10 px-3 rounded-md outline-none"
                    style={{
                      background: selected ? (isDark ? 'rgba(184,157,99,0.12)' : 'rgba(194,169,112,0.10)') : 'transparent',
                      transition: 'all 200ms cubic-bezier(0.25,1,0.5,1)'
                    }}
                    onClick={() => onSelectChat(chat.session_id, chat.type)}
                  >
                    {selected && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded"
                            style={{ background: `linear-gradient(180deg, ${colorAccent} 0%, transparent 100%)` }} />
                    )}
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Secondary badges */}
                      {chat.type === 'daily' ? (
                        <span className="w-2 h-2 rounded-full" style={{ background: chat.completed ? colorAccent : colorSeparator }} />
                      ) : chat.type === 'study' ? (
                        <Bookmark className="w-3.5 h-3.5" style={{ color: colorFgMuted }} />
                      ) : null}

                      <span className="truncate text-[14.5px] font-[500] tracking-[-0.01em]" title={chat.name}>{chat.name}</span>
                    </div>

                    <button
                      className="p-1 rounded opacity-40 hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); onDeleteSession(chat.session_id, chat.type); }}
                      aria-label="Delete chat"
                    >
                      <X className="w-3 h-3" style={{ color: colorFgMuted, transition: 'transform 120ms ease-out, opacity 120ms ease-out' }} strokeWidth={1.25} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
          </div>
      </div>
    </aside>
  );
}
