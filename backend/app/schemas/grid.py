from typing import Any,Literal
from pydantic import BaseModel,Field,model_validator
class SortItem(BaseModel):
    colId:str
    sort:Literal["asc","desc"]
class GridQuery(BaseModel):
    startRow:int=Field(0,ge=0)
    endRow:int=Field(100,gt=0)
    sortModel:list[SortItem]=Field(default_factory=list)
    filterModel:dict[str,Any]=Field(default_factory=dict)
    search:str|None=None
    requestedColumns:list[str]|None=None
    @model_validator(mode="after")
    def page_size(self):
        if self.endRow<=self.startRow:raise ValueError("endRow must be greater than startRow")
        if self.endRow-self.startRow>1000:raise ValueError("Maximum page size is 1000 rows")
        return self
class GridResponse(BaseModel):
    rows:list[dict[str,Any]]
    totalRowCount:int
class RowsPayload(BaseModel):
    rows:list[dict[str,Any]]
