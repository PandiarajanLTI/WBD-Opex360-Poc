from typing import Any, Literal
from pydantic import BaseModel, Field

class SortItem(BaseModel):
    colId: str
    sort: Literal["asc", "desc"]

class GridQuery(BaseModel):
    startRow: int = Field(0, ge=0)
    endRow: int = Field(100, gt=0, le=1000)
    sortModel: list[SortItem] = Field(default_factory=list)
    filterModel: dict[str, Any] = Field(default_factory=dict)
    search: str | None = None
    # null/omitted => all 256 Template columns; list => validated projection
    requestedColumns: list[str] | None = None

class GridResponse(BaseModel):
    rows: list[dict[str, Any]]
    totalRowCount: int

class RowsPayload(BaseModel):
    rows: list[dict[str, Any]]
