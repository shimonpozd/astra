import { DocV1 } from '../types/text';
export interface Chat {
  session_id: string;
  name: string;
  last_modified: string;
  type: 'chat' | 'study';
}

export interface Message {
  id: string | number;
  role: 'user' | 'assistant' | 'system' | 'source';
  content: string | DocV1 | null;
  content_type?: 'text.v1' | 'doc.v1';
  timestamp: number | Date;
}

interface ChatHistoryResponse {
  history: Message[];
}

export interface ChatRequest {
  text: string;
  session_id?: string;
  user_id?: string;
  agent_id?: string;
  context?: 'focus' | 'workbench-left' | 'workbench-right';
}

export interface StreamEvent<T = unknown> {
  type: string;
  data?: T;
}

export interface StreamHandler {
  onDraft?: (payload: any) => void;
  onChunk?: (chunk: string) => void;
  onDoc?: (doc: DocV1) => void;
  onEvent?: (event: StreamEvent) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

// Vite proxy will strip /api, so we call /api/chats from frontend
const API_BASE = '/api'; 

async function getChatList(): Promise<Chat[]> {
  try {
    // Corresponds to backend endpoint GET /chats
    const response = await fetch(`${API_BASE}/chats`);
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.statusText}`);
    }
    // Напрямую возвращаем результат response.json(), так как это и есть массив чатов
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch chat list:", error);
    return []; // Возвращаем пустой массив в случае ошибки
  }
}

async function getChatHistory(sessionId: string): Promise<Message[]> {
  try {
    // Corresponds to backend endpoint GET /chats/{sessionId}
    const response = await fetch(`${API_BASE}/chats/${sessionId}`);
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.statusText}`);
    }
    const data: ChatHistoryResponse = await response.json();
    return data.history || [];
  } catch (error) {
    console.error(`Failed to fetch chat history for ${sessionId}:`, error);
    return [];
  }
}

async function deleteChat(sessionId: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/chats/${sessionId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete chat: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Failed to delete chat ${sessionId}:`, error);
    throw error;
  }
}

async function deleteSession(sessionId: string, sessionType: 'chat' | 'study'): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/${sessionType}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete ${sessionType} session: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Failed to delete ${sessionType} session ${sessionId}:`, error);
    throw error;
  }
}

async function getStudyState(sessionId: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}/study/state?session_id=${sessionId}`);
    if (!response.ok) {
      throw new Error('Failed to get study state');
    }
    const result = await response.json();
    if (!result.ok || !result.state) {
      throw new Error('Invalid response from get study state');
    }
    return result.state;
  } catch (error) {
    console.error(`Failed to get study state for ${sessionId}:`, error);
    throw error;
  }
}

async function getLexicon(word: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}/study/lexicon?word=${encodeURIComponent(word)}`);
    if (!response.ok) {
      throw new Error('Failed to get lexicon data');
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed to get lexicon for ${word}:`, error);
    throw error;
  }
}

async function getBookshelfCategories(): Promise<Array<{name: string; color: string}>> {
  try {
    const response = await fetch(`${API_BASE}/study/categories`);
    if (!response.ok) {
      throw new Error('Failed to get bookshelf categories');
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to get bookshelf categories:', error);
    throw error;
  }
}

async function getBookshelfItems(sessionId: string, ref: string, categories: string[]): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}/study/bookshelf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, ref, categories }),
    });
    if (!response.ok) {
      throw new Error('Failed to get bookshelf items');
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to get bookshelf items:', error);
    throw error;
  }
}

async function getSourceText(ref: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}/api/texts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref }),
    });
    if (!response.ok) {
      throw new Error('Failed to get source text');
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed to get source text for ${ref}:`, error);
    throw error;
  }
}

async function translateText(hebrewText: string, englishText: string): Promise<string> {
  try {
    const response = await fetch(`${API_BASE}/actions/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hebrew_text: hebrewText, english_text: englishText }),
    });

    if (!response.ok) {
      throw new Error(`Failed to translate text: ${response.statusText}`);
    }
    if (!response.body) {
      return '';
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    let fullTranslation = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last, possibly incomplete, line

      for (const line of lines) {
        if (line.trim() === '') continue;
        try {
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === 'llm_chunk' && typeof event.data === 'string') {
            fullTranslation += event.data;
          }
        } catch (e) {
          console.error('Failed to parse stream event in translateText:', line, e);
          // If it's not valid JSON, just ignore it for now. It might be a non-event line.
        }
      }
    }
    return fullTranslation;

  } catch (error) {
    console.error('Failed to translate text:', error);
    throw error;
  }
}

async function explainTerm(term: string, contextText: string, handler: StreamHandler): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/actions/explain-term`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term, context_text: contextText }),
    });

    if (!response.body) {
      throw new Error("Response body is empty");
    }

    // The stream is plain text, not NDJSON. Read it directly.
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        handler.onComplete?.();
        break;
      }
      if (value) {
        handler.onChunk?.(value);
      }
    }
  } catch (error) {
    console.error("Failed to explain term:", error);
    handler.onError?.(error instanceof Error ? error : new Error('Unknown stream error'));
  }
}

