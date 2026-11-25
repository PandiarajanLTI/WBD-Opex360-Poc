"""Bulk update all: PATCH /api/templates/{template_name}/rows/bulk-update (one UPDATE, no row download).

Rows without a usable CURRENCY / PRATE FX rate cannot get a PRATE value. They are skipped and
reported; they never block the rows that can be updated.
"""
import re
import sqlite3
from contextlib import contextmanager
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.dependencies import get_repository
from app.api.routes import router
from app.repositories.bulk_update import build_bulk_update, summarize_skipped
from app.repositories.snowflake_repository import SnowflakeForecastRepository
from app.schemas.bulk import BulkFieldUpdate

SETTINGS = SimpleNamespace(
    snowflake_forecast_table="TEMPLATE",
    snowflake_currency_table="CURRENCYCONVERSION",
    snowflake_fx_rate_type="PRATE",
    snowflake_fx_year=2026,
)


# ---------------------------------------------------------------- fake Snowflake connection
class FakeCursor:
    def __init__(self, db):
        self.db, self.rowcount, self._rows = db, -1, []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.db.executed.append((sql, params or {}))
        step = self.db.script.pop(0) if self.db.script else {}
        self._rows, self.rowcount = step.get("rows", []), step.get("rowcount", -1)
        if "error" in step:
            raise step["error"]

    def fetchall(self):
        return self._rows


class FakeDb:
    def __init__(self, *script):
        self.script, self.executed, self.commits, self.rollbacks = list(script), [], 0, 0

    @contextmanager
    def connection(self):
        db = self

        class Connection:
            def cursor(self):
                return FakeCursor(db)

            def commit(self):
                db.commits += 1

            def rollback(self):
                db.rollbacks += 1

        yield Connection()


def repo(db):
    return SnowflakeForecastRepository(SETTINGS, db)


# ---------------------------------------------------------------- request model
@pytest.mark.parametrize(
    "payload",
    [
        {"field": "NOV_FORECAST", "value": 125},
        {"field": "DEC_FORECAST", "value": 12.5},
        {"field": "DEC_FORECAST", "value": -3},
        {"field": "NOTES", "value": "Reviewed by FP&A"},
        {"field": "NOTES", "value": ""},
    ],
)
def test_valid_payloads_are_accepted(payload):
    assert BulkFieldUpdate.model_validate(payload).field == payload["field"]


@pytest.mark.parametrize(
    "payload",
    [
        {"field": "UPDATED_TS", "value": 1},
        {"field": "JAN_FORECAST", "value": 1},
        {"field": "NOV_FORECAST", "value": "125"},
        {"field": "NOV_FORECAST", "value": True},
        {"field": "NOV_FORECAST", "value": None},
        {"field": "NOTES", "value": 5},
        {"field": "NOTES", "value": None},
        {"field": "NOV_FORECAST"},
        {"value": 1},
        {"field": "NOV_FORECAST", "value": 1, "filterModel": {}},
    ],
)
def test_invalid_payloads_are_rejected(payload):
    with pytest.raises(ValidationError):
        BulkFieldUpdate.model_validate(payload)


# ---------------------------------------------------------------- SQL
def build(field, value):
    return build_bulk_update("TEMPLATE", "CURRENCYCONVERSION", "Warner Media", field, value, "PRATE", 2026)


@pytest.mark.parametrize("field", ["NOV_FORECAST", "DEC_FORECAST"])
def test_forecast_update_is_one_statement_that_also_sets_prate_and_audit_columns(field):
    built = build(field, 125)
    sql = built.update_sql
    assert sql.startswith(f"UPDATE TEMPLATE t SET {field}=") and sql.count("UPDATE ") == 1
    assert f"{field}=%(value)s" in sql
    assert f"{field}_PRATE=%(value)s*fx.FX_RATES" in sql
    assert "UPDATED_TS=CURRENT_TIMESTAMP()" in sql
    assert "UPDATED_BY='OPEX360_API'" in sql and "USER_ACTION='UPDATE'" in sql
    assert "t.TEMPLATE_NAME=%(template_name)s" in sql
    assert "FROM (SELECT UPPER(TRIM(CURRENCY)) CURRENCY,MAX(FX_RATES) FX_RATES FROM CURRENCYCONVERSION" in sql
    assert "CURREP=%(rate_type)s AND YEARS=%(rate_year)s" in sql
    assert built.update_params == {
        "value": Decimal("125"),
        "template_name": "Warner Media",
        "rate_type": "PRATE",
        "rate_year": 2026,
    }


