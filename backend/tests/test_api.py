from fastapi.testclient import TestClient
from app.main import app
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
def test_budget_bulk_update_persists_across_loads():
    q={'startRow':0,'endRow':5,'sortModel':[],'filterModel':{}}
    saved=client.patch('/api/budget/bulk-update',json={'rows':[{'COSTCENTER':'C001','BUDGET_HOLDER':'Jane'},{'COSTCENTER':'C002','BUDGET_HOLDER':'Jane'}]}); assert saved.json()['updated']==2
    for _ in range(2):
        rows=client.post('/api/budget/query',json=q).json()['rows']; assert [r['BUDGET_HOLDER'] for r in rows[:3]]==['Jane','Jane','POC User']

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
