# routes/chart_routes.py

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, ChartDrawing, ChartSettings, UserPreferences, User
from datetime import datetime

chart_bp = Blueprint('chart', __name__)


@chart_bp.route('/drawings/<symbol>', methods=['GET'])
@jwt_required()
def get_drawings(symbol):
    """
    Get saved drawings for a specific symbol.
    Query params:
    - session_id: Optional backtesting session ID
    """
    try:
        user_id = get_jwt_identity()
        session_id = request.args.get('session_id', None)
        
        # Query for user's drawings for this symbol
        query = ChartDrawing.query.filter_by(
            user_id=user_id,
            symbol=symbol
        )
        
        # Filter by session if provided
        if session_id:
            query = query.filter_by(session_id=session_id)
        else:
            query = query.filter_by(session_id=None)
        
        drawing_record = query.first()
        
        if not drawing_record:
            return jsonify({
                'success': True,
                'drawings': []
            }), 200
        
        return jsonify({
            'success': True,
            'drawings': drawing_record.drawings_data,
            'updated_at': drawing_record.updated_at.isoformat()
        }), 200
        
    except Exception as e:
        print(f"❌ Error loading drawings: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@chart_bp.route('/drawings/<symbol>', methods=['POST'])
@jwt_required()
def save_drawings(symbol):
    """
    Save drawings for a specific symbol.
    Body:
    - drawings: Array of drawing objects
    - session_id: Optional backtesting session ID
    """
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or 'drawings' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing drawings data'
            }), 400
        
        drawings = data.get('drawings', [])
        session_id = data.get('session_id', None)
        
        # Find existing record or create new one
        query = ChartDrawing.query.filter_by(
            user_id=user_id,
            symbol=symbol
        )
        
        if session_id:
            query = query.filter_by(session_id=session_id)
        else:
            query = query.filter_by(session_id=None)
        
        drawing_record = query.first()
        
        if drawing_record:
            # Update existing record
            drawing_record.drawings_data = drawings
            drawing_record.updated_at = datetime.utcnow()
        else:
            # Create new record
            drawing_record = ChartDrawing(
                user_id=user_id,
                symbol=symbol,
                session_id=session_id,
                drawings_data=drawings
            )
            db.session.add(drawing_record)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Drawings saved successfully',
            'count': len(drawings),
            'updated_at': drawing_record.updated_at.isoformat()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error saving drawings: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@chart_bp.route('/drawings/<symbol>', methods=['DELETE'])
