from copy import deepcopy
from unittest.mock import Mock

import pytest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.dependencies import get_repository
from app.core.config import Settings
from app.main import app
from app.repositories.mock import MockForecastRepository
from app.repositories.query_builder import API_COLUMNS, build_grid_query, select_expression
from app.repositories.snowflake_repository import SnowflakeForecastRepository
from app.schemas.grid import GridQuery


@pytest.fixture
def repository():
    repo = MockForecastRepository()
    repo.rows = [repo._row(i, "Full Dataset") for i in range(1205, 0, -1)]
    repo.rows.append(repo._row(2000, "Other Template"))
    return repo


@pytest.fixture
def client(monkeypatch, repository):
    monkeypatch.setitem(app.dependency_overrides, get_repository, lambda: repository)
    # Do not enter the application lifespan or establish Snowflake connections.
    return TestClient(app)


def build_query(request=None, *, paginate=True):
    return build_grid_query(
        "FORECAST_TABLE", "FX_TABLE", "Full Dataset' OR 1=1 --",
        request or GridQuery(), "Prate", "FY26", paginate=paginate,
    )


@pytest.mark.parametrize("paginate", [False, True])
def test_full_forecast_sql_selects_all_api_columns_and_binds_template_and_fx(paginate):
    built = build_query(paginate=paginate)
    assert all(select_expression(column) in built.sql for column in API_COLUMNS)
    assert "LEFT JOIN" in built.sql
    assert "FROM FX_TABLE" in built.sql
    assert "UPPER(TRIM(t.CURRENCY))=UPPER(TRIM(fx.CURRENCY))" in built.sql
    assert "t.TEMPLATE_NAME=%(template_name)s" in built.sql
    assert "OR 1=1" not in built.sql
    assert built.sql.endswith("ORDER BY UNIQ_ID ASC")
    assert built.params == {
        "template_name": "Full Dataset' OR 1=1 --",
        "rate_type": "Prate", "rate_year": "FY26",
    }
    for token in ("LIMIT", "OFFSET", "COUNT(", "__TOTAL_COUNT"):
        assert token not in built.sql.upper()


def test_pagination_defaults_preserve_sql_and_bound_parameters():
    built = build_grid_query(
        "FORECAST_TABLE", "FX_TABLE", "Full Dataset",
        GridQuery(startRow=25, endRow=75), "Prate", "FY26",
    )
    assert "COUNT(*) OVER() AS __TOTAL_COUNT" in built.sql
    assert built.sql.endswith("LIMIT %(limit)s OFFSET %(offset)s")
    assert built.params == {
        "template_name": "Full Dataset", "rate_type": "Prate",
        "rate_year": "FY26", "limit": 50, "offset": 25,
    }


def test_full_sql_preserves_filters_sort_and_projection_when_requested():
    request = GridQuery(
        startRow=10, endRow=20, requestedColumns=["NOV_FORECAST", "DROP TABLE"],
        sortModel=[{"colId": "NOV_FORECAST", "sort": "desc"}],
        filterModel={"COMPANY_CODE": {"filterType": "text", "type": "equals", "filter": "US01"}},
    )
    built = build_query(request, paginate=False)
    assert "t.COMPANY_CODE = %(f_0_0)s" in built.sql
    assert built.params["f_0_0"] == "US01"
    assert built.sql.endswith("ORDER BY NOV_FORECAST DESC")
    assert "t.UNIQ_ID AS UNIQ_ID" in built.sql
    assert "t.TEMPLATE_NAME AS TEMPLATE_NAME" in built.sql
    assert "DROP TABLE" not in built.sql
    assert "limit" not in built.params
    assert "offset" not in built.params


def test_mock_full_forecast_exceeds_page_cap_is_scoped_sorted_and_deep_copied(repository):
    repository.rows[0]["NESTED"] = {"values": [1]}
    rows, total = repository.query_all("Full Dataset")
    assert total == len(rows) == 1205
    assert [row["UNIQ_ID"] for row in rows] == list(range(1, 1206))
    assert all(row["TEMPLATE_NAME"] == "Full Dataset" for row in rows)
    rows[-1]["NESTED"]["values"].append(2)
    rows[0]["NOTES"] = "Changed"
    assert repository.rows[0]["NESTED"] == {"values": [1]}
    assert repository.query_all("Full Dataset")[0][0]["NOTES"] == ""
    assert repository.query_all("Missing") == ([], 0)
    page, count = repository.query("Full Dataset", GridQuery(startRow=1000, endRow=1010))
    assert len(page) == 10
    assert count == 1205


