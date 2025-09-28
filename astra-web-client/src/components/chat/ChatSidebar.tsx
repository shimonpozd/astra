import { Plus, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Chat } from '../../services/api';

interface ChatSidebarProps {
  chats: Chat[];
  isLoading: boolean;
  error: string | null;
  selectedChatId: string | null;
  onSelectChat: (id: string, type: 'chat' | 'study') => void;
  onCreateChat: () => void;
  onDeleteSession: (id: string, type: 'chat' | 'study') => void;
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
  return (
    <aside className="border-r bg-card/50 backdrop-blur-sm flex flex-col min-h-0 w-80">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Chats</h2>
          <Button size="icon" variant="ghost" onClick={onCreateChat}>
            <Plus className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 min-h-0 p-2">
        {isLoading && (
          <div className="text-muted-foreground text-sm p-2">Loading chats...</div>
        )}

        {error && (
          <div className="text-red-500 text-sm p-2">Error: {error}</div>
        )}

        {!isLoading && !error && (
          <div className="flex flex-col gap-1 overflow-y-auto">
            {chats.length === 0 ? (
              <p className="text-muted-foreground text-sm p-2">No chats found.</p>
            ) : (
              chats.map((chat) => (
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
