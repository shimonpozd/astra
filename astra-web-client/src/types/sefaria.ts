export interface TanakhSeedBook {
  slug: string;
  indexTitle: string;
  short_en?: string;
  short_ru?: string;
  title_he?: string;
  title_ru?: string;
}

export interface TanakhSeedSection {
  subCategory: string;
  display: string;
  books: TanakhSeedBook[];
}

export interface TanakhSeed {
  category: string;
  children: TanakhSeedSection[];
}

