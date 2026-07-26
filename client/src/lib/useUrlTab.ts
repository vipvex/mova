import { useCallback, useEffect, useMemo } from "react";
import { useLocation } from "wouter";

/**
 * URL-synced tab state for admin/studio surfaces.
 *
 * Conventions:
 * - Path segment is the source of truth: `/base/:tab`
 * - Bare `/base` (or an unknown segment) restores the last tab from localStorage,
 *   then falls back to `defaultTab`, and replace-navigates to the canonical URL
 * - Changing tabs updates the URL (history push) and persists the choice
 *
 * This keeps reloads, shareable links, and back/forward working without ad-hoc state.
 */
export function useUrlTab<T extends string>(opts: {
  basePath: string;
  tabs: readonly T[];
  defaultTab: T;
  storageKey: string;
  /** Map legacy URL segments onto a canonical tab id */
  aliases?: Partial<Record<string, T>>;
}): [T, (tab: T) => void] {
  const [location, navigate] = useLocation();
  const tabSet = useMemo(() => new Set<string>(opts.tabs), [opts.tabs]);

  const resolve = useCallback((seg: string | null | undefined): T | null => {
    if (!seg) return null;
    const aliased = opts.aliases?.[seg];
    if (aliased && tabSet.has(aliased)) return aliased;
    if (tabSet.has(seg)) return seg as T;
    return null;
  }, [opts.aliases, tabSet]);

  const pathTab = useMemo(() => {
    const base = opts.basePath.replace(/\/$/, "");
    if (location === base || location === `${base}/`) return null;
    if (!location.startsWith(`${base}/`)) return null;
    const seg = location.slice(base.length + 1).split(/[?#]/)[0];
    return resolve(seg);
  }, [location, opts.basePath, resolve]);

  const storedTab = useMemo(() => {
    try {
      return resolve(localStorage.getItem(opts.storageKey) || undefined);
    } catch {
      return null;
    }
  }, [opts.storageKey, resolve]);

  const tab: T = pathTab ?? storedTab ?? opts.defaultTab;

  // Canonicalize the URL + remember the choice whenever we're on this surface.
  useEffect(() => {
    const base = opts.basePath.replace(/\/$/, "");
    const onSurface = location === base || location === `${base}/` || location.startsWith(`${base}/`);
    if (!onSurface) return;

    const canonical = `${base}/${tab}`;
    const pathOnly = location.split(/[?#]/)[0];
    if (pathOnly !== canonical) {
      navigate(canonical, { replace: true });
    }
    try { localStorage.setItem(opts.storageKey, tab); } catch { /* ignore */ }
  }, [location, tab, navigate, opts.basePath, opts.storageKey]);

  const setTab = useCallback((next: T) => {
    if (!tabSet.has(next)) return;
    const base = opts.basePath.replace(/\/$/, "");
    navigate(`${base}/${next}`);
    try { localStorage.setItem(opts.storageKey, next); } catch { /* ignore */ }
  }, [navigate, opts.basePath, opts.storageKey, tabSet]);

  return [tab, setTab];
}
