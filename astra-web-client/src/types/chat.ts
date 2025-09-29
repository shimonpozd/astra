import { DocV1 } from './text';

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

export interface SourceData {
  reference: string;
  text: string;
  author?: string;
  url?: string;
  book?: string;
}

export interface ChatState {
  chats: Chat[];
  selectedChatId: string | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

export type ChatAction =
  | { type: 'SET_CHATS'; payload: Chat[] }
  | { type: 'SELECT_CHAT'; payload: string }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_MESSAGES' };