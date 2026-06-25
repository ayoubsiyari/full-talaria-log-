"""Strategy template library."""

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from sqlalchemy.exc import IntegrityError

from models import db, StrategyTemplate, Strategy, User, TemplateLike, TemplateClone
from routes.strategy_routes import _strategy_dict
from schemas.strategy_lab import merge_definition_from_legacy, default_strategy_definition
from user_public_id import ensure_user_public_id
from community_publish import (
    apply_publish_filter,
    extract_preview_image,
    normalize_backtest_snapshot,
    parse_publish_settings,
    public_backtest_snapshot,
    DEFAULT_PUBLISH_SETTINGS,
)


template_bp = Blueprint('templates', __name__)


def _uid():
    return int(get_jwt_identity())


def _request_is_admin():
    """JWT is_admin claim or User.role / User.is_admin (matches dashboard admin checks)."""
    claims = get_jwt() or {}
    if claims.get('is_admin'):
        return True
    user = User.query.get(_uid())
    if not user:
        return False
    if getattr(user, 'role', None) == 'admin':
        return True
    return bool(getattr(user, 'is_admin', False))


def _creator_dict(user):
    if not user:
        return None
    ensure_user_public_id(user)
    return {
        'name': user.name,
        'public_id': user.public_id,
    }


def _template_publish_settings(t):
    raw = getattr(t, 'publish_settings', None)
    if isinstance(raw, dict):
        return parse_publish_settings(raw)
    return dict(DEFAULT_PUBLISH_SETTINGS)


def _viewer_is_author(template, viewer_id):
    return bool(
        viewer_id
        and template.creator_user_id
        and int(viewer_id) == int(template.creator_user_id),
    )


def _likes_count(template_id, creator_user_id=None):
    q = TemplateLike.query.filter_by(template_id=template_id)
    if creator_user_id:
        q = q.filter(TemplateLike.user_id != creator_user_id)
    return q.count()


def _copies_count(template):
    """Public copy count — only non-author clones increment clone_count."""
    return int(getattr(template, 'clone_count', 0) or 0)


def _user_copied_template(template_id, user_id):
    if not user_id:
        return False
    return (
        TemplateClone.query.filter_by(
            template_id=template_id, user_id=user_id,
        ).first()
        is not None
    )


def _engagement_for_template(template, viewer_id=None):
    creator_id = template.creator_user_id
    likes_count = _likes_count(template.id, creator_id)
    liked_by_me = False
    if viewer_id and not _viewer_is_author(template, viewer_id):
        liked_by_me = (
            TemplateLike.query.filter_by(
                template_id=template.id, user_id=viewer_id,
            ).first()
            is not None
        )
    copied_by_me = _user_copied_template(template.id, viewer_id) if viewer_id else False
    return likes_count, _copies_count(template), liked_by_me, copied_by_me


def _engagement_map(templates, viewer_id=None):
    """Batch engagement for list endpoints (author excluded from like/copy actions)."""
    out = {}
    for t in templates:
        is_author = _viewer_is_author(t, viewer_id)
        liked_by_me = False
        copied_by_me = False
        if viewer_id and not is_author:
            liked_by_me = (
                TemplateLike.query.filter_by(
                    template_id=t.id, user_id=viewer_id,
                ).first()
                is not None
            )
            copied_by_me = _user_copied_template(t.id, viewer_id)
        out[t.id] = {
            'likes_count': _likes_count(t.id, t.creator_user_id),
            'liked_by_me': liked_by_me,
            'copies_count': _copies_count(t),
            'is_author': is_author,
            'copied_by_me': copied_by_me,
        }
    return out


def _tpl_dict(t, strategy_snapshot=None, viewer_id=None, engagement=None):
    rating_avg = (t.rating_sum / t.rating_count) if t.rating_count else None
    creator = None
    if t.creator_user_id:
        creator = _creator_dict(User.query.get(t.creator_user_id))
    elif t.template_type == 'official':
        creator = {'name': 'Talaria', 'public_id': None}
    settings = _template_publish_settings(t)
    public_defn = (
        strategy_snapshot
        if strategy_snapshot is not None
        else apply_publish_filter(t.definition, settings)
    )
    is_author = _viewer_is_author(t, viewer_id)
    if engagement is None:
        likes_count, copies_count, liked_by_me, copied_by_me = _engagement_for_template(
            t, viewer_id,
        )
    else:
        likes_count = engagement.get('likes_count', 0)
        liked_by_me = engagement.get('liked_by_me', False)
        copies_count = engagement.get('copies_count', _copies_count(t))
        is_author = engagement.get('is_author', is_author)
        copied_by_me = engagement.get('copied_by_me', False)
    allow_clone = (
        bool(settings.get('allow_clone', True))
        and not is_author
        and not copied_by_me
    )
    out = {
        'id': t.id,
        'title': t.title,
        'category': t.category,
        'difficulty': t.difficulty,
        'template_type': t.template_type,
        'status': t.status,
        'clone_count': t.clone_count,
        'copies_count': copies_count,
        'likes_count': likes_count,
        'liked_by_me': liked_by_me,
        'copied_by_me': copied_by_me,
        'is_author': is_author,
        'can_copy': allow_clone,
        'rating_avg': round(rating_avg, 2) if rating_avg is not None else None,
        'rating_count': t.rating_count,
        'created_at': t.created_at.isoformat() if t.created_at else None,
        'creator': creator,
        'publish_settings': settings,
        'allow_clone': allow_clone,
        'preview_image': getattr(t, 'preview_image', None) or extract_preview_image(public_defn),
        'backtest_snapshot': public_backtest_snapshot(t),
        'definition': public_defn,
    }
    return out


