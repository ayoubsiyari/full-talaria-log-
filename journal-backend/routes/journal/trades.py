# routes/journal/trades.py
"""
Trade CRUD operations for journal entries.
Handles: add, list, update, delete trades
"""

from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, JournalEntry, User
from datetime import datetime, timezone
from . import journal_bp
from .filters import (
    get_active_profile_id, 
    apply_standard_filters, 
    apply_variables_filter,
    serialize_entry
)


def parse_datetime_field(field_name, field_value):
    """Parse datetime field with support for various formats including minute-only"""
    if not field_value:
        return None
        
    print(f"Parsing {field_name}: '{field_value}'")
    value = str(field_value).strip()
    
    try:
        # Handle various datetime formats
        dt = None
        
        # Format 1: ISO format with T (e.g., "2024-06-01T10:00" or "2024-06-01T10:00:00")
        if 'T' in value:
            # Remove timezone info if present and parse as local time
            if 'Z' in value:
                value = value.replace('Z', '')
            elif '+' in value:
                value = value.split('+')[0]
            elif '-' in value and len(value.split('-')[-1]) <= 2:
                # This is a date, not timezone
                pass
            else:
                # Remove timezone offset if present
                parts = value.split('-')
                if len(parts) > 3:
                    value = '-'.join(parts[:3]) + 'T' + parts[3].split('+')[0].split('-')[0]
            
            # Add seconds if missing
            if value.count(':') == 1:
                value += ':00'
            
            dt = datetime.fromisoformat(value)
        
        # Format 2: Date and time separated by space (e.g., "2024-06-01 10:00")
        elif ' ' in value and len(value.split(' ')) == 2:
            date_part, time_part = value.split(' ')
            # Add seconds if missing
            if time_part.count(':') == 1:
                time_part += ':00'
            value = f"{date_part}T{time_part}"
            dt = datetime.fromisoformat(value)
        
        # Format 3: American format (e.g., "06/01/2024 10:00 AM")
        elif '/' in value and ('AM' in value.upper() or 'PM' in value.upper()):
            # Parse American format
            dt = datetime.strptime(value, '%m/%d/%Y %I:%M %p')
        
        # Format 4: European format (e.g., "01/06/2024 10:00")
        elif '/' in value and value.count('/') == 2:
            # Try different European formats
            try:
                dt = datetime.strptime(value, '%d/%m/%Y %H:%M')
            except ValueError:
                try:
                    dt = datetime.strptime(value, '%m/%d/%Y %H:%M')
                except ValueError:
                    dt = datetime.strptime(value, '%Y/%m/%d %H:%M')
        
        if dt is None:
            raise ValueError(f"Unsupported datetime format: {field_value}")
        
        print(f"  Successfully parsed {field_name}: {dt}")
        return dt
        
    except Exception as e:
        print(f"  ERROR parsing {field_name} '{field_value}': {e}")
        raise ValueError(f"Invalid datetime format for {field_name}: '{field_value}'. Supported formats: YYYY-MM-DDTHH:MM, MM/DD/YYYY HH:MM AM/PM, DD/MM/YYYY HH:MM")


