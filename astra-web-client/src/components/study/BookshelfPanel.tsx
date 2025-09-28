import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, BookOpen, Loader2 } from 'lucide-react';
import { BookshelfPanelProps, CommentaryItem } from '../../types/bookshelf';
import { containsHebrew, getTextDirection } from '../../utils/hebrewUtils';
import { api } from '../../services/api';

interface Category {
  name: string;
  color: string;
}

export type GroupKey = string; // "Rashi on Shabbat 12a:2"

export type GroupNode = {
  key: GroupKey;
  parsed: Omit<ParsedRef, 'part'>; // без part
  color: string;                    // вычисляем из category|commentator
  items: any[];           // все части этой группы
};

interface BookshelfState {
  // Данные
  groups: GroupNode[];
  orphans: any[];

  // Фильтры и поиск
  searchQuery: string;
  activeFilters: {
    commentators: string[];
    tractates: string[];
    viewType: 'all' | 'groups' | 'parts';
  };

  // UI состояние
  draggedItem: string | null;
  hoveredGroup: string | null;
  previewVisible: string | null;
}

export type ParsedRef = {
  commentator: string;   // "Rashi"
  tractate: string;      // "Shabbat"
  page: string;          // "12a"
  section: string;       // "2"
  part?: string;         // "1"
};

const REF_RE = /^(.+?)\s+on\s+(.+?)\s+(\S+?):(\S+?)(?::(\S+))?$/;

export function parseRefStrict(ref: string): ParsedRef | null {
  const m = ref.match(REF_RE);
  if (!m) return null;
  const [, commentator, tractate, page, section, part] = m;
  const trimmedPart = part?.trim();
  // If part is "?" or empty, treat as no part
  const finalPart = (trimmedPart && trimmedPart !== '?') ? trimmedPart : undefined;
  return {
    commentator: commentator.trim(),
    tractate: tractate.trim(),
    page: page.trim(),
    section: section.trim(),
    part: finalPart,
  };
}

// Legacy function for backward compatibility
function parseRef(ref: string): ParsedRef {
  const parsed = parseRefStrict(ref);
  if (parsed) return parsed;

  // Fallback для других форматов
  return {
    commentator: 'Unknown',
    tractate: 'Unknown',
    page: 'Unknown',
    section: 'Unknown'
  };
}

