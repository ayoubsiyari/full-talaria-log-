from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from fastapi import Depends

from ..db import get_db
from ..models import BootcampRegistration
from ..schemas import BootcampRegisterIn

router = APIRouter(prefix="/api/bootcamp", tags=["bootcamp"])


@router.post("/register")
def register(payload: BootcampRegisterIn, db: Session = Depends(get_db)):
    if not payload.agree_terms or not payload.agree_rules:
        raise HTTPException(status_code=400, detail="Terms and rules must be accepted")
    if payload.age < 18:
        raise HTTPException(status_code=400, detail="Must be 18 or older")

    reg = BootcampRegistration(
        full_name=payload.full_name.strip(),
        email=str(payload.email).lower(),
        phone=(payload.phone.strip() if payload.phone else None),
        country=payload.country.strip(),
        age=int(payload.age),
        telegram=(payload.telegram.strip() if payload.telegram else None),
        discord=payload.discord.strip(),
        instagram=(payload.instagram.strip() if payload.instagram else None),
        agree_terms=bool(payload.agree_terms),
        agree_rules=bool(payload.agree_rules),
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return {"ok": True, "id": reg.id}
