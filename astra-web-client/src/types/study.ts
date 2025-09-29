import { TextSegment } from './text';

export interface ResolveResponse {
  ok: boolean;
  ref?: string;
  candidates?: string[];
  message?: string;
}

export interface StudySnapshot {
  // New structure for focus reader
  segments: TextSegment[];
  focusIndex: number;
  ref: string;

  // Unchanged properties
  bookshelf: {
    counts: Record<string, number>;
    items: any[]; // Define BookshelfItem later
  };
  chat_local: any[]; // Define ChatEntry later
  ts: number;
  discussion_focus_ref?: string;
  workbench?: { 
    left: any | null; // Define WorkbenchItem later
    right: any | null; 
  };
}
