from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sessions: Mapped[list[TradingSession]] = relationship(back_populates="user", cascade="all, delete-orphan")


class TradingSession(Base):
    __tablename__ = "trading_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    name: Mapped[str] = mapped_column(String(200))
    session_type: Mapped[str] = mapped_column(String(20))

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    start_balance: Mapped[float | None] = mapped_column(Float, nullable=True)
    start_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    symbol: Mapped[str | None] = mapped_column(String(50), nullable=True)

    user: Mapped[User] = relationship(back_populates="sessions")
    trades: Mapped[list[Trade]] = relationship(back_populates="session", cascade="all, delete-orphan")


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("trading_sessions.id"), index=True)

    trade_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    symbol: Mapped[str | None] = mapped_column(String(50), nullable=True)
    side: Mapped[str | None] = mapped_column(String(20), nullable=True)

    entry: Mapped[float | None] = mapped_column(Float, nullable=True)
    exit: Mapped[float | None] = mapped_column(Float, nullable=True)
    pnl: Mapped[float] = mapped_column(Float, default=0.0)

    stop_loss: Mapped[float | None] = mapped_column(Float, nullable=True)
    take_profit: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_amount: Mapped[float | None] = mapped_column(Float, nullable=True)

    rr_planned: Mapped[float | None] = mapped_column(Float, nullable=True)
    rr_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    r_multiple: Mapped[float | None] = mapped_column(Float, nullable=True)

    price_move_pips: Mapped[float | None] = mapped_column(Float, nullable=True)
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)

    close_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    holding_time_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

    entry_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    exit_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    day_of_week: Mapped[str | None] = mapped_column(String(12), nullable=True)
    month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hour_of_entry: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hour_of_exit: Mapped[int | None] = mapped_column(Integer, nullable=True)

    mfe: Mapped[float | None] = mapped_column(Float, nullable=True)
    mae: Mapped[float | None] = mapped_column(Float, nullable=True)
    highest_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    lowest_price: Mapped[float | None] = mapped_column(Float, nullable=True)

    pre_trade_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    post_trade_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    entry_screenshot: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    entry_screenshot_mime: Mapped[str | None] = mapped_column(String(100), nullable=True)
    exit_screenshot: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    exit_screenshot_mime: Mapped[str | None] = mapped_column(String(100), nullable=True)

    session: Mapped[TradingSession] = relationship(back_populates="trades")


class BootcampRegistration(Base):
    __tablename__ = "bootcamp_registrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(255), index=True)

    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    country: Mapped[str] = mapped_column(String(120))
    age: Mapped[int] = mapped_column(Integer)

    telegram: Mapped[str | None] = mapped_column(String(120), nullable=True)
    discord: Mapped[str] = mapped_column(String(120))
    instagram: Mapped[str | None] = mapped_column(String(120), nullable=True)

    agree_terms: Mapped[bool] = mapped_column(Boolean, default=False)
    agree_rules: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
