from contextlib import contextmanager
from types import SimpleNamespace

from app.repositories.snowflake_repository import SnowflakeForecastRepository


class RecordingCursor:
    def __init__(self):
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql, params):
        self.calls.append((sql, params))


class RecordingConnection:
    def __init__(self):
        self.recording_cursor = RecordingCursor()
        self.commits = 0

    def cursor(self):
        return self.recording_cursor

    def commit(self):
        self.commits += 1

    def rollback(self):
        raise AssertionError("Unexpected rollback")


class RecordingFactory:
    def __init__(self):
        self.recording_connection = RecordingConnection()

    @contextmanager
    def connection(self):
        yield self.recording_connection


def test_save_batches_new_rows_into_multi_row_insert_statements():
    factory = RecordingFactory()
    repository = SnowflakeForecastRepository(
        SimpleNamespace(snowflake_forecast_table="FORECAST_TABLE"), factory
    )
    rows = [
        {
            "UNIQ_ID": -(index + 1),
            "TEMPLATE_NAME": "Warner Media",
            "VERSION": "10+2",
            "COMPANY_CODE": f"US{index:03}",
            "NOV_FORECAST": index,
        }
        for index in range(205)
    ]

    result = repository.save("Warner Media", rows)

    calls = factory.recording_connection.recording_cursor.calls
    assert result == {"requested": 205, "updated": 0, "inserted": 205}
    assert len(calls) == 2
    assert all(sql.startswith("INSERT INTO FORECAST_TABLE") for sql, _ in calls)
    assert len(calls[0][1]) == 200 * 6
    assert len(calls[1][1]) == 5 * 6
    assert factory.recording_connection.commits == 1
