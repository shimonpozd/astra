// types/text.ts
export interface TextSegment {
  ref: string;
  text: string;
  heText?: string;
  position: number; // Позиция в общем тексте (0-1)
  type: 'context' | 'focus' | 'commentary';
  metadata?: {
    verse?: number;
    chapter?: number;
    page?: string;
    line?: number;
    title?: string;
    indexTitle?: string;
  };
}

export interface ContinuousText {
  segments: TextSegment[];
  focusIndex: number;
  totalLength: number;
  title: string;
  heTitle?: string;
  collection: string;
}

export interface FocusReaderProps {
  continuousText: ContinuousText | null;
  isLoading?: boolean;
  error?: string | null;
  onSegmentClick?: (segment: TextSegment) => void;
  onNavigateToRef?: (ref: string) => void;
  onLexiconDoubleClick?: () => void;
  showMinimap?: boolean;
  fontSize?: 'small' | 'medium' | 'large';
  lineHeight?: 'compact' | 'normal' | 'relaxed';
  isDailyMode?: boolean; // Flag to show special loading for Daily Mode
  isBackgroundLoading?: boolean; // Flag to show background loading progress
  // Navigation props
  onBack?: () => void;
  onForward?: () => void;
  onExit?: () => void;
  currentRef?: string;
  canBack?: boolean;
  canForward?: boolean;
}

// Message rendering types
export interface Block {
  type: 'heading' | 'paragraph' | 'quote' | 'list' | 'term' | 'callout' | 'action' | 'code';
  text?: string;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  lang?: string;
  dir?: 'rtl' | 'ltr' | 'auto';
  source?: string;
  items?: string[];
  ordered?: boolean;
  variant?: 'info' | 'warn' | 'success' | 'danger';
  label?: string;
  actionId?: string;
  params?: Record<string, unknown>;
  he?: string;
  ru?: string;
  code?: string;
}

export interface Doc {
  version: string;
  blocks: Block[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string; // raw JSON string for assistant/system, plain text for user
}

// doc.v1 message types
export interface Op {
  op: string;
  [key: string]: unknown;
}

export interface DocV1 {
  version: '1.0';
  ops?: Op[];
  blocks: Block[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  created_at: string; // ISO 8601 format
  content_type: 'doc.v1' | 'text.v1' | 'thought.v1';
  content: DocV1 | string;
  meta?: Record<string, unknown>;
}