import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.routes import router
from app.core.config import get_settings
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
settings=get_settings(); app=FastAPI(title="WBD Opex360 AG Grid POC API",version="0.1.0")
app.add_middleware(CORSMiddleware,allow_origins=[item.strip() for item in settings.cors_origins.split(",")],allow_credentials=True,allow_methods=["*"],allow_headers=["*"])
@app.exception_handler(Exception)
async def unhandled_exception(_request: Request, exception: Exception):
    logging.exception("Unhandled API error", exc_info=exception); return JSONResponse(status_code=500,content={"detail":"The request could not be completed."})
@app.get("/health")
def health(): return {"status":"ok","repository":settings.data_repository}
app.include_router(router)
