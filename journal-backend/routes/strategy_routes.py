# backend/routes/strategy_routes.py

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Strategy

strategy_bp = Blueprint('strategy', __name__)

@strategy_bp.route('/strategies', methods=['GET'])
@jwt_required()
def get_strategies():
    """Get all strategies for the current user"""
    try:
        user_id = get_jwt_identity()
        strategies = Strategy.query.filter_by(user_id=user_id).all()
        
        return jsonify({
            'success': True,
            'strategies': [{
                'id': strategy.id,
                'name': strategy.name,
                'description': strategy.description,
                'entry_rules': strategy.entry_rules,
                'exit_rules': strategy.exit_rules,
                'risk_management': strategy.risk_management,
                'created_at': strategy.created_at.isoformat(),
                'updated_at': strategy.updated_at.isoformat()
            } for strategy in strategies]
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@strategy_bp.route('/strategies', methods=['POST'])
@jwt_required()
def create_strategy():
    """Create a new strategy for the current user"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or 'name' not in data:
            return jsonify({'success': False, 'error': 'Strategy name is required'}), 400
        
        new_strategy = Strategy(
            user_id=user_id,
            name=data['name'],
            description=data.get('description', ''),
            entry_rules=data.get('entry_rules', []),
            exit_rules=data.get('exit_rules', []),
            risk_management=data.get('risk_management', {})
        )
        
        db.session.add(new_strategy)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'strategy': {
                'id': new_strategy.id,
                'name': new_strategy.name,
                'description': new_strategy.description,
                'entry_rules': new_strategy.entry_rules,
                'exit_rules': new_strategy.exit_rules,
                'risk_management': new_strategy.risk_management,
                'created_at': new_strategy.created_at.isoformat(),
                'updated_at': new_strategy.updated_at.isoformat()
            }
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@strategy_bp.route('/strategies/<int:strategy_id>', methods=['DELETE'])
@jwt_required()
def delete_strategy(strategy_id):
    """Delete a strategy"""
    try:
        user_id = get_jwt_identity()
        strategy = Strategy.query.filter_by(id=strategy_id, user_id=user_id).first()
        
        if not strategy:
            return jsonify({'success': False, 'error': 'Strategy not found'}), 404
        
        db.session.delete(strategy)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Strategy "{strategy.name}" deleted successfully'
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
