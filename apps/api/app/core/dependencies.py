from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from apps.api.app.models.db import get_db, User
from apps.api.app.core.security import decode_token
from apps.api.app.repositories import runs_repo
from apps.api.app.core.config import settings

security = HTTPBearer(auto_error=False)


async def get_current_user(
    auth: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    # 1. If authorization header provided, decode and look up user
    if auth and auth.credentials:
        payload = decode_token(auth.credentials)
        if payload and "sub" in payload:
            user = runs_repo.get_user_by_id(db, payload["sub"])
            if user:
                if user.status == "blocked":
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is blocked")
                return user

    # 2. Localhost Development Fallback: Never block the developer with "Missing Authorization Header"
    if settings.DEV_MODE:
        admin_user = runs_repo.get_user_by_email(db, "admin@burgersflow.org")
        if admin_user:
            return admin_user
        res_user = runs_repo.get_user_by_email(db, "researcher@burgersflow.org")
        if res_user:
            return res_user

    # 3. Production strict mode (when DEV_MODE=false)
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing or invalid Authorization Header",
        headers={"WWW-Authenticate": "Bearer"}
    )


async def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin" and not settings.DEV_MODE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return user
