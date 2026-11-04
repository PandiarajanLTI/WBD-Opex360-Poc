from contextlib import contextmanager
from app.core.config import Settings
class SnowflakeConnectionFactory:
    def __init__(self, settings: Settings): self.settings = settings
    @contextmanager
    def connection(self):
        import snowflake.connector

        connection = snowflake.connector.connect(account=self.settings.snowflake_account, user=self.settings.snowflake_user, password=self.settings.snowflake_password, warehouse=self.settings.snowflake_warehouse, database=self.settings.snowflake_database, schema=self.settings.snowflake_schema, role=self.settings.snowflake_role or None)
        try: yield connection
        finally: connection.close()
