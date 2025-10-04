import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Home, MapPin, ChevronRight } from 'lucide-react';

// Import static navigation data
import { TALMUD_BAVLI_TRACTATES, TALMUD_ORDERS } from '../../data/talmud-bavli';
import { TANAKH_BOOKS, TANAKH_SECTIONS } from '../../data/tanakh';
import { SHULCHAN_ARUKH_SECTIONS } from '../../data/shulchan-arukh';

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
  
  // Navigation state
  const [selectedCorpus, setSelectedCorpus] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [selectedBook, setSelectedBook] = useState<string>('');
  const [selectedPage, setSelectedPage] = useState<string>('');
  const [selectedSegment, setSelectedSegment] = useState<string>('');

  // Parse current reference into navigation position
  const parseReference = (ref: string): NavigationPosition | null => {
    if (!ref) return null;

    // Simple parsing for Talmud references (e.g., "Shabbat 14a:3")
    const parts = ref.split(' ');
    if (parts.length >= 2) {
      const book = parts[0];
      
      if (book in TALMUD_BAVLI_TRACTATES) {
        const tractateInfo = TALMUD_BAVLI_TRACTATES[book];
        const pageMatch = parts[1].match(/(\d+)([ab]?)(?::(\d+))?/);
        
        if (pageMatch) {
          const pageNum = pageMatch[1];
          const amud = pageMatch[2] || 'a';
          const segment = pageMatch[3] ? parseInt(pageMatch[3]) : undefined;
          
          return {
            corpus: 'Талмуд Вавилонский',
            corpusEn: 'Talmud Bavli',
            section: tractateInfo.order,
            book: book,
            heBook: tractateInfo.he_name,
            ruBook: tractateInfo.ru_name,
            page: `${pageNum}${amud}`,
            segment: segment,
            fullRef: ref
          };
        }
      }
      
      if (book in TANAKH_BOOKS) {
        const bookInfo = TANAKH_BOOKS[book];
        const chapterMatch = parts[1].match(/(\d+)(?::(\d+))?/);
        
        if (chapterMatch) {
          const chapter = chapterMatch[1];
          const verse = chapterMatch[2] ? parseInt(chapterMatch[2]) : undefined;
          
          return {
            corpus: 'Танах',
            corpusEn: 'Tanakh', 
            section: bookInfo.section,
            book: book,
            heBook: bookInfo.he_name,
            ruBook: bookInfo.ru_name,
            page: chapter,
            segment: verse,
            fullRef: ref
          };
        }
      }
    }
    
    return null;
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

  // Handle corpus change
  const handleCorpusChange = (corpus: string) => {
    setSelectedCorpus(corpus);
    setSelectedSection('');
    setSelectedBook('');
    setSelectedPage('');
    setSelectedSegment('');
  };

  // Handle section change
  const handleSectionChange = (section: string) => {
    setSelectedSection(section);
    setSelectedBook('');
    setSelectedPage('');
    setSelectedSegment('');
  };

  // Handle book change
  const handleBookChange = (book: string) => {
    setSelectedBook(book);
    setSelectedPage('');
    setSelectedSegment('');
  };

  // Handle page change
  const handlePageChange = (page: string) => {
    setSelectedPage(page);
    setSelectedSegment('');
    
    if (selectedBook && page) {
      let newRef = '';
      
      if (selectedCorpus === 'Талмуд Вавилонский') {
        newRef = `${selectedBook} ${page}`;
      } else if (selectedCorpus === 'Танах') {
        newRef = `${selectedBook} ${page}`;
      }
      
      if (newRef) {
        onNavigate(newRef);
      }
    }
  };

  // Handle segment change and navigate
  const handleSegmentChange = (segment: string) => {
    setSelectedSegment(segment);
    
    if (selectedBook && selectedPage && segment) {
      let newRef = '';
      
      if (selectedCorpus === 'Талмуд Вавилонский') {
        newRef = `${selectedBook} ${selectedPage}:${segment}`;
      } else if (selectedCorpus === 'Танах') {
        newRef = `${selectedBook} ${selectedPage}:${segment}`;
      }
      
      if (newRef) {
        onNavigate(newRef);
      }
    }
  };

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
          {currentPosition ? (
            <div className="flex items-center gap-1">
              <span>{currentPosition.corpus}</span>
              <ChevronRight className="w-3 h-3" />
              <span>{currentPosition.section}</span>
              <ChevronRight className="w-3 h-3" />
              <span>{currentPosition.ruBook}</span>
              {currentPosition.page && (
                <>
                  <ChevronRight className="w-3 h-3" />
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

      <ChevronRight className="w-3 h-3 text-muted-foreground" />

      {/* Section selector */}
      {selectedCorpus && (
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
      )}

      <ChevronRight className="w-3 h-3 text-muted-foreground" />

      {/* Book/Tractate selector */}
      {selectedSection && (
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
      )}

      <ChevronRight className="w-3 h-3 text-muted-foreground" />

      {/* Page selector */}
      {selectedBook && (
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
      )}

      <ChevronRight className="w-3 h-3 text-muted-foreground" />

      {/* Segment selector */}
      {selectedPage && (
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
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1 ml-2">
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


