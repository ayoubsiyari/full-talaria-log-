# routes/chart_routes.py

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, ChartDrawing, User
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
