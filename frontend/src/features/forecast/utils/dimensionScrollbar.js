const PINNED_VIEWPORTS = [
  '.ag-pinned-left-header',
  '.ag-pinned-left-cols-container',
  '.ag-pinned-left-floating-top',
  '.ag-pinned-left-floating-bottom',
  '.ag-pinned-left-sticky-top',
  '.ag-pinned-left-sticky-bottom',
].join(', ');

// Bound AG Grid's pinned region and use its existing bottom spacer as a
// native scrollbar. There is still just one row model and one paginator.
export function attachDimensionScrollbar(root, api) {
  const scrollbar = root.querySelector('.ag-horizontal-left-spacer');
  if (!scrollbar) return () => {};
  const track = root.ownerDocument.createElement('div');
  track.className = 'forecast-dimension-scroll-track';
  scrollbar.appendChild(track);
  scrollbar.tabIndex = 0;
  scrollbar.setAttribute('aria-label', 'Scroll forecast dimension columns');

  const syncScroll = (source) => {
    const offset = source.scrollLeft;
    [scrollbar, ...root.querySelectorAll(PINNED_VIEWPORTS)].forEach((viewport) => {
      if (viewport.scrollLeft !== offset) viewport.scrollLeft = offset;
    });
  };
  const onScroll = (event) => syncScroll(event.target);
  const viewports = [scrollbar, ...root.querySelectorAll(PINNED_VIEWPORTS)];
  viewports.forEach((viewport) => viewport.addEventListener('scroll', onScroll));

  const refresh = () => {
    const width = api.getDisplayedLeftColumns().reduce(
      (total, column) => total + column.getActualWidth(), 0,
    );
    const viewportWidth = Math.min(width, Math.floor(root.clientWidth * 0.45));
    root.style.setProperty('--forecast-left-width', `${viewportWidth}px`);
    track.style.width = `${width}px`;
    syncScroll(scrollbar);
  };
  const focusColumn = ({ column }) => {
    if (column?.getPinned() !== 'left') return;
    const left = column.getLeft();
    const right = left + column.getActualWidth();
    if (left < scrollbar.scrollLeft) scrollbar.scrollLeft = left;
    else if (right > scrollbar.scrollLeft + scrollbar.clientWidth) {
      scrollbar.scrollLeft = right - scrollbar.clientWidth;
    }
    syncScroll(scrollbar);
  };
  const events = ['displayedColumnsChanged', 'columnResized', 'gridSizeChanged'];
  events.forEach((event) => api.addEventListener(event, refresh));
  api.addEventListener('cellFocused', focusColumn);
  const observer = globalThis.ResizeObserver ? new globalThis.ResizeObserver(refresh) : null;
  observer?.observe(root);
  refresh();
  return () => {
    observer?.disconnect();
    viewports.forEach((viewport) => viewport.removeEventListener('scroll', onScroll));
    if (!api.isDestroyed()) {
      events.forEach((event) => api.removeEventListener(event, refresh));
      api.removeEventListener('cellFocused', focusColumn);
    }
    track.remove();
  };
}