def _templates_payload(items, viewer_id=None):
    try:
        eng = _engagement_map(items, viewer_id)
    except Exception as exc:
        current_app.logger.warning("template engagement map failed: %s", exc)
        eng = {}
    out = []
    for t in items:
        try:
            out.append(_tpl_dict(t, viewer_id=viewer_id, engagement=eng.get(t.id)))
        except Exception as exc:
            current_app.logger.warning(
                "skip template id=%s in list payload: %s", getattr(t, "id", "?"), exc,
            )
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
            'templates': _templates_payload(items, viewer_id=None),
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
            'templates': _templates_payload(items, viewer_id=_uid()),
        }), 200
    except Exception as e:
        current_app.logger.exception("list_templates failed")
        return jsonify({'success': False, 'error': str(e)}), 500


@template_bp.route('/templates/<int:template_id>', methods=['GET'])
@jwt_required()
def get_template(template_id):
    try:
        t = StrategyTemplate.query.filter_by(id=template_id, status='published').first()
        if not t:
            return jsonify({'success': False, 'error': 'Not found'}), 404
        return jsonify({'success': True, 'template': _tpl_dict(t, viewer_id=_uid())}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@template_bp.route('/templates/<int:template_id>/like', methods=['POST', 'DELETE'])
@jwt_required()
def like_template(template_id):
    """Toggle like on a published community template (one like per user)."""
    try:
        user_id = _uid()
        t = StrategyTemplate.query.filter_by(id=template_id, status='published').first()
        if not t:
            return jsonify({'success': False, 'error': 'Not found'}), 404
        if _viewer_is_author(t, user_id):
            return jsonify({
                'success': False,
                'error': 'You cannot like your own community strategy',
            }), 403
        existing = TemplateLike.query.filter_by(
            template_id=template_id, user_id=user_id,
        ).first()
        if request.method == 'POST':
            if not existing:
                db.session.add(TemplateLike(template_id=template_id, user_id=user_id))
            db.session.commit()
            liked = True
        else:
            if existing:
                db.session.delete(existing)
            db.session.commit()
            liked = False
        likes_count = _likes_count(template_id, t.creator_user_id)
        return jsonify({
            'success': True,
            'liked': liked,
            'likes_count': likes_count,
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@template_bp.route('/templates/<int:template_id>/clone', methods=['POST'])
@jwt_required()
def clone_template(template_id):
    try:
        user_id = _uid()
        t = StrategyTemplate.query.filter_by(id=template_id, status='published').first()
        if not t:
            return jsonify({'success': False, 'error': 'Not found'}), 404
        if _viewer_is_author(t, user_id):
            return jsonify({
                'success': False,
                'error': 'You cannot copy your own community strategy',
            }), 403
        settings = _template_publish_settings(t)
        if not settings.get('allow_clone', True):
            return jsonify({
                'success': False,
                'error': 'Author disabled copying for this strategy',
            }), 403
        if _user_copied_template(template_id, user_id):
            return jsonify({
                'success': False,
                'error': 'You already copied this strategy to My Strategies',
            }), 403

        defn = t.definition if isinstance(t.definition, dict) else default_strategy_definition()
        defn = apply_publish_filter(defn, settings)
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
        db.session.flush()
        db.session.add(TemplateClone(
            template_id=template_id,
            user_id=user_id,
            strategy_id=new_s.id,
        ))
        t.clone_count = (t.clone_count or 0) + 1
        db.session.commit()
        return jsonify({
            'success': True,
            'strategy': _strategy_dict(new_s),
            'copies_count': _copies_count(t),
            'copied_by_me': True,
        }), 201
    except IntegrityError:
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': 'You already copied this strategy to My Strategies',
        }), 403
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

        settings = parse_publish_settings(data)
        full_defn = merge_definition_from_legacy(strat)
        public_defn = apply_publish_filter(full_defn, settings)
        preview = (
            extract_preview_image(full_defn)
            if settings.get('include_preview_image', True)
            else None
        )
        snapshot = normalize_backtest_snapshot(data.get('backtest_snapshot'), settings)
        creator = User.query.get(user_id)
        ensure_user_public_id(creator)
        tpl = StrategyTemplate(
            source_strategy_id=strat.id,
            creator_user_id=user_id,
            title=strat.name[:200],
            definition=public_defn,
            category=data.get('category'),
            difficulty=data.get('difficulty'),
            template_type='community',
            status='published',
            publish_settings=settings,
            backtest_snapshot=snapshot,
            preview_image=preview,
        )
        db.session.add(tpl)
        db.session.commit()
        return jsonify({
            'success': True,
            'template_id': tpl.id,
            'public_id': creator.public_id if creator else None,
            'publish_settings': settings,
            'backtest_snapshot': snapshot,
        }), 201
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
        if not _request_is_admin():
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


@template_bp.route('/templates/<int:template_id>', methods=['DELETE'])
@jwt_required()
def remove_template_from_community(template_id):
    """Admin: remove a published community/official template from the public library."""
    try:
        if not _request_is_admin():
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        t = StrategyTemplate.query.get(template_id)
        if not t:
            return jsonify({'success': False, 'error': 'Not found'}), 404
        if t.status != 'published':
            return jsonify({'success': False, 'error': 'Template is not published'}), 400
        t.status = 'removed'
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
