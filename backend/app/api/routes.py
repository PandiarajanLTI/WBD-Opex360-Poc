import csv, io
from fastapi import APIRouter, Depends, HTTPException, Response
from app.api.dependencies import get_forecast_service, get_repository
from app.schemas.grid import GridQuery, GridResponse, RowsPayload
from app.schemas.templates import TemplateCreatePayload, TemplateUploadPayload
from app.services.forecast_service import ForecastService
router = APIRouter(prefix="/api")
@router.get("/templates")
def list_templates(repository=Depends(get_repository)): return repository.list_templates()
@router.post("/templates", status_code=201, responses={409: {"description": "A template with that name already exists."}})
def create_template(payload: TemplateCreatePayload, repository=Depends(get_repository)):
    try:
        return repository.create_templates([payload.model_dump()])[0]
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
@router.post("/templates/upload", status_code=201, responses={409: {"description": "A template with that name already exists."}})
def upload_templates(payload: TemplateUploadPayload, repository=Depends(get_repository)):
    try:
        return {"created": repository.create_templates([item.model_dump() for item in payload.rows])}
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
@router.get("/templates/{template_name}/metadata")
def metadata(template_name: str, repository=Depends(get_repository)): return repository.metadata(template_name)
@router.post("/templates/{template_name}/rows/query", response_model=GridResponse)
def query_rows(template_name: str, request: GridQuery, repository=Depends(get_repository)):
    rows, total = repository.query(template_name, request); return GridResponse(rows=rows, totalRowCount=total)
@router.post("/templates/{template_name}/rows/validate")
def validate_rows(template_name: str, payload: RowsPayload, service: ForecastService=Depends(get_forecast_service)): return {"errors":service.validate(payload.rows)}
@router.post("/templates/{template_name}/rows/save")
def save_rows(template_name: str, payload: RowsPayload, service: ForecastService=Depends(get_forecast_service)):
    result=service.save(template_name,payload.rows)
    if result["errors"]: raise HTTPException(status_code=422, detail=result["errors"])
    return result
@router.get("/templates/{template_name}/dimensions")
def dimensions(template_name: str, parentField: str|None=None, parentValue: str|None=None): return {"values":[]}
@router.post("/templates/{template_name}/actions/{action_name}")
def run_action(template_name: str, action_name: str):
    if action_name not in {"copy-prior-forecast","distribute-variance"}: raise HTTPException(404,"Unknown action")
    return {"message":f"Action {action_name} accepted for {template_name}."}
@router.get("/templates/{template_name}/export")
def export_rows(template_name: str, repository=Depends(get_repository)):
    rows,total=repository.query(template_name,GridQuery(startRow=0,endRow=1000)); output=io.StringIO(); writer=csv.DictWriter(output,fieldnames=list(rows[0]) if rows else ["UNIQ_ID"]); writer.writeheader(); writer.writerows(rows); return Response(output.getvalue(),media_type="text/csv",headers={"Content-Disposition":f'attachment; filename="{template_name}.csv"',"X-Total-Row-Count":str(total)})
@router.post("/budget/query", response_model=GridResponse)
def budget_query(request: GridQuery, repository=Depends(get_repository)):
    rows,total=repository.budget_query(request); return GridResponse(rows=rows,totalRowCount=total)
@router.patch("/budget/bulk-update")
def budget_bulk_update(payload: RowsPayload, repository=Depends(get_repository)):
    count=repository.budget_save(payload.rows); return {"updated":count,"message":f"Saved {count} budget holder mapping row(s)."}
