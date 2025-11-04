import React from "react";
import { debugLog } from '../utils/debugLogger';

interface Commentator {
  ref: string;
  heRef: string;
  indexTitle: string;
  category: string;
  heCategory: string;
}

interface BookshelfItem extends Commentator {
  isRead: boolean;
}

interface RightSidePanelProps {
  sources: any[];
  commentatorsLists?: Array<{ reference: string; commentators: any[] }>;
  bookshelfItems: BookshelfItem[];
  currentReference: string;
}

export default function RightSidePanel({
  sources,
  commentatorsLists = [],
  bookshelfItems,
  currentReference
}: RightSidePanelProps) {
  debugLog('🔄 RightSidePanel render:', sources.length, 'sources, bookshelf:', bookshelfItems.length);

  // Check if text contains Hebrew characters
  const containsHebrew = (text: string) => {
    return /[\u0590-\u05FF]/.test(text);
  };

  // Get appropriate font family for text
  const getFontFamily = (text: string) => {
    if (containsHebrew(text)) {
      return '"Noto Sans Hebrew", "Mugrabi", "Arial Hebrew", "Times New Roman", serif';
    }
    return 'inherit';
  };


  // Handle drag start for commentators
  const handleCommentatorDragStart = (e: React.DragEvent, commentator: Commentator) => {
    const ref = commentator.ref;
    if (ref) {
      e.dataTransfer.setData('text/astra-commentator-ref', String(ref));
      e.dataTransfer.setData('text/plain', String(ref));
    }
  };

  // Handle drag start for sources
  const handleSourceDragStart = (e: React.DragEvent, src: any) => {
    const ref = src.reference || src.heRef || src.book || src.id || '';
    if (ref) {
      e.dataTransfer.setData('text/astra-commentator-ref', String(ref));
      e.dataTransfer.setData('text/plain', String(ref));
    }
  };

  // Get category icon
  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'commentary':
      case 'מפרשים':
        return '💬';
      case 'halakhah':
      case 'הלכה':
        return '⚖️';
      case 'midrash':
      case 'מדרש':
        return '📜';
      default:
        return '📚';
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-medium">Интерактивная библиотека</h3>
        <div className="text-xs text-muted-foreground">
          {currentReference || 'Выберите источник для изучения'}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Bookshelf Section */}
        {bookshelfItems.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground px-1">
              📚 Комментаторы ({bookshelfItems.filter(item => !item.isRead).length} непрочитано)
            </div>
            <div className="grid gap-2">
              {bookshelfItems.map((item) => (
                <div
                  key={item.ref}
                  className={`rounded-lg border p-3 cursor-grab transition-all ${
                    item.isRead
                      ? 'bg-muted/30 border-muted/50 opacity-60'
                      : 'bg-card/60 hover:bg-accent/20 border-border'
                  }`}
                  draggable={!item.isRead}
                  onDragStart={(e) => handleCommentatorDragStart(e, item)}
                  title={item.isRead ? 'Уже прочитано' : `Перетащите в чат, чтобы изучить: ${item.indexTitle}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{getCategoryIcon(item.category)}</span>
                      <div
                        className="text-sm font-medium truncate"
                        title={item.indexTitle}
                        style={{ fontFamily: getFontFamily(item.indexTitle) }}
                      >
                        {item.indexTitle}
                      </div>
                    </div>
                    {item.isRead && (
                      <span className="text-xs text-green-600" title="Прочитано">✓</span>
                    )}
                  </div>

                  <div
                    className="text-xs text-muted-foreground mb-1"
                    style={{ fontFamily: getFontFamily(item.heRef) }}
                  >
                    {item.heRef}
                  </div>

                  <div className="text-xs text-muted-foreground/70">
                    {item.category} • {item.heCategory}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sources Section */}
        {sources.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground px-1">
              📖 Источники ({sources.length})
            </div>
            {sources.map((src, idx) => {
              debugLog('📖 Rendering source:', src.id || idx, src);
              const isHebrewText = src.text && containsHebrew(src.text);
              const fontFamily = src.text ? getFontFamily(src.text) : 'inherit';

              return (
                <div
                  key={src.id || idx}
                  className="rounded-lg border bg-card/60 p-3 cursor-grab hover:bg-accent/20 transition-colors"
                  draggable
                  onDragStart={(e) => handleSourceDragStart(e, src)}
                  title="Перетащите в чат, чтобы изучить этот источник"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div
                      className="text-sm font-medium truncate"
                      title={src.reference || src.heRef || src.book}
                      style={{ fontFamily }}
                    >
                      {src.reference || src.heRef || src.book || 'Источник'}
                    </div>
                    {src.ui_color && (
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: src.ui_color }} />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mb-2" style={{ fontFamily }}>
                    {(src.author ? `${src.author} • ` : '') + (src.book || src.lang || '')}
                  </div>
                  {src.text && (
                    <div
                      className={`whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed ${
                        isHebrewText ? 'text-right' : 'text-left'
                      }`}
                      style={{
                        fontFamily,
                        fontSize: isHebrewText ? '16px' : '13px',
                        lineHeight: isHebrewText ? '1.6' : '1.4',
                        direction: isHebrewText ? 'rtl' : 'ltr',
                        textAlign: isHebrewText ? 'justify' : 'left',
                        width: '100%',
                        wordSpacing: isHebrewText ? '0.1em' : 'normal'
                      }}
                    >
                      {src.text}
                    </div>
                  )}
                  {src.url && (
                    <a href={src.url} target="_blank" rel="noreferrer" className="text-xs text-primary mt-2 inline-block">
                      Открыть источник
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Legacy commentators (for backward compatibility) */}
        {commentatorsLists.map((block, i) => (
          <div key={`commentators_${i}`} className="rounded-lg border bg-card/60 p-3">
            <div className="text-sm font-medium mb-2 flex items-center gap-2">
              <span className="text-blue-500">📚</span>
              Комментаторы для: {block.reference}
            </div>
            {(!block.commentators || block.commentators.length === 0) ? (
              <div className="text-xs text-muted-foreground">Комментариев не найдено</div>
            ) : (
              <ul className="space-y-1">
                {block.commentators.map((c: any, idx2: number) => (
                  <li
                    key={idx2}
                    className="text-xs text-muted-foreground flex items-start gap-2 cursor-grab hover:bg-accent/20 p-1 rounded transition-colors"
                    draggable
                    onDragStart={(e) => {
                      const ref = c.sourceRef || c.anchorRef || c.commentator;
                      if (ref) {
                        e.dataTransfer.setData('text/astra-commentator-ref', String(ref));
                        e.dataTransfer.setData('text/plain', String(ref));
                      }
                    }}
                    title={`Перетащите в чат, чтобы изучить комментарий: ${c.commentator || c.sourceRef}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500/50 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground">
                        {c.commentator || c.sourceRef || 'Комментарий'}
                      </div>
                      {c.sourceHeRef && (
                        <div className="opacity-70 font-medium" style={{ fontFamily: '"Noto Sans Hebrew", "Mugrabi", "Arial Hebrew", "Times New Roman", serif' }}>
                          {c.sourceHeRef}
                        </div>
                      )}
                      {c.category && (
                        <div className="opacity-60 text-[10px]">
                          {c.category}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {/* Empty state */}
        {sources.length === 0 && bookshelfItems.length === 0 && commentatorsLists.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <div className="text-2xl mb-2">📚</div>
            <p className="text-sm">Интерактивная библиотека</p>
            <p className="text-xs mt-1 opacity-70">
              Введите ссылку на источник, чтобы увидеть доступных комментаторов
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
