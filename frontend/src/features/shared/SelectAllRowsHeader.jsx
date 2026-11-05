import { useEffect, useMemo, useState } from 'react';

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

export default function SelectAllRowsHeader({ api }) {
  const [selectionVersion, setSelectionVersion] = useState(0);
  const nodes = useMemo(() => getPageNodes(api), [api, selectionVersion]);
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
        aria-label="Select all rows on this page"
        checked={nodes.length > 0 && selectedCount === nodes.length}
        className="select-all-rows-checkbox"
        disabled={!nodes.length}
        onChange={(event) => {
          nodes.forEach((node) =>
            node.setSelected(event.target.checked, false, 'selectAllHeader'),
          );
        }}
        ref={setCheckboxRef}
        type="checkbox"
      />
    </div>
  );
}