@jwt_required()
def delete_drawings(symbol):
    """
    Delete all drawings for a specific symbol.
    Query params:
    - session_id: Optional backtesting session ID
    """
    try:
        user_id = get_jwt_identity()
        session_id = request.args.get('session_id', None)
        
        # Find and delete record
        query = ChartDrawing.query.filter_by(
            user_id=user_id,
            symbol=symbol
        )
        
        if session_id:
            query = query.filter_by(session_id=session_id)
        else:
            query = query.filter_by(session_id=None)
        
        drawing_record = query.first()
        
        if drawing_record:
            db.session.delete(drawing_record)
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Drawings deleted successfully'
            }), 200
        else:
            return jsonify({
                'success': True,
                'message': 'No drawings found to delete'
            }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error deleting drawings: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@chart_bp.route('/drawings', methods=['GET'])
@jwt_required()
def get_all_user_drawings():
    """
    Get all drawings for the current user across all symbols.
    Useful for syncing or backup purposes.
    """
    try:
        user_id = get_jwt_identity()
        
        drawings = ChartDrawing.query.filter_by(user_id=user_id).all()
        
        result = []
        for drawing_record in drawings:
            result.append({
                'symbol': drawing_record.symbol,
                'session_id': drawing_record.session_id,
                'drawings': drawing_record.drawings_data,
                'updated_at': drawing_record.updated_at.isoformat()
            })
        
        return jsonify({
            'success': True,
            'drawings': result,
            'total': len(result)
        }), 200
        
    except Exception as e:
        print(f"❌ Error loading all drawings: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ============================================================================
# Chart Settings Endpoints
# ============================================================================

@chart_bp.route('/settings/<symbol>', methods=['GET'])
@jwt_required()
def get_settings(symbol):
    """
    Get saved chart settings for a specific symbol.
    Query params:
    - session_id: Optional backtesting session ID
    """
    try:
        user_id = get_jwt_identity()
        session_id = request.args.get('session_id', None)
        
        # Query for user's settings for this symbol
        query = ChartSettings.query.filter_by(
            user_id=user_id,
            symbol=symbol
        )
        
        # Filter by session if provided
        if session_id:
            query = query.filter_by(session_id=session_id)
        else:
            query = query.filter_by(session_id=None)
        
        settings_record = query.first()
        
        if not settings_record:
            return jsonify({
                'success': True,
                'settings': {}
            }), 200
        
        return jsonify({
            'success': True,
            'settings': settings_record.settings_data,
            'updated_at': settings_record.updated_at.isoformat()
        }), 200
        
    except Exception as e:
        print(f"❌ Error loading settings: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@chart_bp.route('/settings/<symbol>', methods=['POST'])
@jwt_required()
def save_settings(symbol):
    """
    Save chart settings for a specific symbol.
    Body:
    - settings: Chart settings object (chart type, colors, indicators, etc.)
    - session_id: Optional backtesting session ID
    """
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or 'settings' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing settings data'
            }), 400
        
        settings = data.get('settings', {})
        session_id = data.get('session_id', None)
        
        # Find existing record or create new one
        query = ChartSettings.query.filter_by(
            user_id=user_id,
            symbol=symbol
        )
        
        if session_id:
            query = query.filter_by(session_id=session_id)
        else:
            query = query.filter_by(session_id=None)
        
        settings_record = query.first()
        
        if settings_record:
            # Update existing record
            settings_record.settings_data = settings
            settings_record.updated_at = datetime.utcnow()
        else:
            # Create new record
            settings_record = ChartSettings(
                user_id=user_id,
                symbol=symbol,
                session_id=session_id,
                settings_data=settings
            )
            db.session.add(settings_record)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Settings saved successfully',
            'updated_at': settings_record.updated_at.isoformat()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error saving settings: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@chart_bp.route('/settings/<symbol>', methods=['DELETE'])
@jwt_required()
def delete_settings(symbol):
    """
    Delete chart settings for a specific symbol.
    Query params:
    - session_id: Optional backtesting session ID
    """
    try:
        user_id = get_jwt_identity()
        session_id = request.args.get('session_id', None)
        
        # Find and delete record
        query = ChartSettings.query.filter_by(
            user_id=user_id,
            symbol=symbol
        )
        
        if session_id:
            query = query.filter_by(session_id=session_id)
        else:
            query = query.filter_by(session_id=None)
        
        settings_record = query.first()
        
        if settings_record:
            db.session.delete(settings_record)
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Settings deleted successfully'
            }), 200
        else:
            return jsonify({
                'success': True,
                'message': 'No settings found to delete'
            }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error deleting settings: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ============================================================================
# User Preferences Endpoints
# ============================================================================

@chart_bp.route('/preferences', methods=['GET'])
@jwt_required()
def get_preferences():
    """
    Get all user preferences.
    """
    try:
        user_id = get_jwt_identity()
        
        # Get or create preferences record
        prefs = UserPreferences.query.filter_by(user_id=user_id).first()
        
        if not prefs:
            # Return empty defaults if no preferences exist
            return jsonify({
                'success': True,
                'preferences': {
                    'tool_defaults': {},
                    'timeframe_favorites': [],
                    'chart_templates': {},
                    'keyboard_shortcuts': {},
                    'drawing_tool_styles': {},
                    'panel_sync_settings': {},
                    'panel_settings': {},
                    'market_config': {},
                    'protection_settings': [],
                    'general_settings': {},
                    'keep_drawing_enabled': False
                }
            }), 200
        
        return jsonify({
            'success': True,
            'preferences': {
                'tool_defaults': prefs.tool_defaults or {},
                'timeframe_favorites': prefs.timeframe_favorites or [],
                'chart_templates': prefs.chart_templates or {},
                'keyboard_shortcuts': prefs.keyboard_shortcuts or {},
                'drawing_tool_styles': prefs.drawing_tool_styles or {},
                'panel_sync_settings': prefs.panel_sync_settings or {},
                'panel_settings': prefs.panel_settings or {},
                'market_config': prefs.market_config or {},
                'protection_settings': prefs.protection_settings or [],
                'general_settings': prefs.general_settings or {},
                'keep_drawing_enabled': prefs.keep_drawing_enabled or False
            },
            'updated_at': prefs.updated_at.isoformat()
        }), 200
        
    except Exception as e:
        print(f"❌ Error loading preferences: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@chart_bp.route('/preferences', methods=['POST'])
@jwt_required()
def update_preferences():
    """
    Update user preferences (partial update supported).
    Body can contain any combination of:
    - tool_defaults
    - timeframe_favorites
    - chart_templates
    - keyboard_shortcuts
    - drawing_tool_styles
    - panel_sync_settings
    - panel_settings
    - market_config
    - protection_settings
    - general_settings
    - keep_drawing_enabled
    """
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        # Get or create preferences record
        prefs = UserPreferences.query.filter_by(user_id=user_id).first()
        
        if not prefs:
            prefs = UserPreferences(user_id=user_id)
            db.session.add(prefs)
        
        # Update only provided fields
        if 'tool_defaults' in data:
            prefs.tool_defaults = data['tool_defaults']
        if 'timeframe_favorites' in data:
            prefs.timeframe_favorites = data['timeframe_favorites']
        if 'chart_templates' in data:
            prefs.chart_templates = data['chart_templates']
        if 'keyboard_shortcuts' in data:
            prefs.keyboard_shortcuts = data['keyboard_shortcuts']
        if 'drawing_tool_styles' in data:
            prefs.drawing_tool_styles = data['drawing_tool_styles']
        if 'panel_sync_settings' in data:
            prefs.panel_sync_settings = data['panel_sync_settings']
        if 'panel_settings' in data:
            prefs.panel_settings = data['panel_settings']
        if 'market_config' in data:
            prefs.market_config = data['market_config']
        if 'protection_settings' in data:
            prefs.protection_settings = data['protection_settings']
        if 'general_settings' in data:
            prefs.general_settings = data['general_settings']
        if 'keep_drawing_enabled' in data:
            prefs.keep_drawing_enabled = data['keep_drawing_enabled']
        
        prefs.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Preferences updated successfully',
            'updated_at': prefs.updated_at.isoformat()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error updating preferences: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