def test_mock_budget_all_reuses_generated_rows_and_saved_overrides(repository):
    repository.budget_save([{"COSTCENTER": "C001", "BUDGET_HOLDER": "Jane"}])
    rows, total = repository.budget_all()
    assert total == len(rows) == 100
    assert rows[0]["BUDGET_HOLDER"] == "Jane"
    rows[0]["BUDGET_HOLDER"] = "Changed"
    assert repository.budget_all()[0][0]["BUDGET_HOLDER"] == "Jane"
    assert repository.budget_query(GridQuery(startRow=0, endRow=5))[0] == repository.budget_all()[0][:5]


def test_mock_budget_all_does_not_truncate_large_source(monkeypatch, repository):
    source = [{"COSTCENTER": f"C{i:05}", "NESTED": [i]} for i in range(1205, 0, -1)]
    monkeypatch.setattr(repository, "_budget_rows", lambda: source)
    rows, total = repository.budget_all()
    assert total == len(rows) == 1205
    assert rows[0]["COSTCENTER"] == "C00001"
    assert rows[-1]["COSTCENTER"] == "C01205"
    rows[-1]["NESTED"].append(0)
    assert source[0]["NESTED"] == [1205]
    assert len(repository.budget_query(GridQuery(startRow=0, endRow=10))[0]) == 10
    monkeypatch.setattr(repository, "_budget_rows", lambda: [])
    assert repository.budget_all() == ([], 0)


@pytest.mark.parametrize("count", [0, 1205])
def test_snowflake_full_forecast_uses_unpaginated_query_and_len(count):
    repo = SnowflakeForecastRepository(Settings(_env_file=None), Mock())
    rows = [{"UNIQ_ID": i, "TEMPLATE_NAME": "Full Dataset"} for i in range(count)]
    repo._fetch = Mock(return_value=deepcopy(rows))
    assert repo.query_all("Full Dataset") == (rows, count)
    repo._fetch.assert_called_once()
    sql, params = repo._fetch.call_args.args
    assert "t.TEMPLATE_NAME=%(template_name)s" in sql
    assert params["template_name"] == "Full Dataset"
    assert sql.endswith("ORDER BY UNIQ_ID ASC")
    for token in ("LIMIT", "OFFSET", "COUNT("):
        assert token not in sql.upper()


@pytest.mark.parametrize("count", [0, 1205])
def test_snowflake_budget_all_selects_every_record_without_count_or_limit(count):
    settings = Settings(_env_file=None)
    repo = SnowflakeForecastRepository(settings, Mock())
    rows = [{"COSTCENTER": f"C{i:05}"} for i in range(count)]
    repo._fetch = Mock(return_value=deepcopy(rows))
    assert repo.budget_all() == (rows, count)
    repo._fetch.assert_called_once_with(
        f"SELECT * FROM {settings.snowflake_budget_table} ORDER BY COSTCENTER", {},
    )


def test_snowflake_paginated_repositories_still_bind_page_parameters():
    repo = SnowflakeForecastRepository(Settings(_env_file=None), Mock())
    repo._fetch = Mock(return_value=[{"UNIQ_ID": 1, "__TOTAL_COUNT": 1205}])
    assert repo.query("Full Dataset", GridQuery(startRow=10, endRow=20)) == ([{"UNIQ_ID": 1}], 1205)
    sql, params = repo._fetch.call_args.args
    assert "COUNT(*) OVER()" in sql
    assert "LIMIT" in sql
    assert "OFFSET" in sql
    assert params["limit"] == 10
    assert params["offset"] == 10
    repo._fetch.return_value = [{"COSTCENTER": "C001", "__TOTAL_COUNT": 1205}]
    assert repo.budget_query(GridQuery(startRow=10, endRow=20)) == ([{"COSTCENTER": "C001"}], 1205)
    sql, params = repo._fetch.call_args.args
    assert "COUNT(*) OVER()" in sql
    assert "LIMIT" in sql
    assert "OFFSET" in sql
    assert params == {"l": 10, "o": 10}


