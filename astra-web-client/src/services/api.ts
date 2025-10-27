import { DocV1 } from '../types/text';
export interface Chat {
  session_id: string;
  name: string;
  last_modified: string;
  type: 'chat' | 'study' | 'daily';
  completed?: boolean; // For daily chats
}

export interface Message {
  id: string | number;
  role: 'user' | 'assistant' | 'system' | 'source';
  content: string | DocV1 | null;
  content_type?: 'text.v1' | 'doc.v1' | 'thought.v1';
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
  onBlockStart?: (blockData: any) => void;
  onBlockDelta?: (blockData: any) => void;
  onBlockEnd?: (blockData: any) => void;
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

interface VirtualDailyChat {
  session_id: string;
  title: string;
  he_title: string;
  display_value: string;
  he_display_value: string;
  ref: string;
  category: string;
  order: number;
  date: string;
  exists: boolean;
}

async function getDailyCalendar(): Promise<VirtualDailyChat[]> {
  try {
    // Get virtual daily chats from backend
    const response = await fetch(`${API_BASE}/daily/calendar`);
    if (!response.ok) {
      throw new Error(`Failed to get daily calendar: ${response.statusText}`);
    }
    const data = await response.json();
    return data.virtual_chats || [];
  } catch (error) {
    console.error("Failed to fetch daily calendar:", error);
    return [];
  }
}

async function createDailySessionLazy(sessionId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/daily/create/${sessionId}`, {
      method: 'POST'
    });
    if (!response.ok) {
      throw new Error(`Failed to create daily session: ${response.statusText}`);
    }
    const result = await response.json();
    return result.created || false;
  } catch (error) {
    console.error("Failed to create daily session:", error);
    return false;
  }
}

async function getDailySegments(sessionId: string): Promise<{
  session_id: string;
  segments: any[];
  total_segments: number;
  loaded_segments: number;
}> {
  try {
    const response = await fetch(`${API_BASE}/daily/${sessionId}/segments`);
    if (!response.ok) {
      throw new Error(`Failed to get daily segments: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to get daily segments:", error);
    throw error;
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

async function deleteSession(sessionId: string, sessionType: 'chat' | 'study' | 'daily'): Promise<void> {
  try {
    // Daily sessions use a different API endpoint
    if (sessionType === 'daily') {
      return await deleteDailySession(sessionId);
    }
    
    const url = `${API_BASE}/sessions/${sessionId}/${sessionType}`;
    console.log('🗑️ API deleteSession call:', {
      url,
      sessionId,
      sessionType,
      method: 'DELETE'
    });
    
    const response = await fetch(url, {
      method: 'DELETE',
    });
    
    console.log('📡 API deleteSession response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      url: response.url
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      console.error('❌ API deleteSession error response:', {
        status: response.status,
        statusText: response.statusText,
        errorText,
        url
      });
      throw new Error(`Failed to delete ${sessionType} session: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    console.log('✅ API deleteSession successful');
  } catch (error) {
    console.error(`Failed to delete ${sessionType} session ${sessionId}:`, error);
    throw error;
  }
}

// Convenience function for daily sessions
export async function deleteDailySession(sessionId: string): Promise<void> {
  try {
    // Daily sessions are virtual - they don't exist until created
    // We can't delete what doesn't exist, so we treat this as success
    console.log('ℹ️ Daily session deletion:', {
      sessionId,
      note: 'Daily sessions are virtual and don\'t exist until created'
    });
    
    // For now, we'll just log that we're "deleting" a virtual session
    // In the future, if daily sessions get persisted, we can add actual deletion logic here
    console.log('✅ Daily session "deleted" (virtual session)');
  } catch (error) {
    console.error(`Failed to delete daily session ${sessionId}:`, error);
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

async function getBookshelfItems(sessionId: string, ref: string, category?: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}/study/bookshelf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, ref, categories: category ? [category] : undefined }),
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

async function setFocus(sessionId: string, ref: string, focusRef?: string): Promise<any> {
  const response = await fetch(`${API_BASE}/study/set_focus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      session_id: sessionId, 
      ref,
      focus_ref: focusRef ?? ref,
      window_size: 30, // Request a wider initial window to prime continuous reading
      navigation_type: "drill_down"
    }),
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
    // NDJSON op→event compatibility mapping
    const idToIndex = new Map<string, number>();
    let nextIndex = 0;
    const extractObjects = (input: string): { objects: string[]; rest: string } => {
      const objects: string[] = [];
      let i = 0, depth = 0, inString = false, escape = false, start = -1;
      while (i < input.length) {
        const ch = input[i];
        if (inString) { if (escape) escape = false; else if (ch === '\\') escape = true; else if (ch === '"') inString = false; }
        else { if (ch === '"') inString = true; else if (ch === '{') { if (depth === 0) start = i; depth++; } else if (ch === '}') { depth--; if (depth === 0 && start !== -1) { objects.push(input.slice(start, i + 1)); start = -1; } } }
        i++;
      }
      const rest = depth === 0 ? '' : (start >= 0 ? input.slice(start) : input);
      return { objects, rest };
    };
  

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        handler.onComplete?.();
        break;
      }

      buffer += value;
      const chunks: string[] = [];
      if (buffer.includes('\n')) {
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) { const t = line.trim(); if (t) chunks.push(t); }
      }
      const extracted = extractObjects(buffer);
      if (extracted.objects.length) { chunks.push(...extracted.objects.map(s => s.trim())); buffer = extracted.rest; }

      for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (trimmed === '' || !trimmed.startsWith('{') || trimmed.startsWith('```')) continue;
        try {
          const parsedAny = JSON.parse(trimmed);
          if (parsedAny && typeof parsedAny === 'object' && typeof parsedAny.op === 'string') {
            const op = parsedAny.op as string;
            if (op === 'add_block' && parsedAny.data && typeof parsedAny.data.id === 'string') {
              const { id, type, meta } = parsedAny.data as { id: string; type?: string; meta?: any };
              if (!idToIndex.has(id)) idToIndex.set(id, nextIndex++);
              const block_index = idToIndex.get(id)!;
              const t = (type || 'p').toLowerCase();
              let block: any = { text: '' }, block_type_for_event = 'paragraph';
              if (t === 'h1') { block = { type: 'heading', level: 1, text: '', meta }; block_type_for_event = 'heading'; }
              else if (t === 'h2') { block = { type: 'heading', level: 2, text: '', meta }; block_type_for_event = 'heading'; }
              else if (t === 'quote') { block = { type: 'quote', text: '', meta }; block_type_for_event = 'quote'; }
              else if (t === 'hr') { block = { type: 'hr' }; block_type_for_event = 'hr'; }
              else { block = { type: 'paragraph', text: '', meta }; block_type_for_event = 'paragraph'; }
              handler.onBlockStart?.({ block_index, block_type: block_type_for_event, block_id: id, block });
              handler.onBlockDelta?.({ block_index, content: block, block: block, delta_type: 'replace' });
              handler.onEvent?.({ type: 'block_start', data: { block_index, block_type: block_type_for_event, block_id: id } });
              continue;
            }
            if (op === 'append_text' && parsedAny.data && typeof parsedAny.data.id === 'string') {
              const { id, text } = parsedAny.data as { id: string; text: string };
              if (!idToIndex.has(id)) idToIndex.set(id, nextIndex++);
              const block_index = idToIndex.get(id)!;
              handler.onBlockDelta?.({ block_index, content: { text }, block: { text }, delta_type: 'append' });
              handler.onEvent?.({ type: 'block_delta', data: { block_index } });
              continue;
            }
            if (op === 'end') { handler.onComplete?.(); return; }
            continue;
          }
          const event = parsedAny as StreamEvent;
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
            case 'full_response': {
              // Handle full response as text content
              const text = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
              handler.onChunk?.(text);
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
          console.error('Failed to parse stream event:', trimmed, e);
        }
      }
    }
  } catch (error) {
    console.error("Failed to send message:", error);
    handler.onError?.(error instanceof Error ? error : new Error('Unknown stream error'));
  }
}

