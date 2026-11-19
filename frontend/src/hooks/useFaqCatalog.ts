import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFaqs } from "../api/chatApi";
import type { FaqListItem } from "../types/chat";

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
}

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
  const [searchQuery, setSearchQueryState] = useState<string>(getInitialSearchQuery);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const setSearchQuery = useCallback((val: string) => {
    setSearchQueryState(val);
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        if (val.trim()) {
          url.searchParams.set("q", val.trim());
        } else {
          url.searchParams.delete("q");
        }
        window.history.replaceState(null, "", `${url.pathname}${url.search}`);
      } catch {
        // Safe fallback if history API is restricted
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchFaqs()
      .then((res) => {
        if (mounted) setItems(res.faqs);
      })
      .catch(() => {
        if (mounted) setItems([]);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const groups = useMemo<FaqCategoryGroup[]>(() => {
    const query = searchQuery.trim().toLowerCase();
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

    return Array.from(map.entries()).map(([category, categoryItems]) => ({
      category,
      items: categoryItems,
    }));
  }, [items, searchQuery]);

  return {
    groups,
    totalCount: items.length,
    searchQuery,
    setSearchQuery,
    isLoading,
  };
}
