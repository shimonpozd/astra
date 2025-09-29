import { useEffect, useRef } from 'react';
import type { Message as ApiMessage } from '../../services/api';
import { MessageRenderer } from '../MessageRenderer';
import type { Doc, DocV1, ChatMessage } from '../../types/text';

// Support both legacy API messages and the newer ChatMessage shape
type AnyMessage = (ApiMessage | ChatMessage | (ApiMessage & Partial<ChatMessage>)) & {
  [key: string]: unknown;
};

// Unified message type for UI rendering
type UiMessage = {
  id?: string | number;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'error';
  content: unknown; // string | DocV1
  content_type?: 'text.v1' | 'doc.v1' | 'thought.v1';
  timestamp?: number | string;
};

interface ChatViewportProps {
  messages: AnyMessage[];
  isLoading: boolean;
}

const hasContentType = (message: AnyMessage): message is AnyMessage & {
  content_type: string;
} => typeof message?.content_type === 'string';

// Normalize incoming messages to UiMessage format
const normalizeMessage = (message: AnyMessage): UiMessage => {
  const role = (message.role as string) || 'assistant';
  const content = message.content;
  let content_type: UiMessage['content_type'] = 'text.v1';

  // Check if content looks like a DocV1
  if (content && typeof content === 'object') {
    const obj = content as any;
    if ((obj.type === 'doc.v1' && Array.isArray(obj.blocks)) ||
        (typeof obj.version === 'string' && Array.isArray(obj.blocks))) {
      content_type = 'doc.v1';
    }
  } else if (typeof content === 'string') {
    // If it's a string, check if it parses to a doc
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as any;
        if ((obj.type === 'doc.v1' && Array.isArray(obj.blocks)) ||
            (typeof obj.version === 'string' && Array.isArray(obj.blocks))) {
          content_type = 'doc.v1';
        }
      }
    } catch {
      // Not JSON, keep as text.v1
    }
  }

  // Override with explicit content_type if present and valid
  if (hasContentType(message)) {
    const ct = message.content_type as string;
    if (['text.v1', 'doc.v1', 'thought.v1'].includes(ct)) {
      content_type = ct as UiMessage['content_type'];
    } else {
      console.warn(`Unknown content_type '${ct}', falling back to 'text.v1'`);
    }
  }

  return {
    id: message.id,
    role: role as UiMessage['role'],
    content,
    content_type,
    timestamp: message.timestamp as UiMessage['timestamp'],
  };
};

// Valid block types for doc.v1
const VALID_BLOCK_TYPES = new Set([
  'paragraph','list','quote','heading','hr','image','table','pre','code','callout','term'
]);

const clamp = (n:any,min:number,max:number) => {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : undefined;
};
const toText = (v:any) =>
  typeof v === 'string' ? v : v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));

function sanitizeBlock(block:any): any {
  if (!block || typeof block !== 'object') return null;

  const type = String(block.type || '').trim();
  if (!VALID_BLOCK_TYPES.has(type)) {
    // ВАЖНО: не выбрасываем — даункастим в абзац, чтобы не пропал текст
    return { type: 'paragraph', text: JSON.stringify(block, null, 2) };
  }

  const out:any = { type };
  if (typeof block.lang === 'string') out.lang = block.lang;
  if (typeof block.dir === 'string')  out.dir  = block.dir;

  switch (type) {
    case 'paragraph':
      out.text = toText(block.text ?? block.content ?? '');
      break;

    case 'quote':
      out.text = toText(block.text ?? block.content ?? '');
      break;

    case 'heading':
      out.level = clamp(block.level ?? 2, 1, 6);
      out.text  = toText(block.text ?? block.content ?? '');
      break;

    case 'list':
      out.ordered = !!block.ordered;
      if (Array.isArray(block.items)) {
        out.items = block.items.map(toText);
      } else if (Array.isArray(block.content)) {
        // Handle nested list_item structure
        out.items = block.content
          .filter((item: any) => item && typeof item === 'object' && item.type === 'list_item')
          .map((item: any) => toText(item.content || ''));
      } else if (typeof block.text === 'string') {
        out.items = [block.text];
      } else {
        out.items = [];
      }
      break;

    case 'hr':
      break;

    case 'image':
      if (typeof block.url==='string') out.url = block.url;
      if (typeof block.alt==='string') out.alt = block.alt;
      if (typeof block.caption==='string') out.caption = block.caption;
      if (Number.isFinite(+block.width))  out.width  = +block.width;
      if (Number.isFinite(+block.height)) out.height = +block.height;
      break;

    case 'table':
      if (Array.isArray(block.headers)) out.headers = block.headers.map(toText);
      if (Array.isArray(block.rows))    out.rows    = block.rows.map((r:any)=>Array.isArray(r)?r.map(toText):[toText(r)]);
      break;

    case 'pre':
    case 'code':
      if (typeof block.code==='string')     out.code     = block.code;
      if (typeof block.language==='string') out.language = block.language;
      if (typeof block.caption==='string')  out.caption  = block.caption;
      break;

    case 'callout':
      if (typeof block.variant==='string') out.variant = block.variant;
      if (typeof block.title==='string')   out.title   = block.title;
      out.text = toText(block.text ?? block.content ?? '');
      break;

    case 'term': {
      const keep = ['he','ru','en','translit','root','grammar','etym','sense','notes','related','examples','refs','context','tags','subtitle','source'];
      for (const k of keep) if (k in block) out[k] = block[k];
      if (!out.he && typeof block.text==='string') out.he = block.text;
      // Handle content field as additional description/notes
      if (typeof block.content === 'string' && !out.notes) {
        out.notes = block.content;
      }
      break;
    }
  }
  return out;
}

