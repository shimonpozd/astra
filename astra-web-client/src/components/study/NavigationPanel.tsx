import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Home, MapPin, AlertCircle } from 'lucide-react';

// Import static navigation data
import { TALMUD_BAVLI_TRACTATES, TALMUD_ORDERS } from '../../data/talmud-bavli';
import { TANAKH_BOOKS, TANAKH_SECTIONS } from '../../data/tanakh';
import { SHULCHAN_ARUKH_SECTIONS } from '../../data/shulchan-arukh';
import { parseRefSmart, normalizeRefForAPI } from '../../utils/refUtils';

const normalizeKey = (value: string | undefined): string =>
  (value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const resolveTalmudBook = (name: string): string | null => {
  const target = normalizeKey(name);
  for (const key of Object.keys(TALMUD_BAVLI_TRACTATES)) {
    const info = TALMUD_BAVLI_TRACTATES[key];
    if (
      normalizeKey(key) === target ||
      normalizeKey(info.he_name) === target ||
      normalizeKey(info.ru_name) === target
    ) {
      return key;
    }
  }
  return null;
};

const resolveTanakhBook = (name: string): string | null => {
  const target = normalizeKey(name);
  for (const key of Object.keys(TANAKH_BOOKS)) {
    const info = TANAKH_BOOKS[key];
    if (
      normalizeKey(key) === target ||
      normalizeKey(info.he_name) === target ||
      normalizeKey(info.ru_name) === target
    ) {
      return key;
    }
  }
  return null;
};

interface NavigationPosition {
  corpus: string;
  corpusEn: string;
  section: string;
  book: string;
  heBook: string;
  ruBook: string;
  page?: string;
  segment?: number;
  fullRef: string;
}

interface NavigationPanelProps {
  currentRef?: string;
  onNavigate: (ref: string) => void;
  className?: string;
}

const NavigationPanel: React.FC<NavigationPanelProps> = ({
  currentRef,
  onNavigate,
  className = ""
}) => {
  const [isNavigating, setIsNavigating] = useState(false);
  const [homePosition, setHomePosition] = useState<NavigationPosition | null>(null);
  const [currentPosition, setCurrentPosition] = useState<NavigationPosition | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  
  // Navigation state
  const [selectedCorpus, setSelectedCorpus] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [selectedBook, setSelectedBook] = useState<string>('');
  const [selectedPage, setSelectedPage] = useState<string>('');
  const [selectedSegment, setSelectedSegment] = useState<string>('');

  // Parse current reference into navigation position with error handling
  const parseReference = (ref: string): NavigationPosition | null => {
    if (!ref) return null;

    const parsed = parseRefSmart(ref);
    if (!parsed) return null;

    if (parsed.type === 'talmud') {
      const canonical = resolveTalmudBook(parsed.book) ?? parsed.book;
      const info = TALMUD_BAVLI_TRACTATES[canonical];
      if (info) {
        return {
          corpus: '?????? ???????????',
          corpusEn: 'Talmud Bavli',
          section: info.order,
          book: canonical,
          heBook: info.he_name,
          ruBook: info.ru_name,
          page: `${parsed.daf}${parsed.amud ?? 'a'}`,
          segment: parsed.segment ?? undefined,
          fullRef: ref,
        };
      }
      return {
        corpus: '??????',
        corpusEn: 'Talmud',
        section: '',
        book: canonical,
        heBook: canonical,
        ruBook: canonical,
        page: parsed.daf ? `${parsed.daf}${parsed.amud ?? 'a'}` : undefined,
        segment: parsed.segment ?? undefined,
        fullRef: ref,
      };
    }

    if (parsed.type === 'tanakh') {
      const canonical = resolveTanakhBook(parsed.book) ?? parsed.book;
      const info = TANAKH_BOOKS[canonical];
      if (info) {
        return {
          corpus: '?????',
          corpusEn: 'Tanakh',
          section: info.section,
          book: canonical,
          heBook: info.he_name,
          ruBook: info.ru_name,
          page: parsed.chapter != null ? String(parsed.chapter) : undefined,
          segment: parsed.verse ?? undefined,
          fullRef: ref,
        };
      }
      return {
        corpus: '?????',
        corpusEn: 'Tanakh',
        section: '',
        book: canonical,
        heBook: canonical,
        ruBook: canonical,
        page: parsed.chapter != null ? String(parsed.chapter) : undefined,
        segment: parsed.verse ?? undefined,
        fullRef: ref,
      };
    }

    const fallbackName = parsed.book
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

    return {
      corpus: '???????? ??????',
      corpusEn: 'Other',
      section: '',
      book: fallbackName,
      heBook: fallbackName,
      ruBook: fallbackName,
      page:
        parsed.type === 'talmud'
          ? parsed.daf
            ? `${parsed.daf}${parsed.amud ?? 'a'}`
            : undefined
          : parsed.type === 'tanakh'
          ? parsed.chapter != null
            ? String(parsed.chapter)
            : undefined
          : undefined,
      segment:
        parsed.type === 'talmud'
          ? parsed.segment ?? undefined
          : parsed.type === 'tanakh'
          ? parsed.verse ?? undefined
          : undefined,
      fullRef: ref,
    };
  };

  // Set home position when navigation panel opens
  const setAsHome = () => {
    if (currentPosition) {
      setHomePosition(currentPosition);
      // Store in localStorage for persistence
      localStorage.setItem('study_home_position', JSON.stringify(currentPosition));
    }
  };

  // Navigate to home position
  const navigateToHome = () => {
    if (homePosition) {
      onNavigate(homePosition.fullRef);
      setIsNavigating(false);
    }
  };

  // Load home position from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('study_home_position');
    if (saved) {
      try {
        setHomePosition(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved home position:', e);
      }
    }
  }, []);

  // Update current position when currentRef changes
  useEffect(() => {
    const position = parseReference(currentRef || '');
    setCurrentPosition(position);
    
    // Обработка ошибок парсинга
    if (currentRef && !position) {
      setParseError(`Не удалось распознать ссылку: "${currentRef}"`);
    } else {
      setParseError(null);
    }
    
    // Auto-set as home if no home is set and we have a position
    if (position && !homePosition) {
      setHomePosition(position);
      localStorage.setItem('study_home_position', JSON.stringify(position));
    }
    
    // Update navigation selectors
    if (position) {
      setSelectedCorpus(position.corpus);
      setSelectedSection(position.section);
      setSelectedBook(position.book);
      setSelectedPage(position.page || '');
      setSelectedSegment(position.segment?.toString() || '');
    }
  }, [currentRef, homePosition]);

  // Get tractates for selected order
  const getTractatesForOrder = (orderName: string) => {
    return Object.entries(TALMUD_BAVLI_TRACTATES)
      .filter(([_, info]) => info.order === orderName)
      .map(([name, info]) => ({ name, ...info }));
  };

  // Get books for selected Tanakh section
  const getBooksForSection = (sectionName: string) => {
    return Object.entries(TANAKH_BOOKS)
      .filter(([_, info]) => info.section === sectionName)
      .map(([name, info]) => ({ name, ...info }));
  };

  // Handle corpus change with auto-substitution
  const handleCorpusChange = (corpus: string) => {
    setSelectedCorpus(corpus);
    setSelectedSection('');
    setSelectedBook('');
    setSelectedPage('');
    setSelectedSegment('');
    
    // Автоподстановка первого доступного раздела
    if (corpus === 'Талмуд Вавилонский' && TALMUD_ORDERS.length > 0) {
      setSelectedSection(TALMUD_ORDERS[0].name);
    } else if (corpus === 'Танах' && TANAKH_SECTIONS.length > 0) {
      setSelectedSection(TANAKH_SECTIONS[0].name);
    } else if (corpus === 'Шулхан Арух' && Object.keys(SHULCHAN_ARUKH_SECTIONS).length > 0) {
      setSelectedSection(Object.keys(SHULCHAN_ARUKH_SECTIONS)[0]);
    }
    
    console.log('🔄 NavigationPanel corpus selected:', corpus);
  };

  // Handle section change with auto-substitution
  const handleSectionChange = (section: string) => {
    setSelectedSection(section);
    setSelectedBook('');
    setSelectedPage('');
    setSelectedSegment('');
    
    // Автоподстановка первой доступной книги
    if (selectedCorpus === 'Талмуд Вавилонский') {
      const tractates = getTractatesForOrder(section);
      if (tractates.length > 0) {
        setSelectedBook(tractates[0].name);
      }
    } else if (selectedCorpus === 'Танах') {
      const books = getBooksForSection(section);
      if (books.length > 0) {
        setSelectedBook(books[0].name);
      }
    }
    
    console.log('🔄 NavigationPanel section selected:', section);
  };

  // Handle book change with auto-substitution
  const handleBookChange = (book: string) => {
    setSelectedBook(book);
    setSelectedPage('');
    setSelectedSegment('');
    
    console.log('🔄 NavigationPanel book selected:', book);
  };

  // Автоподстановка страницы после обновления selectedBook
  useEffect(() => {
    if (selectedBook && !selectedPage) {
      const pageOptions = getPageOptions();
      if (pageOptions.length > 0) {
        setSelectedPage(pageOptions[0]);
      }
    }
  }, [selectedBook, selectedPage]);

  // Handle page change with auto-substitution
  const handlePageChange = (page: string) => {
    setSelectedPage(page);
    setSelectedSegment('');
    
    console.log('🔄 NavigationPanel page selected:', page);
  };

  // Автоподстановка сегмента после обновления selectedPage
  useEffect(() => {
    if (selectedPage && !selectedSegment) {
      const segmentOptions = getSegmentOptions();
      if (segmentOptions.length > 0) {
        setSelectedSegment(segmentOptions[0]);
      }
    }
  }, [selectedPage, selectedSegment]);

  // Handle segment change (without automatic navigation)
  const handleSegmentChange = (segment: string) => {
    setSelectedSegment(segment);
    console.log('🔄 NavigationPanel segment selected:', segment);
    // Не вызываем onNavigate автоматически - пользователь должен нажать "Перейти"
  };

  // Manual navigation function with unified ref format
  const handleNavigate = () => {
    console.log('🔄 NavigationPanel handleNavigate called with:', { selectedBook, selectedPage, selectedSegment, selectedCorpus });
    
    if (selectedBook && selectedPage) {
      const isTalmudCorpus =
        selectedCorpus === 'Талмуд Вавилонский' ||
        selectedCorpus === 'Талмуд' ||
        (currentPosition?.corpusEn ?? '').toLowerCase().includes('talmud');

      const raw = selectedSegment
        ? `${selectedBook} ${selectedPage}${isTalmudCorpus ? '.' : ':'}${selectedSegment}`
        : `${selectedBook} ${selectedPage}`;
      const newRef = normalizeRefForAPI(raw);
      console.log('🔄 NavigationPanel navigating to:', newRef);
      console.log('🔄 NavigationPanel onNavigate function exists:', !!onNavigate);
      onNavigate(newRef);
      setIsNavigating(false); // Close navigation panel after successful navigation
    } else {
      console.error('❌ NavigationPanel: Missing selectedBook or selectedPage:', { selectedBook, selectedPage });
    }
  };

  // Клавиатурная навигация
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isNavigating) return;
      
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          if (selectedBook && selectedPage) {
            handleNavigate();
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsNavigating(false);
          break;
        case 'ArrowRight':
          e.preventDefault();
          // Переход к следующему селектору
          if (!selectedCorpus) {
            // Фокус на корпус
          } else if (!selectedSection) {
            // Фокус на раздел
          } else if (!selectedBook) {
            // Фокус на книгу
          } else if (!selectedPage) {
            // Фокус на страницу
          } else if (!selectedSegment) {
            // Фокус на сегмент
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          // Переход к предыдущему селектору
          if (selectedSegment) {
            setSelectedSegment('');
          } else if (selectedPage) {
            setSelectedPage('');
          } else if (selectedBook) {
            setSelectedBook('');
          } else if (selectedSection) {
            setSelectedSection('');
          } else if (selectedCorpus) {
            setSelectedCorpus('');
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isNavigating, selectedCorpus, selectedSection, selectedBook, selectedPage, selectedSegment, handleNavigate]);

  // Generate page options for selected book
  const getPageOptions = () => {
    if (!selectedBook) return [];
    
    if (selectedCorpus === 'Талмуд Вавилонский' && selectedBook in TALMUD_BAVLI_TRACTATES) {
      const info = TALMUD_BAVLI_TRACTATES[selectedBook];
      const [start, end] = info.pages;
      const pages = [];
      
      for (let i = start; i <= end; i++) {
        pages.push(`${i}a`, `${i}b`);
      }
      return pages;
    }
    
    if (selectedCorpus === 'Танах' && selectedBook in TANAKH_BOOKS) {
      const info = TANAKH_BOOKS[selectedBook];
      const chapters = [];
      
      for (let i = 1; i <= info.chapters; i++) {
        chapters.push(i.toString());
      }
      return chapters;
    }
    
    return [];
  };

  // Generate segment options for selected page
  const getSegmentOptions = () => {
    if (!selectedPage) return [];
    
    // Для Талмуда обычно есть отрывки 1-10, но это может варьироваться
    // В реальном приложении это должно приходить от API
    const segments = [];
    for (let i = 1; i <= 10; i++) {
      segments.push(i.toString());
    }
    return segments;
  };

  if (!isNavigating) {
    // Compact view - just breadcrumb and home button
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div 
          className="text-xs text-muted-foreground flex-1 truncate cursor-pointer hover:text-foreground transition-colors"
          onClick={() => setIsNavigating(true)}
        >
          {parseError ? (
            <div className="flex items-center gap-1 text-red-400">
              <AlertCircle className="w-3 h-3" />
              <span className="truncate">{parseError}</span>
            </div>
          ) : currentPosition ? (
            <div className="flex items-center gap-1">
              <span>{currentPosition.corpus}</span>
              <span className="text-muted-foreground">•</span>
              <span>{currentPosition.section}</span>
              <span className="text-muted-foreground">•</span>
              <span>{currentPosition.ruBook}</span>
              {currentPosition.page && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <span>{currentPosition.page}</span>
                </>
              )}
              {currentPosition.segment && (
                <span>:{currentPosition.segment}</span>
              )}
            </div>
          ) : (
            <span>Нажмите для навигации...</span>
          )}
        </div>
        
        {homePosition && (
          <Button
            size="sm"
            variant="ghost"
            onClick={navigateToHome}
            className="h-6 px-2 text-xs"
            title={`Домой: ${homePosition.corpus} → ${homePosition.ruBook} ${homePosition.page || ''}`}
          >
            <Home className="w-3 h-3" />
          </Button>
        )}
      </div>
    );
  }

  // Expanded navigation view
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Corpus selector */}
      <Select value={selectedCorpus} onValueChange={handleCorpusChange}>
        <SelectTrigger className="h-8 text-xs min-w-[120px]">
          <SelectValue placeholder="Корпус" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Талмуд Вавилонский">Талмуд Вавилонский</SelectItem>
          <SelectItem value="Танах">Танах</SelectItem>
          <SelectItem value="Шулхан Арух">Шулхан Арух</SelectItem>
        </SelectContent>
      </Select>

      {/* Section selector */}
      {selectedCorpus && (
        <>
          <span className="text-muted-foreground">•</span>
          <Select value={selectedSection} onValueChange={handleSectionChange}>
            <SelectTrigger className="h-8 text-xs min-w-[100px]">
              <SelectValue placeholder="Раздел" />
            </SelectTrigger>
            <SelectContent>
              {selectedCorpus === 'Талмуд Вавилонский' && 
                TALMUD_ORDERS.map(order => (
                  <SelectItem key={order.name} value={order.name}>
                    {order.ru_name}
                  </SelectItem>
                ))
              }
              {selectedCorpus === 'Танах' && 
                TANAKH_SECTIONS.map(section => (
                  <SelectItem key={section.name} value={section.name}>
                    {section.ru_name}
                  </SelectItem>
                ))
              }
              {selectedCorpus === 'Шулхан Арух' && 
                Object.entries(SHULCHAN_ARUKH_SECTIONS).map(([name, info]) => (
                  <SelectItem key={name} value={name}>
                    {info.ru_name}
                  </SelectItem>
                ))
              }
            </SelectContent>
          </Select>
        </>
      )}

      {/* Book/Tractate selector */}
      {selectedSection && (
        <>
          <span className="text-muted-foreground">•</span>
          <Select value={selectedBook} onValueChange={handleBookChange}>
            <SelectTrigger className="h-8 text-xs min-w-[120px]">
              <SelectValue placeholder="Книга" />
            </SelectTrigger>
            <SelectContent>
              {selectedCorpus === 'Талмуд Вавилонский' && 
                getTractatesForOrder(selectedSection).map(tractate => (
                  <SelectItem key={tractate.name} value={tractate.name}>
                    {tractate.ru_name}
                  </SelectItem>
                ))
              }
              {selectedCorpus === 'Танах' && 
                getBooksForSection(selectedSection).map(book => (
                  <SelectItem key={book.name} value={book.name}>
                    {book.ru_name}
                  </SelectItem>
                ))
              }
            </SelectContent>
          </Select>
        </>
      )}

      {/* Page selector */}
      {selectedBook && (
        <>
          <span className="text-muted-foreground">•</span>
          <Select value={selectedPage} onValueChange={handlePageChange}>
            <SelectTrigger className="h-8 text-xs min-w-[80px]">
              <SelectValue placeholder="Страница" />
            </SelectTrigger>
            <SelectContent>
              {getPageOptions().map(page => (
                <SelectItem key={page} value={page}>
                  {page}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      {/* Segment selector */}
      {selectedPage && (
        <>
          <span className="text-muted-foreground">•</span>
          <Select value={selectedSegment} onValueChange={handleSegmentChange}>
            <SelectTrigger className="h-8 text-xs min-w-[60px]">
              <SelectValue placeholder="Отрывок" />
            </SelectTrigger>
            <SelectContent>
              {getSegmentOptions().map(segment => (
                <SelectItem key={segment} value={segment}>
                  {segment}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1 ml-2">
        {/* Navigate button */}
        {selectedBook && selectedPage ? (
          <Button
            size="sm"
            variant="default"
            onClick={() => {
              console.log('🔄 NavigationPanel: Перейти button clicked!');
              handleNavigate();
            }}
            className="h-6 px-3 text-xs bg-primary hover:bg-primary/90 transition-colors"
            title="Перейти к выбранному месту"
          >
            Перейти
          </Button>
        ) : (
          <div className="h-6 px-3 text-xs text-muted-foreground flex items-center">
            {!selectedBook ? 'Выберите книгу' : !selectedPage ? 'Выберите страницу' : 'Готово'}
          </div>
        )}
        
        {currentPosition && (
          <Button
            size="sm"
            variant="ghost"
            onClick={setAsHome}
            className="h-6 px-2 text-xs"
            title="Установить как домашнюю позицию"
          >
            <MapPin className="w-3 h-3" />
          </Button>
        )}
        
        {homePosition && (
          <Button
            size="sm"
            variant="ghost"
            onClick={navigateToHome}
            className="h-6 px-2 text-xs"
            title="Вернуться домой"
          >
            <Home className="w-3 h-3" />
          </Button>
        )}
        
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsNavigating(false)}
          className="h-6 px-2 text-xs"
        >
          ✕
        </Button>
      </div>
    </div>
  );
};

export default NavigationPanel;



