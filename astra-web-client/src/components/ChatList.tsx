import { useState, useEffect } from 'react';
import { api, Chat } from '../services/api';
import { Button } from './ui/button';

interface ChatListProps {
  selectedChatId?: string;
  onChatSelect: (sessionId: string, type: 'chat' | 'study') => void;
  onNewChat: () => void;
}

export default function ChatList({ selectedChatId, onChatSelect, onNewChat }: ChatListProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useDemoData, setUseDemoData] = useState(false);

  const loadChats = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔄 Загружаем список чатов...');
      const chatSessionsData = await api.getChatList();
      console.log('📋 API ответ getChatList:', chatSessionsData);

      // Проверяем, что ответ является массивом
      if (!Array.isArray(chatSessionsData)) {
        throw new Error('Неверный формат ответа API: ожидался массив');
      }

      const chatSessions: Chat[] = chatSessionsData.map((chat: any) => ({
        session_id: chat.session_id,
        name: chat.name || `Чат ${chat.session_id.slice(0, 8)}...`,
        last_modified: chat.last_modified || new Date().toISOString(),
        type: chat.type || 'chat' // fallback to 'chat' for backward compatibility
      }));

      // Сортируем по времени последнего изменения (самые новые первыми)
      chatSessions.sort((a, b) => new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime());

      console.log('✅ Загружено чатов:', chatSessions.length);
      setChats(chatSessions);
      setUseDemoData(false);
    } catch (err) {
      console.error('❌ Ошибка при загрузке чатов:', err);
      setError(`Не удалось загрузить список чатов: ${err}`);
      setUseDemoData(true);

      // Используем демо-данные при ошибке API
      setChats([
        {
          session_id: 'demo_chat_1',
          name: 'Демонстрационный чат 1',
          last_modified: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          type: 'chat' as const
        },
        {
          session_id: 'demo_chat_2',
          name: 'Демонстрационный чат 2',
          last_modified: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          type: 'chat' as const
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChats();
  }, []);

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Вчера';
    } else if (days < 7) {
      return `${days} дн. назад`;
    } else {
      return date.toLocaleDateString('ru-RU');
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-800">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-200">
            Чаты
          </h2>
          <Button
            onClick={onNewChat}
            size="sm"
            className="bg-gray-200 hover:bg-gray-100 text-gray-900"
          >
            +
          </Button>
        </div>

        {error && (
          <div className={`text-xs p-2 rounded mb-2 ${
            useDemoData ? 'text-gray-300 bg-gray-700' : 'text-gray-300 bg-gray-700'
          }`}>
            <strong>{useDemoData ? 'Демо режим:' : 'Ошибка:'}</strong> {error}
            {!useDemoData && (
              <Button
                onClick={loadChats}
                size="sm"
                variant="outline"
                className="ml-2 border-gray-600 text-gray-300 hover:bg-gray-600"
              >
                Повторить
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {loading ? (
            <div className="text-center py-4 text-gray-400">
              Загрузка чатов...
            </div>
          ) : chats.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="mb-4">Нет чатов</p>
              <Button
                onClick={onNewChat}
                className="bg-gray-200 hover:bg-gray-100 text-gray-900"
              >
                Создать новый чат
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {chats.map((chat) => (
                <div
                  key={chat.session_id}
                  className={`p-3 rounded cursor-pointer transition-colors ${
                    selectedChatId === chat.session_id
                      ? 'bg-gray-200 text-gray-900'
                      : chat.type === 'study'
                        ? 'bg-blue-900/50 hover:bg-blue-800/60 text-gray-200'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                  }`}
                  onClick={() => onChatSelect(chat.session_id, chat.type)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-medium text-sm truncate flex-1 mr-2 text-gray-200">
                      {chat.name}
                    </h3>
                    <span className="text-xs whitespace-nowrap text-gray-400">
                      {formatTimestamp(new Date(chat.last_modified))}
                    </span>
                  </div>

                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-gray-500">
                      {chat.type === 'study' ? 'Учебная сессия' : 'Последнее обновление'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}