from functools import lru_cache
from app.core.config import get_settings
from app.db.snowflake import SnowflakeConnectionFactory
from app.repositories.mock import MockForecastRepository
from app.repositories.snowflake_repository import SnowflakeForecastRepository
from app.services.forecast_service import ForecastService
@lru_cache
def get_repository():
    settings = get_settings()
    return SnowflakeForecastRepository(settings, SnowflakeConnectionFactory(settings)) if settings.data_repository == "snowflake" else MockForecastRepository()
def get_forecast_service() -> ForecastService: return ForecastService(get_repository())
