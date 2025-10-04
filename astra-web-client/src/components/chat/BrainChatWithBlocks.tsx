// @ts-nocheck
import React, { useState, useRef, useEffect } from 'react';
import { api } from '../../services/api';
import { ChatRequest, Message as MessageType, StreamHandler } from '../../types';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Loader2, AlertCircle, MessageSquare, ArrowLeft } from 'lucide-react';
import { BlockStreamRenderer, useBlockStream } from './BlockStreamRenderer';
import { MessageRenderer } from '../MessageRenderer';
import { DocV1 } from '../../types/text';

interface BrainChatWithBlocksProps {
  persona: string;
  sessionId?: string;
  onPersonaChange?: (persona: string) => void;
  personas?: Array<{id: string, name: string, description: string}>;
  onBack?: () => void;
}

// interface ResearchState {
//   currentStatus: string;
//   currentPlan: any;
//   currentDraft: string;
//   currentCritique: string[];
//   isResearching: boolean;
//   error: string | null;
// }

export default function BrainChatWithBlocks({
  persona,
  sessionId,
  onPersonaChange,
  personas = [],
  onBack
}: BrainChatWithBlocksProps) {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState('');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamingBlocks, setCurrentStreamingBlocks] = useState<DocV1 | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    // Добавляем задержку чтобы избежать конфликтов с другими скроллами
    const timeoutId = setTimeout(() => {
      scrollToBottom();
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [messages, currentStreamingBlocks]);

  const handleSendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: MessageType = {
      id: Date.now(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    setCurrentStreamingBlocks(null);
    setConnectionError(null);

    const request: ChatRequest = {
      text: input,
      session_id: sessionId,
      user_id: 'user_123', // TODO: Get from auth
      agent_id: persona
    };

    const streamHandler: StreamHandler = {
      onBlockStart: (blockData) => {
        console.log('Block start:', blockData);
        // Initialize streaming blocks if not already done
        if (!currentStreamingBlocks) {
          setCurrentStreamingBlocks({
            version: '1.0',
            blocks: []
          });
        }
      },
      
      onBlockDelta: (blockData) => {
        console.log('Block delta:', blockData);
        // Update streaming blocks
        setCurrentStreamingBlocks(prev => {
          if (!prev) return prev;
          
          const newBlocks = [...prev.blocks];
          const { block_index, content } = blockData;
          
          // Ensure we have enough blocks
          while (newBlocks.length <= block_index) {
            newBlocks.push({
              type: 'paragraph',
              text: ''
            });
          }
          
          // Update the block
          newBlocks[block_index] = {
            ...newBlocks[block_index],
            ...content
          };
          
          return {
            ...prev,
            blocks: newBlocks
          } as DocV1;
        });
      },
      
      onBlockEnd: (blockData) => {
        console.log('Block end:', blockData);
        // Finalize the block
        setCurrentStreamingBlocks(prev => {
          if (!prev) return prev;
          
          const newBlocks = [...prev.blocks];
          const { block_index, content } = blockData;
          
          if (newBlocks[block_index]) {
            newBlocks[block_index] = {
              ...newBlocks[block_index],
              ...content
            };
          }
          
          return {
            ...prev,
            blocks: newBlocks
          } as DocV1;
        });
      },
      
      onChunk: (chunk) => {
        console.log('Chunk:', chunk);
        // Handle regular text chunks if needed
      },
      
      onDoc: (doc) => {
        console.log('Doc:', doc);
        // Handle complete doc.v1 documents
        setCurrentStreamingBlocks(doc);
      },
      
      onComplete: () => {
        console.log('Stream complete');
        setIsStreaming(false);
        
        // Save the final message
        if (currentStreamingBlocks) {
          const assistantMessage: MessageType = {
            id: Date.now() + 1,
            role: 'assistant',
            content: currentStreamingBlocks as DocV1,
            content_type: 'doc.v1',
            timestamp: new Date()
          };
          
          setMessages(prev => [...prev, assistantMessage]);
          setCurrentStreamingBlocks(null);
        }
      },
      
      onError: (error) => {
        console.error('Stream error:', error);
        setIsStreaming(false);
        setCurrentStreamingBlocks(null);
        setConnectionError(error.message);
      }
    };

    try {
      await api.sendMessageWithBlocks(request, streamHandler);
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsStreaming(false);
      setCurrentStreamingBlocks(null);
      setConnectionError(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const renderMessage = (message: MessageType) => {
    if ((message as any).content_type === 'doc.v1' && typeof message.content === 'object') {
      return <MessageRenderer doc={message.content as DocV1} />;
    }
    
    return (
      <div className="whitespace-pre-wrap">
        {typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <Card className="flex-1 flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {onBack && (
                <Button variant="ghost" size="sm" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <CardTitle className="text-lg">Новый чат</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {personas.length > 0 && (
                <select
                  value={persona}
                  onChange={(e) => onPersonaChange?.(e.target.value)}
                  className="px-3 py-1 border rounded-md bg-background"
                >
                  {personas.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-4 mb-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {renderMessage(message)}
                </div>
              </div>
            ))}
            
            {/* Streaming blocks */}
            {currentStreamingBlocks && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
                  <MessageRenderer doc={currentStreamingBlocks} />
                  {isStreaming && (
                    <div className="streaming-cursor animate-pulse mt-2">
                      <span className="text-gray-400">▋</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {connectionError && (
              <div className="flex justify-center">
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>{connectionError}</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
          
          <div className="flex-shrink-0 flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Введите сообщение..."
              className="flex-1 min-h-[60px] max-h-[120px] resize-none"
              disabled={isStreaming}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!input.trim() || isStreaming}
              className="self-end"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


