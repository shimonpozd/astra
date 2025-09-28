export interface StudySnapshot {
  focus: { ref: string; title: string; text_full: string; he_text_full?: string; collection: string } | null;
  window: {
    prev: { ref: string; preview: string }[];
    next: { ref: string; preview: string }[];
  };
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
