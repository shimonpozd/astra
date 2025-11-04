import type { TanakhSeed } from '../types/sefaria';

export interface CatalogWork {
  title: string;
  categories: string[];
  path: string;
  depth: number;
  sectionNames: string[];
  addressTypes: string[];
  hasAlt?: string[];
  primaryTitles?: {
    en?: string;
    he?: string;
    ru?: string;
  };
  seedShorts?: {
    short_en?: string;
    short_ru?: string;
  };
}

export interface Catalog {
  generatedAt: string;
  works: CatalogWork[];
}

export interface CatalogManifestEntry {
  category: string;
  slug: string;
  workCount: number;
  label?: string;
  description?: string;
}

export interface CatalogManifest {
  generatedAt: string;
  entries: CatalogManifestEntry[];
}

export interface WorkShape {
  type?: string;
  levels?: string[];
  chapters?: number[];
  shape?: unknown;
  [key: string]: unknown;
}

export interface ParashaAliyah {
  ref: string;
  count?: number;
  range?: [string, string];
}

export interface ParashaRecord {
  slug: string;
  sharedTitle: string;
  wholeRef: string;
  wholeCount?: number;
  aliyot: ParashaAliyah[];
}

export interface ParashaData {
  parshiot: ParashaRecord[];
  computedAt?: string;
}

class HttpError extends Error {
  status: number;
  url: string;

  constructor(response: Response) {
    super(`Request to ${response.url} failed with status ${response.status}`);
    this.status = response.status;
    this.url = response.url;
  }
}

const JSON_CACHE = new Map<string, Promise<unknown>>();

function normalizeBasePath(input: string): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) {
    return '';
  }
  const withoutTrailing = trimmed.replace(/\/+$/, '');
  if (/^[a-z]+:\/\//i.test(withoutTrailing)) {
    return withoutTrailing;
  }
  if (withoutTrailing === '/' || withoutTrailing === '') {
    return '';
  }
  if (withoutTrailing.startsWith('/')) {
    return withoutTrailing;
  }
  return `/${withoutTrailing}`;
}

function joinUrl(base: string, relative: string): string {
  const rel = relative.replace(/^\/+/, '');
  if (!base) {
    return `/${rel}`;
  }
  if (/^[a-z]+:\/\//i.test(base)) {
    const withSlash = base.endsWith('/') ? base : `${base}/`;
    return `${withSlash}${rel}`;
  }
  const normalizedBase = base.startsWith('/') ? base : `/${base}`;
  return `${normalizedBase}/${rel}`.replace(/\/{2,}/g, '/');
}

function normalizeWorkPath(workPath: string): string {
  return workPath.trim().replace(/^\/*/, '').replace(/\/+$/, '');
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof HttpError && error.status === 404;
}

async function fetchJson<T>(url: string): Promise<T> {
  const cached = JSON_CACHE.get(url);
  if (cached) {
    return cached as Promise<T>;
  }

  if (typeof fetch !== 'function') {
    throw new Error('Global fetch API is unavailable');
  }

  const request = (async () => {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new HttpError(response);
    }

    return (await response.json()) as T;
  })();

  JSON_CACHE.set(url, request);

  try {
    return await request;
  } catch (error) {
    JSON_CACHE.delete(url);
    throw error;
  }
}

function deriveManifestFromCatalog(catalog: Catalog): CatalogManifest {
  const counts = new Map<string, number>();

  catalog.works.forEach((work) => {
    const categories = Array.isArray(work.categories) && work.categories.length > 0
      ? work.categories
      : ['Uncategorized'];
    const primary = categories[0];
    counts.set(primary, (counts.get(primary) ?? 0) + 1);
  });

  const entries: CatalogManifestEntry[] = Array.from(counts.entries())
    .map(([category, count]) => ({
      category,
      slug: slugify(category),
      workCount: count,
    }))
    .sort((a, b) => a.category.localeCompare(b.category, 'ru'));

  return {
    generatedAt: catalog.generatedAt,
    entries,
  };
}

function filterCatalogByCategory(
  catalog: Catalog,
  categoryName: string | null,
  categorySlug: string,
): Catalog {
  const normalizedSlug = slugify(categorySlug);
  const normalizedCategory = categoryName ? categoryName.toLowerCase() : null;

  const works = catalog.works.filter((work) => {
    const categories = Array.isArray(work.categories) ? work.categories : [];
    if (!categories.length) {
      return false;
    }
    if (
      normalizedCategory &&
      categories.some((category) => category.toLowerCase() === normalizedCategory)
    ) {
      return true;
    }
    return categories.some((category) => slugify(category) === normalizedSlug);
  });

  return {
    generatedAt: catalog.generatedAt,
    works,
  };
}

export async function loadCatalog(basePath = '/sefaria-cache/'): Promise<Catalog> {
  const normalizedBase = normalizeBasePath(basePath);
  const url = joinUrl(normalizedBase, 'catalog.json');
  return fetchJson<Catalog>(url);
}

export async function loadCatalogManifest(
  basePath = '/sefaria-cache/',
): Promise<CatalogManifest> {
  const normalizedBase = normalizeBasePath(basePath);
  const candidates = ['catalog.manifest.json', 'manifest.json'];

  for (const candidate of candidates) {
    const url = joinUrl(normalizedBase, candidate);
    try {
      return await fetchJson<CatalogManifest>(url);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  const catalog = await loadCatalog(normalizedBase);
  return deriveManifestFromCatalog(catalog);
}

export async function loadCatalogCategory(
  slug: string,
  basePath = '/sefaria-cache/',
): Promise<Catalog> {
  const normalizedBase = normalizeBasePath(basePath);
  const normalizedSlug = slugify(slug);
  const candidates = [
    `categories/${slug}.json`,
    `categories/${normalizedSlug}.json`,
    `catalog.${slug}.json`,
    `catalog-${normalizedSlug}.json`,
  ];

  for (const candidate of candidates) {
    const url = joinUrl(normalizedBase, candidate);
    try {
      return await fetchJson<Catalog>(url);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  const manifest = await loadCatalogManifest(normalizedBase).catch(() => null);
  const categoryName =
    manifest?.entries.find(
      (entry) => entry.slug === slug || entry.slug === normalizedSlug,
    )?.category ?? null;

  const catalog = await loadCatalog(normalizedBase);
  return filterCatalogByCategory(catalog, categoryName, normalizedSlug || slug);
}

export async function loadTanakhSeed(
  basePath = '/sefaria-cache/',
): Promise<TanakhSeed> {
  const normalizedBase = normalizeBasePath(basePath);
  const url = joinUrl(normalizedBase, 'seed/tanakh.seed.json');
  return fetchJson<TanakhSeed>(url);
}

export async function loadShape(
  basePath = '/sefaria-cache/',
  workPath: string,
): Promise<WorkShape | null> {
  const normalizedBase = normalizeBasePath(basePath);
  const normalizedWork = normalizeWorkPath(workPath);
  const url = joinUrl(normalizedBase, `${normalizedWork}/shape.json`);
  try {
    return await fetchJson<WorkShape>(url);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function loadParasha(
  basePath = '/sefaria-cache/',
  workPath: string,
): Promise<ParashaData | null> {
  const normalizedBase = normalizeBasePath(basePath);
  const normalizedWork = normalizeWorkPath(workPath);
  const candidates = ['alt.parasha.json', 'parasha.json'];

  for (const candidate of candidates) {
    const url = joinUrl(normalizedBase, `${normalizedWork}/${candidate}`);
    try {
      return await fetchJson<ParashaData>(url);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  return null;
}

