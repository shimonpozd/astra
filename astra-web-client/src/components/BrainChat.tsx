import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { ChatRequest, Message as MessageType, StreamHandler, BrainEvent } from '../types';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Loader2, AlertCircle, CheckCircle, FileText, MessageSquare, Search, ArrowLeft } from 'lucide-react';

interface BrainChatProps {
  persona: string;
  sessionId?: string;
  onPersonaChange?: (persona: string) => void;
  personas?: Array<{id: string, name: string, description: string}>;
  onBack?: () => void;
}

interface ResearchState {
  currentStatus: string;
  currentPlan: any;
  currentDraft: string;
  currentCritique: string[];
  isResearching: boolean;
  error: string | null;
}

export default function BrainChat({
  persona,
  sessionId,
  onPersonaChange,
  personas = [],
  onBack
}: BrainChatProps) {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState('');
  const [researchState, setResearchState] = useState<ResearchState>({
    currentStatus: '',
    currentPlan: null,
    currentDraft: '',
    currentCritique: [],
    isResearching: false,
    error: null
  });
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [chatTitle, setChatTitle] = useState('Новый чат');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, researchState]);

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
        console.warn('Не удалось загрузить историю чата:', error);
        setMessages([]);
        setChatTitle('Новый чат');
      }
    };

    loadChatHistory();
  }, [sessionId]);

  const sendMessage = async () => {
    if (!input.trim() || researchState.isResearching) return;

    const userMessage: MessageType = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // Сброс состояния исследования
    setResearchState({
      currentStatus: '',
      currentPlan: null,
      currentDraft: '',
      currentCritique: [],
      isResearching: true,
      error: null
    });

    try {
      console.log(`📤 Отправляем сообщение в чат ${sessionId}:`, input);
      const request: ChatRequest = {
        text: input,
        agent_id: persona,
        session_id: sessionId,
        user_id: 'user_' + Date.now() // Генерируем user_id
      };

      const streamHandler: StreamHandler = {
        onStatus: (message: string) => {
          console.log('📊 Status:', message);
          setResearchState(prev => ({ ...prev, currentStatus: message }));
        },

        onPlan: (plan: any) => {
          console.log('📋 Plan:', plan);
          setResearchState(prev => ({ ...prev, currentPlan: plan }));
        },

        onResearchInfo: (info: any) => {
          console.log('🔍 Research Info:', info);
          setResearchState(prev => ({
            ...prev,
            currentPlan: info.plan || prev.currentPlan
          }));
        },

        onDraft: (draft: any) => {
          console.log('📝 Draft:', draft);
          setResearchState(prev => ({ ...prev, currentDraft: draft.draft }));

          // Добавляем черновик как сообщение ассистента
          const draftMessage: MessageType = {
            id: `draft_${Date.now()}`,
            role: 'assistant',
            content: draft.draft,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, draftMessage]);
        },

        onFinalDraft: (draft: any) => {
          console.log('📝 Final Draft:', draft);
          setResearchState(prev => ({ ...prev, currentDraft: draft.draft }));

          // Добавляем финальный черновик как сообщение ассистента
          const finalDraftMessage: MessageType = {
            id: `final_draft_${Date.now()}`,
            role: 'assistant',
            content: draft.draft,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, finalDraftMessage]);
        },

        onCritique: (critique: any) => {
          console.log('🔍 Critique:', critique);
          setResearchState(prev => ({
            ...prev,
            currentCritique: [...prev.currentCritique, ...critique.feedback]
          }));
        },

        onError: (error: any) => {
          console.error('❌ Error:', error);
          setResearchState(prev => ({
            ...prev,
            error: error.message,
            isResearching: false
          }));
        },

        onComplete: () => {
          console.log('✅ Research complete');
          setResearchState(prev => ({ ...prev, isResearching: false }));
        }
      };

      await api.sendMessageStreamNDJSON(request, streamHandler);

    } catch (error) {
      console.error('❌ Error sending message:', error);
      setResearchState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
        isResearching: false
      }));

      // Добавляем сообщение об ошибке
      const errorMessage: MessageType = {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: `Произошла ошибка: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startResearch = async () => {
    if (!input.trim() || researchState.isResearching) return;

    // Добавляем команду /research к тексту
    const researchInput = `/research ${input}`;

    const userMessage: MessageType = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // Сброс состояния исследования
    setResearchState({
      currentStatus: '',
      currentPlan: null,
      currentDraft: '',
      currentCritique: [],
      isResearching: true,
      error: null
    });

    try {
      console.log(`🔬 Запускаем исследование:`, researchInput);
      const request: ChatRequest = {
        text: researchInput,
        agent_id: persona,
        session_id: sessionId,
        user_id: 'user_' + Date.now()
      };

      const streamHandler: StreamHandler = {
        onStatus: (message: string) => {
          console.log('📊 Status:', message);
          setResearchState(prev => ({ ...prev, currentStatus: message }));
        },

        onPlan: (plan: any) => {
          console.log('📋 Plan:', plan);
          setResearchState(prev => ({ ...prev, currentPlan: plan }));
        },

        onResearchInfo: (info: any) => {
          console.log('🔍 Research Info:', info);
          setResearchState(prev => ({
            ...prev,
            currentPlan: info.plan || prev.currentPlan
          }));
        },

        onDraft: (draft: any) => {
          console.log('📝 Draft:', draft);
          setResearchState(prev => ({ ...prev, currentDraft: draft.draft }));

          const draftMessage: MessageType = {
            id: `draft_${Date.now()}`,
            role: 'assistant',
            content: draft.draft,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, draftMessage]);
        },

        onFinalDraft: (draft: any) => {
          console.log('📝 Final Draft:', draft);
          setResearchState(prev => ({ ...prev, currentDraft: draft.draft }));

          const finalDraftMessage: MessageType = {
            id: `final_draft_${Date.now()}`,
            role: 'assistant',
            content: draft.draft,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, finalDraftMessage]);
        },

        onCritique: (critique: any) => {
          console.log('🔍 Critique:', critique);
          setResearchState(prev => ({
            ...prev,
            currentCritique: [...prev.currentCritique, ...critique.feedback]
          }));
        },

        onError: (error: any) => {
          console.error('❌ Error:', error);
          setResearchState(prev => ({
            ...prev,
            error: error.message,
            isResearching: false
          }));
        },

        onComplete: () => {
          console.log('✅ Research complete');
          setResearchState(prev => ({ ...prev, isResearching: false }));
        }
      };

      await api.sendMessageStreamNDJSON(request, streamHandler);

    } catch (error) {
      console.error('❌ Error starting research:', error);
      setResearchState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
        isResearching: false
      }));

      const errorMessage: MessageType = {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: `Произошла ошибка при запуске исследования: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const retryConnection = async () => {
    setIsRetrying(true);
    setConnectionError(null);

    try {
      // Проверяем доступность API
      const response = await fetch('http://localhost:7030/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Повторяем отправку сообщения
        await sendMessage();
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Верхняя панель */}
      <div className="border-b p-4 bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {onBack && (
              <Button
                onClick={onBack}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <h2 className="text-lg font-semibold">
              {chatTitle}
            </h2>
            {researchState.isResearching && (
              <div className="flex items-center gap-2 px-2 py-1 bg-muted text-muted-foreground text-xs rounded">
                <Loader2 className="w-3 h-3 animate-spin" />
                Исследование...
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={persona}
              onChange={(e) => onPersonaChange?.(e.target.value)}
              className="px-3 py-1 bg-muted border border-border rounded text-sm"
            >
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Область сообщений */}
      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <h2 className="text-2xl font-semibold mb-4">
                {sessionId ? 'Чат загружен' : 'Добро пожаловать в Brain Chat'}
              </h2>
              <p className="text-muted-foreground mb-2">
                {sessionId ? 'История чата загружена' : 'Как я могу вам помочь сегодня?'}
              </p>
              <p className="text-sm text-muted-foreground">
                {sessionId ? 'Можете продолжить разговор' : 'Выберите персону выше и начните разговор.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`max-w-2xl px-4 py-3 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
                  <p className="text-xs mt-2 opacity-70">
                    {message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                    <span className="text-xs font-medium">Вы</span>
                  </div>
                )}
              </div>
            ))}

            {/* Индикатор загрузки */}
            {researchState.isResearching && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
                <div className="bg-muted px-4 py-3 rounded-2xl">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {researchState.currentStatus || 'Обработка запроса...'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Панель исследования */}
      {researchState.currentPlan && (
        <Card className="mx-6 mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              План исследования
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">
              <p>Итерация: {researchState.currentPlan.iteration}</p>
              <p>Основная ссылка: {researchState.currentPlan.primary_ref}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Критика */}
      {researchState.currentCritique.length > 0 && (
        <Card className="mx-6 mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Критика и предложения
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="text-sm text-muted-foreground space-y-1">
              {researchState.currentCritique.map((critique, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-xs mt-1">•</span>
                  <span>{critique}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Ошибки подключения */}
      {connectionError && (
        <div className="mx-6 mb-4 p-4 border border-red-200 bg-red-50 rounded flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm text-red-700 mb-2">
              Ошибка подключения: {connectionError}
            </div>
            <Button
              onClick={retryConnection}
              disabled={isRetrying}
              size="sm"
              variant="outline"
              className="text-red-700 border-red-300 hover:bg-red-100"
            >
              {isRetrying ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin mr-2" />
                  Повторная попытка...
                </>
              ) : (
                'Повторить'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Ошибки исследования */}
      {researchState.error && (
        <div className="mx-6 mb-4 p-4 border border-red-200 bg-red-50 rounded flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
          <div className="text-sm text-red-700">
            {researchState.error}
          </div>
        </div>
      )}

      {/* Поле ввода */}
      <div className="border-t bg-card">
        <div className="max-w-4xl mx-auto p-4">
          <div className="flex gap-3 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Введите сообщение или тему исследования..."
              className="flex-1 min-h-[52px] max-h-32 resize-none border-0 shadow-none focus-visible:ring-0 bg-background"
              rows={1}
              disabled={researchState.isResearching}
            />
            <div className="flex gap-2">
              <Button
                onClick={startResearch}
                disabled={!input.trim() || researchState.isResearching}
                size="icon"
                variant="outline"
                className="h-[52px] w-[52px] shrink-0"
                title="Начать глубокое исследование"
              >
                <Search className="w-4 h-4" />
              </Button>
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || researchState.isResearching}
                size="icon"
                className="h-[52px] w-[52px] shrink-0"
              >
                {researchState.isResearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>↑</span>
                )}
              </Button>
            </div>
          </div>
          <div className="text-xs mt-2 text-muted-foreground">
            Enter для отправки • Shift+Enter для новой строки
          </div>
        </div>
      </div>
    </div>
  );
}