// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { attachDimensionScrollbar } from './dimensionScrollbar';

afterEach(() => { document.body.replaceChildren(); });

it('scrolls pinned headers and rows independently of the center and cleans up', () => {
  const root = document.createElement('div');
  root.innerHTML = '<div class="ag-pinned-left-header"></div><div class="ag-pinned-left-cols-container"></div><div class="ag-horizontal-left-spacer"></div><div class="ag-body-horizontal-scroll-viewport"></div>';
  document.body.appendChild(root);
  Object.defineProperty(root, 'clientWidth', { value: 1000 });
  const listeners = new Map();
  const api = {
    getDisplayedLeftColumns: () => [{ getActualWidth: () => 2000 }],
    addEventListener: vi.fn((name, callback) => listeners.set(name, callback)),
    removeEventListener: vi.fn(),
    isDestroyed: () => false,
  };
  const dispose = attachDimensionScrollbar(root, api);
  const scrollbar = root.querySelector('.ag-horizontal-left-spacer');
  const center = root.querySelector('.ag-body-horizontal-scroll-viewport');
  center.scrollLeft = 300;
  expect(root.style.getPropertyValue('--forecast-left-width')).toBe('450px');
  expect(scrollbar.firstChild.style.width).toBe('2000px');
  scrollbar.scrollLeft = 800;
  scrollbar.dispatchEvent(new window.Event('scroll'));
  expect(root.querySelector('.ag-pinned-left-header').scrollLeft).toBe(800);
  expect(root.querySelector('.ag-pinned-left-cols-container').scrollLeft).toBe(800);
  expect(center.scrollLeft).toBe(300);
  listeners.get('cellFocused')({ column: {
    getPinned: () => 'left', getLeft: () => 0, getActualWidth: () => 100,
  } });
  expect(scrollbar.scrollLeft).toBe(0);
  dispose();
  expect(scrollbar.children).toHaveLength(0);
  expect(api.removeEventListener).toHaveBeenCalledTimes(4);
});