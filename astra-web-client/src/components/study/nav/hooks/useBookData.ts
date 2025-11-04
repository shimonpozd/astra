import { useEffect, useState } from 'react';

import { loadParasha, loadShape } from '../../../../lib/sefariaCatalog';
import type { WorkShape, ParashaData } from '../../../../lib/sefariaCatalog';
import type {
  BookAliyah,
  BookParasha,
  MishnahBookData,
  TanakhBookData,
  TanakhBookEntry,
} from '../types';

function buildParshiot(parashaData: ParashaData | null, chapterSizes: number[]): BookParasha[] {
  if (!parashaData) {
    return [];
  }

  return parashaData.parshiot.map((parasha) => {
    const aliyot = parasha.aliyot
      .map((aliyah, index) => {
        const verses = resolveAliyahVerses(aliyah, chapterSizes);
        if (verses == null) {
          return null;
        }

        return {
          ref: aliyah.ref,
          verses,
          index,
        } satisfies BookAliyah;
      })
      .filter((aliyah): aliyah is BookAliyah => aliyah !== null);

    return {
      slug: parasha.slug,
      sharedTitle: parasha.sharedTitle,
      wholeRef: parasha.ref,
      aliyot,
    };
  });
}

function calculateVersesInRange(
  range: [string, string],
  chapterSizes: number[],
): number | null {
  const [startToken, endToken] = range;
  const start = parseRangeToken(startToken);
  const end = parseRangeToken(endToken, start?.chapter);
  if (!start || !end) {
    return null;
  }

  if (start.chapter > end.chapter) {
    return null;
  }

  let total = 0;
  for (let chapter = start.chapter; chapter <= end.chapter; chapter += 1) {
    const chapterLength = chapterSizes[chapter - 1];
    if (!chapterLength) {
      return null;
    }

    if (chapter === start.chapter) {
      total += Math.max(0, chapterLength - (start.verse - 1));
    } else if (chapter === end.chapter) {
      total += Math.min(chapterLength, end.verse);
    } else {
      total += chapterLength;
    }
  }

  return total;
}

function parseRangeToken(
  token: string,
  defaultChapter?: number,
): { chapter: number; verse: number } | null {
  const parts = token.split(':');
  if (parts.length === 1) {
    if (defaultChapter == null) {
      return null;
    }
    const verse = Number(parts[0]);
    if (!Number.isInteger(verse)) {
      return null;
    }
    return { chapter: defaultChapter, verse };
  }

  const [chapterPart, versePart] = parts;
  const chapter = Number(chapterPart);
  const verse = Number(versePart);
  if (!Number.isInteger(chapter) || !Number.isInteger(verse)) {
    return null;
  }
  return { chapter, verse };
}

function resolveAliyahVerses(
  aliyah: { range?: unknown; count?: unknown; ref?: unknown },
  chapterSizes: number[],
): number | null {
  if (typeof aliyah.count === 'number' && Number.isFinite(aliyah.count)) {
    return aliyah.count;
  }

  if (
    Array.isArray(aliyah.range) &&
    aliyah.range.length === 2 &&
    typeof aliyah.range[0] === 'string' &&
    typeof aliyah.range[1] === 'string'
  ) {
    return calculateVersesInRange(
      [aliyah.range[0], aliyah.range[1]],
      chapterSizes,
    );
  }

  if (typeof aliyah.ref === 'string') {
    const rangeTokens = extractRangeTokensFromRef(aliyah.ref);
    if (rangeTokens) {
      return calculateVersesInRange(rangeTokens, chapterSizes);
    }
  }

  return null;
}

function extractRangeTokensFromRef(ref: string): [string, string] | null {
  const segments = ref.split(' ');
  const rangeSegment = segments.length > 1 ? segments.slice(1).join(' ') : segments[0];
  if (!rangeSegment) {
    return null;
  }

  const [start, end] = rangeSegment.split('-');
  if (!start || !end) {
    return null;
  }

  return [start.trim(), end.trim()];
}

function extractChapters(shapeData: WorkShape | null): number[] {
  if (!shapeData) {
    return [];
  }

  const chaptersField = (shapeData as unknown as { chapters?: unknown }).chapters;
  if (
    Array.isArray(chaptersField) &&
    chaptersField.every((value) => typeof value === 'number' && Number.isFinite(value))
  ) {
    return chaptersField as number[];
  }

  const shape = (shapeData as unknown as { shape?: unknown[] }).shape;
  if (!Array.isArray(shape)) {
    return [];
  }

  return shape.map((leaf) => {
    if (Array.isArray(leaf)) {
      return leaf.length;
    }
    if (typeof leaf === 'number') {
      return leaf;
    }
    return 0;
  });
}

export default function useBookData(book: TanakhBookEntry | null) {
  const [data, setData] = useState<TanakhBookData | MishnahBookData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!book) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    if (book.work.categories.includes('Mishnah')) {
      loadShape('/sefaria-cache/', book.work.path)
        .then((shapeData) => {
          if (cancelled) return;
          const chapterSizes = extractChapters(shapeData);
          setData({ chapterSizes });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : 'Не удалось загрузить структуру книги');
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    } else {
      Promise.all([
        loadShape('/sefaria-cache/', book.work.path),
        loadParasha('/sefaria-cache/', book.work.path),
      ])
        .then(([shapeData, parashaData]) => {
          if (cancelled) return;
          const chapterSizes = extractChapters(shapeData);
          const parshiot = buildParshiot(parashaData, chapterSizes);
          setData({ chapterSizes, parshiot });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : 'Не удалось загрузить структуру книги');
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [book]);

  return {
    data,
    loading,
    error,
  };
}
