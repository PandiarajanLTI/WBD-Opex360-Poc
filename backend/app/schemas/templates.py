from pydantic import BaseModel, Field


class TemplateCreatePayload(BaseModel):
    templateName: str = Field(min_length=1, max_length=120)
    section: str = Field(default="Forecast", min_length=1, max_length=80)
    version: str = Field(default="10+2", min_length=1, max_length=40)
    status: str = Field(default="Working", min_length=1, max_length=40)
    currentForecast: float = Field(default=0, ge=0)
    priorForecast: float = Field(default=0, ge=0)
    variance: float = 0


class TemplateUploadPayload(BaseModel):
    rows: list[TemplateCreatePayload] = Field(min_length=1, max_length=500)
