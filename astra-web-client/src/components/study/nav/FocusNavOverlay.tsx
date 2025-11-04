import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { X } from 'lucide-react';

import { useTheme } from '../../theme-provider';
import StarfieldBackground from './StarfieldBackground';
import CategorySidebar from './components/CategorySidebar';
import CurrentLocationPanel from './components/CurrentLocationPanel';
import GlobalSearchBar from './components/GlobalSearchBar';
import BreadcrumbTrail from './components/BreadcrumbTrail';
import MishnahSectionSelector from './components/MishnahSectionSelector';
import BookList from './components/BookList';
import BookHeader from './components/BookHeader';
import ChapterGrid from './components/ChapterGrid';
import ParashaList from './components/ParashaList';
import TanakhSectionPanel from './components/TanakhSectionPanel';
import ComingSoonPanel from './components/ComingSoonPanel';
import TalmudSectionPanel from './components/TalmudSectionPanel';
import useFocusNavData from './hooks/useFocusNavData';
import useTanakhCollections from './hooks/useTanakhCollections';
import useBookData from './hooks/useBookData';
import useFocusNavShortcuts from './hooks/useFocusNavShortcuts';
import { buildTanakhBreadcrumbs, resolveTanakhSection } from './utils/tanakh';
import { findTanakhEntry, parseTanakhReference } from './utils/tanakhReference';
import { SECTION_VARIANTS, ITEM_VARIANTS } from './variants';
import type { CatalogWork } from '../../../lib/sefariaCatalog';
import type {
  BookAliyah,
  BookParasha,
  BookTab,
  CorpusCategory,
  CurrentLocation,
  MishnahSection,
  RootSection,
  TanakhBookEntry,
  TanakhSection,
  TalmudEdition,
  TalmudSeder,
} from './types';
import { TALMUD_SEDER_LABELS, TALMUD_SEDER_ORDER_BAVLI, TALMUD_SEDER_ORDER_YERUSHALMI } from './constants';

interface FocusNavOverlayProps {
  open: boolean;
  onClose: () => void;
  onSelectRef: (ref: string) => void;
  currentRef?: string;
}

const CATEGORY_STRUCTURE: CorpusCategory[] = [
  {
    id: 'written-torah',
    label: 'Письменная Тора',
    icon: '📜',
    corpora: [
      {
        id: 'Tanakh',
        label: 'Танах',
        children: [
          { id: 'tanakh-torah', label: 'Тора', section: 'Torah' },
          { id: 'tanakh-neviim', label: 'Пророки', section: 'Neviim' },
          { id: 'tanakh-ketuvim', label: 'Писания', section: 'Ketuvim' },
        ],
      },
    ],
  },
  {
    id: 'oral-torah',
    label: 'Устная Тора',
    icon: '🗣',
    corpora: [
      { id: 'Mishnah', label: 'Мишна' },
      { id: 'Talmud', label: 'Талмуд' },
    ],
    defaultExpanded: true,
  },
  {
    id: 'halakhah',
    label: 'Галаха и респонсы',
    icon: '⚖️',
    corpora: [
      { id: 'Halakhah', label: 'Галаха' },
      { id: 'Responsa', label: 'Респонсы' },
    ],
  },
  {
    id: 'spiritual-teachings',
    label: 'Духовные учения',
    icon: '✨',
    corpora: [
      { id: 'Chasidut', label: 'Хасидут' },
      { id: 'Musar', label: 'Мусар' },
      { id: 'Jewish Thought', label: 'Еврейская мысль' },
    ],
  },
  {
    id: 'mysticism',
    label: 'Мистицизм',
    icon: '🌌',
    corpora: [{ id: 'Kabbalah', label: 'Каббала' }],
  },
  {
    id: 'liturgy-midrash',
    label: 'Литургия и мидраши',
    icon: '🕯',
    corpora: [
      { id: 'Liturgy', label: 'Литургия' },
      { id: 'Midrash', label: 'Мидраш' },
      { id: 'Reference', label: 'Справочники' },
    ],
  },
  {
    id: 'history',
    label: 'История и культура',
    icon: '📚',
    corpora: [
      { id: 'Second Temple', label: 'Период Второго Храма' },
      { id: 'Tosefta', label: 'Тосефта' },
    ],
  },
];

