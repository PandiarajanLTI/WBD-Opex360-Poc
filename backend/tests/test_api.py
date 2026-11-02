from fastapi.testclient import TestClient
from app.main import app
client=TestClient(app)
def test_query_contract():
    response=client.post('/api/templates/Warner%20Media/rows/query',json={'startRow':0,'endRow':10,'sortModel':[],'filterModel':{}}); assert response.status_code==200; assert len(response.json()['rows'])==10; assert response.json()['totalRowCount']>10
def test_save_rejects_missing_fields():
    response=client.post('/api/templates/Warner%20Media/rows/save',json={'rows':[{'UNIQ_ID':-1}]}); assert response.status_code==422