const coerceDoc = (payload: unknown): Doc | DocV1 | null => {
  const tryExtract = (obj: any): any | null => {
    if (!obj || typeof obj !== "object") return null;

    // Check for explicit doc.v1 markers
    if (obj.type === 'doc.v1' && Array.isArray(obj.blocks)) {
      return obj;
    }
    if (typeof obj.version === 'string' && Array.isArray(obj.blocks)) {
      return obj;
    }

    // Legacy wrappers
    if (obj.doc && Array.isArray(obj.doc.blocks)) return obj.doc;
    if (obj.content && Array.isArray(obj.content.blocks)) return obj.content;
    if (obj.data && Array.isArray(obj.data.blocks)) return obj.data;

    // Direct blocks array
    if (Array.isArray(obj.blocks)) return obj;

    return null;
  };

  const validateAndSanitize = (doc: any): Doc | DocV1 | null => {
    if (!doc || typeof doc !== 'object') return null;
    if (!Array.isArray(doc.blocks)) return null;

    // Sanitize blocks
    const sanitizedBlocks = doc.blocks
      .map(sanitizeBlock)
      .filter((block: any) => block !== null);

    if (sanitizedBlocks.length === 0) return null;

    // Return only allowed top-level fields
    const result: any = { blocks: sanitizedBlocks };
    if (typeof doc.version === 'string') result.version = doc.version;
    if (Array.isArray(doc.ops)) result.ops = doc.ops;

    return result;
  };

  // 1) Already an object?
  if (payload && typeof payload === "object") {
    const extracted = tryExtract(payload as any);
    if (extracted) return validateAndSanitize(extracted);
  }

  // 2) String: strip fences and parse 1-2 times, limit size to 1MB
  if (typeof payload === "string") {
    if (payload.length > 1024 * 1024) {
      console.warn('Payload too large for doc parsing');
      return null;
    }

    let s = payload.trim();

    // Strip triple backticks ```json ... ```
    const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fence) s = fence[1];

    // Try to unpack maximum two times
    for (let i = 0; i < 2; i++) {
      try {
        const parsed = JSON.parse(s);
        const extracted = tryExtract(parsed);
        if (extracted) return validateAndSanitize(extracted);

        // Sometimes there's another JSON string inside
        if (typeof parsed === "string") {
          s = parsed;
          continue;
        }

        // Last attempt: maybe blocks at top level without wrapper
        if (Array.isArray((parsed as any).blocks)) {
          return validateAndSanitize(parsed);
        }
        break;
      } catch {
        break;
      }
    }
  }

  return null;
};

const coerceText = (payload: unknown): string => {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload);
  } catch (error) {
    return String(payload);
  }
};

