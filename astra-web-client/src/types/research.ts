export interface ResearchState {
  currentStatus: string;
  currentPlan: any;
  currentDraft: string;
  currentCritique: string[];
  isResearching: boolean;
  error: string | null;
  notesFeed: Note[];
}

export interface Note {
  ref: string;
  commentator: string | null;
  type: string;
  point: string;
}

export interface ResearchStore {
  // State
  currentStatus: string;
  currentPlan: any;
  currentDraft: string;
  currentCritique: string[];
  isResearching: boolean;
  error: string | null;
  notesFeed: Note[];

  // Actions
  setStatus: (status: string) => void;
  setPlan: (plan: any) => void;
  setDraft: (draft: string) => void;
  addCritique: (critique: string[]) => void;
  setResearching: (researching: boolean) => void;
  setError: (error: string | null) => void;
  addNote: (note: Note) => void;
  reset: () => void;
}