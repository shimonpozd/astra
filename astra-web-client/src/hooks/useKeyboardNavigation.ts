// hooks/useKeyboardNavigation.ts
import { useEffect } from 'react';
import { TextSegment } from '../types/text';

export function useKeyboardNavigation(
  segments: TextSegment[],
  focusIndex: number,
  onNavigate: (ref: string) => void
) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Allow navigation when not typing in input/textarea
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
          target.contentEditable === 'true') return;

      switch (event.key) {
        case 'ArrowUp':
        case 'k':
          event.preventDefault();
          if (focusIndex > 0) {
            onNavigate(segments[focusIndex - 1].ref);
          }
          break;

        case 'ArrowDown':
        case 'j':
          event.preventDefault();
          if (focusIndex < segments.length - 1) {
            onNavigate(segments[focusIndex + 1].ref);
          }
          break;

        case 'Home':
          event.preventDefault();
          onNavigate(segments[0].ref);
          break;

        case 'End':
          event.preventDefault();
          onNavigate(segments[segments.length - 1].ref);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [segments, focusIndex, onNavigate]);
}