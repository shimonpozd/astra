
import { useEffect } from 'react';
import { useLexiconStore } from '../store/lexiconStore';
import { debugLog } from '../utils/debugLogger';

export const useTextSelectionListener = () => {
  const { setSelection, fetchExplanation, term } = useLexiconStore();

  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      debugLog('[Lexicon] Mouse up, selected text:', selectedText);

      if (selectedText) {
        const range = selection?.getRangeAt(0);
        if (range) {
          // Check if the selection is in a text display area
          const ancestor = range.commonAncestorContainer;
          const textElement = ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentElement : ancestor as Element;
          const isInTextArea = textElement?.closest('.select-text') !== null;
          debugLog('[Lexicon] Is in text area:', isInTextArea);

          if (!isInTextArea) {
            debugLog('[Lexicon] Selection not in text area, ignoring');
            return;
          }

          let contextText = null;
          // Try to get the parent paragraph as context
          const parentElement = range.commonAncestorContainer.parentElement;
          if (parentElement) {
            contextText = parentElement.textContent;
          }
          debugLog('[Lexicon] Setting selection:', selectedText, 'context:', contextText);
          setSelection(selectedText, contextText);
        }
      } else {
        // If user clicks away, clear the selection
        debugLog('[Lexicon] Clearing selection');
        setSelection(null, null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      debugLog('[Lexicon] Key down:', event.key, 'term:', term);
      if (event.key === 'Enter' && term) {
        debugLog('[Lexicon] Enter pressed with term, fetching explanation');
        // Don't prevent default to avoid blocking other Enter key uses
        fetchExplanation();
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [setSelection, fetchExplanation, term]);
};