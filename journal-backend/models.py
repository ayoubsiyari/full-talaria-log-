# models.py

from sqlalchemy.dialects.sqlite import JSON
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import secrets
import random

db = SQLAlchemy()


class Group(db.Model):
    __tablename__ = 'group'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # Back-reference to users in this group
    users = db.relationship('User', backref='group', lazy=True)
    
    # Back-reference to group variables
    group_variables = db.relationship('GroupVariable', back_populates='group', cascade='all, delete-orphan')
    
    # Back-reference to group feature flags
    group_feature_flags = db.relationship('GroupFeatureFlags', back_populates='group', cascade='all, delete-orphan')


class GroupFeatureFlags(db.Model):
    __tablename__ = 'group_feature_flags'
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id'), nullable=False)
    feature_name = db.Column(db.String(100), nullable=False)
    enabled = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Back-reference to group
    group = db.relationship('Group', back_populates='group_feature_flags')
    
    # Ensure unique combination of group and feature
    __table_args__ = (db.UniqueConstraint('group_id', 'feature_name', name='uq_group_feature'),)


class GroupVariable(db.Model):
    __tablename__ = 'group_variable'
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    values = db.Column(JSON, nullable=False, default=list)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Back-reference to group
    group = db.relationship('Group', back_populates='group_variables')
    
    # Back-reference to creator
    creator = db.relationship('User', foreign_keys=[created_by])


class User(db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(256), nullable=False)
    profile_image = db.Column(db.String(256), nullable=True)
    is_admin = db.Column(db.Boolean, default=False)
    email_verified = db.Column(db.Boolean, default=False)
    account_type = db.Column(db.String(20), default='individual')  # 'individual', 'group', 'admin'
    verification_code = db.Column(db.String(6), unique=True, nullable=True)
    verification_code_expires = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    full_name = db.Column(db.String(120), nullable=True)
    phone = db.Column(db.String(32), nullable=True)
    country = db.Column(db.String(64), nullable=True)
    initial_balance = db.Column(db.Float, nullable=True, default=0.0)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id'), nullable=True)

    def generate_verification_code(self):
        """Generate a new 6-digit verification code"""
        self.verification_code = f"{random.randint(100000, 999999)}"
        self.verification_code_expires = datetime.utcnow() + timedelta(minutes=10)  # 10 minutes expiry
        return self.verification_code

    def is_verification_code_expired(self):
        """Check if verification code has expired"""
        if not self.verification_code_expires:
            return True
        return datetime.utcnow() > self.verification_code_expires

    def get_group_feature_flags(self):
        """Get feature flags for this user's group"""
        if not self.group_id:
            return {}
        
        group_flags = GroupFeatureFlags.query.filter_by(group_id=self.group_id).all()
        return {flag.feature_name: flag.enabled for flag in group_flags}

    # Back‐reference so you can do: some_user.import_batches
    import_batches = db.relationship(
        'ImportBatch',
        back_populates='user',
        cascade='all, delete-orphan'
    )

    # Back‐reference so you can do: some_user.journal_entries
    journal_entries = db.relationship(
        'JournalEntry',
        back_populates='user',
        cascade='all, delete-orphan'
    )

    # Back‐reference so you can do: some_user.profiles
    profiles = db.relationship(
        'Profile',
        back_populates='user',
        cascade='all, delete-orphan'
    )

    # Back-reference so you can do: some_user.strategies
    strategies = db.relationship(
        'Strategy',
        back_populates='user',
        cascade='all, delete-orphan'
    )




class Profile(db.Model):
    __tablename__ = 'profile'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    mode = db.Column(db.String(50), nullable=False, default='journal') # backtest, journal, journal_live
    description = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # FTP settings for 'journal_live' mode
    ftp_host = db.Column(db.String(255), nullable=True)
    ftp_port = db.Column(db.Integer, nullable=True, default=21)
    ftp_username = db.Column(db.String(100), nullable=True)
    ftp_password = db.Column(db.String(255), nullable=True) # Note: Should be encrypted in a real application

    # Back‐reference so you can do: some_profile.user
    user = db.relationship('User', back_populates='profiles')

    # Back‐reference so you can do: some_profile.import_batches
    import_batches = db.relationship(
        'ImportBatch',
        back_populates='profile',
        cascade='all, delete-orphan'
    )

    # Back‐reference so you can do: some_profile.journal_entries
    journal_entries = db.relationship(
        'JournalEntry',
        back_populates='profile',
        cascade='all, delete-orphan'
    )




