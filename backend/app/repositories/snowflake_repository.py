from typing import Any
from app.core.config import Settings
from app.db.snowflake import SnowflakeConnectionFactory
from app.repositories.query_builder import ALLOWED_COLUMNS,API_COLUMNS,COLUMN_GROUPS,DEFAULT_COLUMNS,TEMPLATE_COLUMNS,VIRTUAL_COLUMNS,build_grid_query
FORECAST_EDITABLE={"NOV_FORECAST","DEC_FORECAST","NOTES"}
class SnowflakeForecastRepository:
 def __init__(self,settings:Settings,factory:SnowflakeConnectionFactory):self.settings,self.factory=settings,factory
 def _fetch(self,sql,params):
  with self.factory.connection() as connection:
   with connection.cursor() as cursor:
    cursor.execute(sql,params); names=[x[0] for x in cursor.description]; return [dict(zip(names,row)) for row in cursor.fetchall()]
 def list_templates(self):
  t=self.settings.snowflake_forecast_table; rows=self._fetch(f"SELECT TEMPLATE_NAME,MAX(SECTION) SECTION,MAX(VERSION) VERSION,MAX(STATUS) STATUS,SUM(COALESCE(FY_WORKING_FORECAST,0)) CURRENT_FORECAST,SUM(COALESCE(FY_PRIORFORECAST,0)) PRIOR_FORECAST,SUM(COALESCE(VARIANCE_PRIORFORECAST,0)) VARIANCE FROM {t} GROUP BY TEMPLATE_NAME ORDER BY TEMPLATE_NAME",{})
  return [{"templateName":r["TEMPLATE_NAME"],"section":r["SECTION"],"version":r["VERSION"],"status":r["STATUS"],"currentForecast":r["CURRENT_FORECAST"],"priorForecast":r["PRIOR_FORECAST"],"variance":r["VARIANCE"]} for r in rows]
 def create_templates(self,templates):raise ValueError("Current schema has no template-header table")
 def metadata(self,template_name):
  t=self.settings.snowflake_forecast_table; rows=self._fetch(f"SELECT TEMPLATE_NAME,MAX(VERSION) VERSION,MAX(STATUS) STATUS,SUM(COALESCE(FY_WORKING_FORECAST,0)) CURRENT_FORECAST,SUM(COALESCE(FY_PRIORFORECAST,0)) PRIOR_FORECAST,SUM(COALESCE(VARIANCE_PRIORFORECAST,0)) VARIANCE FROM {t} WHERE TEMPLATE_NAME=%(n)s GROUP BY TEMPLATE_NAME",{'n':template_name})
  if not rows:raise ValueError(f'Unknown template: {template_name}')
  r=rows[0];return {"templateName":template_name,"version":r["VERSION"],"status":r["STATUS"],"kpis":{"Current forecast":r["CURRENT_FORECAST"],"Prior forecast":r["PRIOR_FORECAST"],"Variance":r["VARIANCE"]},"columns":API_COLUMNS,"defaultColumns":DEFAULT_COLUMNS,"columnGroups":COLUMN_GROUPS,"editableColumns":sorted(FORECAST_EDITABLE),"fx":{"sourceTable":self.settings.snowflake_currency_table,"rateType":self.settings.snowflake_fx_rate_type,"year":self.settings.snowflake_fx_year,"formula":"displayed PRATE = stored PRATE * FX_RATES","currencyField":"CURRENCY"}}
 def query(self,template_name,request):
  b=build_grid_query(self.settings.snowflake_forecast_table,self.settings.snowflake_currency_table,template_name,request,self.settings.snowflake_fx_rate_type,self.settings.snowflake_fx_year);rows=self._fetch(b.sql,b.params);total=int(rows[0].pop('__TOTAL_COUNT')) if rows else 0
  for r in rows:r.pop('__TOTAL_COUNT',None)
  return rows,total
 def summarize(self,template_name,request):
  rows=self._fetch(f"SELECT FSI_ACCOUNT,GEOGRAPHY,SUM(COALESCE(FY_WORKING_FORECAST,0)) FY_WORKING_FORECAST,COUNT(*) ROW_COUNT,COUNT(*) OVER() __TOTAL_COUNT FROM {self.settings.snowflake_forecast_table} WHERE TEMPLATE_NAME=%(n)s GROUP BY FSI_ACCOUNT,GEOGRAPHY ORDER BY FSI_ACCOUNT,GEOGRAPHY LIMIT %(l)s OFFSET %(o)s",{'n':template_name,'l':request.endRow-request.startRow,'o':request.startRow});total=int(rows[0].pop('__TOTAL_COUNT')) if rows else 0;return rows,total
 def valid_combinations(self,keys):
  unique=list(dict.fromkeys(keys));
  if not unique:return set()
  p={};v=[]
  for i,(a,b,c) in enumerate(unique):p.update({f'a{i}':a,f'b{i}':b,f'c{i}':c});v.append(f'(%(a{i})s,%(b{i})s,%(c{i})s)')
  rows=self._fetch(f"SELECT COMPANY_CODE,COSTCENTER,PROFIT_CENTER FROM {self.settings.snowflake_cost_center_table} WHERE IS_ACTIVE='Y' AND (COMPANY_CODE,COSTCENTER,PROFIT_CENTER) IN ({','.join(v)})",p);return {(str(r['COMPANY_CODE']),str(r['COSTCENTER']),str(r['PROFIT_CENTER'])) for r in rows}
 def _bulk_update(self,cursor,template_name,rows):
  total=0
  for start in range(0,len(rows),500):
   batch=rows[start:start+500];vals=[];p={'template_name':template_name}
   for i,r in enumerate(batch):
    p.update({f'id{i}':r['UNIQ_ID'],f'n{i}':r.get('NOV_FORECAST'),f'd{i}':r.get('DEC_FORECAST'),f't{i}':r.get('NOTES')});vals.append(f'(%(id{i})s,%(n{i})s,%(d{i})s,%(t{i})s)')
   cursor.execute(f"UPDATE {self.settings.snowflake_forecast_table} target SET NOV_FORECAST=COALESCE(src.NOV_FORECAST,target.NOV_FORECAST),DEC_FORECAST=COALESCE(src.DEC_FORECAST,target.DEC_FORECAST),NOTES=COALESCE(src.NOTES,target.NOTES),UPDATED_TS=CURRENT_TIMESTAMP(),UPDATED_BY='OPEX360_API',USER_ACTION='UPDATE' FROM (SELECT column1 UNIQ_ID,column2 NOV_FORECAST,column3 DEC_FORECAST,column4 NOTES FROM VALUES {','.join(vals)}) src WHERE target.UNIQ_ID=src.UNIQ_ID AND target.TEMPLATE_NAME=%(template_name)s",p);total+=cursor.rowcount if isinstance(cursor.rowcount,int) and cursor.rowcount>=0 else len(batch)
  return total
 def save(self,template_name,rows):
  inserts=[];updates=[]
  for r in rows:
   try:new=r.get('UNIQ_ID') is None or int(r.get('UNIQ_ID'))<=0
   except (TypeError,ValueError):new=True
   (inserts if new else updates).append(r)
  with self.factory.connection() as connection:
   try:
    with connection.cursor() as cursor:
     updated=self._bulk_update(cursor,template_name,updates);inserted=0
     for r in inserts:
      data={**r,'TEMPLATE_NAME':r.get('TEMPLATE_NAME',template_name)};fields=[c for c in TEMPLATE_COLUMNS if c!='UNIQ_ID' and c in data]
      cursor.execute(f"INSERT INTO {self.settings.snowflake_forecast_table} ({','.join(fields)}) VALUES ({','.join('%('+c+')s' for c in fields)})",{c:data.get(c) for c in fields});inserted+=1
    connection.commit()
   except Exception:connection.rollback();raise
  return {'requested':len(rows),'updated':updated,'inserted':inserted}
 def budget_query(self,request):
  rows=self._fetch(f"SELECT *,COUNT(*) OVER() __TOTAL_COUNT FROM {self.settings.snowflake_budget_table} ORDER BY COSTCENTER LIMIT %(l)s OFFSET %(o)s",{'l':request.endRow-request.startRow,'o':request.startRow});total=int(rows[0].pop('__TOTAL_COUNT')) if rows else 0;return rows,total
 def budget_save(self,rows):
  if not rows:return 0
  editable=("FUNCTION","SUBFUNCTION","COE_TEAM","COE_SUB_TEAM","COE_POC","BU_POC","BUDGET_HOLDER","REGION","LOCATION","CITY","CUSTOM_1","CUSTOM_2","CUSTOM_3")
  groups={}
  for row in rows:
   costcenter=row.get("COSTCENTER")
   if costcenter is None or str(costcenter).strip()=="":continue
   fields=tuple(c for c in editable if c in row)
   if fields:groups.setdefault(fields,[]).append(row)
  updated=0
  with self.factory.connection() as connection:
   try:
    with connection.cursor() as cursor:
     for fields,group in groups.items():
      for start in range(0,len(group),500):
       batch=group[start:start+500];params={};values=[]
       for i,row in enumerate(batch):
        params[f"cc{i}"]=str(row["COSTCENTER"]).strip();markers=[f"%(cc{i})s"]
        for field in fields:
         key=f"v_{field}_{i}";params[key]=row.get(field);markers.append(f"%({key})s")
        values.append("("+",".join(markers)+")")
       aliases=["COSTCENTER",*fields]
       source_columns=",".join(f"column{j+1} AS {column}" for j,column in enumerate(aliases))
       assignments=",".join(f"{column}=src.{column}" for column in fields)
       sql=f"UPDATE {self.settings.snowflake_budget_table} target SET {assignments} FROM (SELECT {source_columns} FROM VALUES {','.join(values)}) src WHERE TRIM(TO_VARCHAR(target.COSTCENTER))=src.COSTCENTER"
       cursor.execute(sql,params)
       count=cursor.rowcount
       updated+=count if isinstance(count,int) and count>=0 else len(batch)
    connection.commit()
   except Exception:
    connection.rollback();raise
  return updated