def test_skipped_row_queries_use_the_same_fx_join_and_never_modify_data():
    built = build("NOV_FORECAST", 1)
    for sql in (built.skipped_sql, built.sample_sql):
        assert sql.startswith("SELECT") and "UPDATE" not in sql
        assert "LEFT JOIN" in sql and "fx.CURRENCY IS NULL" in sql
        assert "t.TEMPLATE_NAME=%(template_name)s" in sql
    assert "SUM(COUNT(*)) OVER () TOTAL" in built.skipped_sql and "LIMIT 6" in built.skipped_sql
    assert "t.UNIQ_ID" in built.sample_sql and "LIMIT 5" in built.sample_sql
    assert built.skipped_params == {"template_name": "Warner Media", "rate_type": "PRATE", "rate_year": 2026}


def test_other_month_columns_are_not_touched():
    sql = build("NOV_FORECAST", 1).update_sql
    assert "DEC_FORECAST" not in sql and "NOTES" not in sql


def test_float_values_keep_their_decimal_text():
    assert build("DEC_FORECAST", 0.1).update_params["value"] == Decimal("0.1")


def test_notes_update_updates_every_row_and_needs_no_fx_lookup():
    built = build("NOTES", "Reviewed")
    assert built.skipped_sql is None and built.sample_sql is None
    assert "FX_RATES" not in built.update_sql and "CURRENCYCONVERSION" not in built.update_sql
    assert "NOTES=%(value)s" in built.update_sql and "UPDATED_TS=CURRENT_TIMESTAMP()" in built.update_sql
    assert built.update_params == {"value": "Reviewed", "template_name": "Warner Media"}


def test_values_are_never_written_into_the_sql_text():
    hostile = "x'; DROP TABLE TEMPLATE; --"
    built = build("NOTES", hostile)
    assert "DROP" not in built.update_sql and built.update_params["value"] == hostile
    assert "Warner Media" not in build("NOV_FORECAST", 1).update_sql


def test_unknown_fields_are_refused_even_if_the_schema_is_bypassed():
    with pytest.raises(ValueError, match="Unsupported bulk update field"):
        build("FY_WORKING_FORECAST", 1)
    with pytest.raises(ValueError):
        build("NOV_FORECAST; DROP TABLE X", 1)


def test_summarize_skipped_wording():
    assert summarize_skipped([]) == (0, [])
    assert summarize_skipped([("", 1, 1)]) == (1, ["1 row(s) have no CURRENCY"])
    total, reasons = summarize_skipped([("GBP", 120, 123), ("", 3, 123)])
    assert total == 123
    assert reasons == [
        "120 row(s) use currency GBP, which has no PRATE FX rate",
        "3 row(s) have no CURRENCY",
    ]
    many = [(f"C{i}", 1, 6) for i in range(6)]
    assert summarize_skipped(many)[1][-1] == "more rows use other currencies without a PRATE FX rate"
    assert len(summarize_skipped(many)[1]) == 6


# ---------------------------------------------------------------- repository
def test_one_row_without_currency_no_longer_blocks_the_update():
    # the reported failure: 1 row with no CURRENCY in a 100,222 row template
    db = FakeDb(
        {"rows": [("", 1, 1)]},  # skipped summary
        {"rows": [(555,)]},  # which rows
        {"rowcount": 100221},  # the UPDATE
    )
    result = repo(db).bulk_update_field("Warner Media", "NOV_FORECAST", 125)
    assert result == {
        "updated": 100221,
        "skipped": 1,
        "skippedReasons": ["1 row(s) have no CURRENCY"],
        "skippedIds": [555],
    }
    assert len(db.executed) == 3 and db.executed[2][0].startswith("UPDATE TEMPLATE t SET NOV_FORECAST")
    assert (db.commits, db.rollbacks) == (1, 0)


