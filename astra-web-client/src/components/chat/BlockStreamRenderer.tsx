import { useState, useEffect, useCallback } from 'react';
import { MessageRenderer } from '../MessageRenderer';
import { DocV1, Block } from '../../types/text';

interface BlockStreamRendererProps {
  onBlockUpdate?: (blocks: Block[]) => void;
  onComplete?: () => void;
  className?: string;
}

interface BlockEvent {
  type: 'block_start' | 'block_delta' | 'block_end';
  data: {
    block_index: number;
    block_type: string;
    content: Block;
  };
}

export function BlockStreamRenderer({ 
  onBlockUpdate, 
  onComplete, 
  className = "" 
}: BlockStreamRendererProps) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [, setCurrentBlockIndex] = useState(0);

  // Handle block events from the stream
  const handleBlockEvent = useCallback((event: BlockEvent) => {
    const { type, data } = event;
    const { block_index, content } = data;

    setBlocks(prevBlocks => {
      const newBlocks = [...prevBlocks];
      
      // Ensure we have enough blocks
      while (newBlocks.length <= block_index) {
        newBlocks.push({
          type: 'paragraph',
          text: ''
        });
      }

      switch (type) {
        case 'block_start':
          newBlocks[block_index] = content;
          setCurrentBlockIndex(block_index);
          break;
          
        case 'block_delta':
          // Update existing block with new content
          if (newBlocks[block_index]) {
            newBlocks[block_index] = {
              ...newBlocks[block_index],
              ...content
            };
          }
          break;
          
        case 'block_end':
          // Finalize the block
          if (newBlocks[block_index]) {
            newBlocks[block_index] = {
              ...newBlocks[block_index],
              ...content
            };
          }
          break;
      }

      return newBlocks;
    });

    // Notify parent of block updates
    onBlockUpdate?.(blocks);
  }, [blocks, onBlockUpdate]);

  // Handle stream completion
  const handleStreamComplete = useCallback(() => {
    setIsStreaming(false);
    onComplete?.();
  }, [onComplete]);

  // Create a virtual doc for rendering
  const virtualDoc: DocV1 = {
    version: '1.0',
    blocks: blocks.filter(block => block && block.type)
  };

  // Listen for block events from the global event system
  useEffect(() => {
    const handleBlockStart = (event: CustomEvent) => {
      handleBlockEvent(event.detail);
    };

    const handleBlockDelta = (event: CustomEvent) => {
      handleBlockEvent(event.detail);
    };

    const handleBlockEnd = (event: CustomEvent) => {
      handleBlockEvent(event.detail);
    };

    const handleStreamStart = () => {
      setIsStreaming(true);
      setBlocks([]);
      setCurrentBlockIndex(0);
    };

    const handleStreamEnd = () => {
      handleStreamComplete();
    };

    // Add event listeners
    window.addEventListener('block_start', handleBlockStart as EventListener);
    window.addEventListener('block_delta', handleBlockDelta as EventListener);
    window.addEventListener('block_end', handleBlockEnd as EventListener);
    window.addEventListener('stream_start', handleStreamStart as EventListener);
    window.addEventListener('stream_end', handleStreamEnd as EventListener);

    return () => {
      window.removeEventListener('block_start', handleBlockStart as EventListener);
      window.removeEventListener('block_delta', handleBlockDelta as EventListener);
      window.removeEventListener('block_end', handleBlockEnd as EventListener);
      window.removeEventListener('stream_start', handleStreamStart as EventListener);
      window.removeEventListener('stream_end', handleStreamEnd as EventListener);
    };
  }, [handleBlockEvent, handleStreamComplete]);

  return (
    <div className={`block-stream-renderer ${className}`}>
      {isStreaming && (
        <div className="streaming-indicator mb-2 text-sm text-gray-500">
          Streaming blocks... ({blocks.length} blocks)
        </div>
      )}
      
      {virtualDoc.blocks.length > 0 && (
        <MessageRenderer doc={virtualDoc} />
      )}
      
      {isStreaming && (
        <div className="streaming-cursor animate-pulse">
          <span className="text-gray-400">▋</span>
        </div>
      )}
    </div>
  );
}

// Hook for using block streaming
export function useBlockStream() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const handleBlockUpdate = useCallback((newBlocks: Block[]) => {
    setBlocks(newBlocks);
  }, []);

  const handleStreamStart = useCallback(() => {
    setIsStreaming(true);
    setBlocks([]);
  }, []);

  const handleStreamEnd = useCallback(() => {
    setIsStreaming(false);
  }, []);

  return {
    blocks,
    isStreaming,
    handleBlockUpdate,
    handleStreamStart,
    handleStreamEnd
  };
}
