import { DocV1 } from './text';
export type { Chat, Message as ChatMessage, SourceData, ChatState, ChatAction } from './chat';
export type { ResearchState, Note, ResearchStore } from './research';
export type { StudySnapshot, ReaderWindow, ReaderItem, StudyStore, FocusItem, WindowItem, BookshelfItem } from './study';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string | DocV1 | null;
  content_type?: 'text.v1' | 'doc.v1';
  timestamp: number | Date;
  plan?: any;
  research?: any;
  error?: any;
  isThinking?: boolean;
  thinking?: string;
  isStreaming?: boolean;
}

export interface ModelSettings {
  temperature: number;
  maxTokens: number;
}

export interface Persona {
  name: string;
  description?: string;
}

export interface ChatSession {
  session_id: string;
  name: string;
  last_modified: string; // ISO date string
  created_at?: string; // ISO date string
}

export interface ChatRequest {
  text: string;
  agent_id?: string;
  user_id?: string;
  session_id?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  reply: string;
}

export interface ChatListResponse {
  chats: ChatSession[];
}

export interface ChatHistoryResponse {
   history: Message[];
}

// NDJSON Event Types for Brain API
export interface BrainEvent {
  type: 'status' | 'plan' | 'draft' | 'critique' | 'research_info' | 'external_sources' | 'final_draft' | 'error' | 'note_created' | 'source' | 'source_text' | 'commentators_list' | 'structured_event';
  data: any;
}

export interface ResearchInfoEvent extends BrainEvent {
  type: 'research_info';
  data: {
    [key: string]: any;
  };
}

export interface StatusEvent extends BrainEvent {
  type: 'status';
  data: {
    message: string;
  };
}

export interface PlanEvent extends BrainEvent {
  type: 'plan';
  data: {
    iteration: number;
    primary_ref: string;
    [key: string]: any;
  };
}

export interface DraftEvent extends BrainEvent {
  type: 'draft';
  data: {
    iteration: number;
    draft: string;
    [key: string]: any;
  };
}

export interface CritiqueEvent extends BrainEvent {
  type: 'critique';
  data: {
    iteration: number;
    feedback: string[];
    [key: string]: any;
  };
}

export interface ErrorEvent extends BrainEvent {
  type: 'error';
  data: {
    message: string;
  };
}

export interface NoteCreatedEvent extends BrainEvent {
  type: 'note_created';
  data: {
    ref: string;
    commentator: string | null;
    type: string;
    point: string;
  };
}

export interface SourceEvent extends BrainEvent {
  type: 'source';
  data: {
    id: string;
    author: string;
    book: string;
    reference: string;
    text: string;
    url: string;
    ui_color: string;
    lang: string;
    heRef?: string;
  };
}

export interface SourceTextEvent extends BrainEvent {
  type: 'source_text';
  data: {
    ref: string;
    heRef?: string;
    text: string;
    lang: string;
    title: string;
  };
}

export interface StructuredEvent extends BrainEvent {
  type: 'structured_event';
  data: {
    type: string;
    data: any;
  };
}

export interface CommentatorsPanelUpdateEvent extends BrainEvent {
  type: 'structured_event';
  data: {
    type: 'commentators_panel_update';
    data: {
      reference: string;
      commentators: Array<{
        ref: string;
        heRef: string;
        indexTitle: string;
        category: string;
        heCategory: string;
      }>;
    };
  };
}


// Streaming response handler
export interface StreamHandler {
  onStatus?: (message: string) => void;
  onPlan?: (plan: PlanEvent['data']) => void;
  onResearchInfo?: (info: ResearchInfoEvent['data']) => void;
  onDraft?: (draft: DraftEvent['data']) => void;
  onThought?: (chunk: string) => void;
  onCritique?: (critique: CritiqueEvent['data']) => void;
  onFinalDraft?: (draft: DraftEvent['data']) => void;
  onNoteCreated?: (note: NoteCreatedEvent['data']) => void;
  onSource?: (source: SourceEvent['data']) => void;
  onSourceText?: (sourceText: SourceTextEvent['data']) => void;
  onCompletenessCheck?: (data: any) => void;
  onInternalQuestions?: (data: any) => void;
  onCommentatorsList?: (data: { reference: string; commentators: Array<{ anchorRef?: string; category?: string; sourceHeRef?: string; sourceRef?: string; commentator?: string }> }) => void;
  onCommentatorsPanelUpdate?: (data: CommentatorsPanelUpdateEvent['data']) => void;
  onError?: (error: ErrorEvent['data']) => void;
  onComplete?: () => void;
}