def test_all_rows_priced_runs_check_and_update_only_and_commits_once():
    db = FakeDb({"rows": []}, {"rowcount": 100222})
    result = repo(db).bulk_update_field("Warner Media", "NOV_FORECAST", 125)
    assert result == {"updated": 100222, "skipped": 0, "skippedReasons": [], "skippedIds": []}
    assert len(db.executed) == 2  # skipped-summary + ONE update, regardless of the row count
    assert db.executed[1][1]["value"] == Decimal("125")
    assert (db.commits, db.rollbacks) == (1, 0)


def test_notes_bulk_update_is_a_single_statement_for_every_row():
    db = FakeDb({"rowcount": 42})
    assert repo(db).bulk_update_field("Warner Media", "NOTES", "Reviewed") == {
        "updated": 42, "skipped": 0, "skippedReasons": [], "skippedIds": [],
    }
    assert len(db.executed) == 1 and (db.commits, db.rollbacks) == (1, 0)


def test_if_no_row_can_be_priced_nothing_changes_and_the_reason_is_raised():
    db = FakeDb({"rows": [("GBP", 3, 3)]}, {"rows": [(1,), (2,), (3,)]}, {"rowcount": 0})
    with pytest.raises(ValueError, match=r"None of the 3 record\(s\) could be updated: 3 row\(s\) use currency GBP"):
        repo(db).bulk_update_field("Warner Media", "DEC_FORECAST", 5)
    assert (db.commits, db.rollbacks) == (0, 1)


def test_database_error_is_rolled_back_and_raised():
    db = FakeDb({"rows": []}, {"error": RuntimeError("warehouse suspended")})
    with pytest.raises(RuntimeError, match="warehouse suspended"):
        repo(db).bulk_update_field("Warner Media", "NOV_FORECAST", 5)
    assert (db.commits, db.rollbacks) == (0, 1)


def test_unknown_row_count_is_reported_as_none_and_does_not_fail():
    db = FakeDb({"rows": [("", 1, 1)]}, {"rows": [(9,)]}, {"rowcount": -1})
    assert repo(db).bulk_update_field("T", "NOV_FORECAST", 1)["updated"] is None
    assert db.commits == 1


def test_empty_template_updates_zero_rows_and_is_not_an_error():
    result = repo(FakeDb({"rows": []}, {"rowcount": 0})).bulk_update_field("Missing", "NOV_FORECAST", 1)
    assert result["updated"] == 0 and result["skipped"] == 0


# ---------------------------------------------------------------- the generated SQL on a real SQL engine
# SQLite (3.33+) understands UPDATE ... FROM. Only the placeholders, CURRENT_TIMESTAMP() and the
# `AS` before the table alias are translated, so this checks the logic of the statements (which rows change, PRATE maths, scoping).
# It is not a Snowflake run.
pytestmark_sqlite = pytest.mark.skipif(
    sqlite3.sqlite_version_info < (3, 33, 0), reason="needs SQLite 3.33+ for UPDATE ... FROM"
)


def _sqlite_translate(sql, params):
    sql = sql.replace("CURRENT_TIMESTAMP()", "CURRENT_TIMESTAMP")
    sql = re.sub(r"^UPDATE (\w+) (\w+) SET", r"UPDATE \1 AS \2 SET", sql)  # SQLite wants AS; Snowflake does not
    names = re.findall(r"%\((\w+)\)s", sql)
    sql = re.sub(r"%\((\w+)\)s", r":\1", sql)
    return sql, {n: (float(params[n]) if isinstance(params[n], Decimal) else params[n]) for n in set(names)}


