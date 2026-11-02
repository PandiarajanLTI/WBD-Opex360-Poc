from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    data_repository: str = "mock"
    cors_origins: str = "http://localhost:5173"
    snowflake_account: str = ""
    snowflake_user: str = ""
    snowflake_password: str = ""
    snowflake_warehouse: str = ""
    snowflake_database: str = ""
    snowflake_schema: str = ""
    snowflake_role: str = ""
    snowflake_forecast_table: str = "FORECAST_TEMPLATE"
    snowflake_budget_table: str = "BUDGET_TABLE"
    snowflake_mapping_table: str = "DIMENSION_MAPPING"
    snowflake_summary_table: str = "TEMPLATE_SUMMARY"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
@lru_cache
def get_settings() -> Settings:
    return Settings()
