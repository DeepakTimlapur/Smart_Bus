import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Ensure project root is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.app.config import FASTAPI_PORT, CORS_ORIGINS
from backend.app.db import init_db, close_db, is_mock_db
from backend.app.api.v1.auth import router as auth_router
from backend.app.api.v1.students import router as students_router
from backend.app.api.v1.buses import router as buses_router
from backend.app.api.v1.fees import router as fees_router
from backend.app.api.v1.drivers import router as drivers_router
from backend.app.api.v1.dashboard import router as dashboard_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes MongoDB connection and indexes on startup; closes on shutdown."""
    print("Connecting to MongoDB database...", flush=True)
    await init_db()
    print("Smart Bus Transit OS Backend started successfully.", flush=True)
    yield
    print("Shutting down database connection...", flush=True)
    await close_db()
    print("Database connection closed.", flush=True)


app = FastAPI(
    title="Smart Bus Transit System API",
    description="Intelligent campus transit management backend with real-time GPS tracking and fee administration.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers under both /api/v1 and /api for compatibility
for prefix in ["/api/v1", "/api"]:
    app.include_router(auth_router, prefix=prefix)
    app.include_router(students_router, prefix=prefix)
    app.include_router(buses_router, prefix=prefix)
    app.include_router(fees_router, prefix=prefix)
    app.include_router(drivers_router, prefix=prefix)
    app.include_router(dashboard_router, prefix=prefix)


@app.get("/")
async def root():
    return {
        "system": "Smart Bus Transit Management OS",
        "status": "OPERATIONAL",
        "version": "1.0.0",
        "db_mode": "local_mock" if is_mock_db() else "mongodb_live",
        "docs_url": "/docs",
    }


@app.get("/health")
@app.get("/api/v1/health")
@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "database": "connected",
        "is_mock": is_mock_db(),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=FASTAPI_PORT,
        reload=False,
    )