@pytest.fixture
def sqlite_db():
    db = sqlite3.connect(":memory:")
    db.executescript(
        """
        CREATE TABLE TEMPLATE (UNIQ_ID INTEGER, TEMPLATE_NAME TEXT, CURRENCY TEXT, NOTES TEXT,
          NOV_FORECAST REAL, NOV_FORECAST_PRATE REAL, DEC_FORECAST REAL, DEC_FORECAST_PRATE REAL,
          UPDATED_TS TEXT, UPDATED_BY TEXT, USER_ACTION TEXT);
        CREATE TABLE CURRENCYCONVERSION (CURRENCY TEXT, CURREP TEXT, YEARS INTEGER, FX_RATES REAL);
        INSERT INTO CURRENCYCONVERSION VALUES
          ('USD','PRATE',2026,1.0),('EUR','PRATE',2026,1.1),('eur','PRATE',2026,1.2),
          ('GBP','ACTUAL',2026,9.9),('GBP','PRATE',2025,9.9);
        INSERT INTO TEMPLATE (UNIQ_ID,TEMPLATE_NAME,CURRENCY,NOV_FORECAST,NOV_FORECAST_PRATE) VALUES
          (1,'Warner Media','USD',1,1),
          (2,'Warner Media',' usd ',1,1),
          (3,'Warner Media','EUR',1,1),
          (4,'Warner Media',NULL,1,1),
          (5,'Warner Media','',1,1),
          (6,'Warner Media','GBP',1,1),
          (7,'Other Template','USD',1,1),
          (8,'Other Template',NULL,1,1);
        """
    )
    yield db
    db.close()


def _run(db, built):
    sql, params = _sqlite_translate(built.update_sql, built.update_params)
    count = db.execute(sql, params).rowcount
    return count


@pytestmark_sqlite
def test_sql_updates_every_priced_row_skips_the_rest_and_leaves_other_templates_alone(sqlite_db):
    built = build("NOV_FORECAST", 100)
    skipped_sql, skipped_params = _sqlite_translate(built.skipped_sql, built.skipped_params)
    groups = sqlite_db.execute(skipped_sql, skipped_params).fetchall()
    total, reasons = summarize_skipped(groups)
    assert total == 3  # NULL + '' + GBP (no PRATE rate for 2026)
    assert sorted(reasons) == sorted(
        ["2 row(s) have no CURRENCY", "1 row(s) use currency GBP, which has no PRATE FX rate"]
    )
    sample_sql, sample_params = _sqlite_translate(built.sample_sql, built.skipped_params)
    assert [r[0] for r in sqlite_db.execute(sample_sql, sample_params).fetchall()] == [4, 5, 6]

    assert _run(sqlite_db, built) == 3  # UNIQ_ID 1, 2, 3 - and not the 3 skipped rows

    rows = {r[0]: r[1:] for r in sqlite_db.execute(
        "SELECT UNIQ_ID,NOV_FORECAST,NOV_FORECAST_PRATE,UPDATED_BY,USER_ACTION FROM TEMPLATE")}
    assert rows[1] == (100, 100.0, "OPEX360_API", "UPDATE")  # USD  x 1.0
    assert rows[2] == (100, 100.0, "OPEX360_API", "UPDATE")  # ' usd ' is trimmed and upper-cased
    assert rows[3][:2] == (100, pytest.approx(120.0)) and rows[3][2] == "OPEX360_API"  # EUR: MAX(1.1, 1.2) per upper-cased currency, like save
    for skipped_id in (4, 5, 6):  # forecast AND prate untouched, so they stay consistent
        assert rows[skipped_id] == (1, 1.0, None, None)
    assert rows[7] == (1, 1.0, None, None) and rows[8] == (1, 1.0, None, None)  # another template


@pytestmark_sqlite
def test_sql_dec_forecast_only_changes_dec_columns(sqlite_db):
    assert _run(sqlite_db, build("DEC_FORECAST", 7)) == 3
    row = sqlite_db.execute(
        "SELECT NOV_FORECAST,NOV_FORECAST_PRATE,DEC_FORECAST,DEC_FORECAST_PRATE FROM TEMPLATE WHERE UNIQ_ID=3"
    ).fetchone()
    assert row == (1, 1.0, 7, pytest.approx(8.4))  # 7 x MAX(1.1, 1.2)


@pytestmark_sqlite
def test_sql_notes_update_reaches_rows_without_a_currency_too(sqlite_db):
    assert _run(sqlite_db, build("NOTES", "Reviewed")) == 6  # all of 'Warner Media', priced or not
    notes = {r[0]: r[1] for r in sqlite_db.execute("SELECT UNIQ_ID,NOTES FROM TEMPLATE")}
    assert all(notes[i] == "Reviewed" for i in range(1, 7)) and notes[7] is None and notes[8] is None


