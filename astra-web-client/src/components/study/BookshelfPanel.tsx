/* eslint-disable @typescript-eslint/no-unused-vars */
import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, BookOpen, Loader2, ArrowDownWideNarrow, ArrowDownNarrowWide } from 'lucide-react';
import { BookshelfPanelProps } from '../../types/bookshelf';
import { api } from '../../services/api';

// Помощник: извлечь человекочитаемое превью из старой (string) или новой ({he,en}) схемы.
// Правило: всегда приоритет he, затем en как fallback.
function coalescePreview(raw: any): { text: string | undefined; lang: 'he' | 'en' | undefined } {
  if (!raw) return { text: undefined, lang: undefined };

  const val = raw.preview ?? raw.text ?? raw.snippet ?? raw.summary;

  // Старый кейс: plain string (считаем как he для обратной совместимости)
  if (typeof val === 'string') {
    const s = val.trim();
    return s.length ? { text: s, lang: 'he' } : { text: undefined, lang: undefined };
  }

  // Новый кейс: объект {he?, en?} или вложенный {text:{he?,en?}}
  const obj = val?.text ? val.text : val;

  if (obj && typeof obj === 'object') {
    const he = typeof obj.he === 'string' ? obj.he.trim() : '';
    const en = typeof obj.en === 'string' ? obj.en.trim() : '';

    // всегда приоритет he
    if (he) return { text: he, lang: 'he' };
    // fallback на en
    if (en) return { text: en, lang: 'en' };
  }

  return { text: undefined, lang: undefined };
}

// Утилита: проверяет, есть ли английский перевод
function hasEnglish(raw: any): boolean {
  if (!raw) return false;
  const val = raw.preview ?? raw.text ?? raw.snippet ?? raw.summary;
  const obj = typeof val === 'string' ? null : (val?.text ? val.text : val);
  const en = obj?.en || (typeof val === 'object' ? val?.en : undefined);
  return typeof en === 'string' && en.trim().length > 0;
}

// Есть ли иврит (по тем же полям, что и coalescePreview)
function hasHebrew(raw: any): boolean {
  if (!raw) return false;
  const val = raw.preview ?? raw.text ?? raw.snippet ?? raw.summary;
  const obj = typeof val === 'string' ? { he: val } : (val?.text ? val.text : val);
  const he = obj?.he;
  return typeof he === 'string' && he.trim().length > 0;
}
// Возвращает текст и css-класс бейджа для языков
function getLangBadge(raw: any): { text: string; className: string } | null {
  const he = hasHebrew(raw);
  const en = hasEnglish(raw);
  if (he && en) return { text: 'Иврит+EN', className: 'bookshelf-lang-badge' };
  if (!he && en) return { text: 'EN', className: 'bookshelf-lang-badge' };
  return null;
}

interface Category {
  name: string;
  color: string;
}

