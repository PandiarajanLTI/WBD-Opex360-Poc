from typing import Any, Literal
from pydantic import BaseModel, Field
class SortItem(BaseModel):
    colId: str
    sort: Literal["asc", "desc"]
class GridQuery(BaseModel):
    startRow: int = Field(0, ge=0)
    endRow: int = Field(100, gt=0, le=1000)
    sortModel: list[SortItem] = []
    filterModel: dict[str, Any] = {}
    search: str | None = None
class GridResponse(BaseModel):
    rows: list[dict[str, Any]]
    totalRowCount: int
class RowsPayload(BaseModel):
    rows: list[dict[str, Any]]
