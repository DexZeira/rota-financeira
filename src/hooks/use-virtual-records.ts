import { useLayoutEffect, useState } from 'react';
import type { Row } from '../model';

export function virtualWindow(heights: number[], scrollTop: number, viewport = 480) {
  const offsets = [0];
  for (const height of heights) offsets.push(offsets[offsets.length - 1] + height);
  let first = 0;
  while (first < heights.length && offsets[first + 1] < Math.max(0, scrollTop - 48)) first++;
  let end = first;
  while (end < heights.length && offsets[end] < scrollTop + viewport) end++;
  const start = Math.max(0, first - 5);
  end = Math.min(heights.length, end + 5);
  return { start, end, offsets };
}

export function useVirtualRecords(rows: Row[], ref: React.RefObject<HTMLDivElement | null>) {
  const [sizes, setSizes] = useState(new Map<string, number>());
  const [scroll, setScroll] = useState(0);
  const [all, setAll] = useState(false);
  const [focused, setFocused] = useState<number>();
  const enabled = rows.length > 200 && !all;
  const window = virtualWindow(rows.map((row) => sizes.get(row.id) ?? 64), scroll);
  const start = enabled ? Math.min(window.start, focused ?? window.start) : 0;
  const end = enabled ? Math.min(rows.length, Math.max(window.end, focused === undefined ? 0 : focused + 1)) : rows.length;
  useLayoutEffect(() => {
    if (!enabled || !ref.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const measured = new Map<string, number>();
      for (const entry of entries) {
        const key = (entry.target as HTMLElement).dataset.recordId;
        const height = entry.target.getBoundingClientRect().height;
        if (key && height > 0) measured.set(key, height);
      }
      setSizes((previous) => {
        const changed = [...measured].some(([key, height]) => Math.abs((previous.get(key) ?? 64) - height) > 0.5);
        return changed ? new Map([...previous, ...measured]) : previous;
      });
    });
    ref.current.querySelectorAll('[data-record-id]').forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [enabled, rows, start, end, ref]);
  return { enabled, all, setAll, setScroll, setFocused, start,
    rows: rows.slice(start, end), top: window.offsets[start],
    bottom: window.offsets[rows.length] - window.offsets[end] };
}