function CategoryButtonBar({
  categories,
  selected,
  onSelect,
  getCount,
  accent = '#c2a970'
}: {
  categories: { name: string; color?: string }[];
  selected: string | null;
  onSelect: (name: string) => void;
  getCount?: (name: string) => number;
  accent?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {categories.slice(0, 12).map((c) => {
        const isActive = selected === c.name;
        const count = getCount ? getCount(c.name) : undefined;

        return (
          <button
            key={c.name}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(c.name)}
            className={`bookshelf-catbtn ${isActive ? 'is-active' : ''}`}
            style={{
              // мягкие рамки без «жёстких светлых линий»
              borderColor: isActive ? accent : 'hsl(var(--border) / 0.28)',
              background: isActive
                ? `color-mix(in oklab, ${accent} 16%, transparent)`
                : 'hsl(var(--panel))',
            }}
            title={c.name}
          >
            <span className="truncate">{CATEGORY_LOCALE[c.name] || c.name}</span>
            {typeof count === 'number' && count > 0 && (
              <span className="bookshelf-catcount">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
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


// Группировка по ref
export function groupByRef(items: any[]) {
  const groups = new Map<GroupKey, GroupNode>();
  const orphans: any[] = [];

  if (!Array.isArray(items) || items.length === 0) {
    return { groups: [], orphans: [] };
  }

  for (const it of items) {
    // 1) Берём ref из нескольких возможных мест (как у вас и было)
    const ref = it.ref || it.metadata?.ref || it.raw?.ref || '';

    // 2) Пытаемся НЕ выводить из строки, а взять точные поля из metadata
    const m = it.metadata || {};
    const commentator = m.commentator || null;
    const tractate    = m.tractate    || null;
    const page        = m.page        || null;
    const section     = m.section     || null;

    // Если метаданных достаточно — строим ключ напрямую
    if (commentator && tractate && page && section) {
      const key: GroupKey = `${commentator} on ${tractate} ${page}:${section}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          parsed: { commentator, tractate, page, section },
          color: '',
          items: [],
        });
      }
      groups.get(key)!.items.push(it);
      continue;
    }

    // 3) Иначе — пробуем старую строгую регулярку как запасной путь
    const p = parseRefStrict(ref);
    if (p) {
      const key: GroupKey = `${p.commentator} on ${p.tractate} ${p.page}:${p.section}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          parsed: { commentator: p.commentator, tractate: p.tractate, page: p.page, section: p.section },
          color: '',
          items: [],
        });
      }
      groups.get(key)!.items.push(it);
      continue;
    }

    // 4) Совсем не распознали — в сироты (но всё равно показываем!)
    orphans.push(it);
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
    const ae = hasEnglish(a) ? 1 : 0;
    const be = hasEnglish(b) ? 1 : 0;
    if (ae !== be) return be - ae; // EN first

    const as = a.score ?? 0, bs = b.score ?? 0;
    if (as !== bs) return bs - as;

    const av = naturalPartValue(a.ref || a.metadata?.ref || '');
    const bv = naturalPartValue(b.ref || b.metadata?.ref || '');
    if (av.n != null && bv.n != null) return av.n - bv.n;
    if (av.n != null) return -1;
    if (bv.n != null) return 1;
    return (av.s ?? '').localeCompare(bv.s ?? '', undefined, { numeric: true, sensitivity: 'base' });
  });
}

// Сортировка групп
export function sortGroups(groups: GroupNode[]): GroupNode[] {
  const groupHasEN = (g: GroupNode) => g.items.some(hasEnglish) ? 1 : 0;
  const maxScore = (items: any[]) => items.reduce((m, it) => Math.max(m, it.score ?? -Infinity), -Infinity);

  return [...groups].sort((g1, g2) => {
    const e1 = groupHasEN(g1), e2 = groupHasEN(g2);
    if (e1 !== e2) return e2 - e1;                 // EN-first по группам
    const s1 = maxScore(g1.items), s2 = maxScore(g2.items);
    if (s1 !== s2) return s2 - s1;                  // затем score
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

const CATEGORY_LOCALE = {
  'Commentary': 'Комментарий',
  'Quoting Commentary': 'Цитируемый комментарий',
  'Midrash': 'Мидраш',
  'Mishnah': 'Мишна',
  'Targum': 'Таргум',
  'Halakhah': 'Галаха',
  'Responsa': 'Респонсы',
  'Chasidut': 'Хасидизм',
  'Kabbalah': 'Каббала',
  'Jewish Thought': 'Еврейская мысль',
  'Liturgy': 'Литургия',
  'Bible': 'Танах'
};

const BookshelfPanel = memo(({
  sessionId,
  currentRef,
  onDragStart
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
  const [density, setDensity] = useState<'compact'|'normal'>('compact');

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
        const data = await api.getBookshelfItems(sessionId, currentRef, selectedCategory);

        // ✅ страховка на случай undefined/null
        const rawItems = Array.isArray(data?.bookshelf?.items) ? data.bookshelf.items : [];

        // Временный диагностический лог (чтобы понять причину, если снова пусто)
        console.debug('[Bookshelf] cat:', selectedCategory, 'items:', data?.bookshelf?.items?.length, 'sample:', data?.bookshelf?.items?.[0]);

        // Группировать и сортировать
        const { groups, orphans } = groupByRef(rawItems);

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
        group.items.some((item: any) => {
          const preview = coalescePreview(item);
          return item.ref.toLowerCase().includes(query) ||
                 item.category?.toLowerCase().includes(query) ||
                 (preview.text && preview.text.toLowerCase().includes(query));
        })
      );
      filteredOrphans = filteredOrphans.filter((item: any) => {
        const preview = coalescePreview(item);
        return item.ref.toLowerCase().includes(query) ||
               item.category?.toLowerCase().includes(query) ||
               (preview.text && preview.text.toLowerCase().includes(query));
      });
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

    const langBadge = getLangBadge(item);

    return (
      <div
        key={group.key}
        className={`rounded-lg border panel-card cursor-move hover:bg-accent/5 transition-colors ${density === 'compact' ? 'p-2' : 'p-2.5'}`}
        style={{ borderColor: `${group.color}80`, borderWidth: '2px' }}
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
                  Часть {part}
                </span>
              )}
              {hasEnglish(item) && (
                <span className="bookshelf-en-badge ml-2">
                  EN
                </span>
              )}
            </div>
            {langBadge && (
              <span className={langBadge.className} aria-label={`Язык: ${langBadge.text}`}>
                {langBadge.text}
              </span>
            )}

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
            <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
              {parsed ? `${parsed.page}:${parsed.section}:${parsed.part ?? '?'}` : item.ref}
            </div>

            {/* ПРЕВЬЮ (2 строки, RTL при иврите) */}
            {density === 'normal' && (() => {
              const preview = coalescePreview(item);
              if (!preview.text) return null;
              const dir = preview.lang === 'he' ? 'rtl' : 'ltr';
              return (
                <div
                  className={`mt-1 opacity-85 line-clamp-2 ${preview.lang === 'he' ? 'text-right font-hebrew' : 'text-left'} text-[11px]`}
                  dir={dir}
                  title={preview.text}
                >
                  {preview.text}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    );
  }, [onDragStart, density]);

  // Render multi-part group
  const renderMultiPartGroup = useCallback((group: GroupNode) => {
    return (
      <div key={group.key} className="space-y-1">
        {/* Group header - compact "series line" */}
        <div
          className={`rounded-lg border panel-card cursor-move hover:bg-accent/5 transition-colors relative ${density === 'compact' ? 'p-2' : 'p-2.5'}`}
          style={{ borderColor: `${group.color}80`, borderWidth: '2px' }}
          title={`Drag entire series: ${group.parsed.commentator} on ${group.parsed.tractate} ${group.parsed.page}:${group.parsed.section} (${group.items.length} parts)`}
          draggable
          onDragStart={(e) => {
            // Передаем всю группу как единое целое
            const groupRef = `${group.parsed.commentator} on ${group.parsed.tractate} ${group.parsed.page}:${group.parsed.section}`;
            const groupData = {
              type: 'group',
              ref: groupRef, // Основной ref группы без части
              refs: group.items.map(item => item.ref), // Все части группы
              groupKey: group.key,
              commentator: group.parsed.commentator,
              tractate: group.parsed.tractate,
              page: group.parsed.page,
              section: group.parsed.section
            };
            
            e.dataTransfer.setData('text/astra-commentator-ref', groupRef);
            e.dataTransfer.setData('text/plain', groupRef);
            // Добавляем специальный тип для группы
            e.dataTransfer.setData('application/json', JSON.stringify(groupData));
            e.dataTransfer.setData('text/astra-group', JSON.stringify(groupData));
            
            setBookshelfState(prev => ({ ...prev, draggedItem: groupRef }));
            onDragStart?.(groupRef);
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-muted-foreground">≡</span>
              <div
                className="w-3 h-3 rounded-full relative"
                style={{ backgroundColor: group.color }}
              >
                {/* Индикатор группового перетаскивания */}
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full border border-background text-[8px] flex items-center justify-center text-white font-bold">
                  ≡
                </div>
              </div>
              <div className="font-semibold text-sm truncate">
                {group.parsed.commentator} on {group.parsed.tractate} {group.parsed.page}:{group.parsed.section}
              </div>
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {group.items.length} частей
            </div>
          </div>
        </div>

        {/* Parts - indented and simpler */}
        <div className="ml-6 space-y-1">
          {group.items.map((item: any, idx: number) => {
            const part = parseRefStrict(item.ref)?.part;
            const langBadge = getLangBadge(item);
            return (
              <div
                key={`${item.ref}__${idx}`}
                className={`flex items-start gap-2 rounded border panel-card hover:bg-accent/10 transition-colors cursor-move ${density==='compact' ? 'py-1 px-2' : 'py-1.5 px-3'}`}
                title={`Drag individual part: ${item.ref}`}
                draggable
                onDragStart={(e) => {
                  // Передаем отдельную часть
                  const partData = {
                    type: 'part',
                    ref: item.ref,
                    parentGroup: group.key,
                    commentator: group.parsed.commentator,
                    tractate: group.parsed.tractate,
                    page: group.parsed.page,
                    section: group.parsed.section,
                    part: parseRefStrict(item.ref)?.part
                  };
                  
                  e.dataTransfer.setData('text/astra-commentator-ref', item.ref);
                  e.dataTransfer.setData('text/plain', item.ref);
                  // Добавляем специальный тип для части
                  e.dataTransfer.setData('application/json', JSON.stringify(partData));
                  e.dataTransfer.setData('text/astra-part', JSON.stringify(partData));
                  
                  setBookshelfState(prev => ({ ...prev, draggedItem: item.ref }));
                  onDragStart?.(item.ref);
                }}
              >
                <span className="text-muted-foreground mt-0.5">≡</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono text-muted-foreground">
                    {part ? `${group.parsed.page}:${group.parsed.section}:${part}` : item.ref}
                  </div>
                  {density === 'normal' && (() => {
                    const preview = coalescePreview(item);
                    if (!preview.text) return null;
                    const dir = preview.lang === 'he' ? 'rtl' : 'ltr';
                    return (
                      <div
                        className={`text-[11px] opacity-85 mt-0.5 line-clamp-2 ${preview.lang==='he' ? 'text-right font-hebrew' : 'text-left'}`}
                        dir={dir}
                      >
                        {preview.text}
                      </div>
                    );
                  })()}
                </div>
                {langBadge && <span className={langBadge.className} aria-label={`Язык: ${langBadge.text}`}>{langBadge.text}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [onDragStart, density]);

  // Main render group function
  const renderGroup = useCallback((group: GroupNode) => {
    return group.items.length === 1
      ? renderSinglePartGroup(group)
      : renderMultiPartGroup(group);
  }, [renderSinglePartGroup, renderMultiPartGroup, density]);

  // Render orphan item
  const renderOrphan = useCallback((item: any, idx?: number) => {
    const parsed = parseRefStrict(item.ref); // может быть null
    const langBadge = getLangBadge(item);

    return (
      <div
        key={`${item.ref}__${idx ?? 0}`}
        className={`flex items-start gap-2 rounded-lg border panel-card hover:bg-accent/10 transition-colors cursor-move ${density==='compact' ? 'p-2' : 'p-2.5'}`}
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
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-sm font-medium truncate">
              {parsed
                ? `${parsed.commentator} on ${parsed.tractate} ${parsed.page}:${parsed.section}${parsed.part ? ` (Part ${parsed.part})` : ''}`
                : item.ref}
            </div>
            {langBadge && <span className={langBadge.className} aria-label={`Язык: ${langBadge.text}`}>{langBadge.text}</span>}
          </div>
          {density === 'normal' && (() => {
            const preview = coalescePreview(item);
            if (!preview.text) return null;
            const dir = preview.lang === 'he' ? 'rtl' : 'ltr';
            return (
              <div
                className={`text-[11px] opacity-85 mt-1 line-clamp-2 ${preview.lang === 'he' ? 'text-right font-hebrew' : 'text-left'}`}
                dir={dir}
              >
                {preview.text}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }, [onDragStart, density]);

  if (error) {
    return <ErrorState error={error} />;
  }

  if (isLoadingCategories) {
    return <LoadingState />;
  }

  return (
    <div className="h-full flex flex-col panel-outer border-l">
      {/* Header */}
      <div className="flex-shrink-0 panel-padding border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Источники</h3>
          <div className="flex gap-2">
            <button onClick={()=>setDensity('compact')} aria-pressed={density==='compact'} type="button"
              title="Компактно" className={`rounded p-1 border ${density==='compact'?'bg-accent text-accent-foreground border-accent':'border-border bg-background text-muted-foreground'} transition-colors`}> <ArrowDownNarrowWide className="w-4 h-4"/></button>
            <button onClick={()=>setDensity('normal')} aria-pressed={density==='normal'} type="button"
              title="Стандартно" className={`rounded p-1 border ${density==='normal'?'bg-accent text-accent-foreground border-accent':'border-border bg-background text-muted-foreground'} transition-colors`}> <ArrowDownWideNarrow className="w-4 h-4"/></button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Поиск источников..."
            className="w-full pl-9 pr-3 py-2 text-sm panel-card rounded-lg border-border/40 focus:outline-none focus:ring-0 focus:border-primary/50 transition-colors"
            value={bookshelfState.searchQuery}
            onChange={(e) => setBookshelfState(prev => ({ ...prev, searchQuery: e.target.value }))}
          />
        </div>

        {/* Category Buttons (compact, 12 max) */}
        <CategoryButtonBar
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
          accent="#c2a970"
          getCount={(catName) => {
            // те же правила, что у тебя раньше — считаем сколько элементов в этой категории
            const all = [
              ...filteredData.groups.flatMap(g => g.items),
              ...filteredData.orphans,
            ];
            return all.filter(it => it.category === catName).length;
          }}
        />
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
          <div className="panel-padding-sm space-compact">
            {filteredData.groups.map((group, i) => (
              <>
                {i>0 && <div className="soft-divider" />}
                {renderGroup(group)}
              </>
            ))}
            {filteredData.groups.length>0 && filteredData.orphans.length>0 && <div className="soft-divider" />}
            {filteredData.orphans.map((item, i) => (
              <>
                {i>0 && <div className="soft-divider" />}
                {renderOrphan(item, i)}
              </>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default BookshelfPanel;


const EmptyState = ({ hasSearch }: { hasSearch: boolean }) => (
  <div className="flex flex-col items-center justify-center h-full p-6 text-center">
    <BookOpen className="w-12 h-12 text-muted-foreground/30 mb-4" />
    <h4 className="text-sm font-medium text-muted-foreground mb-2">
      {hasSearch ? 'Ничего не найдено' : 'Источники ещё не добавлены'}
    </h4>
    <p className="text-xs text-muted-foreground/70">
      {hasSearch
        ? 'Попробуйте изменить параметры поиска'
        : 'Перетащите источники сюда или начните новое исследование'
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


