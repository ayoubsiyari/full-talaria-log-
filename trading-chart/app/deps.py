from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .security import verify_session_token
from .settings import settings


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(settings.session_cookie_name, "")
    user_id = verify_session_token(token)
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
