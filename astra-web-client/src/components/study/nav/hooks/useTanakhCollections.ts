import { useMemo } from 'react';

import type { Catalog, CatalogWork } from '../../../../lib/sefariaCatalog';
import type { TanakhSeed, TanakhSeedBook } from '../../../../types/sefaria';
import type {
  MishnahCollections,
  TanakhBookEntry,
  TanakhCollections,
} from '../types';

export interface UseTanakhCollectionsResult {
  tanakhCollections: TanakhCollections | null;
  mishnahCollections: MishnahCollections | null;
  tanakhEntries: TanakhBookEntry[];
}

function mergeSeed(seedBook: TanakhSeedBook, work: CatalogWork): TanakhSeedBook {
  return {
    ...seedBook,
    short_en: seedBook.short_en ?? work.seedShorts?.short_en ?? '',
    short_ru: seedBook.short_ru ?? work.seedShorts?.short_ru ?? '',
    title_he: seedBook.title_he ?? work.primaryTitles?.he,
    title_ru: seedBook.title_ru ?? seedBook.indexTitle ?? work.title,
  };
}

function slugFromWork(work: CatalogWork): string | null {
  if (!work.path) {
    return null;
  }
  const segments = work.path.split('/').filter(Boolean);
  if (!segments.length) {
    return null;
  }
  return segments[segments.length - 1].toLowerCase().replace(/_/g, '-');
}

function toEntries(catalog: Catalog, mainCategory: string, subCategory: string): TanakhBookEntry[] {
  const matches = catalog.works.filter(
    (work) =>
      work.categories.includes(mainCategory) && work.categories.includes(subCategory),
  );
  return matches.map((work) => ({
    seed: {
      slug: slugFromWork(work) ?? work.title.toLowerCase().replace(/\s+/g, '-'),
      indexTitle: work.title,
      short_en: work.seedShorts?.short_en ?? '',
      short_ru: work.seedShorts?.short_ru ?? '',
    },
    work,
  }));
}

function determineTanakhSection(work: CatalogWork): keyof TanakhCollections | null {
  if (!work.path) {
    return null;
  }

  const segments = work.path.split('/').filter(Boolean);
  if (segments.length !== 4 || segments[0] !== 'works' || segments[1] !== 'Tanakh') {
    return null;
  }

  const categories = work.categories.map((category) => category.toLowerCase());

  if (categories.some((category) => category === 'torah')) {
    return 'torah';
  }
  if (
    categories.some(
      (category) => category === 'prophets' || category === 'neviim' || category === 'nevi\'im',
    )
  ) {
    return 'neviim';
  }
  if (
    categories.some(
      (category) => category === 'writings' || category === 'ketuvim' || category === 'ketuv\'im',
    )
  ) {
    return 'ketuvim';
  }
  return null;
}

function createEntryFromWork(work: CatalogWork): TanakhBookEntry {
  return {
    seed: {
      slug: slugFromWork(work) ?? work.title.toLowerCase().replace(/\s+/g, '-'),
      indexTitle: work.title,
      short_en: work.seedShorts?.short_en ?? '',
      short_ru: work.seedShorts?.short_ru ?? '',
      title_he: work.primaryTitles?.he,
      title_ru: work.seedShorts?.short_ru ?? work.title,
    },
    work,
  };
}

export default function useTanakhCollections(
  catalog: Catalog | null,
  tanakhSeed: TanakhSeed | null,
): UseTanakhCollectionsResult {
  return useMemo<UseTanakhCollectionsResult>(() => {
    if (!catalog) {
      return {
        tanakhCollections: null,
        mishnahCollections: null,
        tanakhEntries: [],
      };
    }

    const worksBySlug = new Map<string, CatalogWork>();
    catalog.works.forEach((work) => {
      const slug = slugFromWork(work);
      if (slug && !worksBySlug.has(slug)) {
        worksBySlug.set(slug, work);
      }
    });

    const tanakhCollections: TanakhCollections | null = tanakhSeed
      ? (() => {
          const sectionMap: TanakhCollections = {
            torah: [],
            neviim: [],
            ketuvim: [],
          };

          tanakhSeed.children.forEach((group) => {
            const key = group.subCategory.toLowerCase();
            const target = sectionMap[key as keyof TanakhCollections];
            if (!target) {
              return;
            }

            group.books.forEach((book) => {
              const normalizedSlug = book.slug.toLowerCase();
              const work =
                worksBySlug.get(normalizedSlug) ??
                catalog.works.find(
                  (candidate) =>
                    candidate.title.toLowerCase() === book.indexTitle.toLowerCase(),
                );

              if (!work) {
                return;
              }

              target.push({
                seed: mergeSeed(book, work),
                work,
              });
            });
          });

          return sectionMap;
        })()
      : null;

    const fallbackTanakhCollections: TanakhCollections = {
      torah: [],
      neviim: [],
      ketuvim: [],
    };

    catalog.works.forEach((work) => {
      const sectionKey = determineTanakhSection(work);
      if (!sectionKey) {
        return;
      }
      fallbackTanakhCollections[sectionKey].push(createEntryFromWork(work));
    });

    const hasFallbackData =
      fallbackTanakhCollections.torah.length > 0 ||
      fallbackTanakhCollections.neviim.length > 0 ||
      fallbackTanakhCollections.ketuvim.length > 0;

    if (hasFallbackData) {
      (Object.keys(fallbackTanakhCollections) as Array<keyof TanakhCollections>).forEach(
        (key) => {
          fallbackTanakhCollections[key].sort((a, b) =>
            a.work.title.localeCompare(b.work.title, 'ru'),
          );
        },
      );
    }

    const mishnahCollections: MishnahCollections | null = catalog
      ? {
          zeraim: toEntries(catalog, 'Mishnah', 'Zeraim'),
          moed: toEntries(catalog, 'Mishnah', 'Moed'),
          nashim: toEntries(catalog, 'Mishnah', 'Nashim'),
          nezikin: toEntries(catalog, 'Mishnah', 'Nezikin'),
          kodashim: toEntries(catalog, 'Mishnah', 'Kodashim'),
          taharot: toEntries(catalog, 'Mishnah', 'Taharot'),
        }
      : null;

    const effectiveCollections =
      tanakhCollections ?? (hasFallbackData ? fallbackTanakhCollections : null);

    const tanakhEntries = effectiveCollections
      ? [
          ...effectiveCollections.torah,
          ...effectiveCollections.neviim,
          ...effectiveCollections.ketuvim,
        ]
      : [];

    return {
      tanakhCollections: effectiveCollections,
      mishnahCollections,
      tanakhEntries,
    };
  }, [catalog, tanakhSeed]);
}