class ImportBatch(db.Model):
    __tablename__ = 'import_batch'

    id = db.Column(db.Integer, primary_key=True)

    # This must match what your routes expect (they do batch = ImportBatch(user_id=…, filename=…, imported_at=…, filepath=…))
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    profile_id = db.Column(db.Integer, db.ForeignKey('profile.id'), nullable=False)
    filename = db.Column(db.String(256), nullable=False)
    imported_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    filepath = db.Column(db.String(512), nullable=False)

    # When you delete a batch, cascade so that its JournalEntry rows go away too
    trades = db.relationship(
        'JournalEntry',
        back_populates='import_batch',
        cascade='all, delete-orphan'
    )

    # Back‐reference so you can do: some_batch.user
    user = db.relationship('User', back_populates='import_batches')
    
    # Back‐reference so you can do: some_batch.profile
    profile = db.relationship('Profile', back_populates='import_batches')


class JournalEntry(db.Model):
    __tablename__ = 'journal_entry'
    id = db.Column(db.Integer, primary_key=True)

    # Every JournalEntry belongs to a user and profile
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    profile_id = db.Column(db.Integer, db.ForeignKey('profile.id'), nullable=False)

    symbol = db.Column(db.String(20), nullable=False)
    direction = db.Column(db.String(10), nullable=False)
    entry_price = db.Column(db.Float, nullable=False)
    exit_price = db.Column(db.Float, nullable=False)
    stop_loss = db.Column(db.Float, nullable=True)
    take_profit = db.Column(db.Float, nullable=True)
    high_price = db.Column(db.Float, nullable=True)
    low_price = db.Column(db.Float, nullable=True)
    variables = db.Column(JSON, default={})


    quantity = db.Column(db.Float, nullable=False, default=1.0)
    contract_size = db.Column(db.Float, nullable=True, default=None)
    instrument_type = db.Column(db.String(20), nullable=False, default='crypto')
    risk_amount = db.Column(db.Float, nullable=False, default=1.0)

    pnl = db.Column(db.Float, nullable=False, default=0.0)
    strategy = db.Column(db.String(64), nullable=True)
    setup = db.Column(db.String(64), nullable=True)
    rr = db.Column(db.Float, nullable=False, default=0.0)
    notes = db.Column(db.Text, nullable=True)
    date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # New fields for advanced metrics
    commission = db.Column(db.Float, nullable=True)
    slippage = db.Column(db.Float, nullable=True)
    open_time = db.Column(db.DateTime, nullable=True)
    close_time = db.Column(db.DateTime, nullable=True)
    
    # Computed duration fields (populated by database triggers)
    duration_seconds = db.Column(db.Integer, nullable=True)
    duration_minutes = db.Column(db.Integer, nullable=True)
    duration_hours = db.Column(db.Float, nullable=True)
    duration_category = db.Column(db.String(50), nullable=True)
    
    # Screenshot fields
    entry_screenshot = db.Column(db.String(512), nullable=True)
    exit_screenshot = db.Column(db.String(512), nullable=True)

    # If this entry was imported via Excel, store the batch_id
    import_batch_id = db.Column(db.Integer, db.ForeignKey('import_batch.id'), nullable=True)
    import_batch = db.relationship('ImportBatch', back_populates='trades')

    extra_data = db.Column(JSON, default={})

    # Back‐reference so you can do: some_entry.user
    user = db.relationship('User', back_populates='journal_entries')
    
    # Back‐reference so you can do: some_entry.profile
    profile = db.relationship('Profile', back_populates='journal_entries')


class Strategy(db.Model):
    __tablename__ = 'strategy'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    entry_rules = db.Column(JSON, nullable=False, default=list)
    exit_rules = db.Column(JSON, nullable=False, default=list)
    risk_management = db.Column(JSON, nullable=False, default=dict)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Back-reference so you can do: some_strategy.user
    user = db.relationship('User', back_populates='strategies')


class FeatureFlags(db.Model):
    __tablename__ = 'feature_flags'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    enabled = db.Column(db.Boolean, default=True)
    description = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(50), nullable=True)  # core, analytics, advanced, admin, test
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)



