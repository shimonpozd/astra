import type { TanakhBookEntry, TanakhSection } from '../types';

export function buildTanakhBreadcrumbs(
  section: TanakhSection,
  book: TanakhBookEntry | null,
  chapter: number | undefined,
): string[] {
  const crumbs = ['Танах', getTanakhSectionLabel(section)];
  if (book) {
    crumbs.push(book.seed.title_ru ?? book.seed.indexTitle ?? book.work.title);
  }
  if (chapter != null) {
    crumbs.push(`Глава ${chapter}`);
  }
  return crumbs;
}

export function getTanakhSectionLabel(section: TanakhSection): string {
  switch (section) {
    case 'Torah':
      return 'Тора';
    case 'Neviim':
      return 'Пророки';
    case 'Ketuvim':
      return 'Писания';
    default:
      return section;
  }
}

export function resolveTanakhSection(entry: TanakhBookEntry): TanakhSection {
  if (entry.work.categories.includes('Torah')) {
    return 'Torah';
  }
  if (entry.work.categories.includes('Prophets') || entry.work.categories.includes('Neviim')) {
    return 'Neviim';
  }
  return 'Ketuvim';
}
