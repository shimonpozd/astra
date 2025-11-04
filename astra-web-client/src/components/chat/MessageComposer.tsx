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
  draftKey?: string; // for sessionStorage draft saving
  
  // Study mode props
  studyMode?: 'iyun' | 'girsa' | null;
  selectedPanelId?: string | null;
}


export default function MessageComposer({
  onSendMessage,
  disabled,
  discussionFocusRef,
  onAttachFiles,
  maxRows = 4, // reduced from 6
  autoFocus = false,
  draftKey = 'composer:draft',
  studyMode,
  selectedPanelId,
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

  // Auto-resize textarea
  useLayoutEffect(() => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    textarea.style.height = 'auto';
    
    const lineHeight = 24; // 1.5rem * 16px
    const minHeight = lineHeight * 1; // 1 line minimum
    const maxHeight = lineHeight * maxRows;
    
    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    
    textarea.style.height = `${newHeight}px`;
  }, [text, maxRows]);

  const send = useCallback(async () => {
    if (!text.trim() || pending || disabled) return;
    
    const message = text.trim();
    setText('');
    setPending(true);
    
    try {
      await onSendMessage(message);
    } catch (error) {
      console.error('Failed to send message:', error);
      setText(message); // Restore message on error
    } finally {
      setPending(false);
    }
  }, [text, pending, disabled, onSendMessage]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      send();
    }
  }, [send, isComposing]);

  const onFocus = useCallback(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const onPickFiles = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length && onAttachFiles) {
      onAttachFiles(files);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onAttachFiles]);

  const toggleHebrewKeyboard = useCallback(() => {
    setHebrewKeyboard(prev => !prev);
  }, []);

  const insertHebrewChar = useCallback((char: string) => {
    if (char === 'Backspace') {
      setText(prev => prev.slice(0, -1));
    } else {
      setText(prev => prev + char);
    }
    textareaRef.current?.focus();
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const ref = e.dataTransfer.getData('text/astra-commentator-ref');
    if (ref) {
      setText(prev => (prev ? prev + ' ' + ref : ref));
      return;
    }
    const files = Array.from(e.dataTransfer.files);
    if (files.length && onAttachFiles) {
      onAttachFiles(files);
    }
  }, [onAttachFiles]);

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

  return (
    <div className="panel-padding-lg panel-inner">
      <div className="max-w-4xl mx-auto">
        <div
          className="relative panel-card rounded-2xl shadow-sm"
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
            className="composer-textarea min-h-12 max-h-40 px-4 py-3 border-0 bg-transparent resize-none text-foreground placeholder:text-muted-foreground"
            style={{ lineHeight: '1.5' }}
          />

          <div className="px-4 pb-3 flex items-center justify-between">
            <div className="flex gap-compact">
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
            
            {/* Study Mode Indicator - positioned to avoid send button */}
            {studyMode && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mr-12">
                <div className={`w-2 h-2 rounded-full ${
                  studyMode === 'iyun' ? 'bg-blue-500' : 'bg-green-500'
                }`} />
                <span className="font-medium">
                  {studyMode === 'iyun' ? 'Иун' : 'Гирса'}
                </span>
                {selectedPanelId && (
                  <span className="text-xs opacity-70">
                    · {
                      selectedPanelId === 'focus' ? 'Фокус' :
                      selectedPanelId === 'left_workbench' ? 'Левая' :
                      selectedPanelId === 'right_workbench' ? 'Правая' : selectedPanelId
                    }
                  </span>
                )}
              </div>
            )}
            
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

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onFileChange}
          />
        </div>

        {/* Hebrew keyboard */}
        {hebrewKeyboard && (
          <div className="mt-4 p-4 bg-card border rounded-lg shadow-sm">
            <div className="space-y-2">
              {hebrewKeys.map((row, rowIndex) => (
                <div key={rowIndex} className="flex gap-1 justify-center">
                  {row.map((key) => (
                    <Button
                      key={key}
                      variant="outline"
                      size="sm"
                      className="min-w-8 h-8 p-0 text-sm"
                      onClick={() => insertHebrewChar(key)}
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
      </div>
    </div>
  );
}
