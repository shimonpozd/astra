import React, { useState } from 'react';
import { Message as MessageType } from '../types/index';
import { MessageRenderer } from './MessageRenderer';
import { Doc, DocV1 } from '../types/text';
import { cn } from '../lib/utils';

interface MessageProps {
  message: MessageType;
}

export default function Message({ message }: MessageProps) {
  const isUser = message.role === 'user';
  const [showThinking, setShowThinking] = useState(false);

  // Handle both old Message format and new ChatMessage format
  const isChatMessage = 'content_type' in message;
  const content = isChatMessage ? message.content : message.content;
  const contentType = isChatMessage ? message.content_type : 'text.v1';

  let renderedContent: React.ReactNode;

  if (isUser) {
    // User messages are always plain text
    renderedContent = (
      <p className="whitespace-pre-wrap leading-relaxed">
        {typeof content === 'string' ? content : JSON.stringify(content)}
      </p>
    );
  } else {
    // Assistant/system messages
    if (contentType === 'doc.v1' && typeof content === 'object' && content !== null) {
      // New doc.v1 format
      renderedContent = <MessageRenderer doc={content as DocV1} />;
    } else if (typeof content === 'string') {
      // Try to parse as legacy JSON or render as plain text
      let parsedDoc: Doc | DocV1 | null = null;
      let parseError = false;

      try {
        parsedDoc = JSON.parse(content);
      } catch (error) {
        parseError = true;
      }

      if (parsedDoc && !parseError) {
        renderedContent = <MessageRenderer doc={parsedDoc} />;
      } else {
        renderedContent = (
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        );
      }
    } else {
      // Fallback
      renderedContent = (
        <p className="whitespace-pre-wrap leading-relaxed">
          {JSON.stringify(content)}
        </p>
      );
    }
  }

  return (
    <div className={cn("flex gap-4 mb-8", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 mt-1 bg-primary text-primary-foreground">
          {message.isStreaming ? (
            <div className="flex space-x-1">
              <div className="w-2 h-2 rounded-full bg-primary-foreground animate-bounce"></div>
              <div className="w-2 h-2 rounded-full bg-primary-foreground animate-bounce" style={{animationDelay: '0.1s'}}></div>
              <div className="w-2 h-2 rounded-full bg-primary-foreground animate-bounce" style={{animationDelay: '0.2s'}}></div>
            </div>
          ) : message.isThinking ? (
            <span title="Ассистент размышлял над ответом">🧠</span>
          ) : (
            '🤖'
          )}
        </div>
      )}

      <div className={cn(
        "max-w-3xl px-6 py-4 rounded-2xl",
        isUser
          ? "ml-12 bg-primary text-primary-foreground"
          : "bg-card text-card-foreground border border-border/30"
      )}>
        {/* Основной контент */}
        {renderedContent}

        {/* План исследования */}
        {message.plan && (
          <details className="mt-4 p-4 note-block">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              📋 План исследования
            </summary>
            <div className="mt-3 text-sm text-muted-foreground">
              <p><strong>Итерация:</strong> {message.plan.iteration}</p>
              <p><strong>Основная ссылка:</strong> {message.plan.primary_ref}</p>
              {message.plan.description && (
                <p><strong>Описание:</strong> {message.plan.description}</p>
              )}
            </div>
          </details>
        )}

        {/* Результаты исследования */}
        {message.research && (
          <details className="mt-4 p-4 note-block">
            <summary className="cursor-pointer text-sm font-medium text-success">
              🔍 Результаты поиска
            </summary>
            <div className="mt-3 text-sm text-muted-foreground">
              <pre className="whitespace-pre-wrap text-xs">
                {JSON.stringify(message.research, null, 2)}
              </pre>
            </div>
          </details>
        )}

        {/* Ошибка */}
        {message.error && (
          <div className="mt-4 p-4 bg-destructive/5 border border-destructive/30 rounded-xl">
            <div className="flex items-center gap-2 text-destructive">
              <span>⚠️</span>
              <span className="font-medium">Ошибка</span>
            </div>
            <p className="mt-2 text-sm text-destructive/90">{message.error.message}</p>
          </div>
        )}

        {/* Мысли ассистента */}
        {message.thinking && (
          <div className="mt-4">
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="text-xs text-primary hover:text-primary/80 underline transition-colors"
            >
              {showThinking ? 'Скрыть мысли' : 'Показать мысли ассистента'}
            </button>
            {showThinking && (
              <div className="mt-3 p-4 note-block">
                <div className="flex items-center gap-2 text-warning mb-2">
                  <span>💭</span>
                  <span className="font-medium text-sm">Ход мыслей</span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {message.thinking}
                </p>
              </div>
            )}
          </div>
        )}

        <p className="text-xs mt-3 text-muted-foreground/70">
          {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
        </p>
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 mt-1 bg-secondary text-secondary-foreground">
          👤
        </div>
      )}
    </div>
  );
}