@pytestmark_sqlite
def test_sql_unknown_template_changes_nothing(sqlite_db):
    built = build_bulk_update("TEMPLATE", "CURRENCYCONVERSION", "Nope", "NOV_FORECAST", 5, "PRATE", 2026)
    assert _run(sqlite_db, built) == 0


# ---------------------------------------------------------------- HTTP
class StubRepository:
    def __init__(self, result=None, error=None):
        self.result = result or {"updated": 7, "skipped": 0, "skippedReasons": [], "skippedIds": []}
        self.error, self.calls = error, []

    def bulk_update_field(self, template_name, field, value):
        self.calls.append((template_name, field, value))
        if self.error:
            raise self.error
        return self.result


def client_for(stub):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_repository] = lambda: stub
    return TestClient(app)


def test_patch_route_updates_in_one_call_and_returns_the_count():
    stub = StubRepository(
        {"updated": 100222, "skipped": 0, "skippedReasons": [], "skippedIds": []}
    )
    response = client_for(stub).patch(
        "/api/templates/Warner%20Media/rows/bulk-update", json={"field": "NOV_FORECAST", "value": 125}
    )
    assert response.status_code == 200
    body = response.json()
    assert (body["template"], body["field"], body["updated"], body["skipped"]) == (
        "Warner Media", "NOV_FORECAST", 100222, 0,
    )
    assert body["message"] == "Updated NOV_FORECAST on 100222 row(s)." and "elapsedMs" in body
    assert stub.calls == [("Warner Media", "NOV_FORECAST", 125)]


def test_patch_route_reports_skipped_rows_instead_of_failing():
    stub = StubRepository(
        {"updated": 100221, "skipped": 1, "skippedReasons": ["1 row(s) have no CURRENCY"], "skippedIds": [555]}
    )
    response = client_for(stub).patch(
        "/api/templates/Warner%20Media/rows/bulk-update", json={"field": "NOV_FORECAST", "value": 125}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["updated"] == 100221 and body["skipped"] == 1 and body["skippedIds"] == [555]
    assert body["skippedReasons"] == ["1 row(s) have no CURRENCY"]
    assert body["message"] == (
        "Updated NOV_FORECAST on 100221 row(s). Skipped 1 row(s) without a usable CURRENCY / PRATE FX rate."
    )


def test_post_is_not_allowed_on_the_bulk_route():
    response = client_for(StubRepository()).post(
        "/api/templates/T/rows/bulk-update", json={"field": "NOV_FORECAST", "value": 1}
    )
    assert response.status_code == 405


@pytest.mark.parametrize(
    "content",
    [
        '{"field": "UPDATED_TS", "value": 1}',
        '{"field": "NOV_FORECAST", "value": "abc"}',
        '{"field": "NOV_FORECAST", "value": 1, "extra": true}',
        "{}",
    ],
)
def test_invalid_requests_return_422_and_never_reach_the_repository(content):
    stub = StubRepository()
    response = client_for(stub).patch(
        "/api/templates/T/rows/bulk-update", content=content, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422 and stub.calls == []


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity"])
@pytest.mark.parametrize("field", ["NOV_FORECAST", "DEC_FORECAST"])
def test_non_finite_numbers_get_a_422_not_a_500(field, literal):
    stub = StubRepository()
    response = client_for(stub).patch(
        "/api/templates/T/rows/bulk-update",
        content='{"field": "%s", "value": %s}' % (field, literal),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422 and stub.calls == []
    assert response.json()["detail"] == f"{field} must be a finite number"


def test_nothing_updatable_is_a_readable_422_message():
    message = "None of the 3 record(s) could be updated: 3 row(s) use currency GBP, which has no PRATE FX rate. No records were changed."
    response = client_for(StubRepository(error=ValueError(message))).patch(
        "/api/templates/T/rows/bulk-update", json={"field": "DEC_FORECAST", "value": 1}
    )
    assert response.status_code == 422 and response.json()["detail"] == message


def test_existing_save_route_is_still_registered():
    paths = {(method, route.path) for route in router.routes for method in route.methods}
    assert ("POST", "/api/templates/{template_name}/rows/save") in paths
    assert ("PATCH", "/api/budget/bulk-update") in paths
    assert ("PATCH", "/api/templates/{template_name}/rows/bulk-update") in paths
