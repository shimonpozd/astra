import { StudySnapshot, ReaderItem, ReaderWindow } from '../types/study';

function detectLang(text: string): 'he' | 'en' | 'ru' {
  if (/[\u0590-\u05FF]/.test(text)) return 'he';
  // Simple heuristic: if Cyrillic, 'ru', else 'en'
  if (/[\u0400-\u04FF]/.test(text)) return 'ru';
  return 'en';
}

function toReaderItem(item: { ref: string; preview?: string }, role: 'prev' | 'next', commentator?: string): ReaderItem {
  const text = item.preview || item.ref;
  return {
    id: `${role}-${item.ref}`,
    ref: item.ref,
    role,
    text,
    lang: detectLang(text),
    preview: item.preview,
    commentator,
  };
}

export function studySnapshotToReaderWindow(snapshot: StudySnapshot | null): ReaderWindow | null {
  if (!snapshot || !snapshot.focus) return null;

  const prevItems = (snapshot.window?.prev || []).slice(-5).reverse().map(item => toReaderItem(item, 'prev'));
  const nextItems = (snapshot.window?.next || []).slice(0, 5).map(item => toReaderItem(item, 'next'));

  const focusItem: ReaderItem = {
    id: `focus-${snapshot.focus.ref}`,
    ref: snapshot.focus.ref,
    role: 'focus',
    text: snapshot.focus.text_full || snapshot.focus.title || snapshot.focus.ref,
    lang: detectLang(snapshot.focus.text_full || ''),
    commentator: snapshot.focus.collection,
  };

  const items = [...prevItems, focusItem, ...nextItems];
  const focusIndex = prevItems.length;

  // Assume hasMore if we have 5 items (full window)
  const hasMorePrev = (snapshot.window?.prev || []).length >= 5;
  const hasMoreNext = (snapshot.window?.next || []).length >= 5;

  return {
    items,
    focusIndex,
    hasMorePrev,
    hasMoreNext,
  };
}