const CORPUS_TO_ROOT_SECTION: Record<string, RootSection> = {
  Tanakh: 'Tanakh',
  Mishnah: 'Mishnah',
  Talmud: 'Talmud',
  Halakhah: 'Halakha',
};

const ROOT_SECTION_TO_CORPUS: Record<RootSection, string> = {
  Tanakh: 'Tanakh',
  Mishnah: 'Mishnah',
  Talmud: 'Talmud',
  Halakha: 'Halakhah',
};

const TALMUD_SEDARIM_SET = new Set<TalmudSeder>([
  ...TALMUD_SEDER_ORDER_BAVLI,
  ...TALMUD_SEDER_ORDER_YERUSHALMI,
]);

function extractTalmudSeder(work: CatalogWork): TalmudSeder | null {
  const sederCategory = work.categories.find((category) => category.startsWith('Seder '));
  if (!sederCategory) {
    return null;
  }
  const name = sederCategory.slice('Seder '.length) as TalmudSeder;
  return TALMUD_SEDARIM_SET.has(name) ? name : null;
}

function isSameCatalogWork(a: CatalogWork | null, b: CatalogWork | null): boolean {
  if (!a || !b) {
    return false;
  }
  if (a.path && b.path) {
    return a.path === b.path;
  }
  return a.title === b.title;
}

