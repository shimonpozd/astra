import { useState, useRef, useLayoutEffect, useCallback, useEffect } from 'react';
import { Send, Paperclip, Keyboard, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

interface MessageComposerProps {
  onSendMessage: (message: string) => Promise<void> | void;
  disabled?: boolean;
  discussionFocusRef?: string;

  // new (optional)
  onAttachFiles?: (files: File[]) => void;
  maxRows?: number;
  autoFocus?: boolean;
  variant?: 'minimal' | 'floating' | 'glass';
  draftKey?: string; // for sessionStorage draft saving
  density?: 'normal' | 'dense' | 'ultra';
}

const DENSITY = {
  normal: { pad: 'p-2', gap: 'gap-2', btn: 'h-10 w-10', lh: 'leading-6' },
  dense:  { pad: 'p-1.5', gap: 'gap-1.5', btn: 'h-9 w-9',  lh: 'leading-5' },
  ultra:  { pad: 'p-1', gap: 'gap-1', btn: 'h-8 w-8',  lh: 'leading-[1.15rem]' },
} as const;

export default function MessageComposer({
  onSendMessage,
  disabled,
  discussionFocusRef,
  onAttachFiles,
  maxRows = 4, // reduced from 6
  autoFocus = false,
  variant = 'floating',
  draftKey = 'composer:draft',
  density = 'dense', // default to dense
}: MessageComposerProps) {
  const [text, setText] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [pending, setPending] = useState(false);
  const [hebrewKeyboard, setHebrewKeyboard] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hebrew keyboard layout
  const hebrewKeys = [
    ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ', 'ל', 'מ', 'נ'],
    ['ס', 'ע', 'פ', 'צ', 'ק', 'ר', 'ש', 'ת', 'ך', 'ם', 'ן', 'ף', 'ץ'],
    ['Backspace']
  ];

  // Load draft on mount
  useEffect(() => {
    const draft = sessionStorage.getItem(draftKey);
    if (draft) setText(draft);
  }, [draftKey]);

  // Save draft with debouncing
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      sessionStorage.setItem(draftKey, text)
    );
    return () => cancelAnimationFrame(id);
  }, [text, draftKey]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.style.height = '0px';
      const style = window.getComputedStyle(el);
      const lineHeight = parseFloat(style.lineHeight || '24'); // explicit line-height
      const maxH = Math.max(1, maxRows) * lineHeight;
      const newH = Math.min(el.scrollHeight, maxH);
      el.style.height = `${newH}px`;
      el.style.overflow = el.scrollHeight > maxH ? 'auto' : 'hidden';
      el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
    });
  }, [maxRows]);

  // Auto-resize on text change
  useLayoutEffect(() => { autoResize(); }, [text, autoResize]);

  // Auto-resize on resize and font load
  useEffect(() => {
    autoResize();
    const onResize = () => autoResize();
    window.addEventListener('resize', onResize);
    (document as any).fonts?.ready?.then(autoResize);
    return () => window.removeEventListener('resize', onResize);
  }, [autoResize]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || pending) return;
    try {
      setPending(true);
      await Promise.resolve(onSendMessage(msg));
      setText('');
    } finally {
      setPending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposing) return;
    if (e.key !== 'Enter') return;

    const withShift = e.shiftKey;
    const withMeta = e.metaKey || e.ctrlKey;

    if (withMeta) { e.preventDefault(); send(); return; }
    if (!withShift) { e.preventDefault(); send(); return; }
    // Shift+Enter -> new line
  };

  const onFocus = () => {
    // Mobile-friendly: scroll into view
    setTimeout(() => {
      textareaRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 100);
  };

  const onPickFiles = () => fileInputRef.current?.click();


  const toggleHebrewKeyboard = () => {
    setHebrewKeyboard(!hebrewKeyboard);
  };

  const handleHebrewKeyPress = (key: string) => {
    if (key === 'Backspace') {
      setText(prev => prev.slice(0, -1));
    } else {
      setText(prev => prev + key);
    }
  };

  const onFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onAttachFiles) return;
    const files = Array.from(e.target.files ?? []);
    if (files.length) onAttachFiles(files);
    // Reset input
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    if (!onAttachFiles) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) onAttachFiles(files);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (!onAttachFiles) return;
    const items = Array.from(e.clipboardData.items || []);
    const files: File[] = [];
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) onAttachFiles(files);
  };

  const d = DENSITY[density];

  const containerVariant =
    variant === 'minimal'
      ? 'bg-transparent border border-transparent shadow-none'
      : variant === 'glass'
      ? 'bg-background/35 supports-[backdrop-filter]:backdrop-blur border border-border/70 shadow-md sm:shadow-lg rounded-lg focus-within:ring-1 focus-within:ring-border/40 transition-all'
      : 'bg-card/95 border border-border/70 shadow-md sm:shadow-lg rounded-lg transition-all'; // floating (default)

  return (
    <div className="px-6 py-4">
      <div className="max-w-4xl mx-auto">
        <div
          className="relative bg-card border border-border rounded-2xl shadow-sm"
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <Textarea
            ref={textareaRef}
            value={text}
            autoFocus={autoFocus}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={onFocus}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={
              discussionFocusRef
                ? 'Спросите о выделенном тексте…'
                : 'Введите сообщение…'
            }
            disabled={disabled}
            className="min-h-12 max-h-40 px-4 py-3 border-0 bg-transparent resize-none focus:ring-0 focus-visible:ring-0 focus:border-0 focus:outline-none text-foreground placeholder:text-muted-foreground"
            style={{ lineHeight: '1.5' }}
          />

          <div className="px-4 pb-3 flex gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="w-8 h-8 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground"
              disabled={disabled}
              onClick={onPickFiles}
              title="Прикрепить файлы"
              aria-label="Прикрепить файлы"
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              variant={hebrewKeyboard ? "default" : "ghost"}
              className="w-8 h-8 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground"
              disabled={disabled}
              onClick={toggleHebrewKeyboard}
              title="Ивритская клавиатура"
              aria-label="Переключить ивритскую клавиатуру"
            >
              <Keyboard className="h-4 w-4" />
            </Button>
          </div>

          <Button
            size="icon"
            className="absolute right-2 bottom-2 w-8 h-8 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={send}
            disabled={disabled || pending || !text.trim()}
            title="Отправить (Enter)"
            aria-label="Отправить сообщение"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Hebrew Keyboard */}
        {hebrewKeyboard && (
          <div className="mt-2 p-3 bg-card border border-border rounded-lg">
            <div className="space-y-2">
              {hebrewKeys.map((row, rowIndex) => (
                <div key={rowIndex} className="flex gap-1 justify-center">
                  {row.map((key) => (
                    <Button
                      key={key}
                      size="sm"
                      variant="outline"
                      className="min-w-[2rem] h-8 px-2 text-sm font-medium"
                      onClick={() => handleHebrewKeyPress(key)}
                      disabled={disabled}
                    >
                      {key === 'Backspace' ? '⌫' : key}
                    </Button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onFilesSelected}
        />
      </div>
    </div>
  );
}