async function resolveRef(text: string): Promise<any> {
  const response = await fetch(`${API_BASE}/study/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    throw new Error('Failed to resolve reference');
  }
  return response.json();
}

async function setFocus(sessionId: string, ref: string): Promise<any> {
  const response = await fetch(`${API_BASE}/study/set_focus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, ref }),
  });
  if (!response.ok) {
    throw new Error('Failed to set focus');
  }
  const result = await response.json();
  if (!result.ok || !result.state) {
    throw new Error('Invalid response from set_focus');
  }
  return result.state;
}

async function navigateBack(sessionId: string): Promise<any> {
  const response = await fetch(`${API_BASE}/study/back`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!response.ok) {
    throw new Error('Failed to navigate back');
  }
  const result = await response.json();
  if (!result.ok || !result.state) {
    throw new Error('Invalid response from back');
  }
  return result.state;
}

async function navigateForward(sessionId: string): Promise<any> {
  const response = await fetch(`${API_BASE}/study/forward`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!response.ok) {
    throw new Error('Failed to navigate forward');
  }
  const result = await response.json();
  if (!result.ok || !result.state) {
    throw new Error('Invalid response from forward');
  }
  return result.state;
}

async function setDiscussionFocus(sessionId: string, ref: string): Promise<any> {
  const response = await fetch(`${API_BASE}/study/chat/set_focus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, ref }),
  });
  if (!response.ok) {
    throw new Error('Failed to set discussion focus');
  }
  const result = await response.json();
  if (!result.ok || !result.state) {
    throw new Error('Invalid response from set_discussion_focus');
  }
  return result.state;
}

async function sendMessage(request: ChatRequest, handler: StreamHandler): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.body) {
      throw new Error("Response body is empty");
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        handler.onComplete?.();
        break;
      }

      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last, possibly incomplete, line

      for (const line of lines) {
        if (line.trim() === '') continue;
        try {
          const event = JSON.parse(line) as StreamEvent;
          switch (event.type) {
            case 'llm_chunk': {
              const chunk = typeof event.data === 'string' ? event.data : '';
              if (chunk) {
                handler.onChunk?.(chunk);
                handler.onDraft?.(event.data as any);
              }
              handler.onEvent?.(event);
              break;
            }
            case 'doc_v1': {
              handler.onDoc?.(event.data as DocV1);
              handler.onEvent?.(event);
              break;
            }
            case 'error': {
              handler.onEvent?.(event);
              const message = typeof event.data === 'string' ? event.data : 'Stream error';
              handler.onError?.(new Error(message));
              break;
            }
            default: {
              handler.onEvent?.(event);
              break;
            }
          }
        } catch (e) {
          console.error('Failed to parse stream event:', line, e);
        }
      }
    }
  } catch (error) {
    console.error("Failed to send message:", error);
    handler.onError?.(error instanceof Error ? error : new Error('Unknown stream error'));
  }
}

async function sendStudyMessage(sessionId: string, text: string, handler: StreamHandler): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/study/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session_id: sessionId, text }),
    });

    if (!response.body) {
      throw new Error("Response body is empty");
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        handler.onComplete?.();
        break;
      }

      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last, possibly incomplete, line

      for (const line of lines) {
        if (line.trim() === '') continue;
        try {
          const event = JSON.parse(line) as StreamEvent;
          switch (event.type) {
            case 'llm_chunk': {
              const chunk = typeof event.data === 'string' ? event.data : '';
              if (chunk) {
                handler.onChunk?.(chunk);
                handler.onDraft?.(event.data as any);
              }
              handler.onEvent?.(event);
              break;
            }
            case 'doc_v1': {
              handler.onDoc?.(event.data as DocV1);
              handler.onEvent?.(event);
              break;
            }
            case 'error': {
              handler.onEvent?.(event);
              const message = typeof event.data === 'string' ? event.data : 'Stream error';
              handler.onError?.(new Error(message));
              break;
            }
            default: {
              handler.onEvent?.(event);
              break;
            }
          }
        } catch (e) {
          console.error('Failed to parse stream event:', line, e);
        }
      }
    }
  } catch (error) {
    console.error("Failed to send study message:", error);
    handler.onError?.(error instanceof Error ? error : new Error('Unknown stream error'));
  }
}

export const api = {
  getChatList,
  getChatHistory,
  deleteChat,
  deleteSession,
  sendMessage,
  sendStudyMessage,
  resolveRef,
  setFocus,
  setDiscussionFocus,
  navigateBack,
  navigateForward,
  getStudyState,
  getLexicon,
  getBookshelfCategories,
  getBookshelfItems,
  translateText,
  explainTerm,
};