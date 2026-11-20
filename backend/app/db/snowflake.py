from contextlib import contextmanager
from queue import Empty, Full, LifoQueue
from threading import Lock
from typing import Iterator
from app.core.config import Settings


class SnowflakeConnectionFactory:
    """Small bounded connection pool for synchronous FastAPI routes.

    Reuses authenticated Snowflake sessions and avoids the previous connect/close cost
    on every page, count, validation and save call.
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self._pool: LifoQueue = LifoQueue(maxsize=settings.snowflake_pool_size)
        self._created = 0
        self._lock = Lock()

    def _new_connection(self):
        if not all(
            (
                self.settings.snowflake_account,
                self.settings.snowflake_user,
                self.settings.snowflake_password,
            )
        ):
            raise RuntimeError(
                "Set SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, and SNOWFLAKE_PASSWORD in backend/.env."
            )

        import snowflake.connector
        return snowflake.connector.connect(
            account=self.settings.snowflake_account,
            user=self.settings.snowflake_user,
            password=self.settings.snowflake_password,
            warehouse=self.settings.snowflake_warehouse,
            database=self.settings.snowflake_database,
            schema=self.settings.snowflake_schema,
            role=self.settings.snowflake_role or None,
            login_timeout=self.settings.snowflake_login_timeout_seconds,
            network_timeout=self.settings.snowflake_network_timeout_seconds,
            client_session_keep_alive=True,
            session_parameters={
                "QUERY_TAG": self.settings.snowflake_query_tag,
                "STATEMENT_TIMEOUT_IN_SECONDS": self.settings.snowflake_query_timeout_seconds,
                "ABORT_DETACHED_QUERY": True,
            },
        )

    def _borrow(self):
        try:
            connection = self._pool.get_nowait()
        except Empty:
            with self._lock:
                if self._created < self.settings.snowflake_pool_size:
                    self._created += 1
                    try:
                        return self._new_connection()
                    except Exception:
                        self._created -= 1
                        raise
            connection = self._pool.get(timeout=self.settings.network_timeout_seconds)

        if connection.is_closed():
            with self._lock:
                self._created -= 1
            return self._borrow()
        return connection

    def _discard(self, connection) -> None:
        try:
            connection.close()
        finally:
            with self._lock:
                self._created = max(0, self._created - 1)

    @contextmanager
    def connection(self) -> Iterator:
        connection = self._borrow()
        broken = False
        try:
            yield connection
        except Exception:
            broken = True
            try:
                connection.rollback()
            except Exception:
                pass
            raise
        finally:
            if broken or connection.is_closed():
                self._discard(connection)
            else:
                try:
                    self._pool.put_nowait(connection)
                except Full:
                    self._discard(connection)

    def close_all(self) -> None:
        while True:
            try:
                self._discard(self._pool.get_nowait())
            except Empty:
                break
