import { useEffect, useMemo, useState } from 'react';

// Pagination mode (unchanged behaviour): select the rows of the current page.
function getPageNodes(api) {
  const pageSize = api.paginationGetPageSize();
  const firstRow = api.paginationGetCurrentPage() * pageSize;
  const lastRow = Math.min(firstRow + pageSize, api.paginationGetRowCount());
  const nodes = [];
  for (let index = firstRow; index < lastRow; index += 1) {
    const node = api.getDisplayedRowAtIndex(index);
    if (node?.data) nodes.push(node);
  }
  return nodes;
}

// Infinite row model has no pages: use every row that is loaded in the grid right now.
function getLoadedNodes(api) {
  const nodes = [];
  api.forEachNode((node) => {
    if (node?.data && !node.rowPinned && !node.data.__INLINE_NEW_ROW) {
      nodes.push(node);
    }
  });
  return nodes;
}

function isPaginated(api) {
  if (typeof api.paginationGetPageSize !== 'function') return false;
  if (typeof api.getGridOption === 'function') {
    return Boolean(api.getGridOption('pagination'));
  }
  return true;
}

function setNodesSelected(api, nodes, selected) {
  // One call = one selectionChanged event, even for tens of thousands of rows.
  if (typeof api.setNodesSelected === 'function') {
    api.setNodesSelected({ nodes, newValue: selected, source: 'selectAllHeader' });
    return;
  }
  nodes.forEach((node) => node.setSelected(selected, false, 'selectAllHeader'));
}

export default function SelectAllRowsHeader({ api }) {
  const [selectionVersion, setSelectionVersion] = useState(0);
  const paginated = isPaginated(api);
  const nodes = useMemo(
    () => (paginated ? getPageNodes(api) : getLoadedNodes(api)),
    [api, paginated, selectionVersion],
  );
  const selectedCount = nodes.filter((node) => node.isSelected()).length;
  useEffect(() => {
    const updateSelection = () => setSelectionVersion((version) => version + 1);
    api.addEventListener('selectionChanged', updateSelection);
    api.addEventListener('paginationChanged', updateSelection);
    api.addEventListener('modelUpdated', updateSelection);
    return () => {
      api.removeEventListener('selectionChanged', updateSelection);
      api.removeEventListener('paginationChanged', updateSelection);
      api.removeEventListener('modelUpdated', updateSelection);
    };
  }, [api]);
  const setCheckboxRef = (checkbox) => {
    if (checkbox) {
      checkbox.indeterminate =
        selectedCount > 0 && selectedCount < nodes.length;
    }
  };
  return (
    <div className="select-all-rows-header">
      <input
        aria-label={paginated ? 'Select all rows on this page' : 'Select all loaded rows'}
        checked={nodes.length > 0 && selectedCount === nodes.length}
        className="select-all-rows-checkbox"
        disabled={!nodes.length}
        onChange={(event) => setNodesSelected(api, nodes, event.target.checked)}
        ref={setCheckboxRef}
        title={paginated ? undefined : `Select all ${nodes.length.toLocaleString()} loaded rows`}
        type="checkbox"
      />
    </div>
  );
}