@journal_bp.route('/add', methods=['POST'])
@jwt_required()
def add_entry():
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)
        data = request.get_json()
        print(f"🔍 Backend received data: {data}")

        required_fields = ['symbol', 'direction', 'entry_price', 'exit_price', 'quantity']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # Parse the entry datetime if provided, otherwise use current time in UTC
        if data.get('entry_datetime') and isinstance(data['entry_datetime'], str):
            try:
                trade_date = datetime.fromisoformat(data['entry_datetime'])
            except (ValueError, TypeError) as e:
                print(f"Error parsing entry_datetime '{data['entry_datetime']}': {e}")
                trade_date = datetime.now(timezone.utc)
        else:
            trade_date = datetime.now(timezone.utc)

        # Parse commission, slippage
        commission = float(data['commission']) if data.get('commission') is not None else None
        slippage = float(data['slippage']) if data.get('slippage') is not None else None
        
        # Ensure variables are in the correct format
        variables = data.get('variables', {})
        if variables and isinstance(variables, dict):
            formatted_variables = {}
            for var_name, var_values in variables.items():
                if isinstance(var_values, list):
                    formatted_variables[var_name] = var_values
                elif isinstance(var_values, str):
                    formatted_variables[var_name] = [var_values]
                else:
                    formatted_variables[var_name] = [str(var_values)]
            variables = formatted_variables
        else:
            variables = {}
        
        # Parse open_time and close_time
        open_time = None
        close_time = None
        
        if data.get('open_time'):
            try:
                open_time = parse_datetime_field('open_time', data['open_time'])
            except ValueError as ve:
                return jsonify({'error': str(ve)}), 400
                
        if data.get('close_time'):
            try:
                close_time = parse_datetime_field('close_time', data['close_time'])
            except ValueError as ve:
                return jsonify({'error': str(ve)}), 400
        
        # Validate that close_time is after open_time if both are provided
        if open_time and close_time:
            if close_time <= open_time:
                return jsonify({'error': 'close_time must be after open_time'}), 400

        entry = JournalEntry(
            user_id=user_id,
            profile_id=profile_id,
            symbol=data['symbol'],
            direction=data['direction'],
            entry_price=float(data['entry_price']) if data.get('entry_price') is not None and data['entry_price'] != '' else 0.0,
            exit_price=float(data['exit_price']) if data.get('exit_price') is not None and data['exit_price'] != '' else 0.0,
            stop_loss=float(data['stop_loss']) if data.get('stop_loss') is not None else None,
            take_profit=float(data['take_profit']) if data.get('take_profit') is not None else None,
            high_price=float(data['high_price']) if data.get('high_price') is not None else None,
            low_price=float(data['low_price']) if data.get('low_price') is not None else None,
            quantity=float(data['quantity']) if data.get('quantity') is not None and data['quantity'] != '' else 1.0,
            contract_size=(float(data['contract_size']) if data.get('contract_size') is not None else None),
            instrument_type=data.get('instrument_type', 'crypto'),
            risk_amount=(float(data['risk_amount']) if data.get('risk_amount') is not None else None),
            pnl=(float(data['pnl']) if data.get('pnl') is not None else None),
            rr=(float(data['rr']) if data.get('rr') is not None else None),
            notes=data.get('notes'),
            strategy=data.get('strategy'),
            setup=data.get('setup'),
            commission=commission,
            slippage=slippage,
            open_time=open_time,
            close_time=close_time,
            entry_screenshot=data.get('entry_screenshot'),
            exit_screenshot=data.get('exit_screenshot'),
            date=trade_date,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            extra_data=data.get('extra_data', {}),
            variables=variables
        )
        db.session.add(entry)
        db.session.commit()

        return jsonify({'trade': serialize_entry(entry)}), 201

    except Exception as e:
        db.session.rollback()
        print(" add_entry error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/list', methods=['GET'])
@jwt_required()
def list_entries():
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)
        
        current_user = User.query.get(user_id)
        if not current_user:
            return jsonify({'error': 'User not found'}), 404

        # Build base query - handle group accounts differently
        if current_user.account_type == 'group' and current_user.group_id:
            group_members = User.query.filter_by(
                group_id=current_user.group_id,
                account_type='individual'
            ).all()
            user_ids = [member.id for member in group_members]
            
            if user_ids:
                query = JournalEntry.query.filter(
                    JournalEntry.user_id.in_(user_ids)
                ).order_by(JournalEntry.date.desc())
            else:
                query = JournalEntry.query.filter_by(user_id=-1)
        else:
            query = JournalEntry.query.filter_by(user_id=user_id, profile_id=profile_id).order_by(JournalEntry.date.desc())
        
        # Apply standard filters
        query = apply_standard_filters(query)
        
        # Get filtered entries
        entries = query.all()
        
        # Apply variables filter if provided (post-query filtering)
        variables_param = request.args.get('variables')
        entries = apply_variables_filter(entries, variables_param)

        result = [serialize_entry(e) for e in entries]
        return jsonify(result), 200

    except Exception as e:
        print(" list_entries error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/<int:id>', methods=['PUT'])
@jwt_required()
def update_entry(id):
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json()
        
        entry = JournalEntry.query.filter_by(id=id, user_id=user_id).first()
        if not entry:
            return jsonify({'error': 'Entry not found'}), 404
        
        # Update fields if provided
        if 'symbol' in data:
            entry.symbol = data['symbol']
        if 'direction' in data:
            entry.direction = data['direction']
        if 'entry_price' in data:
            entry.entry_price = float(data['entry_price']) if data['entry_price'] is not None else entry.entry_price
        if 'exit_price' in data:
            entry.exit_price = float(data['exit_price']) if data['exit_price'] is not None else entry.exit_price
        if 'stop_loss' in data:
            entry.stop_loss = float(data['stop_loss']) if data['stop_loss'] is not None else None
        if 'take_profit' in data:
            entry.take_profit = float(data['take_profit']) if data['take_profit'] is not None else None
        if 'high_price' in data:
            entry.high_price = float(data['high_price']) if data['high_price'] is not None else None
        if 'low_price' in data:
            entry.low_price = float(data['low_price']) if data['low_price'] is not None else None
        if 'quantity' in data:
            entry.quantity = float(data['quantity']) if data['quantity'] is not None else entry.quantity
        if 'contract_size' in data:
            entry.contract_size = float(data['contract_size']) if data['contract_size'] is not None else None
        if 'instrument_type' in data:
            entry.instrument_type = data['instrument_type']
        if 'risk_amount' in data:
            entry.risk_amount = float(data['risk_amount']) if data['risk_amount'] is not None else None
        if 'pnl' in data:
            entry.pnl = float(data['pnl']) if data['pnl'] is not None else None
        if 'rr' in data:
            entry.rr = float(data['rr']) if data['rr'] is not None else None
        if 'notes' in data:
            entry.notes = data['notes']
        if 'strategy' in data:
            entry.strategy = data['strategy']
        if 'setup' in data:
            entry.setup = data['setup']
        if 'commission' in data:
            entry.commission = float(data['commission']) if data['commission'] is not None else None
        if 'slippage' in data:
            entry.slippage = float(data['slippage']) if data['slippage'] is not None else None
        if 'entry_screenshot' in data:
            entry.entry_screenshot = data['entry_screenshot']
        if 'exit_screenshot' in data:
            entry.exit_screenshot = data['exit_screenshot']
        if 'extra_data' in data:
            entry.extra_data = data['extra_data']
        if 'variables' in data:
            variables = data['variables']
            if variables and isinstance(variables, dict):
                formatted_variables = {}
                for var_name, var_values in variables.items():
                    if isinstance(var_values, list):
                        formatted_variables[var_name] = var_values
                    elif isinstance(var_values, str):
                        formatted_variables[var_name] = [var_values]
                    else:
                        formatted_variables[var_name] = [str(var_values)]
                entry.variables = formatted_variables
            else:
                entry.variables = {}
        
        # Parse open_time and close_time if provided
        if 'open_time' in data:
            if data['open_time']:
                try:
                    entry.open_time = parse_datetime_field('open_time', data['open_time'])
                except ValueError as ve:
                    return jsonify({'error': str(ve)}), 400
            else:
                entry.open_time = None
                
        if 'close_time' in data:
            if data['close_time']:
                try:
                    entry.close_time = parse_datetime_field('close_time', data['close_time'])
                except ValueError as ve:
                    return jsonify({'error': str(ve)}), 400
            else:
                entry.close_time = None
        
        # Parse date if provided
        if 'entry_datetime' in data and data['entry_datetime']:
            try:
                entry.date = datetime.fromisoformat(data['entry_datetime'])
            except (ValueError, TypeError):
                pass
        
        entry.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({'trade': serialize_entry(entry)}), 200

    except Exception as e:
        db.session.rollback()
        print(" update_entry error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/delete/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_entry(id):
    try:
        user_id = int(get_jwt_identity())
        entry = JournalEntry.query.filter_by(id=id, user_id=user_id).first()
        
        if not entry:
            return jsonify({'error': 'Entry not found'}), 404
        
        db.session.delete(entry)
        db.session.commit()
        
        return jsonify({'message': 'Entry deleted successfully'}), 200

    except Exception as e:
        db.session.rollback()
        print(" delete_entry error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint"""
    return jsonify({'status': 'healthy', 'message': 'Backend is running'}), 200
