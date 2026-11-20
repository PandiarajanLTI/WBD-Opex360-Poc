from functools import lru_cache
from app.core.config import get_settings
from app.db.snowflake import SnowflakeConnectionFactory
from app.repositories.snowflake_repository import SnowflakeForecastRepository
from app.services.forecast_service import ForecastService


@lru_cache
def get_connection_factory() -> SnowflakeConnectionFactory:
    return SnowflakeConnectionFactory(get_settings())


@lru_cache
def get_repository() -> SnowflakeForecastRepository:
    settings = get_settings()
    return SnowflakeForecastRepository(settings, get_connection_factory())


def get_forecast_service() -> ForecastService:
    return ForecastService(get_repository())
