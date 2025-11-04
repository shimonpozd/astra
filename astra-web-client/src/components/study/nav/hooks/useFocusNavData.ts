import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  loadCatalog,
  loadCatalogCategory,
  loadCatalogManifest,
  loadTanakhSeed,
  type Catalog,
  type CatalogManifest,
  type CatalogManifestEntry,
} from '../../../../lib/sefariaCatalog';
import { debugWarn } from '../../../../utils/debugLogger';
import type { TanakhSeed } from '../../../../types/sefaria';

export interface UseFocusNavDataResult {
  catalog: Catalog | null;
  loadingCatalog: boolean;
  catalogError: string | null;
  manifest: CatalogManifest | null;
  loadingManifest: boolean;
  manifestError: string | null;
  tanakhSeed: TanakhSeed | null;
  loadingTanakhSeed: boolean;
  loadingExtraCategory: string | null;
  isCategoryLoaded: (categoryName: string) => boolean;
  loadExtraCategory: (entry: CatalogManifestEntry) => Promise<void>;
}

export default function useFocusNavData(open: boolean): UseFocusNavDataResult {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [manifest, setManifest] = useState<CatalogManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [tanakhSeed, setTanakhSeed] = useState<TanakhSeed | null>(null);
  const [loadingTanakhSeed, setLoadingTanakhSeed] = useState(false);
  const [loadingExtraCategory, setLoadingExtraCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!open || catalog || loadingCatalog) {
      return;
    }

    let cancelled = false;
    setLoadingCatalog(true);

    loadCatalog()
      .then((result) => {
        if (!cancelled) {
          setCatalog(result);
          setCatalogError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Не удалось загрузить каталог';
          setCatalogError(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingCatalog(false);
        }
      });

    return () => {
      cancelled = true;
      setLoadingCatalog(false);
    };
  }, [open, catalog, loadingCatalog]);

  useEffect(() => {
    if (!open || manifest || loadingManifest) {
      return;
    }

    let cancelled = false;
    setLoadingManifest(true);
    setManifestError(null);

    loadCatalogManifest('/sefaria-cache/')
      .then((data) => {
        if (!cancelled) {
          setManifest(data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Не удалось загрузить манифест каталога';
          setManifestError(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingManifest(false);
        }
      });

    return () => {
      cancelled = true;
      setLoadingManifest(false);
    };
  }, [open, manifest, loadingManifest]);

  useEffect(() => {
    if (!open || tanakhSeed || loadingTanakhSeed) {
      return;
    }

    let cancelled = false;
    setLoadingTanakhSeed(true);

    loadTanakhSeed('/sefaria-cache/')
      .then((seed) => {
        if (!cancelled) {
          setTanakhSeed(seed);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          debugWarn('[useFocusNavData] Failed to load Tanakh seed', err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingTanakhSeed(false);
        }
      });

    return () => {
      cancelled = true;
      setLoadingTanakhSeed(false);
    };
  }, [open, tanakhSeed, loadingTanakhSeed]);

  const loadedCategories = useMemo(() => {
    if (!catalog) return new Set<string>();
    return new Set(catalog.works.map((work) => work.categories[0]));
  }, [catalog]);

  const isCategoryLoaded = useCallback(
    (categoryName: string) => loadedCategories.has(categoryName),
    [loadedCategories],
  );

  const loadExtraCategory = useCallback(
    async (entry: CatalogManifestEntry) => {
      if (loadingExtraCategory || isCategoryLoaded(entry.category)) {
        return;
      }

      setLoadingExtraCategory(entry.slug);
      setManifestError(null);

      try {
        const chunk = await loadCatalogCategory(entry.slug);

        setCatalog((prev) => {
          if (!prev) {
            return prev;
          }

          const existingPaths = new Set(prev.works.map((work) => work.path));
          const additions = chunk.works.filter((work) => !existingPaths.has(work.path));

          if (additions.length === 0) {
            return prev;
          }

          const merged = [...prev.works, ...additions].sort((a, b) =>
            a.title.localeCompare(b.title),
          );
          return { ...prev, works: merged };
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Не удалось загрузить дополнительную категорию';
        setManifestError(message);
      } finally {
        setLoadingExtraCategory(null);
      }
    },
    [isCategoryLoaded, loadingExtraCategory],
  );

  return {
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
  };
}
