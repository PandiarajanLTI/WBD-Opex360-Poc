from functools import lru_cache
from pathlib import Path
from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Snowflake is the only runtime repository. Mock data is intentionally disabled.
    data_repository: str = "snowflake"
    cors_origins: str = "http://localhost:5173"

    snowflake_account: str = "QDEFQVK-BF89605"
    snowflake_user: str = "VISHWASWAROOP007"
    snowflake_password: str = "Vishwaswaroop@123"
    snowflake_warehouse: str = "COMPUTE_WH"
    snowflake_database: str = "OPEX360_POC"
    snowflake_schema: str = "FORECAST"
    snowflake_role: str = "ACCOUNTADMIN"

    # Existing physical schema from SampleData_POC.xlsx. No table restructuring.
    snowflake_forecast_table: str = "TEMPLATE"
    snowflake_currency_table: str = "CURRENCYCONVERSION"
    snowflake_cost_center_table: str = "COSTCENTER"
    snowflake_budget_table: str = "BUDGET_HOLDER"

    snowflake_fx_rate_type: str = "Prate"
    snowflake_fx_year: str = "FY26"
    snowflake_pool_size: int = Field(default=8, ge=1, le=32)
    snowflake_login_timeout_seconds: int = Field(default=15, ge=1, le=120)
    snowflake_network_timeout_seconds: int = Field(default=60, ge=5, le=600)
    snowflake_query_timeout_seconds: int = Field(default=60, ge=5, le=600)
    snowflake_query_tag: str = "wbd-opex360-fastapi"
    max_page_size: int = Field(default=1000, ge=1, le=5000)

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
    )

    @field_validator("data_repository")
    @classmethod
    def snowflake_only(cls, value: str) -> str:
        if value.lower() != "snowflake":
            raise ValueError("DATA_REPOSITORY must be 'snowflake'; mock mode is disabled")
        return "snowflake"


@lru_cache
def get_settings() -> Settings:
    return Settings()
