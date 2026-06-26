# routes/journal/import_export.py
"""
Import and export routes for journal entries.
Handles: Excel import, CSV export, import history
"""

from flask import request, jsonify, send_file, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, JournalEntry, User, ImportBatch, LiveJournalAccount, Profile
from datetime import datetime, timezone
import os
import re
import base64
import uuid
import io
import json
import pandas as pd
from csv_journal import parse_trades_csv_bytes, preview_trades_csv_bytes
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

# Filenames: <user_id>_<uuid32>.<ext> — used for unguessable public GET URLs
SCREENSHOT_FILENAME_RE = re.compile(r'^(\d+)_[a-f0-9]{32}\.(png|jpg|jpeg)$')
MAX_SCREENSHOT_BYTES = 12 * 1024 * 1024


@journal_bp.route('/upload-screenshot', methods=['POST'])
@jwt_required()
def upload_journal_screenshot():
    """
    Accept a chart/screenshot image as data URL or raw base64; save under uploads/screenshots
    and return a short /api/journal/screenshots/... path for entry_screenshot / exit_screenshot.
    """
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json(silent=True) or {}
        data_url = data.get('data_url') or data.get('dataUrl')
        raw_b64 = data.get('image_base64')

        binary = None
        ext = 'png'
        if data_url and isinstance(data_url, str) and data_url.startswith('data:'):
            if ',' not in data_url:
                return jsonify({'error': 'Invalid data URL'}), 400
            try:
                header, b64 = data_url.split(',', 1)
                lower_h = header.lower()
                if 'jpeg' in lower_h or 'jpg' in lower_h:
                    ext = 'jpg'
                elif 'png' in lower_h:
                    ext = 'png'
                else:
                    return jsonify({'error': 'Only PNG or JPEG images are supported'}), 400
                binary = base64.b64decode(b64)
            except Exception:
                return jsonify({'error': 'Invalid image data'}), 400
        elif raw_b64 and isinstance(raw_b64, str):
            try:
                binary = base64.b64decode(raw_b64)
            except Exception:
                return jsonify({'error': 'Invalid base64'}), 400
        else:
            return jsonify({'error': 'Missing data_url or image_base64'}), 400

        if not binary or len(binary) > MAX_SCREENSHOT_BYTES:
            return jsonify({'error': 'Image too large or empty'}), 400

        fname = f'{user_id}_{uuid.uuid4().hex}.{ext}'
        path = os.path.join(SCREENSHOTS_FOLDER, fname)
        with open(path, 'wb') as f:
            f.write(binary)

        url = f'/api/journal/screenshots/{fname}'
        return jsonify({'url': url, 'path': url}), 201

    except Exception as e:
        print(' upload_journal_screenshot error:', e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/screenshots/<filename>', methods=['GET'])
def serve_journal_screenshot(filename):
    """Serve uploaded journal screenshots (opaque filename = security)."""
    safe = os.path.basename(filename)
    if not SCREENSHOT_FILENAME_RE.match(safe):
        return jsonify({'error': 'Not found'}), 404
    full = os.path.join(SCREENSHOTS_FOLDER, safe)
    if not os.path.isfile(full):
        return jsonify({'error': 'Not found'}), 404
    return send_from_directory(SCREENSHOTS_FOLDER, safe)


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


def _ms_to_naive_dt(ms):
    if ms is None:
        return None
    try:
        value = float(ms)
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None
    return datetime.fromtimestamp(value / 1000.0, tz=timezone.utc).replace(tzinfo=None)


def _normalize_csv_direction(raw):
    text = str(raw or "buy").strip().lower()
    if text in {"sell", "short", "s", "-1", "0"}:
        return "short"
    return "long"


def _chart_trade_to_journal_entry(trade, *, user_id, profile_id, batch_id=None):
    direction = _normalize_csv_direction(trade.get("direction"))
    symbol = str(trade.get("ticker") or trade.get("symbol") or "UNKNOWN").upper()
    entry_price = float(trade.get("entryPrice") or trade.get("entry") or 0.0)
    exit_price = float(trade.get("exitPrice") or trade.get("exit") or entry_price or 0.0)
    quantity = float(trade.get("quantity") or trade.get("position_size") or 1.0)
    if quantity <= 0:
        quantity = 1.0
    pnl_raw = trade.get("netPnL")
    if pnl_raw is None:
        pnl_raw = trade.get("pnl")
    pnl = float(pnl_raw) if pnl_raw is not None else None
    rr_raw = trade.get("rMultiple")
    if rr_raw is None:
        rr_raw = trade.get("rr")
    rr = float(rr_raw) if rr_raw is not None else None
    open_time = _ms_to_naive_dt(trade.get("openTime") or trade.get("entryTime"))
    close_time = _ms_to_naive_dt(trade.get("closeTime") or trade.get("exitTime"))
    trade_date = open_time or close_time or datetime.utcnow()
    notes_parts = []
    for key in ("preTradeNotes", "notes", "postNotes", "postTradeNotes"):
        val = trade.get(key)
        if isinstance(val, dict):
            text = val.get("setup") or val.get("text") or val.get("notes")
            if text:
                notes_parts.append(str(text))
        elif val:
            notes_parts.append(str(val))
    notes = "\n\n".join(dict.fromkeys([p for p in notes_parts if p])) or None
    setup = str(trade.get("setup") or "CSV").strip() or "CSV"
    stop_loss = trade.get("stopLoss") or trade.get("planned_sl") or trade.get("sl")
    take_profit = trade.get("takeProfit") or trade.get("target") or trade.get("tp")
    commission = trade.get("commission_at_entry") or trade.get("commission") or trade.get("commission_total")
    slippage = trade.get("slippage")
    return JournalEntry(
        user_id=user_id,
        profile_id=profile_id,
        symbol=symbol,
        direction=direction,
        entry_price=entry_price,
        exit_price=exit_price,
        stop_loss=float(stop_loss) if stop_loss is not None and stop_loss != "" else None,
        take_profit=float(take_profit) if take_profit is not None and take_profit != "" else None,
        quantity=quantity,
        pnl=pnl,
        rr=rr,
        notes=notes,
        strategy=setup,
        setup=setup,
        commission=float(commission) if commission is not None and commission != "" else None,
        slippage=float(slippage) if slippage is not None and slippage != "" else None,
        open_time=open_time,
        close_time=close_time,
        date=trade_date,
        import_batch_id=batch_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        extra_data={
            "csv_import": True,
            "trade_id": trade.get("tradeId") or trade.get("trade_id") or trade.get("id"),
            "manual_dashboard": True,
        },
    )


def _get_live_journal_account(user_id, account_id):
    return LiveJournalAccount.query.filter_by(
        id=account_id,
        user_id=user_id,
        status="active",
    ).first()


def _activate_live_journal_profile(user_id, profile_id):
    Profile.query.filter_by(user_id=user_id).update({"is_active": False})
    profile = Profile.query.filter_by(id=profile_id, user_id=user_id).first()
    if profile:
        profile.is_active = True
        profile.updated_at = datetime.utcnow()


@journal_bp.route('/live-accounts/<int:account_id>/import-csv/preview', methods=['POST'])
@jwt_required()
def preview_live_account_csv(account_id):
    """Inspect CSV headers and suggest column mapping before live journal import."""
    try:
        user_id = int(get_jwt_identity())
        row = _get_live_journal_account(user_id, account_id)
        if not row:
            return jsonify({"success": False, "error": "Live journal account not found"}), 404
        if 'file' not in request.files:
            return jsonify({"success": False, "error": "No file provided"}), 400
        file = request.files['file']
        if not file.filename:
            return jsonify({"success": False, "error": "No file selected"}), 400
        raw = file.read()
        if len(raw) > 12 * 1024 * 1024:
            return jsonify({"success": False, "error": "CSV file too large (max 12 MB)"}), 413
        preview = preview_trades_csv_bytes(raw)
        errs = preview.get("errors") or []
        if errs:
            return jsonify({"success": False, "message": "CSV preview failed", "errors": errs[:20]}), 400
        return jsonify({"success": True, **preview}), 200
    except Exception as exc:
        print(" preview_live_account_csv error:", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


@journal_bp.route('/live-accounts/<int:account_id>/import-csv', methods=['POST'])
@jwt_required()
def import_live_account_csv(account_id):
    """Bulk-import CSV trades into a live journal account profile."""
    try:
        user_id = int(get_jwt_identity())
        row = _get_live_journal_account(user_id, account_id)
        if not row:
            return jsonify({"success": False, "error": "Live journal account not found"}), 404
        if 'file' not in request.files:
            return jsonify({"success": False, "error": "No file provided"}), 400
        file = request.files['file']
        if not file.filename:
            return jsonify({"success": False, "error": "No file selected"}), 400

        mapping_obj = None
        column_mapping = request.form.get("column_mapping")
        if column_mapping and str(column_mapping).strip():
            try:
                parsed_map = json.loads(column_mapping)
            except json.JSONDecodeError:
                return jsonify({"success": False, "error": "Invalid column_mapping JSON"}), 400
            if not isinstance(parsed_map, dict):
                return jsonify({"success": False, "error": "column_mapping must be a JSON object"}), 400
            mapping_obj = {
                str(k): str(v)
                for k, v in parsed_map.items()
                if v is not None and str(v).strip()
            }

        raw = file.read()
        if len(raw) > 12 * 1024 * 1024:
            return jsonify({"success": False, "error": "CSV file too large (max 12 MB)"}), 413

        parsed = parse_trades_csv_bytes(raw, column_mapping=mapping_obj)
        errs = parsed.get("errors") or []
        if errs:
            return jsonify({"success": False, "message": "CSV parse errors", "errors": errs[:80]}), 400
        trades = parsed.get("trades") or []
        if not trades:
            return jsonify({"success": False, "error": "No trades parsed from CSV"}), 400

        unique_filename = f"{uuid.uuid4()}_{file.filename}"
        filepath = os.path.join(UPLOAD_FOLDER, unique_filename)
        with open(filepath, "wb") as handle:
            handle.write(raw)

        batch = ImportBatch(
            user_id=user_id,
            profile_id=row.profile_id,
            filename=file.filename,
            filepath=filepath,
            imported_at=datetime.utcnow(),
        )
        db.session.add(batch)
        db.session.flush()

        _activate_live_journal_profile(user_id, row.profile_id)
        imported_count = 0
        for trade in trades:
            entry = _chart_trade_to_journal_entry(
                trade,
                user_id=user_id,
                profile_id=row.profile_id,
                batch_id=batch.id,
            )
            db.session.add(entry)
            imported_count += 1

        db.session.commit()
        journal_len = JournalEntry.query.filter_by(user_id=user_id, profile_id=row.profile_id).count()
        warnings = list(parsed.get("warnings") or [])
        return jsonify({
            "success": True,
            "imported": imported_count,
            "journal_len": journal_len,
            "mode": "append",
            "batch_id": batch.id,
            "warnings": warnings[:20],
        }), 201
    except Exception as exc:
        db.session.rollback()
        print(" import_live_account_csv error:", exc)
        return jsonify({"success": False, "error": str(exc)}), 500


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
