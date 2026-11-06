from app.repositories.query_builder import TEMPLATE_COLUMNS, build_grid_query
from app.schemas.grid import GridQuery

def test_workbook_has_256_template_columns():
    assert len(TEMPLATE_COLUMNS) == 256

def test_omitted_projection_selects_all_fields():
    built=build_grid_query("TEMPLATE","Template 1",GridQuery(startRow=0,endRow=20))
    assert all(column in built.sql for column in TEMPLATE_COLUMNS)

def test_requested_projection_is_allow_listed():
    built=build_grid_query("TEMPLATE","Template 1",GridQuery(requestedColumns=["UNIQ_ID","NOV_FORECAST","DROP TABLE"]))
    assert "NOV_FORECAST" in built.sql
    assert "DROP TABLE" not in built.sql
