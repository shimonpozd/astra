import { useState, useEffect } from 'react';
import { MessageRenderer } from './MessageRenderer';
import { Block, DocV1 } from '../types/text';
import { mergeDelta, sanitizeBlock, generateStableBlockId, BlockState } from '../utils/block';

interface BlockStreamRendererProps {
  onBlockStart?: (blockData: any) => void;
  onBlockDelta?: (blockData: any) => void;
  onBlockEnd?: (blockData: any) => void;
  onComplete?: () => void;
  // Fix: Add props for external event handling
  externalHandlers?: {
    onBlockStart?: (blockData: any) => void;
    onBlockDelta?: (blockData: any) => void;
    onBlockEnd?: (blockData: any) => void;
    onComplete?: () => void;
  };
}

// BlockData interface removed - not used

// BlockState now imported from utils/block.ts

export function BlockStreamRenderer({ onBlockStart, onBlockDelta, onBlockEnd, onComplete, externalHandlers }: BlockStreamRendererProps) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [blockStates, setBlockStates] = useState<Map<number, BlockState>>(new Map());

  // Create a virtual doc from accumulated blocks - Fix: Return copies to avoid mutations
  const virtualDoc: DocV1 = {
    version: "1.0",
    blocks: blocks.map(block => ({ ...block }))
  };

  // Functions now imported from utils/block.ts

  // Fix: Handle block start with stable block_id generation
  const handleBlockStart = (blockData: any) => {
    const { block_index, block_type, block, block_id } = blockData;
    
    setBlockStates(prev => {
      const current = prev.get(block_index);
      if (current?.finalized) return prev; // Don't touch finalized blocks
      
      const newStates = new Map(prev);
      // Fix: Use unified stable block_id generation
      const stableBlockId = generateStableBlockId(block_id, current?.block_id);
      
      newStates.set(block_index, {
        block_index,
        block_id: stableBlockId, // Fix: Stable block_id
        type: block_type ?? block?.type,
        block: sanitizeBlock(block ?? { type: block_type, text: "" }),
        finalized: false
      });
      return newStates;
    });
    
    onBlockStart?.(blockData);
  };

  // Fix: Handle block delta with proper merging and delta type support
  const handleBlockDelta = (blockData: any) => {
    const { block_index, block, delta_type } = blockData;
    
    setBlockStates(prev => {
      const current = prev.get(block_index);
      if (!current || current.finalized) return prev; // Don't update finalized blocks
      
      const newStates = new Map(prev);
      // Fix: Support delta type (replace vs append)
      const deltaType = delta_type === 'append' ? 'append' : 'replace';
      newStates.set(block_index, {
        ...current,
        block: mergeDelta(current.block, sanitizeBlock(block), deltaType)
      });
      return newStates;
    });
    
    onBlockDelta?.(blockData);
  };

  // Fix: Handle block end with proper finalization
  const handleBlockEnd = (blockData: any) => {
    const { block_index } = blockData;
    
    setBlockStates(prev => {
      const current = prev.get(block_index);
      if (!current) return prev;
      
      const newStates = new Map(prev);
      newStates.set(block_index, { ...current, finalized: true });
      return newStates;
    });
    
    onBlockEnd?.(blockData);
  };

  // Handle stream completion
  const handleComplete = () => {
    setIsComplete(true);
    onComplete?.();
  };

  // Fix: Update blocks array with batching and stable sorting
  useEffect(() => {
    let raf = 0;
    raf = requestAnimationFrame(() => {
      const sortedBlocks = Array.from(blockStates.values())
        .sort((a, b) => a.block_index - b.block_index)
        .map(state => state.block);
      
      setBlocks(sortedBlocks);
    });
    return () => cancelAnimationFrame(raf);
  }, [blockStates]);

  // Fix: Use external handlers instead of global window handlers
  useEffect(() => {
    if (!externalHandlers) return;
    
    // Set up external handlers
    externalHandlers.onBlockStart = handleBlockStart;
    externalHandlers.onBlockDelta = handleBlockDelta;
    externalHandlers.onBlockEnd = handleBlockEnd;
    externalHandlers.onComplete = handleComplete;
    
    return () => {
      // Cleanup
      if (externalHandlers) {
        externalHandlers.onBlockStart = undefined;
        externalHandlers.onBlockDelta = undefined;
        externalHandlers.onBlockEnd = undefined;
        externalHandlers.onComplete = undefined;
      }
    };
  }, [externalHandlers]);

  return (
    <div className="block-stream-renderer">
      <MessageRenderer doc={virtualDoc} />
      {!isComplete && (
        <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
          <span>Генерация контента...</span>
        </div>
      )}
    </div>
  );
}

// Hook for using block stream renderer - Fix: Use unified logic from utils
export function useBlockStream() {
  const [blockStates, setBlockStates] = useState<Map<number, BlockState>>(new Map());
  const [isComplete, setIsComplete] = useState(false);

  // Functions now imported from utils/block.ts

  const addBlock = (blockEvent: { kind: 'start' | 'delta' | 'end', block_index: number, block?: Block, block_type?: string, block_id?: string }) => {
    const { kind, block_index, block, block_type, block_id } = blockEvent;
    
    setBlockStates(prev => {
      const newStates = new Map(prev);
      const current = prev.get(block_index);
      
      switch (kind) {
        case 'start':
          if (current?.finalized) return prev;
          newStates.set(block_index, {
            block_index,
        block_id: generateStableBlockId(block_id, current?.block_id), // Fix: Use unified generation
        type: (block_type ?? block?.type ?? 'paragraph') as Block["type"],
        block: sanitizeBlock(block ?? { type: (block_type ?? 'paragraph') as Block["type"], text: "" }),
            finalized: false
          });
          break;
          
        case 'delta':
          if (!current || current.finalized) return prev;
          // Fix: Support delta type (replace vs append) and preserve existing content if delta is empty
          const deltaType = (blockEvent as any).delta_type === 'append' ? 'append' : 'replace';
          const deltaBlock = block || { type: current.type, text: "" };
          // Fix: Don't sanitize empty deltas that would overwrite existing content
          const sanitizedDelta = (deltaBlock as any).text === "" && (current.block as any).text ? current.block : sanitizeBlock(deltaBlock);
          newStates.set(block_index, {
            ...current,
            block: mergeDelta(current.block, sanitizedDelta, deltaType)
          });
          break;
          
        case 'end':
          if (!current) return prev;
          newStates.set(block_index, { ...current, finalized: true });
          break;
      }
      
      return newStates;
    });
  };

  // Fix: Add method to get finalized blocks count
  const getFinalizedBlocksCount = () => {
    return Array.from(blockStates.values()).filter(state => state.finalized).length;
  };

  // Fix: Add method to check if all blocks are finalized
  const areAllBlocksFinalized = () => {
    const states = Array.from(blockStates.values());
    return states.length === 0 || states.every(state => state.finalized); // Fix: Empty document is finalized
  };

  const complete = () => {
    setIsComplete(true);
  };

  const reset = () => {
    setBlockStates(new Map());
    setIsComplete(false);
  };

  // Fix: Create blocks array from blockStates with proper sorting
  const blocks = Array.from(blockStates.values())
    .sort((a, b) => a.block_index - b.block_index)
    .map(state => state.block);

  const virtualDoc: DocV1 = {
    version: "1.0",
    blocks: blocks
  };

  return {
    blocks,
    isComplete,
    virtualDoc,
    addBlock,
    complete,
    reset,
    getFinalizedBlocksCount,
    areAllBlocksFinalized
  };
}
