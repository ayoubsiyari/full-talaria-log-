import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .security import verify_session_token
from .settings import settings


def verify_jwt_token(token: str) -> int | None:
    """Verify JWT token from journal-backend."""
    try:
        # Use the same secret as journal-backend
        jwt_secret = settings.jwt_secret_key
        payload = jwt.decode(token, jwt_secret, algorithms=["HS256"])
        # flask_jwt_extended stores identity as 'sub' claim
        user_id = payload.get("sub")
        if user_id:
            return int(user_id)
    except (jwt.InvalidTokenError, ValueError, TypeError):
        pass
    return None


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    # Try cookie first (main site)
    token = request.cookies.get(settings.session_cookie_name, "")
    user_id = verify_session_token(token)
    
    # If no valid cookie, try Bearer token (journal frontend)
    if not user_id:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            bearer_token = auth_header[7:]
            # Try custom session token first
            user_id = verify_session_token(bearer_token)
            # If that fails, try JWT verification
            if not user_id:
                user_id = verify_jwt_token(bearer_token)
    
    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="not_authenticated",
            headers={"Cache-Control": "no-store", "Vary": "Cookie"},
        )
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=401,
            detail="not_authenticated",
            headers={"Cache-Control": "no-store", "Vary": "Cookie"},
        )
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="forbidden")
    return user
