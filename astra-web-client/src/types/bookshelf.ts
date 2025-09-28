// types/bookshelf.ts
export interface CommentaryItem {
  ref: string;                    // Полная ссылка: "Rashi on Shabbat 12a:2:1"
  baseRef: string;               // Базовая ссылка: "Rashi on Shabbat 12a:2"
  level: number;                 // Уровень детализации (1-4)
  hasChildren: boolean;          // Есть ли подкомментарии
  children?: CommentaryItem[];   // Вложенные комментарии
  parent?: string;              // Ссылка на родительский элемент
  preview: string;              // Превью текста
  fullText?: string;            // Полный текст (загружается по требованию)
  category: string;             // Категория комментатора
  isExpanded?: boolean;         // Состояние раскрытия
  metadata: {
    commentator: string;        // Rashi, Tosafot, etc.
    tractate: string;          // Shabbat
    page: string;              // 12a
    section: string;           // 2
    subsection?: string;       // 1, 2, 3
  }
}

export interface BookshelfItem {
  ref: string;
  title?: string;
  heTitle?: string; // Заголовок на иврите
  commentator?: string;
  heCommentator?: string; // Комментатор на иврите
  preview?: string;
  hePreview?: string; // Превью на иврите
  category?: string;
  heCategory?: string; // Категория на иврите
  language?: 'hebrew' | 'english' | 'aramaic' | 'mixed';
  isRead?: boolean;
  direction?: 'ltr' | 'rtl';
}

export interface Bookshelf {
  items: BookshelfItem[];
  totalCount?: number;
  hasMore?: boolean;
}

export interface BookshelfPanelProps {
  sessionId?: string;
  currentRef?: string;
  onDragStart?: (ref: string) => void;
  onItemClick?: (item: CommentaryItem) => void;
}