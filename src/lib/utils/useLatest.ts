'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * A ref that always holds the most recent value.
 *
 * Used where a long-lived callback (a rAF loop, a timer, a subscription) needs
 * the current props without being torn down and rebuilt on every render.
 * Assigning during render would be a side effect in the render phase, so the
 * write happens in an effect instead.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
