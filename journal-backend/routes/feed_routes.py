"""Social feed: strategy posts, likes, comments, follows."""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, StrategyPost, PostLike, PostComment, UserFollow, Strategy, User
from routes.strategy_routes import _strategy_dict


feed_bp = Blueprint('feed', __name__)


def _uid():
    return int(get_jwt_identity())


def _comment_replies(parent_comment_id):
    out = []
    for r in PostComment.query.filter_by(parent_id=parent_comment_id).order_by(PostComment.created_at.asc()).all():
        ru = User.query.get(r.user_id)
        out.append({
            'id': r.id,
            'body': r.body,
            'author': {'id': ru.id, 'name': ru.name} if ru else None,
        })
    return out


@feed_bp.route('/feed', methods=['GET'])
@jwt_required()
def get_feed():
    """Paginated feed: all public posts or following-only with ?following=1"""
    try:
        user_id = _uid()
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 50)
        following_only = request.args.get('following') in ('1', 'true', 'yes')

        q = StrategyPost.query.filter(StrategyPost.visibility == 'public')
        if following_only:
            ids = [r.following_id for r in UserFollow.query.filter_by(follower_id=user_id).all()]
            if not ids:
                return jsonify({'success': True, 'posts': [], 'page': page, 'has_more': False}), 200
            q = q.filter(StrategyPost.user_id.in_(ids))

        q = q.order_by(StrategyPost.created_at.desc())
        total = q.count()
        items = q.offset((page - 1) * per_page).limit(per_page).all()

        out = []
        for p in items:
            author = User.query.get(p.user_id)
            likes = PostLike.query.filter_by(post_id=p.id).count()
            comments = PostComment.query.filter_by(post_id=p.id).count()
            strat = Strategy.query.get(p.strategy_id)
            liked = PostLike.query.filter_by(post_id=p.id, user_id=user_id).first() is not None
            out.append({
                'id': p.id,
                'caption': p.caption,
                'created_at': p.created_at.isoformat() if p.created_at else None,
                'visibility': p.visibility,
                'include_description': p.include_description,
                'include_conditions': p.include_conditions,
                'include_variables': p.include_variables,
                'include_stats': p.include_stats,
                'include_heatmap': p.include_heatmap,
                'include_trades': p.include_trades,
                'likes_count': likes,
                'comments_count': comments,
                'liked_by_me': liked,
                'author': {'id': author.id, 'name': author.name} if author else None,
                'strategy': _strategy_dict(strat, include_legacy=False) if strat else None,
            })

        return jsonify({
            'success': True,
            'posts': out,
            'page': page,
            'has_more': (page * per_page) < total,
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@feed_bp.route('/posts', methods=['POST'])
@jwt_required()
def create_post():
    try:
        user_id = _uid()
        data = request.get_json() or {}
        sid = data.get('strategy_id')
        if not sid:
            return jsonify({'success': False, 'error': 'strategy_id required'}), 400
        strat = Strategy.query.filter_by(id=sid, user_id=user_id).first()
        if not strat:
            return jsonify({'success': False, 'error': 'Strategy not found'}), 404

        post = StrategyPost(
            user_id=user_id,
            strategy_id=sid,
            caption=data.get('caption'),
            images=data.get('images') or [],
            visibility=data.get('visibility', 'public'),
            include_description=bool(data.get('include_description', True)),
            include_conditions=bool(data.get('include_conditions', True)),
            include_variables=bool(data.get('include_variables', True)),
            include_stats=bool(data.get('include_stats', False)),
            include_heatmap=bool(data.get('include_heatmap', False)),
            include_trades=bool(data.get('include_trades', False)),
        )
        db.session.add(post)
        db.session.commit()
        return jsonify({'success': True, 'post_id': post.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@feed_bp.route('/posts/<int:post_id>', methods=['DELETE'])
@jwt_required()
def delete_post(post_id):
    try:
        user_id = _uid()
        p = StrategyPost.query.filter_by(id=post_id, user_id=user_id).first()
        if not p:
            return jsonify({'success': False, 'error': 'Not found'}), 404
        db.session.delete(p)
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@feed_bp.route('/posts/<int:post_id>/like', methods=['POST', 'DELETE'])
@jwt_required()
def like_post(post_id):
    try:
        user_id = _uid()
        p = StrategyPost.query.get(post_id)
        if not p:
            return jsonify({'success': False, 'error': 'Post not found'}), 404

        existing = PostLike.query.filter_by(post_id=post_id, user_id=user_id).first()
        if request.method == 'POST':
            if not existing:
                db.session.add(PostLike(post_id=post_id, user_id=user_id))
            db.session.commit()
            return jsonify({'success': True, 'liked': True}), 200
        else:
            if existing:
                db.session.delete(existing)
            db.session.commit()
            return jsonify({'success': True, 'liked': False}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@feed_bp.route('/posts/<int:post_id>/comments', methods=['GET', 'POST'])
@jwt_required()
def post_comments(post_id):
    try:
        p = StrategyPost.query.get(post_id)
        if not p:
            return jsonify({'success': False, 'error': 'Post not found'}), 404

        if request.method == 'GET':
            rows = PostComment.query.filter_by(post_id=post_id, parent_id=None).order_by(PostComment.created_at.asc()).all()
            out = []
            for c in rows:
                u = User.query.get(c.user_id)
                out.append({
                    'id': c.id,
                    'body': c.body,
                    'created_at': c.created_at.isoformat() if c.created_at else None,
                    'author': {'id': u.id, 'name': u.name} if u else None,
                    'replies': _comment_replies(c.id),
                })
            return jsonify({'success': True, 'comments': out}), 200

        user_id = _uid()
        data = request.get_json() or {}
        body = (data.get('body') or '').strip()
        if not body:
            return jsonify({'success': False, 'error': 'body required'}), 400
        parent_id = data.get('parent_id')
        c = PostComment(post_id=post_id, user_id=user_id, body=body[:5000], parent_id=parent_id)
        db.session.add(c)
        db.session.commit()
        return jsonify({'success': True, 'comment_id': c.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@feed_bp.route('/comments/<int:comment_id>', methods=['DELETE'])
@jwt_required()
def delete_comment(comment_id):
    try:
        user_id = _uid()
        c = PostComment.query.filter_by(id=comment_id, user_id=user_id).first()
        if not c:
            return jsonify({'success': False, 'error': 'Not found'}), 404
        db.session.delete(c)
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@feed_bp.route('/users/<int:target_id>/follow', methods=['POST', 'DELETE'])
@jwt_required()
def follow_user(target_id):
    try:
        user_id = _uid()
        if target_id == user_id:
            return jsonify({'success': False, 'error': 'Cannot follow self'}), 400
        tgt = User.query.get(target_id)
        if not tgt:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        ex = UserFollow.query.filter_by(follower_id=user_id, following_id=target_id).first()
        if request.method == 'POST':
            if not ex:
                db.session.add(UserFollow(follower_id=user_id, following_id=target_id))
            db.session.commit()
            return jsonify({'success': True, 'following': True}), 200
        else:
            if ex:
                db.session.delete(ex)
            db.session.commit()
            return jsonify({'success': True, 'following': False}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
