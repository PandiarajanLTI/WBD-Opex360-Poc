import { useLayoutEffect, useRef, useState } from 'react';

export const GRID_ROW_HEIGHT = 42;
const HEADER_HEIGHT = 46;
const SCROLLBAR_HEIGHT = 18;

export function getViewportGridOptions(height) {
  // A deterministic fallback is needed for hidden containers and DOM-free tests.
  const visibleRows = height > 0
    ? Math.max(1, Math.ceil((height - HEADER_HEIGHT - SCROLLBAR_HEIGHT) / GRID_ROW_HEIGHT))
    : 20;
  return {
    // Only the rendered buffer scales with the viewport; all data is local.
    rowBuffer: Math.min(50, Math.max(5, Math.ceil(visibleRows / 2))),
    rowHeight: GRID_ROW_HEIGHT,
    headerHeight: HEADER_HEIGHT,
  };
}

export function useViewportGrid() {
  const viewportRef = useRef(null);
  const [gridOptions, setGridOptions] = useState(null);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const measure = () => {
      const measured = getViewportGridOptions(element.clientHeight);
      setGridOptions((current) => {
        if (!current) return measured;
        if (current.rowBuffer === measured.rowBuffer) return current;
        // AG Grid adjusts rendered rows to the new viewport.
        return { ...current, rowBuffer: measured.rowBuffer };
      });
    };
    measure();
    const observer = globalThis.ResizeObserver
      ? new globalThis.ResizeObserver(measure)
      : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, []);

  return { viewportRef, gridOptions };
}