async function sendMessageWithBlocks(request: ChatRequest, handler: StreamHandler): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/chat/stream-blocks`, {
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
      // Prefer newline framing, but also support brace-balanced framing
      const chunks: string[] = [];
      if (buffer.includes('\n')) {
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (t) chunks.push(t);
        }
      }
      // Extract any complete JSON objects left in buffer (for non-newline streams)
      const extracted = extractObjects(buffer);
      if (extracted.objects.length) {
        chunks.push(...extracted.objects.map(s => s.trim()));
        buffer = extracted.rest;
      }

      for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (trimmed === '' || !trimmed.startsWith('{') || trimmed.startsWith('```')) continue;
        try {
          const parsed = JSON.parse(trimmed);

          // Translate NDJSON op protocol into existing block_* events
          if (parsed && typeof parsed === 'object' && typeof parsed.op === 'string') {
            const op = parsed.op as string;
            if (op === 'add_block' && parsed.data && typeof parsed.data.id === 'string') {
              const { id, type, meta } = parsed.data as { id: string; type?: string; meta?: any };
              if (!idToIndex.has(id)) idToIndex.set(id, nextIndex++);
              const block_index = idToIndex.get(id)!;
              // Normalize NDJSON type to internal renderer schema
              const t = (type || 'p').toLowerCase();
              let block: any = { text: '' };
              let block_type_for_event = 'paragraph';
              if (t === 'h1') { block = { type: 'heading', level: 1, text: '', meta }; block_type_for_event = 'heading'; }
              else if (t === 'h2') { block = { type: 'heading', level: 2, text: '', meta }; block_type_for_event = 'heading'; }
              else if (t === 'quote') { block = { type: 'quote', text: '', meta }; block_type_for_event = 'quote'; }
              else if (t === 'hr') { block = { type: 'hr' }; block_type_for_event = 'hr'; }
              else { block = { type: 'paragraph', text: '', meta }; block_type_for_event = 'paragraph'; }

              handler.onBlockStart?.({ block_index, block_type: block_type_for_event, block_id: id, block });
              handler.onEvent?.({ type: 'block_start', data: { block_index, block_type: block_type_for_event, block_id: id } });
              // Also emit an initial delta to set the block type/structure for UIs that only handle deltas
              handler.onBlockDelta?.({ block_index, content: block, delta_type: 'replace' });
              continue;
            }
            if (op === 'append_text' && parsed.data && typeof parsed.data.id === 'string') {
              const { id, text } = parsed.data as { id: string; text: string };
              if (!idToIndex.has(id)) idToIndex.set(id, nextIndex++);
              const block_index = idToIndex.get(id)!;
              // Provide both shapes for compatibility (content used by BrainChatWithBlocks)
              handler.onBlockDelta?.({ block_index, content: { text }, block: { text }, delta_type: 'append' });
              handler.onEvent?.({ type: 'block_delta', data: { block_index } });
              continue;
            }
            if (op === 'end') {
              handler.onComplete?.();
              return;
            }
            continue;
          }

          const event = parsed as StreamEvent;
          switch (event.type) {
            case 'block_start': {
              handler.onBlockStart?.(event.data as any);
              handler.onEvent?.(event);
              break;
            }
            case 'block_delta': {
              handler.onBlockDelta?.(event.data as any);
              handler.onEvent?.(event);
              break;
            }
            case 'block_end': {
              handler.onBlockEnd?.(event.data as any);
              handler.onEvent?.(event);
              break;
            }
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
            case 'full_response': {
              // Handle full response as text content
              const text = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
              handler.onChunk?.(text);
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
    console.error("Failed to send message with blocks:", error);
    handler.onError?.(error instanceof Error ? error : new Error('Unknown stream error'));
  }
}

async function sendStudyMessage(
  sessionId: string, 
  text: string, 
  handler: StreamHandler, 
  agentId?: string,
  selectedPanelId?: string | null
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/study/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        session_id: sessionId, 
        text,
        agent_id: agentId,
        selected_panel_id: selectedPanelId
      }),
    });

    if (!response.body) {
      throw new Error("Response body is empty");
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    // NDJSON op→event compatibility mapping
    const idToIndex = new Map<string, number>();
    let nextIndex = 0;
    const extractObjects = (input: string): { objects: string[]; rest: string } => {
      const objects: string[] = [];
      let i = 0, depth = 0, inString = false, escape = false, start = -1;
      while (i < input.length) {
        const ch = input[i];
        if (inString) { if (escape) escape = false; else if (ch === '\\') escape = true; else if (ch === '"') inString = false; }
        else { if (ch === '"') inString = true; else if (ch === '{') { if (depth === 0) start = i; depth++; } else if (ch === '}') { depth--; if (depth === 0 && start !== -1) { objects.push(input.slice(start, i + 1)); start = -1; } } }
        i++;
      }
      const rest = depth === 0 ? '' : (start >= 0 ? input.slice(start) : input);
      return { objects, rest };
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        handler.onComplete?.();
        break;
      }

      buffer += value;
      const chunks: string[] = [];
      if (buffer.includes('\n')) {
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) { const t = line.trim(); if (t) chunks.push(t); }
      }
      const extracted = extractObjects(buffer);
      if (extracted.objects.length) { chunks.push(...extracted.objects.map(s => s.trim())); buffer = extracted.rest; }

      for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (trimmed === '' || !trimmed.startsWith('{') || trimmed.startsWith('```')) continue;
        try {
          const parsedAny = JSON.parse(trimmed);
          if (parsedAny && typeof parsedAny === 'object' && typeof parsedAny.op === 'string') {
            const op = parsedAny.op as string;
            if (op === 'add_block' && parsedAny.data && typeof parsedAny.data.id === 'string') {
              const { id, type, meta } = parsedAny.data as { id: string; type?: string; meta?: any };
              if (!idToIndex.has(id)) idToIndex.set(id, nextIndex++);
              const block_index = idToIndex.get(id)!;
              const t = (type || 'p').toLowerCase();
              let block: any = { text: '' }, block_type_for_event = 'paragraph';
              if (t === 'h1') { block = { type: 'heading', level: 1, text: '', meta }; block_type_for_event = 'heading'; }
              else if (t === 'h2') { block = { type: 'heading', level: 2, text: '', meta }; block_type_for_event = 'heading'; }
              else if (t === 'quote') { block = { type: 'quote', text: '', meta }; block_type_for_event = 'quote'; }
              else if (t === 'hr') { block = { type: 'hr' }; block_type_for_event = 'hr'; }
              else { block = { type: 'paragraph', text: '', meta }; block_type_for_event = 'paragraph'; }
              handler.onBlockStart?.({ block_index, block_type: block_type_for_event, block_id: id, block });
              handler.onBlockDelta?.({ block_index, content: block, block: block, delta_type: 'replace' });
              handler.onEvent?.({ type: 'block_start', data: { block_index, block_type: block_type_for_event, block_id: id } });
              continue;
            }
            if (op === 'append_text' && parsedAny.data && typeof parsedAny.data.id === 'string') {
              const { id, text } = parsedAny.data as { id: string; text: string };
              if (!idToIndex.has(id)) idToIndex.set(id, nextIndex++);
              const block_index = idToIndex.get(id)!;
              handler.onBlockDelta?.({ block_index, content: { text }, block: { text }, delta_type: 'append' });
              handler.onEvent?.({ type: 'block_delta', data: { block_index } });
              continue;
            }
            if (op === 'end') { handler.onComplete?.(); return; }
            continue;
          }
          const event = parsedAny as StreamEvent;
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
            case 'full_response': {
              // Handle full response as text content
              const text = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
              handler.onChunk?.(text);
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
  sendMessageWithBlocks,
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
  explainTerm,
  getDailyCalendar,
  createDailySessionLazy,
  getDailySegments,
};