// Generate stable keys for messages to avoid React re-mounting issues
const getStableKey = (msg: UiMessage, index: number): string => {
  if (msg.id != null) {
    return String(msg.id);
  }

  // Create deterministic hash from timestamp/index + content preview
  const contentStr = String(msg.content || '').slice(0, 64);
  const base = `${msg.timestamp || 'no-ts'}-${index}-${contentStr}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    const char = base.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `msg-${Math.abs(hash)}`;
};

export default function ChatViewport({ messages, isLoading }: ChatViewportProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Normalize messages to UiMessage format
  const uiMessages: UiMessage[] = messages.map(normalizeMessage);

  // Smart scrolling: stick to bottom only when appropriate
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const isNearBottom = () => {
      const { scrollHeight, scrollTop, clientHeight } = viewport;
      return (scrollHeight - scrollTop - clientHeight) < 120;
    };

    // Check if we should scroll to bottom
    const shouldScrollToBottom =
      isNearBottom() ||
      uiMessages.length === 0 || // Initial load
      (uiMessages[uiMessages.length - 1]?.role === 'user'); // User just sent message

    if (shouldScrollToBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [uiMessages]);

  const renderAssistantContent = (rawContent: unknown, contentType?: string) => {
    const doc = coerceDoc(rawContent);

    if (doc) {
      return (
        <article className="doc" dir="auto">
          <MessageRenderer doc={doc} />
        </article>
      );
    }

    // Strict doc.v1 handling
    if (contentType === 'doc.v1') {
      console.warn('Failed to parse doc.v1:', { sample: String(rawContent).slice(0, 200) });

      // Try one more rescue attempt for strings starting with {
      if (typeof rawContent === 'string' && rawContent.trim().startsWith('{') && rawContent.includes('"blocks"')) {
        try {
          const rescueDoc = coerceDoc(rawContent);
          if (rescueDoc) {
            return (
              <article className="doc" dir="auto">
                <MessageRenderer doc={rescueDoc} />
              </article>
            );
          }
        } catch {
          // Rescue failed
        }
      }

      // Show diagnostic UI for corrupted doc.v1
      return (
        <article className="doc" dir="auto">
          <div className="rounded-xl p-4 border border-red-500/50 bg-red-950/20">
            <p className="text-red-400 font-medium mb-2">Документ повреждён</p>
            <p className="text-sm text-neutral-400 mb-3">
              Не удалось распознать формат doc.v1. Возможно, ответ модели содержит ошибку.
            </p>
            <details className="text-xs">
              <summary className="cursor-pointer text-neutral-500 hover:text-neutral-400">
                Показать сырой ответ
              </summary>
              <pre className="mt-2 p-2 bg-neutral-900 rounded text-neutral-300 overflow-auto max-h-32">
                {coerceText(rawContent)}
              </pre>
            </details>
          </div>
        </article>
      );
    }

    // Fallback for non-doc content: create virtual doc with single paragraph
    const safeDoc: DocV1 = {
      version: '1.0',
      blocks: [{ type: 'paragraph', text: coerceText(rawContent) }]
    };

    return (
      <article className="doc" dir="auto">
        <MessageRenderer doc={safeDoc} />
      </article>
    );
  };

  return (
    <div ref={viewportRef} className="flex-1 min-h-0 p-4 overflow-y-auto bg-background">
      {isLoading ? (
        <div className="flex justify-center items-center h-full">
          <p className="text-muted-foreground">Loading messages...</p>
        </div>
      ) : uiMessages.length === 0 ? (
        <div className="flex justify-center items-center h-full">
          <p className="text-muted-foreground">Select a chat to see messages.</p>
        </div>
      ) : (
        <div className="space-y-4 max-w-[65rem] mx-auto">
          {uiMessages.map((message, index) => {
            const key = getStableKey(message, index);

            let renderedContent;
            if (message.role === 'user') {
              const userText = coerceText(message.content);
              renderedContent = (
                <div className="px-3 py-2 rounded-2xl bg-primary text-primary-foreground text-sm max-w-[72ch] whitespace-pre-wrap">
                  {userText}
                </div>
              );
            } else if (message.content_type === 'thought.v1') {
              const thoughtText = coerceText(message.content);
              renderedContent = (
                <div className="text-xs text-neutral-400 italic px-3 py-2 rounded-2xl bg-neutral-800/50 max-w-[72ch] whitespace-pre-wrap">
                  <p>{thoughtText}</p>
                </div>
              );
            } else {
              renderedContent = renderAssistantContent(message.content, message.content_type);
            }

            return (
              <div
                key={key}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {renderedContent}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
}