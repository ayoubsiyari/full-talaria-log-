from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "trading-chart"
    env: str = "development"

    database_url: str

    secret_key: str
    session_cookie_name: str = "session"
    session_ttl_seconds: int = 60 * 60 * 24 * 14

    session_cookie_secure: bool = False
    session_cookie_samesite: str = "lax"

    cors_origins: str = ""

    admin_email: str | None = None
    admin_password: str | None = None
    admin_name: str = "Admin"

    google_service_account_file: str | None = None
    google_sheets_spreadsheet_id: str | None = None
    google_sheets_sheet_name: str = "Registrations"

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()  # type: ignore
