from fastapi.testclient import TestClient
from app.main import app
client=TestClient(app)
def test_query_contract():
    response=client.post('/api/templates/Warner%20Media/rows/query',json={'startRow':0,'endRow':10,'sortModel':[],'filterModel':{}}); assert response.status_code==200; assert len(response.json()['rows'])==10; assert response.json()['totalRowCount']>10
def test_save_rejects_missing_fields():
    response=client.post('/api/templates/Warner%20Media/rows/save',json={'rows':[{'UNIQ_ID':-1}]}); assert response.status_code==422
def test_budget_bulk_update_persists_across_loads():
    q={'startRow':0,'endRow':5,'sortModel':[],'filterModel':{}}
    saved=client.patch('/api/budget/bulk-update',json={'rows':[{'COSTCENTER':'C001','BUDGET_HOLDER':'Jane'},{'COSTCENTER':'C002','BUDGET_HOLDER':'Jane'}]}); assert saved.json()['updated']==2
    for _ in range(2):
        rows=client.post('/api/budget/query',json=q).json()['rows']; assert [r['BUDGET_HOLDER'] for r in rows[:3]]==['Jane','Jane','POC User']
