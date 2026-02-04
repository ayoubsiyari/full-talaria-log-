from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_admin
from ..models import User
from ..schemas import UserPublic

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users")
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.execute(select(User).order_by(User.created_at.desc())).scalars().all()
    return {"users": [UserPublic.model_validate(u, from_attributes=True) for u in users]}
