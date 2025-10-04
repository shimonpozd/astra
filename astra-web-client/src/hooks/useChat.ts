import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Chat, Message, ChatRequest } from '../services/api';

// Helper function to synchronously get user ID, preventing race conditions
function getUserId(): string {
  let storedUserId = localStorage.getItem("astra_user_id");
  if (!storedUserId) {
    storedUserId = "web_user_" + crypto.randomUUID();
    localStorage.setItem("astra_user_id", storedUserId);
  }
  return storedUserId;
}

const userId = getUserId();

export function useChat(agentId: string = 'default', initialChatId?: string | null) {
  const navigate = useNavigate();
  // State for chat list
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for selected chat and its messages
  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Load initial chat list including daily chats
  useEffect(() => {
    async function loadChats() {
      try {
        setIsLoading(true);
        setError(null);
        
        // Load regular chats and daily virtual chats in parallel
        const [chatList, dailyCalendar] = await Promise.all([
          api.getChatList(),
          api.getDailyCalendar()
        ]);
        
        console.log('📅 Daily calendar loaded:', dailyCalendar);
        
        // Convert daily calendar to Chat format
        const dailyChats: Chat[] = dailyCalendar.map(item => ({
          session_id: item.session_id,
          name: item.title, // Just the title: "Daf Yomi", "Parashat Hashavua", etc.
          last_modified: item.date, // Use date as last_modified for sorting
          type: 'daily' as const,
          completed: false // Will be updated when we check if session exists
        }));
        
        console.log('📚 Daily chats created:', dailyChats);
        
        // Combine and sort (daily chats first, then by last_modified)
        const allChats = [...dailyChats, ...chatList].sort((a, b) => {
          // Daily chats always come first
          if (a.type === 'daily' && b.type !== 'daily') return -1;
          if (a.type !== 'daily' && b.type === 'daily') return 1;
          
          // Within same type, sort by last_modified (newest first)
          return new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime();
        });
        
        setChats(allChats);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    }

    loadChats();
  }, []); // Runs once on mount

  // Load messages when a chat is selected
  useEffect(() => {
    if (!selectedChatId || window.location.pathname.startsWith('/study')) {
      setMessages([]);
      return;
    }

    async function loadMessages() {
      try {
        setIsLoadingMessages(true);
        const messageList = await api.getChatHistory(selectedChatId!);
        setMessages(messageList);
      } catch (e) {
        setMessages([]);
      } finally {
        setIsLoadingMessages(false);
      }
    }

    loadMessages();
  }, [selectedChatId]);

  const selectChat = useCallback((id: string) => {
    setSelectedChatId(id);
    navigate(`/chat/${id}`);
  }, [navigate]);

  const createChat = useCallback(() => {
    const newId = crypto.randomUUID();
    const newChat: Chat = {
      session_id: newId,
      name: "Новый чат",
      last_modified: new Date().toISOString(),
      type: 'chat',
    };
    setChats((prev) => [newChat, ...prev]);
    selectChat(newId);
  }, [selectChat]);

  const deleteChat = useCallback(async (sessionId: string) => {
    try {
      await api.deleteChat(sessionId);
      setChats((prev) => prev.filter((chat) => chat.session_id !== sessionId));
      if (selectedChatId === sessionId) {
        navigate('/');
      }
    } catch (error) {
      console.error("Failed to delete chat:", error);
      setError('Failed to delete chat. Please try again.');
    }
  }, [navigate, selectedChatId]);

  const deleteSession = useCallback(async (sessionId: string, sessionType: 'chat' | 'study' | 'daily') => {
    try {
      await api.deleteSession(sessionId, sessionType);
      setChats((prev) => prev.filter((chat) => chat.session_id !== sessionId));
      if (selectedChatId === sessionId) {
        navigate('/');
      }
    } catch (error) {
      console.error(`Failed to delete ${sessionType} session:`, error);
      setError(`Failed to delete ${sessionType} session. Please try again.`);
    }
  }, [navigate, selectedChatId]);

  const reloadChats = useCallback(async () => {
    try {
      console.log('🔄 Reloading chats from API...');
      setIsLoading(true);
      setError(null);
      const chatList = await api.getChatList();
      console.log('📋 API returned chats:', chatList);
      setChats(chatList);
      console.log('✅ Chats state updated');
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred';
      console.error('❌ Failed to reload chats:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendMessage = useCallback(async (text: string, context?: 'focus' | 'workbench-left' | 'workbench-right' | null) => {
    if (!selectedChatId) return;

    setIsSending(true);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      content_type: 'text.v1',
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);

    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      content_type: 'text.v1',
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    const request: ChatRequest = {
      text,
      session_id: selectedChatId!,
      user_id: userId,
      agent_id: agentId,
      context: context || undefined,
    };

    await api.sendMessage(request, {
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

  }, [selectedChatId]);

  return {
    chats,
    isLoading,
    error,
    messages,
    isLoadingMessages,
    selectedChatId,
    selectChat,
    createChat,
    sendMessage,
    isSending,
    deleteChat,
    deleteSession,
    reloadChats,
  };
}