# backend/routes/strategy_routes.py

import os
from collections import defaultdict
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Strategy, JournalEntry
from schemas.strategy_lab import (
    merge_definition_from_legacy,
    normalize_strategy_payload,
)


strategy_bp = Blueprint('strategy', __name__)


def _uid():
    return int(get_jwt_identity())


def _strategy_dict(strategy, include_legacy=True):
    definition = merge_definition_from_legacy(strategy)
    out = {
        'id': strategy.id,
        'name': strategy.name,
        'description': strategy.description or '',
        'strategy_definition': definition,
        'created_at': strategy.created_at.isoformat() if strategy.created_at else None,
        'updated_at': strategy.updated_at.isoformat() if strategy.updated_at else None,
    }
    if include_legacy:
        out['entry_rules'] = strategy.entry_rules
        out['exit_rules'] = strategy.exit_rules
        out['risk_management'] = strategy.risk_management
    return out


@strategy_bp.route('/strategies', methods=['GET'])
@jwt_required()
def get_strategies():
    """Get all strategies for the current user"""
    try:
        user_id = _uid()
        strategies = Strategy.query.filter_by(user_id=user_id).order_by(Strategy.updated_at.desc()).all()

        return jsonify({
            'success': True,
            'strategies': [_strategy_dict(s) for s in strategies]
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@strategy_bp.route('/strategies/<int:strategy_id>', methods=['GET'])
@jwt_required()
def get_strategy(strategy_id):
    """Get one strategy"""
    try:
        user_id = _uid()
        strategy = Strategy.query.filter_by(id=strategy_id, user_id=user_id).first()
        if not strategy:
            return jsonify({'success': False, 'error': 'Strategy not found'}), 404
        return jsonify({'success': True, 'strategy': _strategy_dict(strategy)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@strategy_bp.route('/strategies', methods=['POST'])
@jwt_required()
def create_strategy():
    """Create a new strategy for the current user"""
    try:
        user_id = _uid()
        data = request.get_json() or {}
        normalized = normalize_strategy_payload(data)

        if not normalized.get('name'):
            return jsonify({'success': False, 'error': 'Strategy name is required'}), 400

        max_s = int(os.environ.get('MAX_STRATEGIES_PER_USER', '500'))
        if Strategy.query.filter_by(user_id=user_id).count() >= max_s:
            return jsonify({'success': False, 'error': 'Strategy limit reached'}), 403

        new_strategy = Strategy(
            user_id=user_id,
            name=normalized['name'][:100],
            description=(normalized.get('description') or '')[:5000],
            entry_rules=normalized['entry_rules'],
            exit_rules=normalized['exit_rules'],
            risk_management=normalized['risk_management'],
            strategy_definition=normalized['strategy_definition'],
        )

        db.session.add(new_strategy)
        db.session.commit()

        return jsonify({
            'success': True,
            'strategy': _strategy_dict(new_strategy)
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@strategy_bp.route('/strategies/<int:strategy_id>', methods=['PUT'])
@jwt_required()
def update_strategy(strategy_id):
    """Update strategy (full document)"""
    try:
        user_id = _uid()
        strategy = Strategy.query.filter_by(id=strategy_id, user_id=user_id).first()
        if not strategy:
            return jsonify({'success': False, 'error': 'Strategy not found'}), 404

        data = request.get_json() or {}
        merged = {
            'name': data.get('name', strategy.name),
            'description': data.get('description', strategy.description),
            'entry_rules': data.get('entry_rules', data.get('entryRules', strategy.entry_rules)),
            'exit_rules': data.get('exit_rules', data.get('exitRules', strategy.exit_rules)),
            'risk_management': data.get('risk_management', data.get('riskManagement', strategy.risk_management)),
        }
        if data.get('strategy_definition') is not None or data.get('strategyDefinition') is not None:
            merged['strategy_definition'] = data.get('strategy_definition') or data.get('strategyDefinition')
        else:
            sd = dict(merge_definition_from_legacy(strategy))
            for k in ('instrument', 'instruments', 'market_categories', 'style', 'direction', 'timeframe', 'conditions', 'variables'):
                if k in data:
                    sd[k] = data[k]
            merged['strategy_definition'] = sd
        normalized = normalize_strategy_payload(merged)

        if normalized.get('name'):
            strategy.name = normalized['name'][:100]
        strategy.description = (normalized.get('description') or '')[:5000]
        strategy.entry_rules = normalized['entry_rules']
        strategy.exit_rules = normalized['exit_rules']
        strategy.risk_management = normalized['risk_management']
        strategy.strategy_definition = normalized['strategy_definition']

        db.session.commit()
        return jsonify({'success': True, 'strategy': _strategy_dict(strategy)}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@strategy_bp.route('/strategies/<int:strategy_id>', methods=['DELETE'])
@jwt_required()
def delete_strategy(strategy_id):
    """Delete a strategy"""
    try:
        user_id = _uid()
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


@strategy_bp.route('/strategies/<int:strategy_id>/duplicate', methods=['POST'])
@jwt_required()
def duplicate_strategy(strategy_id):
    try:
        user_id = _uid()
        src = Strategy.query.filter_by(id=strategy_id, user_id=user_id).first()
        if not src:
            return jsonify({'success': False, 'error': 'Strategy not found'}), 404

        copy = Strategy(
            user_id=user_id,
            name=f'{src.name} (Copy)'[:100],
            description=src.description,
            entry_rules=list(src.entry_rules or []),
            exit_rules=list(src.exit_rules or []),
            risk_management=dict(src.risk_management or {}),
            strategy_definition=dict(merge_definition_from_legacy(src)),
        )
        db.session.add(copy)
        db.session.commit()
        return jsonify({'success': True, 'strategy': _strategy_dict(copy)}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@strategy_bp.route('/strategies/<int:strategy_id>/performance', methods=['GET'])
@jwt_required()
def strategy_performance(strategy_id):
    """Aggregate stats for trades linked by strategy_id or strategy name."""
    try:
        user_id = _uid()
        strat = Strategy.query.filter_by(id=strategy_id, user_id=user_id).first()
        if not strat:
            return jsonify({'success': False, 'error': 'Strategy not found'}), 404

        q = JournalEntry.query.filter_by(user_id=user_id).filter(
            (JournalEntry.strategy_id == strategy_id)
            | (JournalEntry.strategy == strat.name)
        )
        trades = q.all()
        n = len(trades)
        if n == 0:
            return jsonify({
                'success': True,
                'performance': {
                    'total_trades': 0,
                    'win_rate': None,
                    'profit_factor': None,
                    'total_pnl': 0,
                    'avg_win': None,
                    'avg_loss': None,
                }
            }), 200

        wins = [t for t in trades if (t.pnl or 0) > 0]
        losses = [t for t in trades if (t.pnl or 0) < 0]
        win_rate = len(wins) / n if n else 0
        gross_win = sum(t.pnl for t in wins)
        gross_loss = abs(sum(t.pnl for t in losses)) or 0
        pf = (gross_win / gross_loss) if gross_loss > 0 else None

        return jsonify({
            'success': True,
            'performance': {
                'total_trades': n,
                'win_rate': round(win_rate, 4),
                'profit_factor': round(pf, 4) if pf is not None else None,
                'total_pnl': round(sum(t.pnl for t in trades), 2),
                'avg_win': round(gross_win / len(wins), 2) if wins else None,
                'avg_loss': round(sum(t.pnl for t in losses) / len(losses), 2) if losses else None,
            }
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@strategy_bp.route('/strategies/<int:strategy_id>/variable-heatmap', methods=['GET'])
@jwt_required()
def variable_heatmap(strategy_id):
    """
    Cross-tab counts for two keys in JournalEntry.variables (JSON).
    Query: var_a, var_b (dot paths or top-level keys — simple top-level only).
    """
    try:
        user_id = _uid()
        strat = Strategy.query.filter_by(id=strategy_id, user_id=user_id).first()
        if not strat:
            return jsonify({'success': False, 'error': 'Strategy not found'}), 404

        var_a = request.args.get('var_a') or 'a'
        var_b = request.args.get('var_b') or 'b'

        q = JournalEntry.query.filter_by(user_id=user_id).filter(
            (JournalEntry.strategy_id == strategy_id)
            | (JournalEntry.strategy == strat.name)
        )
        cells = defaultdict(lambda: defaultdict(int))
        for t in q.all():
            vd = t.variables or {}
            if not isinstance(vd, dict):
                continue
            a = str(vd.get(var_a, ''))
            b = str(vd.get(var_b, ''))
            cells[a][b] += 1

        return jsonify({
            'success': True,
            'heatmap': {ka: dict(vb) for ka, vb in cells.items()},
            'keys': [var_a, var_b],
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@strategy_bp.route('/strategies/export/<int:strategy_id>', methods=['GET'])
@jwt_required()
def export_strategy_json(strategy_id):
    try:
        user_id = _uid()
        strategy = Strategy.query.filter_by(id=strategy_id, user_id=user_id).first()
        if not strategy:
            return jsonify({'success': False, 'error': 'Strategy not found'}), 404
        return jsonify({'success': True, 'export': _strategy_dict(strategy)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
