import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { ChatRequest } from '../types';
import { MessageRenderer } from './MessageRenderer';
import { useBlockStream } from './BlockStreamRenderer';
import { DocV1 } from '../types/text';
import { debugLog } from '../utils/debugLogger';

interface BrainChatWithBlocksProps {
  persona: string;
  sessionId: string;
  onPersonaChange: (persona: string) => void;
  personas?: string[];
  onBack?: () => void;
}

interface MessageType {
  id: string;
  role: 'user' | 'assistant';
  content: string | DocV1;
  timestamp: Date;
  status?: 'streaming' | 'done' | 'error'; // Fix: Add status field
}

export default function BrainChatWithBlocks({
  persona,
  sessionId,
  onPersonaChange,
  personas = [],
  onBack
}: BrainChatWithBlocksProps) {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState('');
  const [chatTitle, setChatTitle] = useState('Новый чат');
  const [isSending, setIsSending] = useState(false);
  
  // Block streaming state - Fix: Use proper useBlockStream with event handling
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState<MessageType | null>(null);
  const { isComplete, virtualDoc, addBlock, complete, reset } = useBlockStream();

  // Fix: Sync virtualDoc with messages when it changes (with proper deep copy)
  useEffect(() => {
    if (!currentStreamingMessage) return;
    setMessages(prev => prev.map(m =>
      m.id === currentStreamingMessage.id ? { ...m, content: JSON.parse(JSON.stringify(virtualDoc)) } : m
    ));
  }, [virtualDoc, currentStreamingMessage]);

  // Load chat history on session change
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!sessionId) {
        setMessages([]);
        setChatTitle('Новый чат');
        return;
      }

      try {
        const response = await api.getChatHistory(sessionId);
        const historyMessages = (response as any).history?.map((msg: any) => {
          // Fix: Parse doc.v1 from string content
          let content: any = msg.content;
          if (typeof content === 'string') {
            try {
              const parsed = JSON.parse(content);
              if (parsed && parsed.blocks && Array.isArray(parsed.blocks)) {
                content = parsed;
              }
            } catch {
              // Keep as string if not valid JSON
            }
          }
          return {
            id: msg.id || crypto.randomUUID(), // Fix: Use crypto.randomUUID()
            role: msg.role,
            content,
            timestamp: new Date(msg.timestamp || Date.now())
          };
        }) || [];
        
        setMessages(historyMessages);
        
        // Set chat title from first user message
        const firstUserMessage = historyMessages.find((m: MessageType) => m.role === 'user');
        if (firstUserMessage && typeof firstUserMessage.content === 'string') {
          setChatTitle(firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : ''));
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    };

    loadChatHistory();
  }, [sessionId]);

  const sendMessage = async () => {
    if (!input.trim() || isSending) return;

    const userMessage: MessageType = {
      id: crypto.randomUUID(), // Fix: Use crypto.randomUUID()
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsSending(true);

    // Reset block streaming state
    reset();

    const request: ChatRequest = {
      text: currentInput,
      agent_id: persona,
      session_id: sessionId,
    };

    const assistantMessageId = crypto.randomUUID(); // Fix: Use crypto.randomUUID()
    const assistantMessage: MessageType = {
      id: assistantMessageId,
      role: 'assistant',
      content: { version: "1.0", blocks: [] }, // Fix: Start with proper empty doc structure
      timestamp: new Date(),
      status: 'streaming' // Fix: Set initial status
    };

    // Add assistant message to UI
    setMessages(prev => [...prev, assistantMessage]);
    setCurrentStreamingMessage(assistantMessage);

    const streamHandler = {
      onBlockStart: (data: any) => {
        debugLog('Block start:', data);
        // Fix: Normalize incoming data
        if (data.block_index !== undefined) {
          addBlock({ kind: 'start', ...data });
        }
      },
      onBlockDelta: (data: any) => {
        debugLog('Block delta:', data);
        // Fix: Normalize incoming data - ensure block exists
        if (data.block_index !== undefined && data.block) {
          addBlock({ kind: 'delta', ...data });
        }
      },
      onBlockEnd: (data: any) => {
        debugLog('Block end:', data);
        // Fix: Normalize incoming data
        if (data.block_index !== undefined) {
          addBlock({ kind: 'end', ...data });
        }
      },
      onComplete: () => {
        complete();
        // Fix: Finalize content with deep copy to ensure latest state and update status
        const finalDoc = JSON.parse(JSON.stringify(virtualDoc));
        setMessages(prev => prev.map(m =>
          m.id === assistantMessageId ? { ...m, content: finalDoc, status: 'done' } : m
        ));
        setIsSending(false);
        setCurrentStreamingMessage(null);
      },
      onError: (error: Error) => {
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: `Error: ${error.message}` }
            : msg
        ));
        setIsSending(false);
        setCurrentStreamingMessage(null);
      }
    };

    try {
      await api.sendMessageWithBlocks(request, streamHandler);
    } catch (error) {
      console.error('❌ Error sending message:', error);
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? { ...msg, content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }
          : msg
      ));
      setIsSending(false);
      setCurrentStreamingMessage(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { // Fix: Use onKeyDown
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              ←
            </button>
          )}
          <h1 className="text-xl font-semibold">{chatTitle}</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={persona}
            onChange={(e) => onPersonaChange(e.target.value)}
            className="px-3 py-1 border rounded-lg"
          >
            {personas.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] ${message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100'} rounded-lg p-3`}>
              {message.role === 'user' ? (
                <p className="whitespace-pre-wrap">{message.content as string}</p>
              ) : (
                <div>
                  {typeof message.content === 'object' && 'blocks' in message.content ? (
                    <MessageRenderer doc={message.content as DocV1} />
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content as string}</p>
                  )}
                  
                  {/* Show streaming indicator for current message */}
                  {currentStreamingMessage?.id === message.id && !isComplete && (
                    <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                      <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-500 rounded-full"></div>
                      <span>Генерация...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown} // Fix: Use onKeyDown
            placeholder="Введите сообщение..."
            className="flex-1 p-3 border rounded-lg resize-none"
            rows={2}
            disabled={isSending}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isSending}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? 'Отправка...' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  );
}
