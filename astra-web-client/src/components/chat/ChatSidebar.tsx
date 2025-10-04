import { Plus, X, ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '../ui/button';
import { Chat } from '../../services/api';
import { useState } from 'react';

interface ChatSidebarProps {
  chats: Chat[];
  isLoading: boolean;
  error: string | null;
  selectedChatId: string | null;
  onSelectChat: (id: string, type: 'chat' | 'study' | 'daily') => void;
  onCreateChat: () => void;
  onDeleteSession: (id: string, type: 'chat' | 'study' | 'daily') => void;
}

export default function ChatSidebar({
  chats,
  isLoading,
  error,
  selectedChatId,
  onSelectChat,
  onCreateChat,
  onDeleteSession,
}: ChatSidebarProps) {
  const [isDailyExpanded, setIsDailyExpanded] = useState(true);
  
  // Separate daily and regular chats
  const dailyChats = chats.filter(chat => chat.type === 'daily');
  const regularChats = chats.filter(chat => chat.type !== 'daily');
  
  // Count completed daily chats
  const completedDailyCount = dailyChats.filter(chat => chat.completed).length;
  return (
    <aside className="border-r panel-outer flex flex-col min-h-0 w-80">
      {/* Header */}
      <div className="panel-padding border-b border-border/50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Chats</h2>
          <Button size="icon" variant="ghost" onClick={onCreateChat}>
            <Plus className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 min-h-0 panel-padding-sm">
        {isLoading && (
          <div className="text-muted-foreground text-sm p-2">Loading chats...</div>
        )}

        {error && (
          <div className="text-red-500 text-sm p-2">Error: {error}</div>
        )}

        {!isLoading && !error && (
          <div className="flex flex-col gap-compact overflow-y-auto">
            {/* Daily Learning Section */}
            {dailyChats.length > 0 && (
              <div className="mb-4">
                <Button
                  variant="ghost"
                  className="w-full justify-between p-2 h-auto text-left"
                  onClick={() => setIsDailyExpanded(!isDailyExpanded)}
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-red-600" />
                    <span className="font-medium text-red-700">Daily ({completedDailyCount}/{dailyChats.length})</span>
                  </div>
                  {isDailyExpanded ? (
                    <ChevronDown className="w-4 h-4 text-red-600" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-red-600" />
                  )}
                </Button>
                
                {isDailyExpanded && (
                  <div className="mt-2 space-y-1">
                    {dailyChats.map((chat) => (
                      <Button
                        key={chat.session_id}
                        variant={selectedChatId === chat.session_id ? 'secondary' : 'ghost'}
                        className="w-full justify-between truncate group px-3 py-2 h-auto bg-red-900/10 hover:bg-red-800/20"
                        onClick={() => onSelectChat(chat.session_id, chat.type)}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="truncate text-left text-sm">{chat.name}</span>
                        </div>
                        
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {chat.completed ? (
                            <span className="text-green-600 text-sm">✅</span>
                          ) : (
                            <span className="text-red-400 text-sm">⬜</span>
                          )}
                          <button
                            className="p-1 rounded-full hover:bg-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSession(chat.session_id, chat.type);
                            }}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Regular Chats Section */}
            {regularChats.length === 0 && dailyChats.length === 0 ? (
              <p className="text-muted-foreground text-sm p-2">No chats found.</p>
            ) : (
              regularChats.map((chat) => (
                <Button
                  key={chat.session_id}
                  variant={selectedChatId === chat.session_id ? 'secondary' : 'ghost'}
                  className={`w-full justify-between truncate group px-3 py-2 h-auto ${
                    chat.type === 'study' ? 'bg-blue-900/20 hover:bg-blue-800/30' : ''
                  }`}
                  onClick={() => onSelectChat(chat.session_id, chat.type)}
                >
                  <span className="truncate text-left">{chat.name}</span>
                  <button
                    className="p-1 rounded-full hover:bg-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(chat.session_id, chat.type);
                    }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Button>
              ))
            )}
          </div>
        )}
      </div>

    </aside>
  );
}
