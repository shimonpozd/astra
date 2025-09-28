import { useEffect, useRef } from 'react';
import type { Message as ApiMessage } from '../../services/api';
import { MessageRenderer } from '../MessageRenderer';
import type { Doc, DocV1, ChatMessage } from '../../types/text';

// Support both legacy API messages and the newer ChatMessage shape
type AnyMessage = (ApiMessage | ChatMessage | (ApiMessage & Partial<ChatMessage>)) & {
  [key: string]: unknown;
};

interface ChatViewportProps {
  messages: AnyMessage[];
  isLoading: boolean;
}

const hasContentType = (message: AnyMessage): message is AnyMessage & {
  content_type: string;
} => typeof message?.content_type === 'string';

const coerceDoc = (payload: unknown): Doc | DocV1 | null => {
  if (!payload) return null;
  if (typeof payload === 'object') {
    const maybeBlocks = (payload as { blocks?: unknown }).blocks;
    if (Array.isArray(maybeBlocks)) {
      return payload as Doc | DocV1;
    }
  }
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).blocks)) {
        return parsed as Doc | DocV1;
      }
      return parsed as Doc;
    } catch (error) {
      return null;
    }
  }
  return null;
};

const coerceText = (payload: unknown): string => {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload);
  } catch (error) {
    return String(payload);
  }
};

export default function ChatViewport({ messages, isLoading }: ChatViewportProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const renderAssistantContent = (rawContent: unknown, declaredType: string) => {
    const preferredDoc = declaredType === 'doc.v1' ? coerceDoc(rawContent) : null;
    if (preferredDoc) {
      return (
        <div className="text-sm text-neutral-100">
          <MessageRenderer doc={preferredDoc} />
        </div>
      );
    }

    const fallbackDoc = coerceDoc(rawContent);
    if (fallbackDoc) {
      return (
        <div className="text-sm text-neutral-100">
          <MessageRenderer doc={fallbackDoc} />
        </div>
      );
    }

    const text = coerceText(rawContent);
    const parsedTextDoc = coerceDoc(text);
    if (parsedTextDoc) {
      return (
        <div className="text-sm text-neutral-100">
          <MessageRenderer doc={parsedTextDoc} />
        </div>
      );
    }

    return (
      <div className="text-sm text-neutral-100">
        <p className="mb-4 leading-7 whitespace-pre-wrap">{text}</p>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 p-4 overflow-y-auto" style={{ backgroundColor: '#262624' }}>
      {isLoading ? (
        <div className="flex justify-center items-center h-full">
          <p className="text-muted-foreground">Loading messages...</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex justify-center items-center h-full">
          <p className="text-muted-foreground">Select a chat to see messages.</p>
        </div>
      ) : (
        <div className="space-y-4 max-w-[835px] mx-auto">
          {messages.map((message, index) => {
            const role = (message.role as string) || 'assistant';
            const rawContent = message.content;
            const contentType = hasContentType(message)
              ? (message.content_type as string) || 'text.v1'
              : 'text.v1';

            const key = message.id ?? message.timestamp ?? `${role}-${index}`;

            let renderedContent;
            if (role === 'user') {
              const userText = coerceText(rawContent);
              renderedContent = (
                <div className="px-4 py-2 rounded-2xl bg-primary text-primary-foreground text-sm max-w-[835px] whitespace-pre-wrap">
                  {userText}
                </div>
              );
            } else {
              renderedContent = renderAssistantContent(rawContent, contentType);
            }

            return (
              <div
                key={key as string | number}
                className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {renderedContent}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
}
