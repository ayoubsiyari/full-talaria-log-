# routes/journal/import_export.py
"""
Import and export routes for journal entries.
Handles: Excel import, CSV export, import history
"""

from flask import request, jsonify, send_file, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, JournalEntry, User, ImportBatch
from datetime import datetime
import os
import uuid
import io
import pandas as pd
from . import journal_bp
from .filters import (
    get_active_profile_id, 
    apply_standard_filters, 
    apply_variables_filter,
    build_group_aware_query,
    serialize_entry
)

# Make sure uploads folder exists
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', 'uploads')
SCREENSHOTS_FOLDER = os.path.join(UPLOAD_FOLDER, 'screenshots')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(SCREENSHOTS_FOLDER, exist_ok=True)


@journal_bp.route('/export', methods=['GET'])
@jwt_required()
def export_entries():
    """
    Export journal entries to CSV format.
    """
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)
        
        query = build_group_aware_query(user_id, profile_id)
        query = apply_standard_filters(query)
        entries = query.all()
        
        variables_param = request.args.get('variables')
        entries = apply_variables_filter(entries, variables_param)
        
        if not entries:
            return jsonify({'error': 'No entries to export'}), 404
        
        # Create DataFrame
        data = []
        for e in entries:
            row = {
                'Date': e.date.strftime('%Y-%m-%d %H:%M') if e.date else '',
                'Symbol': e.symbol,
                'Direction': e.direction,
                'Entry Price': e.entry_price,
                'Exit Price': e.exit_price,
                'Stop Loss': e.stop_loss,
                'Take Profit': e.take_profit,
                'Quantity': e.quantity,
                'P&L': e.pnl,
                'R:R': e.rr,
                'Strategy': e.strategy,
                'Setup': e.setup,
                'Notes': e.notes,
                'Commission': e.commission,
                'Slippage': e.slippage,
                'Open Time': e.open_time.strftime('%Y-%m-%d %H:%M') if e.open_time else '',
                'Close Time': e.close_time.strftime('%Y-%m-%d %H:%M') if e.close_time else '',
            }
            data.append(row)
        
        df = pd.DataFrame(data)
        
        # Create CSV in memory
        output = io.StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        
        # Create BytesIO for sending
        byte_output = io.BytesIO()
        byte_output.write(output.getvalue().encode('utf-8'))
        byte_output.seek(0)
        
        filename = f"trades_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        
        return send_file(
            byte_output,
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        print(" export_entries error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/import/excel', methods=['POST'])
@jwt_required()
def import_entries_excel():
    """
    Import trades from Excel/CSV file.
    """
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)
        
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Check file extension
        filename = file.filename
        if not (filename.endswith('.xlsx') or filename.endswith('.xls') or filename.endswith('.csv')):
            return jsonify({'error': 'Invalid file format. Please upload .xlsx, .xls, or .csv file'}), 400
        
        # Save file to uploads folder
        unique_filename = f"{uuid.uuid4()}_{filename}"
        filepath = os.path.join(UPLOAD_FOLDER, unique_filename)
        file.save(filepath)
        
        # Read file based on extension
        try:
            if filename.endswith('.csv'):
                df = pd.read_csv(filepath)
            else:
                df = pd.read_excel(filepath)
        except Exception as e:
            os.remove(filepath)
            return jsonify({'error': f'Error reading file: {str(e)}'}), 400
        
        # Create import batch record
        batch = ImportBatch(
            user_id=user_id,
            profile_id=profile_id,
            filename=filename,
            filepath=filepath,
            imported_at=datetime.utcnow()
        )
        db.session.add(batch)
        db.session.flush()  # Get the batch ID
        
        # Column mapping (flexible)
        column_mapping = {
            'symbol': ['symbol', 'pair', 'ticker', 'asset', 'instrument'],
            'direction': ['direction', 'side', 'type', 'position', 'buy/sell'],
            'entry_price': ['entry_price', 'entry', 'open_price', 'open', 'buy_price'],
            'exit_price': ['exit_price', 'exit', 'close_price', 'close', 'sell_price'],
            'quantity': ['quantity', 'qty', 'size', 'amount', 'volume', 'lots'],
            'pnl': ['pnl', 'profit', 'profit_loss', 'p&l', 'net_pnl', 'realized_pnl'],
            'date': ['date', 'trade_date', 'datetime', 'time', 'open_time', 'entry_time'],
            'stop_loss': ['stop_loss', 'sl', 'stop'],
            'take_profit': ['take_profit', 'tp', 'target'],
            'strategy': ['strategy', 'setup_type', 'trade_type'],
            'notes': ['notes', 'comment', 'comments', 'description'],
        }
        
        # Find matching columns
        df_columns_lower = {col.lower().strip(): col for col in df.columns}
        matched_columns = {}
        
        for field, possible_names in column_mapping.items():
            for name in possible_names:
                if name.lower() in df_columns_lower:
                    matched_columns[field] = df_columns_lower[name.lower()]
                    break
        
        # Required columns check
        required = ['symbol', 'direction', 'entry_price', 'exit_price']
        missing = [f for f in required if f not in matched_columns]
        if missing:
            db.session.rollback()
            os.remove(filepath)
            return jsonify({
                'error': f'Missing required columns: {", ".join(missing)}',
                'found_columns': list(df.columns),
                'expected_columns': required
            }), 400
        
        # Import trades
        imported_count = 0
        errors = []
        
        for idx, row in df.iterrows():
            try:
                # Parse required fields
                symbol = str(row[matched_columns['symbol']]).strip()
                direction = str(row[matched_columns['direction']]).strip().lower()
                
                # Normalize direction
                if direction in ['buy', 'long', 'b', '1']:
                    direction = 'long'
                elif direction in ['sell', 'short', 's', '-1', '0']:
                    direction = 'short'
                
                entry_price = float(row[matched_columns['entry_price']])
                exit_price = float(row[matched_columns['exit_price']])
                
                # Parse optional fields
                quantity = float(row[matched_columns.get('quantity', 'quantity')]) if 'quantity' in matched_columns else 1.0
                pnl = float(row[matched_columns['pnl']]) if 'pnl' in matched_columns and pd.notna(row[matched_columns['pnl']]) else None
                
                # Parse date
                trade_date = datetime.utcnow()
                if 'date' in matched_columns:
                    date_val = row[matched_columns['date']]
                    if pd.notna(date_val):
                        if isinstance(date_val, str):
                            try:
                                trade_date = pd.to_datetime(date_val)
                            except:
                                pass
                        elif isinstance(date_val, datetime):
                            trade_date = date_val
                
                # Create entry
                entry = JournalEntry(
                    user_id=user_id,
                    profile_id=profile_id,
                    symbol=symbol,
                    direction=direction,
                    entry_price=entry_price,
                    exit_price=exit_price,
                    quantity=quantity,
                    pnl=pnl,
                    stop_loss=float(row[matched_columns['stop_loss']]) if 'stop_loss' in matched_columns and pd.notna(row[matched_columns['stop_loss']]) else None,
                    take_profit=float(row[matched_columns['take_profit']]) if 'take_profit' in matched_columns and pd.notna(row[matched_columns['take_profit']]) else None,
                    strategy=str(row[matched_columns['strategy']]).strip() if 'strategy' in matched_columns and pd.notna(row[matched_columns['strategy']]) else None,
                    notes=str(row[matched_columns['notes']]).strip() if 'notes' in matched_columns and pd.notna(row[matched_columns['notes']]) else None,
                    date=trade_date,
                    import_batch_id=batch.id,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                
                # Calculate R:R if not provided
                if entry.pnl is not None and entry.stop_loss is not None:
                    risk = abs(entry.entry_price - entry.stop_loss) * entry.quantity
                    if risk > 0:
                        entry.rr = entry.pnl / risk
                
                db.session.add(entry)
                imported_count += 1
                
            except Exception as e:
                errors.append(f"Row {idx + 2}: {str(e)}")
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'imported': imported_count,
            'batch_id': batch.id,
            'errors': errors[:10] if errors else [],  # Return first 10 errors
            'total_errors': len(errors)
        }), 201

    except Exception as e:
        db.session.rollback()
        print(" import_entries_excel error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/import/history', methods=['GET'])
@jwt_required()
def import_history():
    """
    Get import history for the current user.
    """
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)
        
        batches = ImportBatch.query.filter_by(
            user_id=user_id,
            profile_id=profile_id
        ).order_by(ImportBatch.imported_at.desc()).all()
        
        result = []
        for batch in batches:
            trade_count = JournalEntry.query.filter_by(import_batch_id=batch.id).count()
            result.append({
                'id': batch.id,
                'filename': batch.filename,
                'imported_at': batch.imported_at.isoformat(),
                'trade_count': trade_count
            })
        
        return jsonify(result), 200

    except Exception as e:
        print(" import_history error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/import/file/<int:batch_id>', methods=['GET'])
@jwt_required()
def download_imported_file(batch_id):
    """
    Download the original imported file.
    """
    try:
        user_id = int(get_jwt_identity())
        
        batch = ImportBatch.query.filter_by(id=batch_id, user_id=user_id).first()
        if not batch:
            return jsonify({'error': 'Import batch not found'}), 404
        
        if not os.path.exists(batch.filepath):
            return jsonify({'error': 'File no longer exists'}), 404
        
        return send_file(
            batch.filepath,
            as_attachment=True,
            download_name=batch.filename
        )

    except Exception as e:
        print(" download_imported_file error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/import/<int:batch_id>', methods=['DELETE'])
@jwt_required()
def delete_import_batch(batch_id):
    """
    Delete an import batch and all its trades.
    """
    try:
        user_id = int(get_jwt_identity())
        
        batch = ImportBatch.query.filter_by(id=batch_id, user_id=user_id).first()
        if not batch:
            return jsonify({'error': 'Import batch not found'}), 404
        
        # Delete associated trades
        JournalEntry.query.filter_by(import_batch_id=batch_id).delete()
        
        # Delete file if exists
        if os.path.exists(batch.filepath):
            os.remove(batch.filepath)
        
        # Delete batch record
        db.session.delete(batch)
        db.session.commit()
        
        return jsonify({'message': 'Import batch deleted successfully'}), 200

    except Exception as e:
        db.session.rollback()
        print(" delete_import_batch error:", e)
        return jsonify({'error': str(e)}), 500
