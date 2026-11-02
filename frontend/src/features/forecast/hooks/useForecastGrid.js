import { useCallback, useEffect, useRef, useState } from 'react';
import { forecastService } from '../services/forecastService';
export function useForecastGrid(templateName) {
  const [state, setState] = useState({
    rows: [],
    totalRowCount: 0,
    isLoading: true,
    error: '',
  });
  const [dirtyRows, setDirtyRows] = useState(new Map());
  const requestRef = useRef(0);
  const loadRows = useCallback(
    async (
      request = { startRow: 0, endRow: 100, sortModel: [], filterModel: {} },
    ) => {
      const requestId = ++requestRef.current;
      setState((current) => ({ ...current, isLoading: true, error: '' }));
      try {
        const result = await forecastService.queryRows(templateName, request);
        if (requestId === requestRef.current)
          setState({ ...result, isLoading: false, error: '' });
      } catch (error) {
        if (requestId === requestRef.current)
          setState((current) => ({
            ...current,
            isLoading: false,
            error: error.message,
          }));
      }
    },
    [templateName],
  );
  useEffect(() => {
    loadRows();
  }, [loadRows]);
  const markDirty = useCallback(
    (row) => setDirtyRows((current) => new Map(current).set(row.UNIQ_ID, row)),
    [],
  );
  const clearDirty = useCallback(() => setDirtyRows(new Map()), []);
  return {
    ...state,
    dirtyRows: [...dirtyRows.values()],
    loadRows,
    markDirty,
    clearDirty,
    setState,
  };
}
