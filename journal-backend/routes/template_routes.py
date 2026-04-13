"""Strategy template library."""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, StrategyTemplate, Strategy, User
from routes.strategy_routes import _strategy_dict
from schemas.strategy_lab import merge_definition_from_legacy, default_strategy_definition


template_bp = Blueprint('templates', __name__)


def _uid():
    return int(get_jwt_identity())


def _tpl_dict(t, strategy_snapshot=None):
    rating_avg = (t.rating_sum / t.rating_count) if t.rating_count else None
    out = {
        'id': t.id,
        'title': t.title,
        'category': t.category,
        'difficulty': t.difficulty,
        'template_type': t.template_type,
        'status': t.status,
        'clone_count': t.clone_count,
        'rating_avg': round(rating_avg, 2) if rating_avg is not None else None,
        'rating_count': t.rating_count,
        'created_at': t.created_at.isoformat() if t.created_at else None,
    }
    if strategy_snapshot:
        out['definition'] = strategy_snapshot
    else:
        out['definition'] = t.definition
    return out


def _published_templates_list():
    """Query published templates (same filters as list_templates)."""
    q = StrategyTemplate.query.filter(StrategyTemplate.status == 'published')
    cat = request.args.get('category')
    if cat:
        q = q.filter(StrategyTemplate.category == cat)
    ttype = request.args.get('type')
    if ttype:
        q = q.filter(StrategyTemplate.template_type == ttype)
    return q.order_by(StrategyTemplate.clone_count.desc()).limit(100).all()


@template_bp.route('/templates/public', methods=['GET'])
def list_templates_public():
    """Browse published templates without authentication (read-only; use for visitors)."""
    try:
        items = _published_templates_list()
        return jsonify({
            'success': True,
            'templates': [_tpl_dict(t) for t in items],
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@template_bp.route('/templates', methods=['GET'])
@jwt_required()
def list_templates():
    """Browse published templates (official + community)."""
    try:
        items = _published_templates_list()
        return jsonify({
            'success': True,
            'templates': [_tpl_dict(t) for t in items],
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@template_bp.route('/templates/<int:template_id>', methods=['GET'])
@jwt_required()
def get_template(template_id):
    try:
        t = StrategyTemplate.query.filter_by(id=template_id, status='published').first()
        if not t:
            return jsonify({'success': False, 'error': 'Not found'}), 404
        return jsonify({'success': True, 'template': _tpl_dict(t)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@template_bp.route('/templates/<int:template_id>/clone', methods=['POST'])
@jwt_required()
def clone_template(template_id):
    try:
        user_id = _uid()
        t = StrategyTemplate.query.filter_by(id=template_id, status='published').first()
        if not t:
            return jsonify({'success': False, 'error': 'Not found'}), 404

        defn = t.definition if isinstance(t.definition, dict) else default_strategy_definition()
        name = (request.get_json() or {}).get('name') or f'{t.title} (My Copy)'
        new_s = Strategy(
            user_id=user_id,
            name=name[:100],
            description='',
            entry_rules=[],
            exit_rules=[],
            risk_management={},
            strategy_definition=defn,
        )
        db.session.add(new_s)
        t.clone_count = (t.clone_count or 0) + 1
        db.session.commit()
        return jsonify({'success': True, 'strategy': _strategy_dict(new_s)}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@template_bp.route('/templates/<int:template_id>/rate', methods=['POST'])
@jwt_required()
def rate_template(template_id):
    try:
        data = request.get_json() or {}
        stars = int(data.get('stars', 0))
        if stars < 1 or stars > 5:
            return jsonify({'success': False, 'error': 'stars must be 1-5'}), 400
        t = StrategyTemplate.query.get(template_id)
        if not t:
            return jsonify({'success': False, 'error': 'Not found'}), 404
        t.rating_sum = (t.rating_sum or 0) + stars
        t.rating_count = (t.rating_count or 0) + 1
        db.session.commit()
        return jsonify({'success': True, 'rating_avg': t.rating_sum / t.rating_count}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@template_bp.route('/templates/submit', methods=['POST'])
@jwt_required()
def submit_template():
    """Submit user's strategy for community template review."""
    try:
        user_id = _uid()
        data = request.get_json() or {}
        sid = data.get('strategy_id')
        if not sid:
            return jsonify({'success': False, 'error': 'strategy_id required'}), 400
        strat = Strategy.query.filter_by(id=sid, user_id=user_id).first()
        if not strat:
            return jsonify({'success': False, 'error': 'Strategy not found'}), 404

        defn = merge_definition_from_legacy(strat)
        tpl = StrategyTemplate(
            source_strategy_id=strat.id,
            creator_user_id=user_id,
            title=strat.name[:200],
            definition=defn,
            category=data.get('category'),
            difficulty=data.get('difficulty'),
            template_type='community',
            status='pending',
        )
        db.session.add(tpl)
        db.session.commit()
        return jsonify({'success': True, 'template_id': tpl.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@template_bp.route('/users/me/saved-templates', methods=['GET'])
@jwt_required()
def saved_templates_placeholder():
    """Placeholder: persist saved template IDs in user preferences later."""
    return jsonify({'success': True, 'saved': []}), 200


@template_bp.route('/templates/<int:template_id>/approve', methods=['POST'])
@jwt_required()
def approve_template(template_id):
    """Admin: publish a pending community template."""
    try:
        user_id = _uid()
        admin = User.query.get(user_id)
        if not admin or getattr(admin, 'role', None) != 'admin':
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        t = StrategyTemplate.query.get(template_id)
        if not t:
            return jsonify({'success': False, 'error': 'Not found'}), 404
        t.status = 'published'
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
