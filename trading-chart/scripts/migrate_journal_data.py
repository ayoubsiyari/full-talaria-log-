#!/usr/bin/env python3
"""
Migration script to export journal data from old VPS and import to new VPS.

Run this script on the NEW VPS after deploying the updated models.
It connects to the OLD VPS database remotely and imports data.
"""

import os
import sys
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
from psycopg2.extras import RealDictCursor
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    Base, User, JournalGroup, JournalProfile, JournalEntry, 
    Strategy, ImportBatch, FeatureFlag
)

# Old VPS database connection
OLD_DB_CONFIG = {
    "host": "31.97.192.82",
    "port": 5432,
    "database": "talaria_log",
    "user": "talaria_user",
    "password": "talaria_secure_password_2024"
}

# New VPS database URL (from environment or default)
NEW_DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql+psycopg2://talaria:talaria@db:5432/talaria"
)


def get_old_db_connection():
    """Connect to the old VPS PostgreSQL database."""
    return psycopg2.connect(
        host=OLD_DB_CONFIG["host"],
        port=OLD_DB_CONFIG["port"],
        database=OLD_DB_CONFIG["database"],
        user=OLD_DB_CONFIG["user"],
        password=OLD_DB_CONFIG["password"],
        cursor_factory=RealDictCursor
    )


def get_new_db_session():
    """Create a session for the new VPS database."""
    engine = create_engine(NEW_DATABASE_URL)
    Base.metadata.create_all(engine)  # Create tables if not exist
    Session = sessionmaker(bind=engine)
    return Session()


def migrate_groups(old_conn, new_session):
    """Migrate groups from old to new database."""
    print("Migrating groups...")
    cursor = old_conn.cursor()
    cursor.execute('SELECT * FROM "group"')
    groups = cursor.fetchall()
    
    id_mapping = {}
    for g in groups:
        new_group = JournalGroup(
            name=g["name"],
            description=g.get("description"),
            is_active=g.get("is_active", True),
            created_at=g.get("created_at") or datetime.utcnow(),
            updated_at=g.get("updated_at")
        )
        new_session.add(new_group)
        new_session.flush()
        id_mapping[g["id"]] = new_group.id
    
    new_session.commit()
    print(f"  Migrated {len(groups)} groups")
    return id_mapping


def migrate_users(old_conn, new_session, group_id_mapping):
    """Migrate users from old to new database."""
    print("Migrating users...")
    cursor = old_conn.cursor()
    cursor.execute('SELECT * FROM "user"')
    users = cursor.fetchall()
    
    id_mapping = {}
    migrated = 0
    skipped = 0
    
    for u in users:
        # Check if user already exists by email
        existing = new_session.query(User).filter(User.email == u["email"]).first()
        if existing:
            # Update existing user to have journal access
            existing.has_journal_access = True
            if u.get("group_id") and u["group_id"] in group_id_mapping:
                existing.group_id = group_id_mapping[u["group_id"]]
            id_mapping[u["id"]] = existing.id
            skipped += 1
            continue
        
        new_user = User(
            name=u.get("full_name") or u.get("email", "").split("@")[0],
            email=u["email"],
            password_hash=u["password"],  # bcrypt hash is compatible
            role="admin" if u.get("is_admin") else "user",
            is_active=u.get("is_active", True) if "is_active" in u else True,
            created_at=u.get("created_at") or datetime.utcnow(),
            has_journal_access=True,  # All imported users get journal access
            group_id=group_id_mapping.get(u.get("group_id")) if u.get("group_id") else None
        )
        new_session.add(new_user)
        new_session.flush()
        id_mapping[u["id"]] = new_user.id
        migrated += 1
    
    new_session.commit()
    print(f"  Migrated {migrated} new users, {skipped} existing users updated")
    return id_mapping


def migrate_profiles(old_conn, new_session, user_id_mapping):
    """Migrate profiles from old to new database."""
    print("Migrating profiles...")
    cursor = old_conn.cursor()
    cursor.execute("SELECT * FROM profile")
    profiles = cursor.fetchall()
    
    id_mapping = {}
    for p in profiles:
        if p["user_id"] not in user_id_mapping:
            continue
            
        new_profile = JournalProfile(
            user_id=user_id_mapping[p["user_id"]],
            name=p["name"],
            mode=p["mode"],
            description=p.get("description"),
            is_active=p.get("is_active", True),
            created_at=p.get("created_at") or datetime.utcnow(),
            updated_at=p.get("updated_at"),
            ftp_host=p.get("ftp_host"),
            ftp_port=p.get("ftp_port"),
            ftp_username=p.get("ftp_username"),
            ftp_password=p.get("ftp_password")
        )
        new_session.add(new_profile)
        new_session.flush()
        id_mapping[p["id"]] = new_profile.id
    
    new_session.commit()
    print(f"  Migrated {len(id_mapping)} profiles")
    return id_mapping


def migrate_import_batches(old_conn, new_session, user_id_mapping, profile_id_mapping):
    """Migrate import batches from old to new database."""
    print("Migrating import batches...")
    cursor = old_conn.cursor()
    cursor.execute("SELECT * FROM import_batch")
    batches = cursor.fetchall()
    
    id_mapping = {}
    for b in batches:
        if b["user_id"] not in user_id_mapping:
            continue
        if b["profile_id"] not in profile_id_mapping:
            continue
            
        new_batch = ImportBatch(
            user_id=user_id_mapping[b["user_id"]],
            profile_id=profile_id_mapping[b["profile_id"]],
            filename=b["filename"],
            filepath=b["filepath"],
            imported_at=b.get("imported_at") or datetime.utcnow()
        )
        new_session.add(new_batch)
        new_session.flush()
        id_mapping[b["id"]] = new_batch.id
    
    new_session.commit()
    print(f"  Migrated {len(id_mapping)} import batches")
    return id_mapping


