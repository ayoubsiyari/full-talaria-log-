# routes/journal/filters.py
"""
Common filtering and query building logic for journal routes.
"""

from flask import request
from models import db, JournalEntry, User, Profile
from datetime import datetime
import json


def get_active_profile_id(user_id):
    """Get the active profile ID for a user"""
    active_profile = Profile.query.filter_by(user_id=user_id, is_active=True).first()
    if not active_profile:
        # Create a default profile if none exists
        default_profile = Profile(
            user_id=user_id,
            name="Default Profile",
            description="Default trading profile",
            is_active=True,
            mode="backtest"
        )
        db.session.add(default_profile)
        db.session.commit()
        return default_profile.id
    return active_profile.id


def build_group_aware_query(user_id, profile_id=None):
    """
    Build a query that handles both individual and group accounts.
    For group accounts, includes all group members' data.
    For individual accounts, includes only their own data.
    """
    current_user = User.query.get(user_id)
    if not current_user:
        print(f"❌ User {user_id} not found")
        return JournalEntry.query.filter_by(user_id=-1)  # Return empty query
    
    print(f"🔍 Building query for user {user_id} (account_type: {current_user.account_type}, group_id: {current_user.group_id})")
    
    if current_user.account_type == 'group' and current_user.group_id:
        # Group account: include trades from all group members
        group_members = User.query.filter_by(
            group_id=current_user.group_id,
            account_type='individual'
        ).all()
        user_ids = [member.id for member in group_members]
        
        print(f"👥 Group {current_user.group_id} has {len(user_ids)} individual members: {user_ids}")
        
        if user_ids:
            query = JournalEntry.query.filter(JournalEntry.user_id.in_(user_ids))
            if profile_id:
                query = query.filter_by(profile_id=profile_id)
                print(f"📊 Group query with profile_id: {profile_id}")
            else:
                print(f"📊 Group query without profile filter")
            return query
        else:
            # No group members found, but let's check if there are any users in this group at all
            all_group_users = User.query.filter_by(group_id=current_user.group_id).all()
            print(f"⚠️ No individual members found in group {current_user.group_id}, but found {len(all_group_users)} total users")
            
            if all_group_users:
                # Include all users in the group, regardless of account type
                all_user_ids = [user.id for user in all_group_users]
                print(f"🔄 Using all group users: {all_user_ids}")
                query = JournalEntry.query.filter(JournalEntry.user_id.in_(all_user_ids))
                if profile_id:
                    query = query.filter_by(profile_id=profile_id)
                return query
            else:
                print(f"❌ No users found in group {current_user.group_id}")
                return JournalEntry.query.filter_by(user_id=-1)
    else:
        # Individual account: show only their own trades
        print(f"👤 Individual account query for user {user_id}")
        query = JournalEntry.query.filter_by(user_id=user_id)
        if profile_id:
            query = query.filter_by(profile_id=profile_id)
            print(f"📊 Individual query with profile_id: {profile_id}")
        else:
            print(f"📊 Individual query without profile filter")
        return query


def apply_standard_filters(query):
    """
    Apply standard filters from request args to a query.
    Returns the filtered query and the filter parameters used.
    """
    from_date = request.args.get('from_date')
    to_date = request.args.get('to_date')
    symbols = request.args.get('symbols')
    directions = request.args.get('directions')
    strategies = request.args.get('strategies')
    setups = request.args.get('setups')
    min_pnl = request.args.get('min_pnl')
    max_pnl = request.args.get('max_pnl')
    min_rr = request.args.get('min_rr')
    max_rr = request.args.get('max_rr')
    batch_ids = request.args.get('batch_ids')
    
    # Apply date filters
    if from_date:
        try:
            from_date_parsed = datetime.strptime(from_date, '%Y-%m-%d')
            query = query.filter(JournalEntry.date >= from_date_parsed)
        except ValueError:
            pass
            
    if to_date:
        try:
            to_date_parsed = datetime.strptime(to_date, '%Y-%m-%d')
            query = query.filter(JournalEntry.date <= to_date_parsed)
        except ValueError:
            pass
    
    # Apply symbol filter
    if symbols:
        symbol_list = [s.strip() for s in symbols.split(',') if s.strip()]
        if symbol_list:
            query = query.filter(JournalEntry.symbol.in_(symbol_list))
    
    # Apply direction filter
    if directions:
        direction_list = [d.strip() for d in directions.split(',') if d.strip()]
        if direction_list:
            query = query.filter(JournalEntry.direction.in_(direction_list))
    
    # Apply strategy filter
    if strategies:
        strategy_list = [s.strip() for s in strategies.split(',') if s.strip()]
        if strategy_list:
            query = query.filter(JournalEntry.strategy.in_(strategy_list))
    
    # Apply setup filter
    if setups:
        setup_list = [s.strip() for s in setups.split(',') if s.strip()]
        if setup_list:
            query = query.filter(JournalEntry.setup.in_(setup_list))
    
    # Apply P&L range filters
    if min_pnl:
        try:
            min_pnl_val = float(min_pnl)
            query = query.filter(JournalEntry.pnl >= min_pnl_val)
        except ValueError:
            pass
    
    if max_pnl:
        try:
            max_pnl_val = float(max_pnl)
            query = query.filter(JournalEntry.pnl <= max_pnl_val)
        except ValueError:
            pass
    
    # Apply R:R range filters
    if min_rr:
        try:
            min_rr_val = float(min_rr)
            query = query.filter(JournalEntry.rr >= min_rr_val)
        except ValueError:
            pass
    
    if max_rr:
        try:
            max_rr_val = float(max_rr)
            query = query.filter(JournalEntry.rr <= max_rr_val)
        except ValueError:
            pass
    
    # Apply import batch filter
    if batch_ids:
        try:
            batch_id_list = [int(b.strip()) for b in batch_ids.split(',') if b.strip()]
            if batch_id_list:
                query = query.filter(JournalEntry.import_batch_id.in_(batch_id_list))
        except ValueError:
            pass
    
    return query


