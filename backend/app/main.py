import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.dependencies import get_connection_factory
from app.api.routes import router
from app.core.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
settings=get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    get_connection_factory().close_all()

app=FastAPI(title="WBD Opex360 AG Grid POC API",version="0.2.0",lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in settings.cors_origins.split(",")],allow_credentials=True,allow_methods=["*"],allow_headers=["*"])

@app.exception_handler(Exception)
async def unhandled_exception(_request: Request, exception: Exception):
    logging.exception("Unhandled API error",exc_info=exception)
    return JSONResponse(status_code=500,content={"detail":"The request could not be completed."})

@app.get("/health")
def health():
    try:
        with get_connection_factory().connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        return {"status":"ok","repository":"snowflake","snowflake":"connected"}
    except Exception:
        return JSONResponse(status_code=503,content={"status":"degraded","repository":"snowflake","snowflake":"unavailable"})

app.include_router(router)