// Группировка по ref
export function groupByRef(items: any[]) {
  const groups = new Map<GroupKey, GroupNode>();
  const orphans: any[] = [];

  for (const it of items) {
    const p = parseRefStrict(it.ref);
    if (!p) { orphans.push(it); continue; }

    const key: GroupKey = `${p.commentator} on ${p.tractate} ${p.page}:${p.section}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        parsed: { commentator: p.commentator, tractate: p.tractate, page: p.page, section: p.section },
        color: '', // посчитаем ниже
        items: [],
      });
    }
    groups.get(key)!.items.push(it);
  }
  return { groups: [...groups.values()], orphans };
}

// Натуральная сортировка внутри группы
function naturalPartValue(ref: string): { n?: number; s?: string } {
  const p = parseRefStrict(ref);
  if (!p?.part) return { s: '' };
  const n = Number(p.part);
  return Number.isFinite(n) ? { n } : { s: p.part };
}

export function sortGroupItems(items: any[]): any[] {
  return [...items].sort((a, b) => {
    const as = a.score ?? 0, bs = b.score ?? 0;
    if (as !== bs) return bs - as;

    const av = naturalPartValue(a.ref);
    const bv = naturalPartValue(b.ref);
    if (av.n != null && bv.n != null) return av.n - bv.n;
    if (av.n != null) return -1;
    if (bv.n != null) return 1;
    return (av.s ?? '').localeCompare(bv.s ?? '', undefined, { numeric: true, sensitivity: 'base' });
  });
}

// Сортировка групп
function maxScore(items: any[]) {
  return items.reduce((m, it) => Math.max(m, it.score ?? -Infinity), -Infinity);
}

export function sortGroups(groups: GroupNode[]): GroupNode[] {
  return [...groups].sort((g1, g2) => {
    const s1 = maxScore(g1.items), s2 = maxScore(g2.items);
    if (s1 !== s2) return s2 - s1;
    const t1 = `${g1.parsed.tractate} ${g1.parsed.page}:${g1.parsed.section}`;
    const t2 = `${g2.parsed.tractate} ${g2.parsed.page}:${g2.parsed.section}`;
    return t1.localeCompare(t2, undefined, { numeric: true, sensitivity: 'base' });
  });
}

// Цветовая схема
const COMMENTATOR_COLORS: Record<string, string> = {
  Rashi:    '#4AA3FF',
  Tosafot:  '#2ECC71',
  Ramban:   '#8E8AFF',
  Rashba:   '#FF8A4A',
  Ritva:    '#00B8D9',
};

function colorFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 30%, 60%)`;
}

export function pickColor(category?: string, commentator?: string) {
  if (category) return colorFromString(category);
  if (commentator && COMMENTATOR_COLORS[commentator]) return COMMENTATOR_COLORS[commentator];
  return '#7A7A7A';
}

const BookshelfPanel = memo(({
  sessionId,
  currentRef,
  onDragStart,
  onItemClick
}: BookshelfPanelProps & {
  sessionId?: string;
  currentRef?: string;
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [bookshelfState, setBookshelfState] = useState<BookshelfState>({
    groups: [],
    orphans: [],
    searchQuery: '',
    activeFilters: {
      commentators: [],
      tractates: [],
      viewType: 'all'
    },
    draggedItem: null,
    hoveredGroup: null,
    previewVisible: null
  });

  // Debounced search
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(bookshelfState.searchQuery);
    }, 200);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [bookshelfState.searchQuery]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load categories on mount
  useEffect(() => {
    const loadCategories = async () => {
      setIsLoadingCategories(true);
      setError(null);
      try {
        const cats = await api.getBookshelfCategories();
        setCategories(cats);
        // Auto-select first category if available
        if (cats.length > 0 && !selectedCategory) {
          setSelectedCategory(cats[0].name);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load categories');
      } finally {
        setIsLoadingCategories(false);
      }
    };

    loadCategories();
  }, []);

  // Load items when category or ref changes
  useEffect(() => {
    if (!selectedCategory || !sessionId || !currentRef) return;

    const loadItems = async () => {
      setIsLoadingItems(true);
      setError(null);
      try {
        const data = await api.getBookshelfItems(sessionId, currentRef, [selectedCategory]);

        // Группировать и сортировать
        const { groups, orphans } = groupByRef(data.items);

        // Сортировать группы и элементы внутри групп
        const sortedGroups = sortGroups(groups.map(group => ({
          ...group,
          items: sortGroupItems(group.items),
          color: pickColor(group.items[0]?.category, group.parsed.commentator)
        })));

        setBookshelfState(prev => ({
          ...prev,
          groups: sortedGroups,
          orphans
        }));
      } catch (err: any) {
        setError(err.message || 'Failed to load bookshelf items');
      } finally {
        setIsLoadingItems(false);
      }
    };

    loadItems();
  }, [selectedCategory, sessionId, currentRef]);


  // Filter groups and items based on search and filters
  const filteredData = useMemo(() => {
    let filteredGroups = bookshelfState.groups;
    let filteredOrphans = bookshelfState.orphans;

    // Apply filters to groups
    if (bookshelfState.activeFilters.commentators.length > 0) {
      filteredGroups = filteredGroups.filter(group =>
        bookshelfState.activeFilters.commentators.includes(group.parsed.commentator)
      );
      filteredOrphans = filteredOrphans.filter((item: any) => {
        const parsed = parseRefStrict(item.ref);
        return parsed && bookshelfState.activeFilters.commentators.includes(parsed.commentator);
      });
    }

    if (bookshelfState.activeFilters.tractates.length > 0) {
      filteredGroups = filteredGroups.filter(group =>
        bookshelfState.activeFilters.tractates.includes(group.parsed.tractate)
      );
      filteredOrphans = filteredOrphans.filter((item: any) => {
        const parsed = parseRefStrict(item.ref);
        return parsed && bookshelfState.activeFilters.tractates.includes(parsed.tractate);
      });
    }

    // Search filter
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      filteredGroups = filteredGroups.filter(group =>
        group.parsed.commentator.toLowerCase().includes(query) ||
        group.key.toLowerCase().includes(query) ||
        group.items.some(item =>
          item.ref.toLowerCase().includes(query) ||
          item.category?.toLowerCase().includes(query) ||
          item.preview?.toLowerCase().includes(query)
        )
      );
      filteredOrphans = filteredOrphans.filter((item: any) =>
        item.ref.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query) ||
        item.preview?.toLowerCase().includes(query)
      );
    }

    // View type filter
    if (bookshelfState.activeFilters.viewType === 'groups') {
      filteredOrphans = []; // Hide orphans when showing only groups
    } else if (bookshelfState.activeFilters.viewType === 'parts') {
      filteredGroups = filteredGroups.filter(group => group.items.length > 1); // Hide single-item groups
    }

    return { groups: filteredGroups, orphans: filteredOrphans };
  }, [bookshelfState.groups, bookshelfState.orphans, debouncedSearchQuery, bookshelfState.activeFilters]);

  // Render single part group (compact)
  const renderSinglePartGroup = useCallback((group: GroupNode) => {
    const item = group.items[0];
    const parsed = parseRefStrict(item.ref); // может вернуть null, проверим
    const part = parsed?.part;

    return (
      <div
        key={group.key}
        className="p-3 rounded-lg border bg-card cursor-move hover:bg-accent/5 transition-colors"
        style={{ borderColor: group.color, borderWidth: '2px' }}
        draggable
        onDragStart={(e) => {
          // Для совместимости передаем конкретный ref части
          e.dataTransfer.setData('text/astra-commentator-ref', item.ref);
          e.dataTransfer.setData('text/plain', item.ref);
          setBookshelfState(prev => ({ ...prev, draggedItem: item.ref }));
          onDragStart?.(item.ref);
        }}
      >
        <div className="flex items-start gap-2">
          {/* цветовой маркер */}
          <div className="w-3 h-3 rounded-full mt-1.5" style={{ backgroundColor: group.color }} />

          <div className="flex-1 min-w-0">
            {/* ГЛАВНАЯ СТРОКА: КТО/ГДЕ */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="font-semibold text-sm truncate">
                {group.parsed.commentator} on {group.parsed.tractate} {group.parsed.page}:{group.parsed.section}
              </div>
              {part && (
                <span className="text-[10px] uppercase tracking-wide bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded whitespace-nowrap">
                  Part {part}
                </span>
              )}
            </div>

            {/* ДОП. ПОДПИСИ (если есть) */}
            {(item.heRef || item.indexTitle) && (
              <div className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">
                {/* Ивритский heRef показываем RTL и одной строкой */}
                {item.heRef && (
                  <span dir="rtl" className="font-hebrew">
                    {item.heRef}
                  </span>
                )}
                {item.heRef && item.indexTitle ? ' â€¢ ' : null}
                {item.indexTitle && (
                  <span dir="ltr">{item.indexTitle}</span>
                )}
              </div>
            )}

            {/* РЕФЕРЕНТ В МОНО (адрес части) */}
            <div className="text-xs font-mono text-muted-foreground mt-1">
              {parsed ? `${parsed.page}:${parsed.section}:${parsed.part ?? '?'}` : item.ref}
            </div>

            {/* ПРЕВЬЮ (1 строка, RTL при иврите) */}
            {item.preview && (
              <div
                className={`text-xs mt-1 opacity-80 line-clamp-1 ${
                  containsHebrew(item.preview) ? 'text-right font-hebrew' : 'text-left'
                }`}
                dir={getTextDirection(item.preview)}
                title={item.preview}
              >
                {item.preview}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }, [onDragStart]);

  // Render multi-part group
  const renderMultiPartGroup = useCallback((group: GroupNode) => {
    return (
      <div key={group.key} className="space-y-1">
        {/* Group header - compact "series line" */}
        <div
          className="p-2 rounded-lg border bg-card cursor-move hover:bg-accent/5 transition-colors"
          style={{ borderColor: group.color, borderWidth: '2px' }}
          draggable
          onDragStart={(e) => {
            // Передаем первый ref группы для совместимости с текущим workbench
            const firstRef = group.items[0]?.ref;
            if (firstRef) {
              e.dataTransfer.setData('text/astra-commentator-ref', firstRef);
              e.dataTransfer.setData('text/plain', firstRef);
              setBookshelfState(prev => ({ ...prev, draggedItem: firstRef }));
              onDragStart?.(firstRef);
            }
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-muted-foreground">≡</span>
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: group.color }}
              />
              <div className="font-semibold text-sm truncate">
                {group.parsed.commentator} on {group.parsed.tractate} {group.parsed.page}:{group.parsed.section}
              </div>
              <span className="text-[10px] uppercase tracking-wide bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded">
                Series
              </span>
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {group.items.length} parts
            </div>
          </div>
        </div>

        {/* Parts - indented and simpler */}
        <div className="ml-6 space-y-1">
          {group.items.map((item: any, idx: number) => {
            const part = parseRefStrict(item.ref)?.part;
            return (
              <div
                key={`${item.ref}__${idx}`}
                className="flex items-start gap-2 p-2 rounded border bg-card/50 border-border hover:bg-accent/10 transition-colors cursor-move"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/astra-commentator-ref', item.ref);
                  e.dataTransfer.setData('text/plain', item.ref);
                  setBookshelfState(prev => ({ ...prev, draggedItem: item.ref }));
                  onDragStart?.(item.ref);
                }}
              >
                <span className="text-muted-foreground mt-0.5">≡</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono text-muted-foreground">
                    {part ? `${group.parsed.page}:${group.parsed.section}:${part}` : item.ref}
                  </div>
                  {item.preview && (
                    <div
                      className={`text-xs opacity-75 mt-0.5 line-clamp-1 ${
                        containsHebrew(item.preview) ? 'text-right font-hebrew' : 'text-left'
                      }`}
                      dir={getTextDirection(item.preview)}
                    >
                      {item.preview}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [onDragStart]);

  // Main render group function
  const renderGroup = useCallback((group: GroupNode) => {
    return group.items.length === 1
      ? renderSinglePartGroup(group)
      : renderMultiPartGroup(group);
  }, [renderSinglePartGroup, renderMultiPartGroup]);

  // Render orphan item
  const renderOrphan = useCallback((item: any, idx?: number) => {
    const parsed = parseRefStrict(item.ref); // может быть null

    return (
      <div
        key={`${item.ref}__${idx ?? 0}`}
        className="flex items-start gap-2 p-3 rounded-lg border bg-card border-border hover:bg-accent/10 transition-colors cursor-move"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/astra-commentator-ref', item.ref);
          e.dataTransfer.setData('text/plain', item.ref);
          setBookshelfState(prev => ({ ...prev, draggedItem: item.ref }));
          onDragStart?.(item.ref);
        }}
      >
        <span className="text-muted-foreground mt-0.5">≡</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {parsed
              ? `${parsed.commentator} on ${parsed.tractate} ${parsed.page}:${parsed.section}${parsed.part ? ` (Part ${parsed.part})` : ''}`
              : item.ref}
          </div>
          {item.preview && (
            <div
              className={`text-xs opacity-75 mt-1 line-clamp-2 ${
                containsHebrew(item.preview) ? 'text-right font-hebrew' : 'text-left'
              }`}
              dir={getTextDirection(item.preview)}
            >
              {item.preview}
            </div>
          )}
        </div>
      </div>
    );
  }, [onDragStart]);

  if (error) {
    return <ErrorState error={error} />;
  }

  if (isLoadingCategories) {
    return <LoadingState />;
  }

  return (
    <div className="h-full flex flex-col bg-card/50">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b">
        <h3 className="text-lg font-semibold mb-3">Sources</h3>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search sources..."
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            value={bookshelfState.searchQuery}
            onChange={(e) => setBookshelfState(prev => ({ ...prev, searchQuery: e.target.value }))}
          />
        </div>

        {/* Commentators Filter */}
        <div className="flex flex-wrap gap-1 mb-3">
          {Array.from(new Set([
            ...bookshelfState.groups.map(g => g.parsed.commentator),
            ...bookshelfState.orphans.map((item: any) => parseRefStrict(item.ref)?.commentator).filter((c): c is string => Boolean(c))
          ])).slice(0, 6).map(commentator => (
            <button
              key={commentator}
              onClick={() => {
                setBookshelfState(prev => {
                  const newCommentators = prev.activeFilters.commentators.includes(commentator)
                    ? prev.activeFilters.commentators.filter(c => c !== commentator)
                    : [...prev.activeFilters.commentators, commentator];
                  return {
                    ...prev,
                    activeFilters: { ...prev.activeFilters, commentators: newCommentators }
                  };
                });
              }}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                bookshelfState.activeFilters.commentators.includes(commentator)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-secondary hover:bg-secondary/80 border-border'
              }`}
              style={{
                borderColor: bookshelfState.activeFilters.commentators.includes(commentator) ? undefined : undefined,
                backgroundColor: bookshelfState.activeFilters.commentators.includes(commentator) ? undefined : undefined
              }}
            >
              {commentator}
            </button>
          ))}
          {Array.from(new Set([
            ...bookshelfState.groups.map(g => g.parsed.commentator),
            ...bookshelfState.orphans.map((item: any) => parseRefStrict(item.ref)?.commentator).filter((c): c is string => Boolean(c))
          ])).length > 6 && (
            <select
              className="text-xs border rounded-full px-2 py-1 bg-secondary"
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  setBookshelfState(prev => ({
                    ...prev,
                    activeFilters: {
                      ...prev.activeFilters,
                      commentators: [...prev.activeFilters.commentators, e.target.value]
                    }
                  }));
                }
              }}
            >
              <option value="">More...</option>
              {Array.from(new Set([
                ...bookshelfState.groups.map(g => g.parsed.commentator),
                ...bookshelfState.orphans.map((item: any) => parseRefStrict(item.ref)?.commentator).filter((c): c is string => Boolean(c))
              ])).slice(6).map(commentator => (
                <option key={commentator} value={commentator}>{commentator}</option>
              ))}
            </select>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1">
          {categories.map((category) => (
            <button
              key={category.name}
              onClick={() => setSelectedCategory(category.name)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                selectedCategory === category.name
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card hover:bg-accent border-border'
              }`}
              style={{
                borderColor: selectedCategory === category.name ? category.color : undefined,
                backgroundColor: selectedCategory === category.name ? category.color : undefined
              }}
            >
              {category.name}
              {(() => {
                const count = [
                  ...filteredData.groups.flatMap(g => g.items),
                  ...filteredData.orphans
                ].filter(item => item.category === category.name).length;
                return count > 0 ? (
                  <span className="ml-1 opacity-75">
                    ({count})
                  </span>
                ) : null;
              })()}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoadingItems ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (filteredData.groups.length === 0 && filteredData.orphans.length === 0) ? (
          <EmptyState hasSearch={!!bookshelfState.searchQuery} />
        ) : (
          <div className="p-3 space-y-3">
            {filteredData.groups.map((group) => renderGroup(group))}
            {filteredData.orphans.map((item, idx) => renderOrphan(item, idx))}
          </div>
        )}
      </div>
    </div>
  );
});

export default BookshelfPanel;

// Вспомогательные компоненты
const BookshelfHeader = memo(({
  searchQuery,
  onSearchChange,
  itemCount,
  totalCount
}: {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  itemCount: number;
  totalCount?: number;
}) => (
  <div className="flex-shrink-0 p-4 border-b">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-lg font-semibold">Sources</h3>
      <span className="text-sm text-muted-foreground">
        {itemCount}{totalCount ? ` / ${totalCount}` : ''}
      </span>
    </div>

    {onSearchChange && (
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search sources..."
          className="w-full pl-9 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          value={searchQuery || ''}
          onChange={(e) => onSearchChange(e.target.value)}
          dir="rtl"
        />
      </div>
    )}
  </div>
));

const EmptyState = ({ hasSearch }: { hasSearch: boolean }) => (
  <div className="flex flex-col items-center justify-center h-full p-6 text-center">
    <BookOpen className="w-12 h-12 text-muted-foreground/30 mb-4" />
    <h4 className="text-sm font-medium text-muted-foreground mb-2">
      {hasSearch ? 'No sources found' : 'No sources yet'}
    </h4>
    <p className="text-xs text-muted-foreground/70">
      {hasSearch
        ? 'Try adjusting your search terms'
        : 'Drag sources here or start a new study'
      }
    </p>
  </div>
);

const LoadingState = () => (
  <div className="h-full flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

const ErrorState = ({ error }: { error: string }) => (
  <div className="h-full flex flex-col items-center justify-center p-6 text-center">
    <div className="text-red-500 mb-2">⚠️</div>
    <h3 className="text-lg font-medium mb-2">Error</h3>
    <p className="text-sm text-muted-foreground">{error}</p>
  </div>
);

const BookshelfList = memo(({
  items,
  onDragStart,
  onItemClick,
  draggedItem,
  setDraggedItem
}: {
  items: CommentaryItem[];
  onDragStart?: (ref: string) => void;
  onItemClick?: (item: CommentaryItem) => void;
  draggedItem: string | null;
  setDraggedItem: (ref: string | null) => void;
}) => (
  <div className="flex-1 overflow-y-auto space-y-2 p-2">
    {items.map((item, index) => (
      <BookshelfItemComponent
        key={item.ref}
        item={item}
        onDragStart={(ref) => {
          setDraggedItem(ref);
          onDragStart?.(ref);
        }}
        onItemClick={onItemClick}
        isDragged={draggedItem === item.ref}
      />
    ))}
  </div>
));

const CommentaryGroup = memo(({
  item,
  onDragStart,
  onItemClick,
  onToggleExpand,
  isExpanded,
  isDragged,
  childrenCount
}: {
  item: CommentaryItem;
  onDragStart?: (ref: string) => void;
  onItemClick?: (item: CommentaryItem) => void;
  onToggleExpand?: (ref: string) => void;
  isExpanded?: boolean;
  isDragged?: boolean;
  childrenCount?: number;
}) => {
  const displayTitle = item.ref;
  const direction = getTextDirection(displayTitle);
  const isHebrew = containsHebrew(displayTitle);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/astra-commentator-ref', item.ref);
    e.dataTransfer.setData('text/plain', item.ref);
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart?.(item.ref);
  }, [item.ref, onDragStart]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onToggleExpand?.(item.ref);
  }, [item.ref, onToggleExpand]);

  return (
    <div
      className={`
        p-3 rounded-lg border transition-all duration-200 cursor-pointer
        ${isDragged
          ? 'opacity-50 scale-95 border-primary'
          : 'hover:shadow-md hover:border-primary/50'
        }
        bg-card border-border hover:bg-accent/10
      `}
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      tabIndex={0}
      role="button"
      aria-expanded={isExpanded}
      aria-label={`Group: ${displayTitle}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">ðŸ“–</span>
          <div
            className={`font-semibold text-sm ${
              isHebrew ? 'text-right font-hebrew text-base leading-relaxed' : 'text-left'
            }`}
            dir={direction}
          >
            {displayTitle}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand?.(item.ref);
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label={isExpanded ? 'Collapse group' : 'Expand group'}
          >
            {isExpanded ? 'âˆ’' : '+'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
        <span>ðŸ“Š {childrenCount || 0} parts</span>
        <span>ðŸŽ¯ High relevance</span>
      </div>

      <div className="flex gap-2 mt-2">
        <button className="text-xs px-2 py-1 bg-secondary rounded hover:bg-secondary/80">
          ðŸ“‹ Copy All
        </button>
        <button className="text-xs px-2 py-1 bg-secondary rounded hover:bg-secondary/80">
          ðŸ”„ Load in Workbench
        </button>
      </div>
    </div>
  );
});

const CommentaryItemComponent = memo(({
  item,
  onDragStart,
  onItemClick,
  isDragged
}: {
  item: CommentaryItem;
  onDragStart?: (ref: string) => void;
  onItemClick?: (item: CommentaryItem) => void;
  isDragged?: boolean;
}) => {
  const displayTitle = item.ref;
  const direction = getTextDirection(displayTitle);
  const isHebrew = containsHebrew(displayTitle);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/astra-commentator-ref', item.ref);
    e.dataTransfer.setData('text/plain', item.ref);
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart?.(item.ref);
  }, [item.ref, onDragStart]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onItemClick?.(item);
  }, [item, onItemClick]);

  return (
    <div
      className={`
        p-3 rounded-lg border transition-all duration-200 cursor-move ml-6
        ${isDragged
          ? 'opacity-50 scale-95 border-primary'
          : 'hover:shadow-md hover:border-primary/50'
        }
        bg-card border-border hover:bg-accent/10
      `}
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      tabIndex={0}
      role="button"
      aria-label={`Source: ${displayTitle}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">ðŸ“</span>
          <div
            className={`font-semibold text-sm ${
              isHebrew ? 'text-right font-hebrew text-base leading-relaxed' : 'text-left'
            }`}
            dir={direction}
          >
            {displayTitle}
          </div>
        </div>
        <button className="text-muted-foreground hover:text-foreground" aria-label="Preview">
          ðŸ‘
        </button>
      </div>

      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
        <span>ðŸ“ Brief</span>
        <span>ðŸ”— Part of series</span>
      </div>

      <div className="flex gap-2 mt-2">
        <button className="text-xs px-2 py-1 bg-secondary rounded hover:bg-secondary/80">
          ðŸ”„ In Workbench
        </button>
      </div>
    </div>
  );
});

const BookshelfItemComponent = memo(({
  item,
  onDragStart,
  onItemClick,
  isDragged
}: {
  item: CommentaryItem;
  onDragStart?: (ref: string) => void;
  onItemClick?: (item: CommentaryItem) => void;
  isDragged?: boolean;
}) => {
  // Показываем полную ссылку с нумерацией
  const displayTitle = item.ref; // Полная ссылка типа "Rashi on Shabbat 12a:2:1"
  const subtitle = `${item.metadata.commentator} on ${item.metadata.tractate}`; // Короткое название типа "Rashi on Shabbat"

  const direction = getTextDirection(displayTitle);
  const isHebrew = containsHebrew(displayTitle);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/astra-commentator-ref', item.ref);
    e.dataTransfer.setData('text/plain', item.ref);
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart?.(item.ref);
  }, [item.ref, onDragStart]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onItemClick?.(item);
  }, [item, onItemClick]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onItemClick?.(item);
    }
  }, [item, onItemClick]);

  return (
    <div
      className={`
        p-3 rounded-lg border transition-all duration-200 cursor-move
        ${isDragged
          ? 'opacity-50 scale-95 border-primary'
          : 'hover:shadow-md hover:border-primary/50'
        }
        bg-card border-border hover:bg-accent/10
      `}
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Source: ${displayTitle}`}
    >
      {/* Полная ссылка с нумерацией */}
      <div
        className={`font-semibold text-sm mb-1 ${
          isHebrew ? 'text-right font-hebrew text-base leading-relaxed' : 'text-left'
        }`}
        dir={direction}
      >
        {displayTitle}
      </div>

      {/* Короткое название (если отличается от полной ссылки) */}
      {subtitle && subtitle !== displayTitle && (
        <div
          className={`text-xs text-muted-foreground mb-2 ${
            containsHebrew(subtitle) ? 'text-right font-hebrew' : 'text-left'
          }`}
          dir={getTextDirection(subtitle)}
        >
          {subtitle}
        </div>
      )}

      {/* Категория */}
      {item.category && (
        <div className="flex items-center gap-1 mb-2">
          <BookOpen className="w-3 h-3 text-muted-foreground" />
          <span
            className={`text-xs text-muted-foreground ${
              containsHebrew(item.category)
                ? 'font-hebrew'
                : ''
            }`}
          >
            {item.category}
          </span>
        </div>
      )}

      {/* Превью */}
      {item.preview && (
        <div
          className={`text-xs opacity-75 line-clamp-2 ${
            containsHebrew(item.preview)
              ? 'text-right font-hebrew leading-relaxed text-sm'
              : 'text-left leading-normal'
          }`}
          dir={getTextDirection(item.preview)}
        >
          {item.preview}
        </div>
      )}

    </div>
  );
});
