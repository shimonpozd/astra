import { useEffect } from 'react';
import type { RefObject } from 'react';

interface UseFocusNavShortcutsOptions {
  open: boolean;
  overlayRef: RefObject<HTMLDivElement>;
  onClose: () => void;
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ];
  return Array.from(root.querySelectorAll<HTMLElement>(selectors.join(','))).filter(
    (el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'),
  );
}

function computeNextFocusIndex(
  currentIndex: number,
  total: number,
  moveBackward: boolean,
): number {
  if (total === 0) return 0;
  if (moveBackward) {
    if (currentIndex <= 0) return total - 1;
    return currentIndex - 1;
  }
  if (currentIndex === -1 || currentIndex >= total - 1) {
    return 0;
  }
  return currentIndex + 1;
}

export default function useFocusNavShortcuts({
  open,
  overlayRef,
  onClose,
}: UseFocusNavShortcutsOptions) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const overlay = overlayRef.current;
    if (!overlay) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusables = getFocusableElements(overlay);
      if (!focusables.length) {
        event.preventDefault();
        return;
      }

      const current = document.activeElement as HTMLElement | null;
      const currentIndex = current ? focusables.indexOf(current) : -1;
      const nextIndex = computeNextFocusIndex(
        currentIndex,
        focusables.length,
        event.shiftKey,
      );

      event.preventDefault();
      focusables[nextIndex]?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);

    const focusables = getFocusableElements(overlay);
    (focusables[0] ?? overlay).focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, overlayRef, onClose]);
}