def test_forecast_endpoint_returns_entire_template_in_one_response(client):
    response = client.get("/api/templates/Full%20Dataset/rows")
    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"rows", "totalRowCount"}
    assert payload["totalRowCount"] == len(payload["rows"]) == 1205
    assert all(row["TEMPLATE_NAME"] == "Full Dataset" for row in payload["rows"])
    assert payload["rows"][0]["UNIQ_ID"] == 1
    assert payload["rows"][-1]["UNIQ_ID"] == 1205


def test_budget_endpoint_returns_entire_large_source(client, monkeypatch, repository):
    rows = [{"COSTCENTER": f"C{i:05}"} for i in range(1205)]
    monkeypatch.setattr(repository, "_budget_rows", lambda: rows)
    response = client.get("/api/budget/rows")
    assert response.status_code == 200
    assert response.json() == {"rows": rows, "totalRowCount": 1205}


def test_budget_endpoint_includes_persisted_overrides(client):
    saved = client.patch("/api/budget/bulk-update", json={
        "rows": [{"COSTCENTER": "C001", "BUDGET_HOLDER": "Jane"}],
    })
    assert saved.status_code == 200
    response = client.get("/api/budget/rows")
    assert response.json()["totalRowCount"] == 100
    assert response.json()["rows"][0]["BUDGET_HOLDER"] == "Jane"


@pytest.mark.parametrize("url", ["/api/templates/Missing/rows", "/api/budget/rows"])
def test_full_endpoints_return_empty_grid_response(client, monkeypatch, repository, url):
    monkeypatch.setattr(repository, "_budget_rows", lambda: [])
    response = client.get(url)
    assert response.status_code == 200
    assert response.json() == {"rows": [], "totalRowCount": 0}


@pytest.mark.parametrize("url,total", [
    ("/api/templates/Full%20Dataset/rows/query", 1205), ("/api/budget/query", 100),
])
def test_old_paginated_endpoints_and_page_cap_remain(client, url, total):
    response = client.post(url, json={"startRow": 10, "endRow": 20})
    assert response.status_code == 200
    assert len(response.json()["rows"]) == 10
    assert response.json()["totalRowCount"] == total
    assert client.post(url, json={"startRow": 0, "endRow": 1001}).status_code == 422
    with pytest.raises(ValidationError, match="Maximum page size is 1000"):
        GridQuery(startRow=0, endRow=1001)


def test_gzip_large_response_preserves_cors_headers(client):
    cors = next(m for m in app.user_middleware if m.cls is CORSMiddleware)
    origin = cors.kwargs["allow_origins"][0]
    response = client.get("/api/templates/Full%20Dataset/rows", headers={
        "Accept-Encoding": "gzip", "Origin": origin,
    })
    assert response.status_code == 200
    assert response.headers["content-encoding"] == "gzip"
    assert "Accept-Encoding" in response.headers["vary"]
    assert response.headers["access-control-allow-origin"] in {origin, "*"}
    # TestClient decodes the wire compression automatically.
    assert len(response.json()["rows"]) == 1205
    classes = [m.cls for m in app.user_middleware]
    assert classes.index(CORSMiddleware) < classes.index(GZipMiddleware)
    gzip = next(m for m in app.user_middleware if m.cls is GZipMiddleware)
    assert gzip.kwargs == {"minimum_size": 1000, "compresslevel": 3}


def test_gzip_does_not_compress_small_response(client):
    response = client.get("/api/templates/Missing/rows", headers={"Accept-Encoding": "gzip"})
    assert response.status_code == 200
    assert "content-encoding" not in response.headers


def test_grid_query_defaults_to_unpaged():
    request = GridQuery.model_validate({})
    assert request.startRow is None
    assert request.endRow is None


@pytest.mark.parametrize("bounds", [
    {"startRow": 0}, {"endRow": 10},
    {"startRow": 0, "endRow": None}, {"startRow": None, "endRow": 10},
])
def test_grid_query_rejects_half_pair(bounds):
    with pytest.raises(ValidationError, match="provided together"):
        GridQuery.model_validate(bounds)


@pytest.mark.parametrize("bounds", [
    {"startRow": -1, "endRow": 10}, {"startRow": 0, "endRow": 0},
    {"startRow": 10, "endRow": 10}, {"startRow": 20, "endRow": 10},
    {"startRow": 0, "endRow": 1001},
])
def test_grid_query_preserves_page_validation(bounds):
    with pytest.raises(ValidationError):
        GridQuery.model_validate(bounds)


def test_grid_query_accepts_maximum_page_and_explicit_null_pair():
    assert GridQuery(startRow=5, endRow=1005).endRow == 1005
    assert GridQuery(startRow=None, endRow=None) == GridQuery()