function FocusNavOverlay({
  open,
  onClose,
  onSelectRef,
  currentRef,
}: FocusNavOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useFocusNavShortcuts({ open, overlayRef, onClose });

  const {
    catalog,
    loadingCatalog,
    catalogError,
    manifest,
    loadingManifest,
    manifestError,
    tanakhSeed,
    loadingTanakhSeed,
    loadingExtraCategory,
    isCategoryLoaded,
    loadExtraCategory,
  } = useFocusNavData(open);

  const [activeCorpus, setActiveCorpus] = useState<string | null>(null);
  const [talmudEdition, setTalmudEdition] = useState<TalmudEdition>('Bavli');
  const [talmudSeder, setTalmudSeder] = useState<TalmudSeder | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [didInitFromRef, setDidInitFromRef] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<CurrentLocation | null>(null);
  const [locationNav, setLocationNav] = useState<{ prev?: string; next?: string } | null>(null);
  const [rootSection, setRootSection] = useState<RootSection | null>(null);
  const [tanakhSection, setTanakhSection] = useState<TanakhSection | null>(null);
  const [mishnahSection, setMishnahSection] = useState<MishnahSection | null>(null);
  const [selectedBook, setSelectedBook] = useState<TanakhBookEntry | null>(null);
  const [bookTab, setBookTab] = useState<BookTab>('chapters');
  const [activeChapter, setActiveChapter] = useState<number | null>(null);
  const [selectedTractate, setSelectedTractate] = useState<CatalogWork | null>(null);

  const {
    data: bookData,
    loading: loadingBook,
    error: bookError,
  } = useBookData(selectedBook);
  const hasParasha = !!(bookData && 'parshiot' in bookData && bookData.parshiot.length > 0);

  const talmudStructure = useMemo(() => {
    const empty = {
      order: [] as TalmudSeder[],
      map: {} as Partial<Record<TalmudSeder, CatalogWork[]>>,
    };
    if (!catalog) {
      return empty;
    }

    const map: Partial<Record<TalmudSeder, CatalogWork[]>> = {};

    catalog.works.forEach((work) => {
      if (!work.categories.includes('Talmud') || !work.categories.includes(talmudEdition)) {
        return;
      }
      const seder = extractTalmudSeder(work);
      if (!seder) {
        return;
      }
      if (!map[seder]) {
        map[seder] = [];
      }
      map[seder]!.push(work);
    });

    Object.values(map).forEach((list) => {
      if (list) {
        list.sort((a, b) => a.title.localeCompare(b.title, 'en'));
      }
    });

    const baseOrder =
      talmudEdition === 'Yerushalmi'
        ? TALMUD_SEDER_ORDER_YERUSHALMI
        : TALMUD_SEDER_ORDER_BAVLI;
    const order = baseOrder.filter((seder) => (map[seder]?.length ?? 0) > 0);

    return { order, map };
  }, [catalog, talmudEdition]);

  useEffect(() => {
    if (!open) {
      setRootSection(null);
      setTanakhSection(null);
      setMishnahSection(null);
      setSelectedBook(null);
      setBookTab('chapters');
      setSelectedTractate(null);
      setTalmudEdition('Bavli');
      setTalmudSeder(null);
      setActiveCorpus(null);
      setSearchQuery('');
      setBreadcrumbs([]);
      setCurrentLocation(null);
      setLocationNav(null);
      setActiveChapter(null);
      setDidInitFromRef(false);
    }
  }, [open]);

  useEffect(() => {
    const { order, map } = talmudStructure;
    const editionLabel = talmudEdition === 'Bavli' ? 'Бавли' : 'Иерушалми';

    if (!order.length) {
      if (talmudSeder !== null) {
        setTalmudSeder(null);
      }
      if (selectedTractate) {
        setSelectedTractate(null);
      }
      setBreadcrumbs(['Талмуд', editionLabel]);
      return;
    }

    const desiredSeder =
      talmudSeder && map[talmudSeder]?.length ? talmudSeder : order[0];

    if (desiredSeder !== talmudSeder) {
      setTalmudSeder(desiredSeder);
      setSelectedTractate(null);
      setCurrentLocation(null);
      setLocationNav(null);
      setBreadcrumbs(['Талмуд', editionLabel, TALMUD_SEDER_LABELS[desiredSeder]]);
      return;
    }

    const tractates = map[desiredSeder] ?? [];
    if (!tractates.length) {
      if (selectedTractate) {
        setSelectedTractate(null);
      }
      setBreadcrumbs(['Талмуд', editionLabel, TALMUD_SEDER_LABELS[desiredSeder]]);
      return;
    }

    const hasSelected =
      selectedTractate &&
      tractates.some((work) => isSameCatalogWork(work, selectedTractate));

    if (!hasSelected) {
      const fallback = tractates[0]!;
      setSelectedTractate(fallback);
      setCurrentLocation(null);
      setLocationNav(null);
      setBreadcrumbs(['Талмуд', editionLabel, TALMUD_SEDER_LABELS[desiredSeder], fallback.title]);
      return;
    }
  }, [talmudStructure, talmudSeder, selectedTractate, talmudEdition]);
  useEffect(() => {
    if (!selectedTractate) {
      return;
    }
    const editionLabel = talmudEdition === 'Bavli' ? 'Бавли' : 'Иерушалми';
    const crumbs = ['Талмуд', editionLabel];
    if (talmudSeder) {
      crumbs.push(TALMUD_SEDER_LABELS[talmudSeder]);
    }
    crumbs.push(selectedTractate.title);
    setBreadcrumbs(crumbs);
  }, [selectedTractate, talmudEdition, talmudSeder]);

  useEffect(() => {
    if (!open || !rootSection) {
      return;
    }
    const mapped = ROOT_SECTION_TO_CORPUS[rootSection];
    if (mapped && mapped !== activeCorpus) {
      setActiveCorpus(mapped);
    }
  }, [open, rootSection, activeCorpus]);

  useEffect(() => {
    if (!activeCorpus) {
      return;
    }
    const mapped = CORPUS_TO_ROOT_SECTION[activeCorpus];
    if (mapped && mapped !== rootSection) {
      setRootSection(mapped);
    }
  }, [activeCorpus, rootSection]);

  const handleBookSelect = useCallback((book: TanakhBookEntry) => {
    setSelectedBook(book);
    setBookTab('chapters');
    setActiveChapter(null);
    setCurrentLocation(null);
    setLocationNav(null);
    const section = tanakhSection ?? resolveTanakhSection(book);
    setBreadcrumbs(buildTanakhBreadcrumbs(section, book, undefined));
  }, [tanakhSection]);

  useEffect(() => {
    if (bookTab === 'parasha' && !hasParasha) {
      setBookTab('chapters');
    }
  }, [bookTab, hasParasha]);

  const handleChapterSelect = useCallback((chapter: number) => {
    if (!selectedBook) {
      return;
    }
    setActiveChapter(chapter);

    const isMishnahBook = selectedBook.work.categories.includes('Mishnah');
    let ref: string;

    if (isMishnahBook) {
      ref = `${selectedBook.seed.indexTitle} ${chapter}`;
      setCurrentLocation(null);
    } else {
      const lastVerse = bookData?.chapterSizes?.[chapter - 1] ?? 1;
      ref = `${selectedBook.seed.indexTitle} ${chapter}:1-${chapter}:${lastVerse}`;
      const section = tanakhSection ?? resolveTanakhSection(selectedBook);
      setBreadcrumbs(buildTanakhBreadcrumbs(section, selectedBook, chapter));
      setCurrentLocation({
        type: 'tanakh',
        book: selectedBook,
        chapter,
        verse: 1,
        ref,
      });
    }

    onSelectRef(ref);
    onClose();
  }, [selectedBook, bookData, tanakhSection, onSelectRef, onClose]);

  const handleAliyahSelect = useCallback((aliyah: BookAliyah) => {
    onSelectRef(aliyah.ref);
    onClose();
  }, [onSelectRef, onClose]);

  const handleParashaSelect = useCallback((parasha: BookParasha) => {
    onSelectRef(parasha.wholeRef);
    onClose();
  }, [onSelectRef, onClose]);

  const handleTalmudEditionChange = useCallback((edition: TalmudEdition) => {
    setTalmudEdition(edition);
    setTalmudSeder(null);
    setSelectedTractate(null);
    setCurrentLocation(null);
    setLocationNav(null);
    setBreadcrumbs(['Талмуд', edition === 'Bavli' ? 'Бавли' : 'Иерушалми']);
  }, []);

  const handleTalmudSederSelect = useCallback((seder: TalmudSeder) => {
    setTalmudSeder(seder);
    setSelectedTractate(null);
    setCurrentLocation(null);
    setLocationNav(null);
    setBreadcrumbs(['Талмуд', talmudEdition === 'Bavli' ? 'Бавли' : 'Иерушалми', TALMUD_SEDER_LABELS[seder]]);
  }, [talmudEdition]);

  const handleTalmudTractateSelect = useCallback(
    (tractate: CatalogWork) => {
      setSelectedTractate(tractate);
      setCurrentLocation(null);
      setLocationNav(null);
      setBreadcrumbs(['Талмуд', talmudEdition === 'Bavli' ? 'Бавли' : 'Иерушалми', tractate.title]);
    },
    [talmudEdition],
  );
  const handleTalmudDafSelect = useCallback((daf: string) => {
    if (!selectedTractate) {
      return;
    }
    const baseRef = `${selectedTractate.title} ${daf}`;
    setCurrentLocation({
      type: 'talmud',
      tractate: selectedTractate.title,
      daf,
      edition: talmudEdition,
      ref: baseRef,
    });
    const editionLabel = talmudEdition === 'Bavli' ? 'Бавли' : 'Иерушалми';
    const crumbs = ['Талмуд', editionLabel];
    if (talmudSeder) {
      crumbs.push(TALMUD_SEDER_LABELS[talmudSeder]);
    }
    crumbs.push(selectedTractate.title, `Лист ${daf}`);
    setBreadcrumbs(crumbs);
    onSelectRef(`${baseRef}:1`);
    onClose();
  }, [selectedTractate, talmudEdition, talmudSeder, onSelectRef, onClose]);

  const handleTanakhSectionChange = useCallback((section: TanakhSection) => {
    setTanakhSection(section);
    setSelectedBook(null);
    setCurrentLocation(null);
    setLocationNav(null);
    setBreadcrumbs(buildTanakhBreadcrumbs(section, null, undefined));
  }, []);

  const handleSelectCorpus = useCallback(
    (corpusId: string, options?: { tanakhSection?: TanakhSection }) => {
      setActiveCorpus(corpusId);
      const mappedRoot = CORPUS_TO_ROOT_SECTION[corpusId];
      if (mappedRoot) {
        setRootSection(mappedRoot);
      } else {
        setRootSection(null);
      }

      if (corpusId === 'Tanakh') {
        const targetSection = options?.tanakhSection ?? tanakhSection ?? 'Torah';
        handleTanakhSectionChange(targetSection);
      } else if (corpusId === 'Talmud') {
        handleTalmudEditionChange('Bavli');
      } else if (corpusId === 'Mishnah') {
        setBreadcrumbs(['Мишна']);
      } else {
        setBreadcrumbs([getCorpusLabel(corpusId)]);
      }

      if (corpusId !== 'Talmud') {
        setTalmudEdition('Bavli');
      setTalmudSeder(null);
      }

      setSelectedBook(null);
      setMishnahSection(null);
      setBookTab('chapters');
      if (corpusId !== 'Tanakh') {
        setTanakhSection(null);
      }
      setSelectedTractate(null);
      setCurrentLocation(null);
      setLocationNav(null);
      setSearchQuery('');

      if (manifest && !isCategoryLoaded(corpusId)) {
        const entry = manifest.entries.find((item) => item.category === corpusId);
        if (entry) {
          void loadExtraCategory(entry);
        }
      }
    },
    [
      handleTanakhSectionChange,
      handleTalmudEditionChange,
      isCategoryLoaded,
      loadExtraCategory,
      manifest,
      tanakhSection,
    ],
  );

  const handleMishnahSectionChange = useCallback((section: MishnahSection) => {
    setMishnahSection(section);
    setSelectedBook(null);
    setCurrentLocation(null);
    setLocationNav(null);
    setBreadcrumbs(['Мишна', getMishnahSectionLabel(section)]);
  }, []);

  const handleLocationNavigate = useCallback((ref: string) => {
    if (!ref) {
      return;
    }
    onSelectRef(ref);
    onClose();
  }, [onSelectRef, onClose]);

  useEffect(() => {
    if (!currentLocation) {
      setLocationNav(null);
      return;
    }
    if (currentLocation.type !== 'tanakh') {
      setLocationNav(null);
      return;
    }
    if (!bookData?.chapterSizes?.length) {
      return;
    }
    const chapter = currentLocation.chapter;
    const total = bookData.chapterSizes.length;
    const bookTitle = currentLocation.book.work.title;
    const prev = chapter > 1 ? `${bookTitle} ${chapter - 1}` : undefined;
    const next = chapter < total ? `${bookTitle} ${chapter + 1}` : undefined;
    setLocationNav(prev || next ? { prev, next } : null);
  }, [currentLocation, bookData]);

  useEffect(() => {
    if (!selectedBook) {
      setActiveChapter(null);
      return;
    }
    if (!currentLocation || currentLocation.type !== 'tanakh') {
      return;
    }
    if (currentLocation.book.work.path && selectedBook.work.path) {
      if (currentLocation.book.work.path === selectedBook.work.path) {
        setActiveChapter(currentLocation.chapter);
      } else {
        setActiveChapter(null);
      }
      return;
    }
    if (currentLocation.book.work.title === selectedBook.work.title) {
      setActiveChapter(currentLocation.chapter);
    }
  }, [selectedBook, currentLocation]);

  const {
    tanakhCollections,
    mishnahCollections,
    tanakhEntries,
  } = useTanakhCollections(catalog, tanakhSeed);

  useEffect(() => {
    if (!tanakhCollections) {
      return;
    }
    if (!tanakhSection) {
      setTanakhSection('Torah');
    }
  }, [tanakhCollections, tanakhSection]);

  useEffect(() => {
    if (!open || didInitFromRef) {
      return;
    }
    if (!currentRef) {
      setDidInitFromRef(true);
      return;
    }
    if (!tanakhEntries.length) {
      return;
    }

    const ref = currentRef.trim();
    if (!ref) {
      setDidInitFromRef(true);
      return;
    }

    const tanakhInfo = parseTanakhReference(ref);
    if (tanakhInfo) {
      const entry = findTanakhEntry(tanakhEntries, tanakhInfo.book);
      if (entry) {
        const section = resolveTanakhSection(entry) ?? 'Torah';
        setActiveCorpus('Tanakh');
        if (tanakhSection !== section) {
          setTanakhSection(section);
        }
        setSelectedBook(entry);
        setBookTab('chapters');
        setBreadcrumbs(buildTanakhBreadcrumbs(section, entry, tanakhInfo.chapter));
        setCurrentLocation({
          type: 'tanakh',
          book: entry,
          chapter: tanakhInfo.chapter,
          verse: tanakhInfo.verse,
          ref,
        });
        setDidInitFromRef(true);
        return;
      }
    }

    setDidInitFromRef(true);
  }, [open, didInitFromRef, currentRef, tanakhEntries, tanakhSection]);

  const showInitialLoading = (loadingCatalog || loadingManifest || loadingTanakhSeed) && !catalog;
  const showInitialError = !catalog && (catalogError || manifestError);

  if (showInitialLoading) {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            ref={overlayRef}
            className="absolute inset-0 z-50 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Навигация по библиотеке — загрузка"
          >
            <div
              className={clsx(
                'absolute inset-0 backdrop-blur-sm',
                theme === 'dark' ? 'bg-black/70' : 'bg-black/50',
              )}
            />
            <StarfieldBackground />

            <div className="relative mx-auto flex h-full max-w-5xl flex-col px-6 py-8">
              <div className="mb-4 flex justify-end">
                <OverlayCloseButton onClose={onClose} theme={theme} />
              </div>
              <div className="relative flex-1 min-h-0 overflow-y-auto">
                <div className="pointer-events-auto relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-4 pb-16">
                  <motion.section
                    key="loading"
                    variants={SECTION_VARIANTS}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className={clsx(
                      'rounded-2xl border p-4 shadow-lg backdrop-blur-lg',
                      theme === 'dark'
                        ? 'border-white/10 bg-white/10 shadow-black/20'
                        : 'border-gray-200 bg-white/20 shadow-gray-200/20',
                    )}
                  >
                    <div className="flex items-center justify-center py-8">
                      <div className="flex items-center gap-3">
                        <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-amber-400" />
                        <p
                          className={clsx(
                            'text-sm',
                            theme === 'dark' ? 'text-white/70' : 'text-gray-600',
                          )}
                        >
                          Загружаем каталог библиотеки…
                        </p>
                      </div>
                    </div>
                  </motion.section>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  if (showInitialError) {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            ref={overlayRef}
            className="absolute inset-0 z-50 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Навигация по библиотеке — ошибка"
          >
            <div
              className={clsx(
                'absolute inset-0 backdrop-blur-sm',
                theme === 'dark' ? 'bg-black/70' : 'bg-black/50',
              )}
            />
            <StarfieldBackground />

            <div className="relative mx-auto flex h-full max-w-5xl flex-col px-6 py-8">
              <div className="mb-4 flex justify-end">
                <OverlayCloseButton onClose={onClose} theme={theme} />
              </div>
              <div className="relative flex-1 min-h-0 overflow-y-auto">
                <div className="pointer-events-auto relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-4 pb-16">
                  <motion.section
                    key="error"
                    variants={SECTION_VARIANTS}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className={clsx(
                      'rounded-2xl border p-4 shadow-lg backdrop-blur-lg',
                      theme === 'dark'
                        ? 'border-red-500/40 bg-red-500/10 text-red-200 shadow-black/20'
                        : 'border-red-300 bg-red-50 text-red-700 shadow-red-200/20',
                    )}
                  >
                    <h3 className="text-lg font-semibold">Не удалось загрузить каталог</h3>
                    <p className="mt-2 text-sm opacity-80">{catalogError ?? manifestError}</p>
                    <p className="mt-4 text-xs opacity-60">
                      Проверьте подключение к сети или попробуйте обновить страницу чуть позже.
                    </p>
                  </motion.section>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  if (!open || !catalog) {
    return null;
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={overlayRef}
          className="absolute inset-0 z-50 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Навигация по библиотеке"
        >
          <div
            className={clsx(
              'absolute inset-0 backdrop-blur-sm',
              theme === 'dark' ? 'bg-black/70' : 'bg-black/50',
            )}
          />
          <StarfieldBackground />

          <div className="relative mx-auto flex h-full max-w-6xl flex-col px-6 py-8">
            <div className="mb-4 flex items-center justify-between gap-4">
              <BreadcrumbTrail items={breadcrumbs} theme={theme} variants={ITEM_VARIANTS} />
              <div className="flex items-center gap-3">
                <GlobalSearchBar query={searchQuery} onQueryChange={setSearchQuery} theme={theme} />
                <OverlayCloseButton onClose={onClose} theme={theme} />
              </div>
            </div>

            <div className="flex min-h-0 flex-1 gap-6 overflow-hidden">
              <CategorySidebar
                categories={CATEGORY_STRUCTURE}
                activeCorpus={activeCorpus}
                activeTanakhSection={tanakhSection}
                onSelectCorpus={handleSelectCorpus}
                loadingExtra={loadingExtraCategory}
                theme={theme}
              />

              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                  <CurrentLocationPanel
                    location={currentLocation}
                    nav={locationNav ?? undefined}
                    onNavigate={handleLocationNavigate}
                    theme={theme}
                    variants={SECTION_VARIANTS}
                  />

                  {manifestError && (
                    <div
                      className={clsx(
                        'rounded-2xl border px-3 py-3 text-xs',
                        theme === 'dark'
                          ? 'border-red-500/40 bg-red-500/10 text-red-200'
                          : 'border-red-300 bg-red-50 text-red-700',
                      )}
                    >
                      {manifestError}
                    </div>
                  )}

                  <AnimatePresence initial={false}>
                    {rootSection === 'Tanakh' && (
                      <TanakhSectionPanel
                        collections={tanakhCollections}
                        section={tanakhSection}
                        onSelectBook={handleBookSelect}
                        activeBookTitle={selectedBook?.work.title}
                        loadingSeed={loadingTanakhSeed}
                        theme={theme}
                        variants={SECTION_VARIANTS}
                      />
                    )}
                  </AnimatePresence>

                  <AnimatePresence initial={false}>
                    {selectedBook && (bookData || loadingBook || bookError) && (
                      <motion.section
                        key="book"
                        variants={SECTION_VARIANTS}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className={clsx(
                          'rounded-2xl border p-5 shadow-lg backdrop-blur-xl',
                          theme === 'dark'
                            ? 'border-white/10 bg-white/10 shadow-black/25'
                            : 'border-gray-200 bg-white/20 shadow-gray-200/25',
                        )}
                      >
                        <BookHeader
                          book={selectedBook}
                          activeTab={bookTab}
                          onTabChange={setBookTab}
                          loading={loadingBook}
                          error={bookError}
                          isMishnah={selectedBook.work.categories.includes('Mishnah')}
                          hasParasha={hasParasha}
                          theme={theme}
                        />

                        {loadingBook && (
                          <div
                            className={clsx(
                              'rounded-xl border px-4 py-6 text-sm text-center',
                              theme === 'dark'
                                ? 'border-white/10 bg-white/5 text-white/80'
                                : 'border-gray-200 bg-white text-gray-700',
                            )}
                          >
                            Загружаем структуру книги…
                          </div>
                        )}

                        {!loadingBook && bookError && (
                          <div
                            className={clsx(
                              'rounded-xl border px-4 py-6 text-sm text-center',
                              theme === 'dark'
                                ? 'border-red-400/60 bg-red-500/10 text-red-200'
                                : 'border-red-300 bg-red-50 text-red-700',
                            )}
                          >
                            {bookError}
                          </div>
                        )}

                        {!loadingBook && !bookError && bookData && (
                          <>
                            {bookTab === 'chapters' && 'chapterSizes' in bookData && (
                              <ChapterGrid
                                chapterSizes={bookData.chapterSizes}
                                onSelect={handleChapterSelect}
                                isLoading={loadingBook}
                                activeChapter={activeChapter}
                                theme={theme}
                              />
                            )}

                            {bookTab === 'parasha' && 'parshiot' in bookData && bookData.parshiot.length > 0 && (
                              <ParashaList
                                parshiot={bookData.parshiot}
                                onSelectParasha={handleParashaSelect}
                                onSelectAliyah={handleAliyahSelect}
                                isLoading={loadingBook}
                                theme={theme}
                              />
                            )}

                            {bookTab === 'parasha' && 'parshiot' in bookData && bookData.parshiot.length === 0 && (
                              <div
                                className={clsx(
                                  'rounded-xl border px-4 py-4 text-sm text-center',
                                  theme === 'dark'
                                    ? 'border-white/10 bg-white/5 text-white/70'
                                    : 'border-gray-200 bg-gray-50 text-gray-600',
                                )}
                              >
                                Для этой книги нет структурированных данных по парашам.
                              </div>
                            )}
                          </>
                        )}
                      </motion.section>
                    )}
                  </AnimatePresence>

                  <AnimatePresence initial={false}>
                    {rootSection === 'Mishnah' && mishnahCollections && (
                      <motion.section
                        key="mishnah"
                        variants={SECTION_VARIANTS}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className={clsx(
                          'rounded-2xl border p-4 shadow-lg backdrop-blur-lg',
                          theme === 'dark'
                            ? 'border-white/10 bg-white/10 shadow-black/20'
                            : 'border-gray-200 bg-white/20 shadow-gray-200/20',
                        )}
                      >
                        <h3
                          className={clsx(
                            'mb-3 text-sm font-semibold uppercase tracking-wide',
                            theme === 'dark' ? 'text-amber-200/90' : 'text-amber-700',
                          )}
                        >
                          Разделы Мишны
                        </h3>
                        <MishnahSectionSelector
                          active={mishnahSection}
                          onSelect={handleMishnahSectionChange}
                          theme={theme}
                          variants={ITEM_VARIANTS}
                        />
                        <div className="mt-4 space-y-4">
                          {mishnahSection === 'Zeraim' && (
                            <BookList
                              books={mishnahCollections.zeraim}
                              onSelect={handleBookSelect}
                              activeTitle={selectedBook?.work.title}
                              theme={theme}
                            />
                          )}
                          {mishnahSection === 'Moed' && (
                            <BookList
                              books={mishnahCollections.moed}
                              onSelect={handleBookSelect}
                              activeTitle={selectedBook?.work.title}
                              theme={theme}
                            />
                          )}
                          {mishnahSection === 'Nashim' && (
                            <BookList
                              books={mishnahCollections.nashim}
                              onSelect={handleBookSelect}
                              activeTitle={selectedBook?.work.title}
                              theme={theme}
                            />
                          )}
                          {mishnahSection === 'Nezikin' && (
                            <BookList
                              books={mishnahCollections.nezikin}
                              onSelect={handleBookSelect}
                              activeTitle={selectedBook?.work.title}
                              theme={theme}
                            />
                          )}
                          {mishnahSection === 'Kodashim' && (
                            <BookList
                              books={mishnahCollections.kodashim}
                              onSelect={handleBookSelect}
                              activeTitle={selectedBook?.work.title}
                              theme={theme}
                            />
                          )}
                          {mishnahSection === 'Taharot' && (
                            <BookList
                              books={mishnahCollections.taharot}
                              onSelect={handleBookSelect}
                              activeTitle={selectedBook?.work.title}
                              theme={theme}
                            />
                          )}
                        </div>
                      </motion.section>
                    )}
                  </AnimatePresence>

                  <AnimatePresence initial={false}>
                    {rootSection === 'Talmud' && (
                      <TalmudSectionPanel
                        edition={talmudEdition}
                        sedarim={talmudStructure.map}
                        sederOrder={talmudStructure.order}
                        selectedSeder={talmudSeder}
                        selectedTractate={selectedTractate}
                        onEditionChange={handleTalmudEditionChange}
                        onSelectSeder={handleTalmudSederSelect}
                        onSelectTractate={handleTalmudTractateSelect}
                        onSelectDaf={handleTalmudDafSelect}
                        theme={theme}
                        variants={SECTION_VARIANTS}
                      />
                    )}
                  </AnimatePresence>

                  {rootSection && rootSection !== 'Tanakh' && rootSection !== 'Talmud' && (
                    <ComingSoonPanel sectionName={rootSection} theme={theme} variants={SECTION_VARIANTS} />
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function OverlayCloseButton({
  onClose,
  theme,
}: {
  onClose: () => void;
  theme: 'dark' | 'light' | 'system';
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      className={clsx(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70',
        theme === 'dark'
          ? 'border-white/15 bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
          : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-900',
      )}
    >
      <X className="h-4 w-4" />
      <span className="sr-only">Закрыть навигацию</span>
    </button>
  );
}

function getCorpusLabel(corpusId: string): string {
  const group = CATEGORY_STRUCTURE.find((category) =>
    category.corpora.some((corpus) => corpus.id === corpusId),
  );
  if (!group) {
    return corpusId;
  }
  const corpus = group.corpora.find((entry) => entry.id === corpusId);
  return corpus?.label ?? corpusId;
}

function getMishnahSectionLabel(section: MishnahSection): string {
  switch (section) {
    case 'Zeraim':
      return 'Зераим';
    case 'Moed':
      return 'Моэд';
    case 'Nashim':
      return 'Нашим';
    case 'Nezikin':
      return 'Незикин';
    case 'Kodashim':
      return 'Кодашим';
    case 'Taharot':
      return 'Тахарот';
    default:
      return section;
  }
}

export default FocusNavOverlay;






