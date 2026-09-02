import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Centralized LocalStorage-backed state hook.
 * Reads once on mount, writes on every change, and tolerates
 * corrupted/missing data by falling back to the provided default.
 */
export function useLocalStorage<T>(key: string, defaultValue: T) {
  const isFirstRender = useRef(true);
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      // Ensure first-run seed data is persisted immediately.
      try {
        if (window.localStorage.getItem(key) === null) {
          window.localStorage.setItem(key, JSON.stringify(value));
        }
      } catch {
        /* ignore quota / privacy errors */
      }
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / privacy errors */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  const reset = useCallback(() => setValue(defaultValue), [defaultValue]);

  return [value, setValue, reset] as const;
}
