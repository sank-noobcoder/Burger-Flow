import uuid
import time
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from apps.api.app.core.config import settings
from apps.api.app.models.db import init_db, SessionLocal
from apps.api.app.repositories import runs_repo
from apps.api.app.core.security import hash_password

from apps.api.app.core.security_firewall import SecurityFirewallMiddleware
from apps.api.app.api.v1.auth import router as auth_router
from apps.api.app.api.v1.presets import router as presets_router
from apps.api.app.api.v1.runs import router as runs_router
from apps.api.app.api.v1.compare import router as compare_router
from apps.api.app.api.v1.admin import router as admin_router


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version="3.1.0",
        docs_url="/docs",
        openapi_url="/openapi.json"
    )

    # 1. Security Threat Firewall (Validates all requests for SQLi, XSS, Path Traversal)
    app.add_middleware(SecurityFirewallMiddleware)

    # 2. CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Open in dev, proxy routed in prod
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Middleware: Request-ID and Timing
    @app.middleware("http")
    async def request_id_and_timing_middleware(request: Request, call_next):
        req_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        start_time = time.time()
        
        response: Response = await call_next(request)
        
        process_time = time.time() - start_time
        response.headers["X-Request-ID"] = req_id
        response.headers["X-Process-Time"] = f"{process_time:.4f}s"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    # Health Checks
    @app.get("/healthz", tags=["health"])
    def healthz():
        return {"status": "ok"}

    @app.get("/readyz", tags=["health"])
    def readyz():
        return {"status": "ready"}

    # Include API Routers under /api/v1
    app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
    app.include_router(presets_router, prefix=settings.API_V1_PREFIX)
    app.include_router(runs_router, prefix=settings.API_V1_PREFIX)
    app.include_router(compare_router, prefix=settings.API_V1_PREFIX)
    app.include_router(admin_router, prefix=settings.API_V1_PREFIX)

    @app.on_event("startup")
    def on_startup():
        init_db()
        # Seed default users
        db = SessionLocal()
        try:
            # 1. Researcher
            if not runs_repo.get_user_by_email(db, "researcher@burgersflow.org"):
                runs_repo.create_user(
                    db,
                    email="researcher@burgersflow.org",
                    password_hash=hash_password("researcher123"),
                    role="researcher"
                )
            # 2. Admin
            if not runs_repo.get_user_by_email(db, "admin@burgersflow.org"):
                runs_repo.create_user(
                    db,
                    email="admin@burgersflow.org",
                    password_hash=hash_password("admin123"),
                    role="admin"
                )

            # 3. Clean up orphaned jobs left in "running" or "queued" from terminated server sessions
            stale_runs = db.query(runs_repo.Run).filter(
                runs_repo.Run.status.in_(["running", "queued"])
            ).all()
            for sr in stale_runs:
                sr.status = "failed"
                sr.error_message = "Session terminated before completion (Server restarted)"
            
            # 4. In DEV_MODE, ensure quotas are never a blocker for scientific experimentation
            if settings.DEV_MODE:
                quotas = db.query(runs_repo.Quota).all()
                for q in quotas:
                    q.gpu_min_limit = 5000.0
                    q.gpu_min_used = 0.0
                    q.max_active_jobs = 10
            db.commit()
        finally:
            db.close()

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("apps.api.app.main:app", host="0.0.0.0", port=8000, reload=True)
