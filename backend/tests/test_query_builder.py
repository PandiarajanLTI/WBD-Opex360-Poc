from app.repositories.query_builder import build_grid_query
from app.schemas.grid import GridQuery
def test_query_builder_allow_lists_sort_and_parameterizes_filter():
    built=build_grid_query('FORECAST_TEMPLATE','A',GridQuery(startRow=0,endRow=50,sortModel=[{'colId':'NOV_FORECAST','sort':'desc'},{'colId':'DROP TABLE','sort':'asc'}],filterModel={'COMPANY_CODE':{'filter':'US'}})); assert 'DROP TABLE' not in built.sql; assert 'NOV_FORECAST DESC' in built.sql; assert built.params['filter_0']=='%US%'
