import logging

from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from fastapi import Depends

from ..db import get_db
from ..models import BootcampRegistration
from ..schemas import BootcampRegisterIn
from ..settings import settings

logger = logging.getLogger(__name__)


def _append_registration_to_google_sheets(reg: BootcampRegistration) -> None:
    if not settings.google_sheets_spreadsheet_id:
        return
    if not settings.google_service_account_file:
        return

    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build

    creds = Credentials.from_service_account_file(
        settings.google_service_account_file,
        scopes=["https://www.googleapis.com/auth/spreadsheets"],
    )
    service = build("sheets", "v4", credentials=creds, cache_discovery=False)
    values = [
        [
            reg.id,
            reg.full_name,
            reg.email,
            reg.country,
            reg.phone or "",
            reg.age,
            reg.telegram or "",
            reg.discord,
            reg.instagram or "",
            (reg.created_at.isoformat() if getattr(reg, "created_at", None) else ""),
        ]
    ]
    service.spreadsheets().values().append(
        spreadsheetId=settings.google_sheets_spreadsheet_id,
        range=f"{settings.google_sheets_sheet_name}!A1",
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": values},
    ).execute()

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
    try:
        _append_registration_to_google_sheets(reg)
    except Exception:
        logger.exception("google_sheets_append_failed")
    return {"ok": True, "id": reg.id}
