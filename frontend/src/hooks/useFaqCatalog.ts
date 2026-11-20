import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFaqs } from "../api/chatApi";
import type { FaqListItem } from "../types/chat";
import { useDebouncedValue } from "./useDebouncedValue";

export interface FaqCategoryGroup {
  category: string;
  items: FaqListItem[];
}

export interface UseFaqCatalogResult {
  groups: FaqCategoryGroup[];
  totalCount: number;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

const CATEGORY_ORDER: Record<string, number> = {
  "Profil & Akademik Prodi TI": 0,
  "Praktikum & Laboratorium": 1,
  "Magang / PKL": 2,
  "Layanan & Tugas Akhir": 3,
};

function getInitialSearchQuery(): string {
  if (typeof window === "undefined") return "";
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("q") ?? "";
  } catch {
    return "";
  }
}

export function useFaqCatalog(): UseFaqCatalogResult {
  const [items, setItems] = useState<FaqListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>(getInitialSearchQuery);
  const debouncedQuery = useDebouncedValue(searchQuery, 200);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (debouncedQuery.trim()) {
        url.searchParams.set("q", debouncedQuery.trim());
      } else {
        url.searchParams.delete("q");
      }
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    } catch {
      // Safe fallback if history API is restricted
    }
  }, [debouncedQuery]);

  const retry = useCallback(() => {
    setReloadTick((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError(null);

    fetchFaqs()
      .then((res) => {
        if (mounted) {
          setItems(res.faqs);
          setError(null);
        }
      })
      .catch((err) => {
        if (mounted) {
          setItems([]);
          setError(
            err instanceof Error
              ? err.message
              : "Gagal memuat daftar topik FAQ dari server."
          );
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [reloadTick]);

  const groups = useMemo<FaqCategoryGroup[]>(() => {
    const query = debouncedQuery.trim().toLowerCase();
    const filtered = query
      ? items.filter(
          (item) =>
            item.question.toLowerCase().includes(query) ||
            item.category.toLowerCase().includes(query) ||
            item.source.toLowerCase().includes(query)
        )
      : items;

    const map = new Map<string, FaqListItem[]>();
    for (const faq of filtered) {
      const bucket = map.get(faq.category);
      if (bucket) {
        bucket.push(faq);
      } else {
        map.set(faq.category, [faq]);
      }
    }

    return Array.from(map.entries())
      .map(([category, categoryItems]) => ({
        category,
        items: categoryItems,
      }))
      .sort((a, b) => {
        const orderA = CATEGORY_ORDER[a.category] ?? 99;
        const orderB = CATEGORY_ORDER[b.category] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.category.localeCompare(b.category);
      });
  }, [items, debouncedQuery]);

  return {
    groups,
    totalCount: items.length,
    searchQuery,
    setSearchQuery,
    isLoading,
    error,
    retry,
  };
}
