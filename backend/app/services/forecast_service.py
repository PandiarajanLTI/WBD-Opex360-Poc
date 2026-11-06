from typing import Any
from app.repositories.base import ForecastRepository
MANDATORY_FIELDS=("TEMPLATE_NAME","VERSION","FSI_ACCOUNT","GEOGRAPHY","BRAND","PROFIT_CENTER","COMPANY_CODE","COST_CENTER")
class ForecastService:
 def __init__(self,repository:ForecastRepository):self.repository=repository
 def _new(self,row):
  try:return row.get("UNIQ_ID") is None or int(row.get("UNIQ_ID"))<=0
  except (TypeError,ValueError):return True
 def validate(self,rows):
  errors=[];pending=[];seen=set()
  for row in rows:
   if not self._new(row):continue
   missing=[x for x in MANDATORY_FIELDS if not row.get(x)]
   if missing:errors.append({"rowId":row.get("UNIQ_ID"),"message":"Missing required fields: "+", ".join(missing)});continue
   key=(str(row["COMPANY_CODE"]),str(row["COST_CENTER"]),str(row["PROFIT_CENTER"]))
   if key in seen:errors.append({"rowId":row.get("UNIQ_ID"),"message":"Duplicate dimension combination in request"});continue
   seen.add(key);pending.append((row,key))
  valid=self.repository.valid_combinations([k for _,k in pending]) if pending else set()
  for row,key in pending:
   if key not in valid:errors.append({"rowId":row.get("UNIQ_ID"),"message":"Invalid or inactive dimension combination"})
  return errors
 def save(self,template_name,rows):
  errors=self.validate(rows)
  if errors:return {"requested":len(rows),"updated":0,"inserted":0,"saved":0,"errors":errors,"message":"Validation failed"}
  r=self.repository.save(template_name,rows);return {**r,"saved":r["updated"]+r["inserted"],"errors":[],"message":f"Updated {r['updated']} row(s); inserted {r['inserted']} row(s)."}
