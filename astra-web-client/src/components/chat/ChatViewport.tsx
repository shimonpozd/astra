import { useEffect, useRef } from 'react';
import type { Message as ApiMessage } from '../../services/api';
import UnifiedMessageRenderer from '../UnifiedMessageRenderer';
import { AudioMessageRenderer } from '../AudioMessageRenderer';
import type { ChatMessage, AudioMessage } from '../../types/text';
import { safeScrollToBottom } from '../../utils/scrollUtils';
import { debugWarn } from '../../utils/debugLogger';

// Support both legacy API messages and the newer ChatMessage shape
type AnyMessage = (ApiMessage | ChatMessage | (ApiMessage & Partial<ChatMessage>)) & {
  [key: string]: unknown;
};

// Unified message type for UI rendering
type UiMessage = {
  id?: string | number;
  role: 'user' | 'assistant' | 'system';
  content: unknown;
  content_type?: 'text.v1' | 'doc.v1' | 'thought.v1' | 'audio.v1';
  timestamp?: number | string;
};

interface ChatViewportProps {
  messages: AnyMessage[];
  isLoading: boolean;
}

const hasContentType = (message: AnyMessage): message is AnyMessage & {
  content_type: string;
} => {
  return typeof (message as any).content_type === 'string';
};

const normalizeMessage = (message: AnyMessage): UiMessage => {
  const role = (message.role as string) || 'assistant';
  const content = message.content;
  let content_type: UiMessage['content_type'] = 'text.v1';

  // Простая эвристика для определения content_type
  if (typeof content === 'string') {
    const s = content.trim();
    if (s.startsWith('{') || s.startsWith('[')) content_type = 'doc.v1';
  } else if (content && typeof content === 'object') {
    const obj: any = content;
    if (Array.isArray(obj?.blocks) || typeof obj?.version === 'string') {
      content_type = 'doc.v1';
    }
  }

  // Override with explicit content_type if present and valid
  if (hasContentType(message)) {
    const ct = message.content_type as string;
    if (['text.v1', 'doc.v1', 'thought.v1', 'audio.v1'].includes(ct)) {
      content_type = ct as UiMessage['content_type'];
    } else if (process.env.NODE_ENV === 'development') {
      debugWarn(`Unknown content_type '${ct}', falling back to 'text.v1'`);
    }
  }

  return {
    id: message.id,
    role: role as UiMessage['role'],
    content,
    content_type,
    timestamp: message.timestamp as UiMessage['timestamp'],
  };
};

// Generate stable keys for messages without random salt
const getStableKey = (msg: UiMessage, index: number): string => {
  if (msg.id != null && msg.id !== undefined && String(msg.id).trim() && String(msg.id) !== 'undefined') {
    return `msg-id-${String(msg.id)}`;
  }

  // Create deterministic hash from timestamp/index + content preview + role
  const contentStr = String(msg.content || '').slice(0, 64);
  const timestamp = msg.timestamp ? String(msg.timestamp) : 'no-ts';
  const role = msg.role || 'unknown';
  const contentType = msg.content_type || 'text';
  
  const base = `${timestamp}-${index}-${role}-${contentType}-${contentStr}`;
  
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    const char = base.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  const hashKey = Math.abs(hash);
  if (hashKey > 0) {
    return `msg-hash-${hashKey}-idx${index}`;
  }
  
  // Ultimate fallback without random elements
  return `msg-fallback-${index}-${timestamp}`;
};

export default function ChatViewport({ messages, isLoading }: ChatViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Normalize all messages for consistent rendering
  const uiMessages = messages.map(normalizeMessage);

  // Improved auto-scroll logic (с задержкой для предотвращения конфликтов)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const { scrollHeight, scrollTop, clientHeight } = viewport;
    const distance = scrollHeight - scrollTop - clientHeight;
    const nearBottom = distance < 120;

    const senderIsUser = uiMessages[uiMessages.length - 1]?.role === 'user';
    const shouldStick = nearBottom || uiMessages.length === 0 || senderIsUser;

    if (shouldStick) {
      // Use smooth scrolling for small distances, instant for large ones
      const behavior = distance < 800 ? 'smooth' : 'auto';
      safeScrollToBottom(messagesEndRef.current, behavior, 50);
    }
  }, [uiMessages]);

  // Ensure initial autoscroll on first render with messages
  useEffect(() => {
    if (messagesEndRef.current) {
      safeScrollToBottom(messagesEndRef.current, 'auto', 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always scroll to bottom when messages length increases (new messages loaded)
  useEffect(() => {
    if (messagesEndRef.current) {
      safeScrollToBottom(messagesEndRef.current, 'auto', 0);
    }
  }, [uiMessages.length]);

  return (
    <div ref={viewportRef} className="flex-1 min-h-0 panel-padding overflow-y-auto panel-inner">
      {isLoading ? (
        <div className="flex justify-center items-center h-full">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      ) : uiMessages.length === 0 ? (
        <div className="flex justify-center items-center h-full">
          <div className="text-muted-foreground">Select a chat to start messaging</div>
        </div>
      ) : (
        <div className="space-messages w-full max-w-[72ch] mx-auto">
          {uiMessages.map((message, index) => {
            const key = getStableKey(message, index);

            const renderUserBubble = () => {
              const text =
                typeof message.content === 'string'
                  ? message.content
                  : JSON.stringify(message.content, null, 2);
              return (
                <div className="ml-auto max-w-[85%] rounded-2xl px-4 py-3 bg-primary text-primary-foreground">
                  {/* БЕЗ .doc! — чистый текст в пузыре */}
                  <p className="whitespace-pre-wrap break-words">{text}</p>
                </div>
              );
            };

            const renderAssistantDoc = () => {
              // Handle audio messages
              if (message.content_type === 'audio.v1') {
                return <AudioMessageRenderer message={message as AudioMessage} />;
              }
              
              // Default doc rendering
              return (
                <article className="doc" dir="auto">
                  <UnifiedMessageRenderer input={message.content} />
                </article>
              );
            };

            return (
              <div key={key} className="w-full">
                {message.content_type === 'thought.v1' ? (
                  <div className="text-xs text-muted-foreground italic whitespace-pre-wrap mx-auto max-w-[72ch]">
                    <p>
                      {typeof message.content === 'string'
                        ? message.content
                        : JSON.stringify(message.content)}
                    </p>
                  </div>
                ) : message.role === 'user' ? (
                  renderUserBubble()
                ) : (
                  renderAssistantDoc()
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
}