def apply_variables_filter(entries, variables_param):
    """
    Apply variables filter to a list of entries (post-query filtering).
    Returns filtered list of entries.
    """
    if not variables_param:
        return entries
    
    try:
        variables_filter = json.loads(variables_param)
        if not isinstance(variables_filter, dict) or not variables_filter:
            return entries
        
        filtered_entries = []
        for entry in entries:
            matches_all = True
            for var_name, var_values in variables_filter.items():
                if not isinstance(var_values, list) or not var_values:
                    continue
                
                entry_vars = entry.variables or {}
                if isinstance(entry_vars, dict):
                    entry_value = entry_vars.get(var_name)
                    if entry_value:
                        if isinstance(entry_value, list):
                            entry_values = [str(v).strip().lower() for v in entry_value if v]
                        else:
                            entry_values = [str(entry_value).strip().lower()]
                    else:
                        extra_data = entry.extra_data or {}
                        if isinstance(extra_data, dict):
                            entry_value = extra_data.get(var_name)
                            if entry_value:
                                if isinstance(entry_value, list):
                                    entry_values = [str(v).strip().lower() for v in entry_value if v]
                                else:
                                    entry_values = [str(entry_value).strip().lower()]
                            else:
                                entry_values = []
                        else:
                            entry_values = []
                else:
                    entry_values = []
                
                filter_values = [str(v).strip().lower() for v in var_values if v]
                if not any(ev in filter_values for ev in entry_values):
                    matches_all = False
                    break
            
            if matches_all:
                filtered_entries.append(entry)
        
        return filtered_entries
    except (json.JSONDecodeError, TypeError):
        return entries


def serialize_entry(entry):
    """Serialize a journal entry to dictionary format."""
    return {
        'id': entry.id,
        'symbol': entry.symbol,
        'direction': entry.direction,
        'entry_price': entry.entry_price,
        'exit_price': entry.exit_price,
        'high_price': entry.high_price,
        'low_price': entry.low_price,
        'stop_loss': entry.stop_loss,
        'take_profit': entry.take_profit,
        'open_time': entry.open_time.strftime('%Y-%m-%dT%H:%M') if entry.open_time else None,
        'close_time': entry.close_time.strftime('%Y-%m-%dT%H:%M') if entry.close_time else None,
        'quantity': entry.quantity,
        'contract_size': entry.contract_size,
        'instrument_type': entry.instrument_type,
        'risk_amount': entry.risk_amount,
        'pnl': entry.pnl,
        'rr': entry.rr,
        'notes': entry.notes,
        'strategy': entry.strategy,
        'setup': entry.setup,
        'commission': entry.commission,
        'slippage': entry.slippage,
        'entry_screenshot': entry.entry_screenshot,
        'exit_screenshot': entry.exit_screenshot,
        'extra_data': entry.extra_data or {},
        'variables': entry.variables or {},
        'date': entry.date.isoformat() if entry.date else None,
        'created_at': entry.created_at.isoformat() if entry.created_at else None,
        'updated_at': entry.updated_at.isoformat() if entry.updated_at else None
    }
