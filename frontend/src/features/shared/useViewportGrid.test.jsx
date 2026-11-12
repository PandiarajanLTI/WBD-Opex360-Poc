// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { useCallback } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getViewportGridOptions, useViewportGrid } from './useViewportGrid';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('viewport grid sizing', () => {
it('sizes only the render buffer from viewport height', () => {
  expect(getViewportGridOptions(484)).toEqual({
    rowBuffer: 5, rowHeight: 42, headerHeight: 46,
  });
  expect(getViewportGridOptions(904)).toEqual({
    rowBuffer: 10, rowHeight: 42, headerHeight: 46,
  });
  expect(getViewportGridOptions(0).cacheBlockSize).toBeUndefined();
  expect(getViewportGridOptions(0).rowBuffer).toBe(10);
  expect(getViewportGridOptions(100000).rowBuffer).toBe(50);
});

it('measures before mounting the grid and updates the render buffer on resize', () => {
  let resize;
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  function Probe() {
    const { viewportRef, gridOptions } = useViewportGrid();
    const measureRef = useCallback((element) => {
      if (element && !viewportRef.current) {
        Object.defineProperty(element, 'clientHeight', { configurable: true, value: 484 });
      }
      viewportRef.current = element;
    }, [viewportRef]);
    return <div ref={measureRef} data-testid="viewport">{gridOptions && JSON.stringify(gridOptions)}</div>;
  }
  const { unmount } = render(<Probe />);
  const viewport = screen.getByTestId('viewport');
  expect(JSON.parse(viewport.textContent).rowBuffer).toBe(5);
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 904 });
  act(() => resize());
  const resized = JSON.parse(viewport.textContent);
  expect(resized.cacheBlockSize).toBeUndefined();
  expect(resized.rowBuffer).toBe(10);
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
});