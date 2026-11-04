from fastapi.testclient import TestClient
from app.main import app
from app.repositories.query_builder import BUDGET_COLUMNS
client=TestClient(app)
def test_query_contract():
    response=client.post('/api/templates/Warner%20Media/rows/query',json={'startRow':0,'endRow':10,'sortModel':[],'filterModel':{}}); assert response.status_code==200; assert len(response.json()['rows'])==10; assert response.json()['totalRowCount']>10

def test_query_applies_ag_grid_filter_sort_and_pagination():
    response=client.post('/api/templates/Warner%20Media/rows/query',json={
        'startRow':0,
        'endRow':5,
        'sortModel':[{'colId':'NOV_FORECAST','sort':'desc'}],
        'filterModel':{'COMPANY_CODE':{'filterType':'text','type':'equals','filter':'US01'}},
    })
    assert response.status_code==200
    result=response.json()
    assert result['totalRowCount']==350
    assert len(result['rows'])==5
    assert all(row['COMPANY_CODE']=='US01' for row in result['rows'])
    assert [row['NOV_FORECAST'] for row in result['rows']]==sorted(
        (row['NOV_FORECAST'] for row in result['rows']),reverse=True
    )
def test_summary_query_groups_forecast_by_fsi_and_region():
    response=client.post('/api/templates/Warner%20Media/rows/summary',json={
        'startRow':0,
        'endRow':100,
        'sortModel':[{'colId':'FSI_ACCOUNT','sort':'asc'}],
        'filterModel':{},
    })
    assert response.status_code==200
    result=response.json()
    assert result['totalRowCount']==12
    assert len(result['rows'])==12
    first=result['rows'][0]
    assert first['FSI_ACCOUNT']=='A000'
    assert first['GEOGRAPHY'] in {'NA','EMEA'}
    assert first['ROW_COUNT']>0
    assert first['FY_WORKING_FORECAST']>0
def test_save_rejects_missing_fields():
    response=client.post('/api/templates/Warner%20Media/rows/save',json={'rows':[{'UNIQ_ID':-1}]}); assert response.status_code==422

def test_save_inserts_new_forecast_row():
    row={
        'UNIQ_ID':-1,
        'INSERTED':'Y',
        'TEMPLATE_NAME':'Warner Media',
        'VERSION':'10+2',
        'COMPANY_CODE':'US01',
        'PROFIT_CENTER':'P999',
        'COST_CENTER':'C999',
        'FSI_ACCOUNT':'A999',
        'GEOGRAPHY':'NA',
        'BRAND':'Studio',
        'NOV_FORECAST':1250,
        'DEC_FORECAST':1500,
    }
    saved=client.post('/api/templates/Warner%20Media/rows/save',json={'rows':[row]})
    assert saved.status_code==200
    result=client.post('/api/templates/Warner%20Media/rows/query',json={
        'startRow':0,
        'endRow':10,
        'sortModel':[],
        'filterModel':{'COST_CENTER':{'filterType':'text','type':'equals','filter':'C999'}},
    })
    assert result.json()['totalRowCount']==1
    assert result.json()['rows'][0]['COST_CENTER']=='C999'
    first_page=client.post('/api/templates/Warner%20Media/rows/query',json={
        'startRow':0,
        'endRow':1,
        'sortModel':[],
        'filterModel':{},
    })
    assert first_page.json()['rows'][0]['COST_CENTER']=='C999'

def test_save_updates_full_forecast_row_without_changing_row_identity_or_total():
    original = client.post('/api/templates/Warner%20Media/rows/query', json={
        'startRow': 0,
        'endRow': 1,
        'sortModel': [],
        'filterModel': {
            'UNIQ_ID': {'filterType': 'number', 'type': 'equals', 'filter': 1},
        },
    }).json()['rows'][0]
    saved = client.post('/api/templates/Warner%20Media/rows/save', json={
        'rows': [{
            **original,
            'TEMPLATE_NAME': 'EMEA Distribution',
            'COMPANY_CODE': 'CA01',
            'VERSION': '11+1',
            'JAN_FORECAST': 321,
            'FY_WORKING_FORECAST': 999999,
        }],
    })
    assert saved.status_code == 200
    result = client.post('/api/templates/Warner%20Media/rows/query', json={
        'startRow': 0,
        'endRow': 1,
        'sortModel': [],
        'filterModel': {'UNIQ_ID': {'filterType': 'number', 'type': 'equals', 'filter': original['UNIQ_ID']}},
    }).json()['rows'][0]
    assert result['COMPANY_CODE'] == 'CA01'
    assert result['VERSION'] == '11+1'
    assert result['JAN_FORECAST'] == 321
    assert result['TEMPLATE_NAME'] == 'Warner Media'
    assert result['FY_WORKING_FORECAST'] == original['FY_WORKING_FORECAST']

def test_budget_bulk_update_persists_across_loads():
    q={'startRow':0,'endRow':5,'sortModel':[],'filterModel':{}}
    saved=client.patch('/api/budget/bulk-update',json={'rows':[{'COSTCENTER':'C001','COSTCENTER_NAME':'Updated Cost Center','COMPANY_CODE':'CA01','PROFIT_CENTER':'P999','BUDGET_HOLDER':'Jane','COE_POC':'Jane','CUSTOM_3':'Updated'},{'COSTCENTER':'C002','BUDGET_HOLDER':'Jane'}]}); assert saved.json()['updated']==2
    for _ in range(2):
        rows=client.post('/api/budget/query',json=q).json()['rows']; assert [r['BUDGET_HOLDER'] for r in rows[:3]]==['Jane','Jane','POC User']
        assert rows[0]['COSTCENTER_NAME']=='Cost Center 1'
        assert rows[0]['COMPANY_CODE']=='US01'
        assert rows[0]['PROFIT_CENTER']=='P001'
        assert rows[0]['COE_POC']=='Jane'
        assert rows[0]['CUSTOM_3']=='Updated'

def test_budget_query_returns_all_budget_table_columns():
    response=client.post('/api/budget/query',json={
        'startRow':0,
        'endRow':1,
        'sortModel':[],
        'filterModel':{},
    })
    assert response.status_code==200
    row=response.json()['rows'][0]
    assert tuple(row)==BUDGET_COLUMNS

def test_create_template_persists_in_template_list():
    payload={'templateName':'API Created Forecast','section':'Forecast','version':'11+1','status':'Working','currentForecast':125000,'priorForecast':120000,'variance':5000}
    created=client.post('/api/templates',json=payload)
    assert created.status_code==201
    assert created.json()['templateName']==payload['templateName']
    assert any(item['templateName']==payload['templateName'] for item in client.get('/api/templates').json())
    assert client.post('/api/templates',json=payload).status_code==409

def test_upload_templates_accepts_a_batch():
    payload={'rows':[{'templateName':'API Uploaded Forecast','section':'Forecast','version':'10+2','status':'Working','currentForecast':2500,'priorForecast':2000,'variance':500}]}
    response=client.post('/api/templates/upload',json=payload)
    assert response.status_code==201
    assert response.json()['created'][0]['templateName']=='API Uploaded Forecast'
