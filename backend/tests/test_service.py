from app.repositories.mock import MockForecastRepository
from app.services.forecast_service import ForecastService
def test_valid_row_saves():
    row={'UNIQ_ID':-1,'TEMPLATE_NAME':'Warner Media','VERSION':'10+2','FSI_ACCOUNT':'A1','GEOGRAPHY':'NA','BRAND':'Studio','PROFIT_CENTER':'P1','COMPANY_CODE':'US01','COST_CENTER':'C1','NOV_FORECAST':1,'DEC_FORECAST':2}; result=ForecastService(MockForecastRepository()).save('Warner Media',[row]); assert result['saved']==1