def migrate_journal_entries(old_conn, new_session, user_id_mapping, profile_id_mapping, batch_id_mapping):
    """Migrate journal entries from old to new database."""
    print("Migrating journal entries (this may take a while)...")
    cursor = old_conn.cursor()
    cursor.execute("SELECT * FROM journal_entry")
    entries = cursor.fetchall()
    
    migrated = 0
    batch_size = 1000
    
    for i, e in enumerate(entries):
        if e["user_id"] not in user_id_mapping:
            continue
        if e["profile_id"] not in profile_id_mapping:
            continue
            
        new_entry = JournalEntry(
            user_id=user_id_mapping[e["user_id"]],
            profile_id=profile_id_mapping[e["profile_id"]],
            symbol=e["symbol"],
            direction=e["direction"],
            entry_price=e["entry_price"],
            exit_price=e["exit_price"],
            stop_loss=e.get("stop_loss"),
            take_profit=e.get("take_profit"),
            high_price=e.get("high_price"),
            low_price=e.get("low_price"),
            variables=e.get("variables"),
            quantity=e["quantity"],
            contract_size=e.get("contract_size"),
            instrument_type=e["instrument_type"],
            risk_amount=e["risk_amount"],
            pnl=e["pnl"],
            strategy=e.get("strategy"),
            setup=e.get("setup"),
            rr=e["rr"],
            notes=e.get("notes"),
            date=e["date"],
            created_at=e.get("created_at") or datetime.utcnow(),
            updated_at=e.get("updated_at"),
            commission=e.get("commission"),
            slippage=e.get("slippage"),
            open_time=e.get("open_time"),
            close_time=e.get("close_time"),
            duration_seconds=e.get("duration_seconds"),
            duration_minutes=e.get("duration_minutes"),
            duration_hours=e.get("duration_hours"),
            duration_category=e.get("duration_category"),
            entry_screenshot=e.get("entry_screenshot"),
            exit_screenshot=e.get("exit_screenshot"),
            import_batch_id=batch_id_mapping.get(e.get("import_batch_id")),
            extra_data=e.get("extra_data")
        )
        new_session.add(new_entry)
        migrated += 1
        
        # Commit in batches
        if migrated % batch_size == 0:
            new_session.commit()
            print(f"  Progress: {migrated}/{len(entries)} entries...")
    
    new_session.commit()
    print(f"  Migrated {migrated} journal entries")


def migrate_strategies(old_conn, new_session, user_id_mapping):
    """Migrate strategies from old to new database."""
    print("Migrating strategies...")
    cursor = old_conn.cursor()
    cursor.execute("SELECT * FROM strategy")
    strategies = cursor.fetchall()
    
    migrated = 0
    for s in strategies:
        if s["user_id"] not in user_id_mapping:
            continue
            
        new_strategy = Strategy(
            user_id=user_id_mapping[s["user_id"]],
            name=s["name"],
            description=s.get("description"),
            entry_rules=s["entry_rules"],
            exit_rules=s["exit_rules"],
            risk_management=s["risk_management"],
            created_at=s.get("created_at") or datetime.utcnow(),
            updated_at=s.get("updated_at")
        )
        new_session.add(new_strategy)
        migrated += 1
    
    new_session.commit()
    print(f"  Migrated {migrated} strategies")


def migrate_feature_flags(old_conn, new_session):
    """Migrate feature flags from old to new database."""
    print("Migrating feature flags...")
    cursor = old_conn.cursor()
    cursor.execute("SELECT * FROM feature_flags")
    flags = cursor.fetchall()
    
    for f in flags:
        # Check if flag already exists
        existing = new_session.query(FeatureFlag).filter(FeatureFlag.name == f["name"]).first()
        if existing:
            continue
            
        new_flag = FeatureFlag(
            name=f["name"],
            enabled=f.get("enabled", False),
            description=f.get("description"),
            category=f.get("category"),
            created_at=f.get("created_at") or datetime.utcnow(),
            updated_at=f.get("updated_at")
        )
        new_session.add(new_flag)
    
    new_session.commit()
    print(f"  Migrated {len(flags)} feature flags")


def main():
    print("=" * 60)
    print("JOURNAL DATA MIGRATION")
    print("=" * 60)
    print(f"Source: {OLD_DB_CONFIG['host']}:{OLD_DB_CONFIG['database']}")
    print(f"Target: {NEW_DATABASE_URL.split('@')[1] if '@' in NEW_DATABASE_URL else NEW_DATABASE_URL}")
    print("=" * 60)
    
    # Connect to databases
    print("\nConnecting to old VPS database...")
    old_conn = get_old_db_connection()
    print("Connected!")
    
    print("Creating new database session...")
    new_session = get_new_db_session()
    print("Connected!")
    
    try:
        # Migrate in order (respecting foreign keys)
        group_id_mapping = migrate_groups(old_conn, new_session)
        user_id_mapping = migrate_users(old_conn, new_session, group_id_mapping)
        profile_id_mapping = migrate_profiles(old_conn, new_session, user_id_mapping)
        batch_id_mapping = migrate_import_batches(old_conn, new_session, user_id_mapping, profile_id_mapping)
        migrate_journal_entries(old_conn, new_session, user_id_mapping, profile_id_mapping, batch_id_mapping)
        migrate_strategies(old_conn, new_session, user_id_mapping)
        migrate_feature_flags(old_conn, new_session)
        
        print("\n" + "=" * 60)
        print("MIGRATION COMPLETE!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\nERROR: {e}")
        new_session.rollback()
        raise
    finally:
        old_conn.close()
        new_session.close()


if __name__ == "__main__":
    main()
