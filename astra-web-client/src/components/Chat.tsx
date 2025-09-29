import React, { useState, useRef, useEffect } from 'react';
import Message from './Message';
import { api } from '../services/api';
import { ChatRequest, StreamHandler } from '../types';
import { Message as MessageType, ModelSettings as ModelSettingsType } from '../types/index';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface ChatProps {
  persona: string;
  modelSettings: ModelSettingsType;
  sessionId?: string;
  onPersonaChange?: (persona: string) => void;
  personas?: Array<{id: string, name: string, description: string}>;
}

export default function Chat({
  persona,
  modelSettings,
  sessionId,
  onPersonaChange,
  personas = []
}: ChatProps) {
  // modelSettings пока не используется, но оставляем для будущего
  console.log('Model settings:', modelSettings);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatTitle, setChatTitle] = useState('Новый чат');
  const [useDemoMode, setUseDemoMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Загружаем историю чата при выборе чата
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!sessionId) {
        setMessages([]);
        setChatTitle('Новый чат');
        return;
      }

      try {
        console.log(`📖 Загружаем историю для чата: ${sessionId}`);
        const response = await api.getChatHistory(sessionId);
        console.log(`📄 История чата ${sessionId}:`, response);

        const historyMessages = (response as any).history?.map((msg: any) => ({
          id: msg.id || Date.now().toString() + Math.random(),
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
        })) || [];

        console.log(`✅ Загружено сообщений для чата ${sessionId}:`, historyMessages.length);
        setMessages(historyMessages);
        setUseDemoMode(false);

        // Устанавливаем заголовок чата на основе первого сообщения
        if (historyMessages.length > 0) {
          const firstMessage = historyMessages[0].content;
          const title = firstMessage.length > 50
            ? firstMessage.slice(0, 50) + '...'
            : firstMessage;
          setChatTitle(title);
        } else {
          setChatTitle('Новый чат');
        }
      } catch (error) {
        console.warn('Не удалось загрузить историю чата, используем демо:', error);
        setUseDemoMode(true);

        // Используем демо-сообщения при ошибке API
        const demoMessages: MessageType[] = [
          {
            id: `demo_${sessionId}_1`,
            role: 'user',
            content: `Сообщение в чат ${sessionId}`,
            timestamp: new Date(Date.now() - 1000 * 60 * 30)
          },
          {
            id: `demo_${sessionId}_2`,
            role: 'assistant',
            content: `Ответ в чат ${sessionId}. Это демо-сообщение для тестирования интерфейса.`,
            timestamp: new Date(Date.now() - 1000 * 60 * 29)
          }
        ];

        setMessages(demoMessages);
        setChatTitle(`Демо чат: ${sessionId}`);
      }
    };

    loadChatHistory();
  }, [sessionId]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: MessageType = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    // Создаем сообщение ассистента с индикатором загрузки
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: MessageType = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      console.log(`📤 Отправляем сообщение в чат ${sessionId}:`, currentInput);
      const request: ChatRequest = {
        text: currentInput,
        agent_id: persona,
        session_id: sessionId
      };

      const streamHandler: StreamHandler = {
        onStatus: (message: string) => {
          console.log('📊 Status:', message);
          // Показываем статус в виде временного уведомления
          // Можно добавить toast или временное сообщение
        },

        onPlan: (plan: any) => {
          console.log('📋 Plan:', plan);
          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, plan }
              : msg
          ));
        },

        onResearchInfo: (info: any) => {
          console.log('🔍 Research Info:', info);
          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, research: info }
              : msg
          ));
        },

        onDraft: (draft: any) => {
          console.log('📝 Draft:', draft);

          // Проверяем наличие тегов <think>
          const thinkMatch = draft.draft.match(/<think>(.*?)<\/think>/s);
          let content = draft.draft;
          let thinking = '';

          if (thinkMatch) {
            thinking = thinkMatch[1];
            // Удаляем теги <think> из основного контента
            content = draft.draft.replace(/<think>.*?<\/think>/s, '').trim();
          }

          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content,
                  isStreaming: true,
                  isThinking: !!thinking,
                  thinking
                }
              : msg
          ));
        },

        onFinalDraft: (draft: any) => {
          console.log('📝 Final Draft:', draft);

          // Проверяем наличие тегов <think>
          const thinkMatch = draft.draft.match(/<think>(.*?)<\/think>/s);
          let content = draft.draft;
          let thinking = '';

          if (thinkMatch) {
            thinking = thinkMatch[1];
            // Удаляем теги <think> из основного контента
            content = draft.draft.replace(/<think>.*?<\/think>/s, '').trim();
          }

          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content,
                  isStreaming: false,
                  isThinking: !!thinking,
                  thinking
                }
              : msg
          ));
        },

        onCritique: (critique: any) => {
          console.log('🔍 Critique:', critique);
          // Можно добавить отображение критики
        },

        onError: (error: any) => {
          console.error('❌ Error:', error);
          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, error, isStreaming: false }
              : msg
          ));
        },

        onComplete: () => {
          console.log('✅ Stream complete');
          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, isStreaming: false }
              : msg
          ));
          setIsLoading(false);
        }
      };

      await api.sendMessage(request, streamHandler);
      setUseDemoMode(false);

    } catch (error) {
      console.warn('API не доступен, используем демо-ответ:', error);
      setUseDemoMode(true);

      // Имитируем задержку ответа
      setTimeout(() => {
        const demoResponse = `Это демо-ответ на ваше сообщение: "${currentInput}". В реальной версии здесь будет ответ от AI модели с использованием персоны "${persona}".`;

        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: demoResponse, isStreaming: false }
            : msg
        ));
        setIsLoading(false);
      }, 1000);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Верхняя панель - как в ChatGPT */}
      <div className="border-b border-gray-700 p-4 bg-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-200">
              {chatTitle}
            </h2>
            {useDemoMode && (
              <div className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                Демо режим
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Выбор персоны */}
            <Select value={persona} onValueChange={onPersonaChange}>
              <SelectTrigger className="w-48 bg-gray-700 border-gray-600 text-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                {personas.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-gray-200 hover:bg-gray-700">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

          </div>
        </div>
      </div>

      {/* Область сообщений */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-900">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center max-w-md">
              <h2 className="text-2xl font-semibold mb-4 text-gray-200">
                {sessionId ? 'Чат загружен' : 'Добро пожаловать в Astra Chat'}
              </h2>
              <p className="text-lg mb-2 text-gray-400">
                {sessionId ? 'История чата загружена' : 'Как я могу вам помочь сегодня?'}
              </p>
              <p className="text-sm text-gray-500">
                {sessionId ? 'Можете продолжить разговор' : 'Выберите персону и модель выше и начните разговор.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            {messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
            {isLoading && (
              <div className="flex items-center gap-3 py-4 text-gray-400">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce"></div>
                  <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
                <span>Печатает...</span>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода */}
      <div className="border-t border-gray-700 bg-gray-800">
        <div className="max-w-4xl mx-auto p-4">
          <div className="flex gap-3 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Введите сообщение..."
              className="flex-1 min-h-[52px] max-h-32 resize-none border-0 shadow-none focus-visible:ring-0 bg-gray-700 text-gray-200 placeholder-gray-500"
              rows={1}
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="h-[52px] w-[52px] shrink-0 bg-gray-200 hover:bg-gray-100 text-gray-900"
            >
              {isLoading ? (
                <div className="animate-spin">⟳</div>
              ) : (
                <span>↑</span>
              )}
            </Button>
          </div>
          <div className="text-xs mt-2 text-gray-500">
            Нажмите Enter для отправки, Shift+Enter для новой строки
          </div>
        </div>
      </div>
    </div>
  );
}