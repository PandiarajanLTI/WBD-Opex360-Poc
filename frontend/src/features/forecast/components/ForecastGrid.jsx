import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { attachDimensionScrollbar } from '../utils/dimensionScrollbar';

export default function ForecastGrid({ dimensionScroll = true, onGridReady, ...props }) {
  const rootRef = useRef(null);
  const [api, setApi] = useState(null);
  useEffect(() => {
    if (api && dimensionScroll) return attachDimensionScrollbar(rootRef.current, api);
  }, [api, dimensionScroll]);

  return (
    <div ref={rootRef} className={dimensionScroll ? 'forecast-unified-grid forecast-dimension-scroll' : 'forecast-unified-grid'}>
      <AgGridReact {...props}
        alwaysShowHorizontalScroll
        processUnpinnedColumns={() => []}
        onGridReady={(event) => {
          setApi(event.api);
          onGridReady?.(event);
        }}
      />
    </div>
  );
}