@pytest.mark.parametrize("kind", ["detail", "summary", "budget"])
def test_empty_query_returns_entire_dataset(client, monkeypatch, repository, kind):
    if kind == "detail":
        url = "/api/templates/Full%20Dataset/rows/query"
        expected = deepcopy(repository.rows[:-1])
    elif kind == "summary":
        url = "/api/templates/Full%20Dataset/rows/summary"
        # More than 1000 distinct groups catches implicit default and page-cap truncation.
        for row in repository.rows:
            row["FSI_ACCOUNT"] = f"A{row['UNIQ_ID']:05}"
        expected = [
            {"FSI_ACCOUNT": row["FSI_ACCOUNT"], "GEOGRAPHY": row["GEOGRAPHY"],
             "FY_WORKING_FORECAST": row["FY_WORKING_FORECAST"], "ROW_COUNT": 1}
            for row in repository.rows[:-1]
        ]
    else:
        url = "/api/budget/query"
        expected = [{"COSTCENTER": f"C{i:05}"} for i in range(1205)]
        monkeypatch.setattr(repository, "_budget_rows", lambda: expected)
    response = client.post(url, json={})
    assert response.status_code == 200
    assert response.json() == {"rows": expected, "totalRowCount": 1205}


@pytest.mark.parametrize("url", [
    "/api/templates/Full%20Dataset/rows/query",
    "/api/templates/Full%20Dataset/rows/summary", "/api/budget/query",
])
@pytest.mark.parametrize("bounds", [{"startRow": 0}, {"endRow": 10}])
def test_query_endpoints_reject_half_pair(client, url, bounds):
    assert client.post(url, json=bounds).status_code == 422


def test_unpaged_mock_detail_preserves_filter_sort_and_deep_copy(repository):
    request = GridQuery(
        sortModel=[{"colId": "UNIQ_ID", "sort": "asc"}],
        filterModel={"UNIQ_ID": {"filterType": "number", "type": "greaterThan", "filter": 100}},
    )
    rows, total = repository.query("Full Dataset", request)
    assert total == len(rows) == 1105
    assert [row["UNIQ_ID"] for row in rows] == list(range(101, 1206))
    rows[0]["NOTES"] = "Changed"
    assert repository.query("Full Dataset", request)[0][0]["NOTES"] == ""


@pytest.mark.parametrize("kind", ["detail", "summary", "budget"])
@pytest.mark.parametrize("count", [0, 1205])
def test_snowflake_unpaged_queries_omit_limits_and_return_accurate_totals(kind, count):
    repo = SnowflakeForecastRepository(Settings(_env_file=None), Mock())
    rows = [{"UNIQ_ID": i} for i in range(count)]
    repo._fetch = Mock(return_value=deepcopy(rows))
    if kind == "detail":
        result = repo.query("Full Dataset", GridQuery())
    elif kind == "summary":
        result = repo.summarize("Full Dataset", GridQuery())
    else:
        result = repo.budget_query(GridQuery())
    assert result == (rows, count)
    repo._fetch.assert_called_once()
    sql, params = repo._fetch.call_args.args
    for token in ("LIMIT", "OFFSET", "__TOTAL_COUNT"):
        assert token not in sql.upper()
    assert not {"l", "o", "limit", "offset"}.intersection(params)


@pytest.mark.parametrize("kind", ["detail", "summary", "budget"])
def test_snowflake_paged_queries_strip_count_from_every_row(kind):
    repo = SnowflakeForecastRepository(Settings(_env_file=None), Mock())
    rows = [{"UNIQ_ID": i, "__TOTAL_COUNT": 1205} for i in range(2)]
    repo._fetch = Mock(return_value=deepcopy(rows))
    request = GridQuery(startRow=10, endRow=12)
    if kind == "detail":
        result = repo.query("Full Dataset", request)
    elif kind == "summary":
        result = repo.summarize("Full Dataset", request)
    else:
        result = repo.budget_query(request)
    assert result == ([{"UNIQ_ID": 0}, {"UNIQ_ID": 1}], 1205)
    sql, params = repo._fetch.call_args.args
    assert "COUNT(*) OVER()" in sql
    assert "LIMIT" in sql
    assert "OFFSET" in sql
    assert params.get("limit", params.get("l")) == 2
    assert params.get("offset", params.get("o")) == 10