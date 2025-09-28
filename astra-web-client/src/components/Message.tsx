import React, { useState } from 'react';
import { Message as MessageType } from '../types/index';
import { MessageRenderer } from './MessageRenderer';
import { Doc, DocV1, ChatMessage } from '../types/text';
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
    <div className={cn("flex gap-4 mb-6", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 mt-1 bg-gray-200 text-gray-900">
          {message.isStreaming ? (
            <div className="flex space-x-1">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"></div>
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{animationDelay: '0.1s'}}></div>
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{animationDelay: '0.2s'}}></div>
            </div>
          ) : message.isThinking ? (
            <span title="Ассистент размышлял над ответом">🧠</span>
          ) : (
            '🤖'
          )}
        </div>
      )}

      <div className={cn(
        "max-w-2xl px-4 py-3 rounded-2xl",
        isUser
          ? "ml-12"
          : ""
      )}
      style={{
        backgroundColor: isUser ? '#f5f5f5' : '#1a1a1a',
        color: isUser ? '#0f0f0f' : '#f5f5f5'
      }}>
        {/* Основной контент */}
        {renderedContent}

        {/* План исследования */}
        {message.plan && (
          <details className="mt-3 p-3 bg-gray-800 rounded-lg">
            <summary className="cursor-pointer text-sm font-medium text-blue-400">
              📋 План исследования
            </summary>
            <div className="mt-2 text-sm text-gray-300">
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
          <details className="mt-3 p-3 bg-gray-800 rounded-lg">
            <summary className="cursor-pointer text-sm font-medium text-green-400">
              🔍 Результаты поиска
            </summary>
            <div className="mt-2 text-sm text-gray-300">
              <pre className="whitespace-pre-wrap text-xs">
                {JSON.stringify(message.research, null, 2)}
              </pre>
            </div>
          </details>
        )}

        {/* Ошибка */}
        {message.error && (
          <div className="mt-3 p-3 bg-red-900 border border-red-700 rounded-lg">
            <div className="flex items-center gap-2 text-red-300">
              <span>⚠️</span>
              <span className="font-medium">Ошибка</span>
            </div>
            <p className="mt-1 text-sm text-red-200">{message.error.message}</p>
          </div>
        )}

        {/* Мысли ассистента */}
        {message.thinking && (
          <div className="mt-3">
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="text-xs text-blue-400 hover:text-blue-300 underline"
            >
              {showThinking ? 'Скрыть мысли' : 'Показать мысли ассистента'}
            </button>
            {showThinking && (
              <div className="mt-2 p-3 bg-yellow-900 border border-yellow-700 rounded-lg">
                <div className="flex items-center gap-2 text-yellow-300 mb-2">
                  <span>💭</span>
                  <span className="font-medium text-sm">Ход мыслей</span>
                </div>
                <p className="text-sm text-yellow-200 whitespace-pre-wrap">
                  {message.thinking}
                </p>
              </div>
            )}
          </div>
        )}

        <p className="text-xs mt-2" style={{
          color: isUser ? '#404040' : '#808080',
          opacity: isUser ? 0.7 : 1
        }}>
          {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
        </p>
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 mt-1 bg-gray-200 text-gray-900">
          👤
        </div>
      )}
    </div>
  );
}