import type { CatalogWork } from '../../../lib/sefariaCatalog';
import type { TanakhSeedBook } from '../../../types/sefaria';

export type RootSection = 'Tanakh' | 'Mishnah' | 'Talmud' | 'Halakha';

export type TanakhSection = 'Torah' | 'Neviim' | 'Ketuvim';

export type MishnahSection =
  | 'Zeraim'
  | 'Moed'
  | 'Nashim'
  | 'Nezikin'
  | 'Kodashim'
  | 'Taharot';

export type BookTab = 'chapters' | 'parasha';

export interface CorpusCategory {
  id: string;
  label: string;
  icon: string;
  corpora: Array<{
    id: string;
    label: string;
    children?: Array<{
      id: string;
      label: string;
      section?: TanakhSection;
    }>;
  }>;
  defaultExpanded?: boolean;
}

export interface BookAliyah {
  ref: string;
  verses: number | null;
  index: number;
}

export interface BookParasha {
  slug: string;
  sharedTitle: string;
  wholeRef: string;
  aliyot: BookAliyah[];
}

export interface TanakhBookData {
  chapterSizes: number[];
  parshiot: BookParasha[];
}

export interface MishnahBookData {
  chapterSizes: number[];
}

export interface TanakhBookEntry {
  seed: TanakhSeedBook;
  work: CatalogWork;
}

export type CurrentLocation =
  | {
      type: 'tanakh';
      book: TanakhBookEntry;
      chapter: number;
      verse?: number;
      ref: string;
    }
  | {
      type: 'talmud';
      tractate: string;
      daf: string;
      edition: TalmudEdition;
      ref: string;
    };

export interface TanakhCollections {
  torah: TanakhBookEntry[];
  neviim: TanakhBookEntry[];
  ketuvim: TanakhBookEntry[];
}

export interface MishnahCollections {
  zeraim: TanakhBookEntry[];
  moed: TanakhBookEntry[];
  nashim: TanakhBookEntry[];
  nezikin: TanakhBookEntry[];
  kodashim: TanakhBookEntry[];
  taharot: TanakhBookEntry[];
}

export type TalmudEdition = 'Bavli' | 'Yerushalmi';

export type TalmudSeder =
  | 'Zeraim'
  | 'Moed'
  | 'Nashim'
  | 'Nezikin'
  | 'Kodashim'
  | 'Tahorot';
