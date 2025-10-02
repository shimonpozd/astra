import { Block } from '../types/text';

// Unified mergeDelta function with support for different delta types
export function mergeDelta(prev: Block, next: Block, deltaType: 'replace' | 'append' = 'replace'): Block {
  if (prev.type !== next.type) return next; // Type change - take new block
  
  switch (prev.type) {
    case "paragraph":
    case "quote": {
      const prevText = (prev as any).text ?? "";
      const nextText = (next as any).text ?? "";
      // Support both replace and append based on delta type
      const finalText = deltaType === 'append' ? prevText + nextText : nextText;
      return { ...prev, text: finalText };
    }
    case "list": {
      const p = prev as any, n = next as any;
      const prevItems = Array.isArray(p.items) ? p.items : [];
      const nextItems = Array.isArray(n.items) ? n.items : [];
      // Support both replace and append based on delta type
      const finalItems = deltaType === 'append' ? [...prevItems, ...nextItems] : nextItems;
      return { ...p, items: finalItems };
    }
    default:
      return { ...prev, ...next };
  }
}

// Unified sanitizeBlock function with soft fallback
export function sanitizeBlock(block: Block): Block {
  if (!block || typeof block !== 'object') {
    return { type: 'paragraph', text: '' };
  }
  
  // Ensure required fields exist
  const sanitized = { ...block };
  
  if (sanitized.type === 'paragraph' || sanitized.type === 'quote') {
    // Soft fallback for non-string text
    if (typeof sanitized.text !== 'string') {
      sanitized.text = String(sanitized.text ?? '');
    }
  }
  
  if (sanitized.type === 'list') {
    if (!Array.isArray((sanitized as any).items)) {
      (sanitized as any).items = [];
    }
  }
  
  return sanitized;
}

// Generate stable block_id
export function generateStableBlockId(serverBlockId?: string, existingBlockId?: string): string {
  return serverBlockId || existingBlockId || crypto.randomUUID();
}

// Block state interface
export interface BlockState {
  block_index: number;
  block_id: string;
  type: Block["type"];
  block: Block;
  finalized: boolean;
}

// Unified block event processing logic
export function applyBlockEvent(
  prevStates: Map<number, BlockState>,
  event: { kind: 'start' | 'delta' | 'end', block_index: number, block?: Block, block_type?: string, block_id?: string, delta_type?: 'replace' | 'append' }
): Map<number, BlockState> {
  const { kind, block_index, block, block_type, block_id, delta_type } = event;
  const newStates = new Map(prevStates);
  const current = prevStates.get(block_index);
  
  switch (kind) {
    case 'start':
      if (current?.finalized) return prevStates; // Don't touch finalized blocks
      newStates.set(block_index, {
        block_index,
        block_id: generateStableBlockId(block_id, current?.block_id),
        type: (block_type as any) ?? block?.type ?? 'paragraph',
        block: sanitizeBlock(block ?? { type: (block_type as any) ?? 'paragraph', text: "" }),
        finalized: false
      });
      break;
      
    case 'delta':
      if (!current || current.finalized) return prevStates; // Ignore events for finalized blocks
      const deltaBlock = block || { type: current.type, text: "" };
      // Fix: Don't sanitize empty deltas that would overwrite existing content
      const sanitizedDelta = (deltaBlock as any).text === "" && (current.block as any).text ? current.block : sanitizeBlock(deltaBlock);
      newStates.set(block_index, {
        ...current,
        block: mergeDelta(current.block, sanitizedDelta, delta_type || 'replace')
      });
      break;
      
    case 'end':
      if (!current) return prevStates;
      newStates.set(block_index, { ...current, finalized: true });
      break;
  }
  
  return newStates;
}
