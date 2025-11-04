// Shared request/response types for Brain API

export interface ChatRequest {
  text: string;
  agent_id?: string;
  session_id?: string;
}

export interface ChatResponse {
  reply: string;
}

export interface ChatListItem {
  session_id: string;
  name: string;
  last_modified: string; // ISO string
}

export interface ChatListResponse {
  chats: ChatListItem[];
}

export interface Message {
  id?: string | number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string | number | Date;
}

export interface ChatHistoryResponse {
  messages: Message[];
}

export type BrainEventType =
  | 'status'
  | 'plan'
  | 'research_info'
  | 'speech_chunk'
  | 'thought_chunk'
  | 'draft'
  | 'final_draft'
  | 'critique'
  | 'note_created'
  | 'source'
  | 'source_text'
  | 'error';

export interface BrainEvent<T = any> {
  type: BrainEventType;
  data: T;
}

export interface StreamHandler {
  onStatus?: (message: string) => void;
  onPlan?: (plan: any) => void;
  onResearchInfo?: (info: any) => void;
  // For incremental plain text chunks when not JSON
  onDraft?: (draft: { draft?: string; chunk?: string } | any) => void;
  // For final full answer
  onFinalDraft?: (finalDraft: any) => void;
  // For incremental <think> ... </think> chunks
  onThought?: (chunk: string) => void;
  onCritique?: (critique: any) => void;
  onNoteCreated?: (note: any) => void;
  onSource?: (source: any) => void;
  onSourceText?: (sourceText: any) => void;
  onError?: (error: { message?: string } | any) => void;
  onComplete?: () => void;
}

