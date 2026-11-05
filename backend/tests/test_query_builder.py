from app.repositories.query_builder import (
    build_grid_query,
    matches_filter_model,
    sort_rows,
)
from app.schemas.grid import GridQuery
def test_query_builder_allow_lists_sort_and_parameterizes_filter():
    built=build_grid_query('FORECAST_TEMPLATE','A',GridQuery(startRow=0,endRow=50,sortModel=[{'colId':'NOV_FORECAST','sort':'desc'},{'colId':'DROP TABLE','sort':'asc'}],filterModel={'COMPANY_CODE':{'filterType':'text','type':'contains','filter':'US'}})); assert 'DROP TABLE' not in built.sql; assert 'NOV_FORECAST DESC' in built.sql; assert built.params['filter_0_0']=='%US%'

def test_ag_number_filter_builds_comparison_and_uses_bound_value():
    built=build_grid_query('FORECAST_TEMPLATE','A',GridQuery(filterModel={'NOV_FORECAST':{'filterType':'number','type':'greaterThan','filter':1500}}))
    assert 'NOV_FORECAST > %(filter_0_0)s' in built.sql
    assert built.params['filter_0_0']==1500

def test_ag_filter_matcher_applies_text_number_and_or_conditions():
    filters={
        'COMPANY_CODE':{'filterType':'text','type':'contains','filter':'us'},
        'NOV_FORECAST':{'filterType':'number','operator':'OR','conditions':[{'type':'lessThan','filter':1000},{'type':'greaterThan','filter':2000}]},
    }
    assert matches_filter_model({'COMPANY_CODE':'US01','NOV_FORECAST':2500},filters,{'COMPANY_CODE','NOV_FORECAST'})
    assert not matches_filter_model({'COMPANY_CODE':'CA01','NOV_FORECAST':2500},filters,{'COMPANY_CODE','NOV_FORECAST'})
    rows=[{'NOV_FORECAST':2},{'NOV_FORECAST':1}]
    sort_rows(rows,[type('Sort',(),{'colId':'NOV_FORECAST','sort':'asc'})()],{'NOV_FORECAST'})
    assert [row['NOV_FORECAST'] for row in rows]==[1,2]
