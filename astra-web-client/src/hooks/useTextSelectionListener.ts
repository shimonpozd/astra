
import { useEffect } from 'react';
import { useLexiconStore } from '../store/lexiconStore';

export const useTextSelectionListener = () => {
  const { setSelection, fetchExplanation, term } = useLexiconStore();

  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      console.log('[Lexicon] Mouse up, selected text:', selectedText);

      if (selectedText) {
        const range = selection?.getRangeAt(0);
        if (range) {
          // Check if the selection is in a text display area
          const ancestor = range.commonAncestorContainer;
          const textElement = ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentElement : ancestor as Element;
          const isInTextArea = textElement?.closest('.select-text') !== null;
          console.log('[Lexicon] Is in text area:', isInTextArea);

          if (!isInTextArea) {
            console.log('[Lexicon] Selection not in text area, ignoring');
            return;
          }

          let contextText = null;
          // Try to get the parent paragraph as context
          const parentElement = range.commonAncestorContainer.parentElement;
          if (parentElement) {
            contextText = parentElement.textContent;
          }
          console.log('[Lexicon] Setting selection:', selectedText, 'context:', contextText);
          setSelection(selectedText, contextText);
        }
      } else {
        // If user clicks away, clear the selection
        console.log('[Lexicon] Clearing selection');
        setSelection(null, null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      console.log('[Lexicon] Key down:', event.key, 'term:', term);
      if (event.key === 'Enter' && term) {
        console.log('[Lexicon] Enter pressed with term, fetching explanation');
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
