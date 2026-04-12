"""Social feed: strategy posts, likes, comments, follows."""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import or_, and_, func

from models import db, StrategyPost, PostLike, PostComment, UserFollow, Strategy, User
from routes.strategy_routes import _strategy_dict


feed_bp = Blueprint('feed', __name__)

# public  = any logged-in user (community / "friends" in the product sense)
# guest   = also listed for visitors without an account (GET /feed/explore)
# friends = mutual follows only
# private = author only
_ALLOWED_VISIBILITY = frozenset({'public', 'guest', 'friends', 'private'})


def _uid():
    return int(get_jwt_identity())


def _mutual_friend_ids(user_id):
    """User IDs with mutual follow (A follows B and B follows A)."""
    rows_a = UserFollow.query.filter_by(follower_id=user_id).all()
    i_follow = {r.following_id for r in rows_a}
    rows_b = UserFollow.query.filter_by(following_id=user_id).all()
    follow_me = {r.follower_id for r in rows_b}
    return i_follow & follow_me


def can_view_strategy_post(viewer_id, post):
    """
    Who may see or interact with a feed post (logged-in viewer):
    - public / guest: any logged-in user
    - friends: author + users who mutually follow the author
    - private: author only
    """
    if not post:
        return False
    vis = (post.visibility or 'public')
    if vis is None or (isinstance(vis, str) and not vis.strip()):
        vis = 'public'
    vis = str(vis).strip().lower()
    if vis not in _ALLOWED_VISIBILITY:
        vis = 'public'
    author_id = post.user_id
    if vis in ('public', 'guest'):
        return True
    if vis == 'private':
        return viewer_id == author_id
    if vis == 'friends':
        if viewer_id == author_id:
            return True
        mutual = _mutual_friend_ids(viewer_id)
        return author_id in mutual
    return viewer_id == author_id


def _serialize_post_row(p, viewer_id):
    """Build one feed post dict. viewer_id None => liked_by_me False (e.g. anonymous explore)."""
    author = User.query.get(p.user_id)
    likes = PostLike.query.filter_by(post_id=p.id).count()
    comments = PostComment.query.filter_by(post_id=p.id).count()
    strat = Strategy.query.get(p.strategy_id)
    liked = False
    if viewer_id is not None:
        liked = PostLike.query.filter_by(post_id=p.id, user_id=viewer_id).first() is not None
    return {
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
    }


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


@feed_bp.route('/feed/explore', methods=['GET'])
def feed_explore():
    """
    Unauthenticated read-only feed: posts where visibility = guest (visible to visitors without an account).
    Logged-in users also see these in GET /feed.
    """
    try:
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 50)
        vis_norm = func.lower(func.trim(StrategyPost.visibility))
        q = StrategyPost.query.filter(vis_norm == 'guest').order_by(StrategyPost.created_at.desc())
        total = q.count()
        items = q.offset((page - 1) * per_page).limit(per_page).all()
        out = [_serialize_post_row(p, None) for p in items]
        return jsonify({
            'success': True,
            'posts': out,
            'page': page,
            'has_more': (page * per_page) < total,
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@feed_bp.route('/feed', methods=['GET'])
@jwt_required()
def get_feed():
    """
    Paginated community feed (requires login):
    - public: any logged-in user (community — everyone with an account)
    - guest: same as public in this feed, plus appears on /feed/explore for visitors
    - friends: mutual follows only
    - private: author only
    Optional ?following=1 limits to people you follow (still respects visibility).
    """
    try:
        user_id = _uid()
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 20)), 50)
        following_only = request.args.get('following') in ('1', 'true', 'yes')

        mutual_ids = _mutual_friend_ids(user_id)
        if mutual_ids:
            friends_authors = or_(
                StrategyPost.user_id == user_id,
                StrategyPost.user_id.in_(list(mutual_ids)),
            )
        else:
            friends_authors = StrategyPost.user_id == user_id

        # Normalize visibility for SQL (handles whitespace, casing, legacy empty strings)
        vis_norm = func.lower(func.trim(StrategyPost.visibility))
        members_vis = or_(
            StrategyPost.visibility.is_(None),
            vis_norm == 'public',
            vis_norm == '',
            vis_norm == 'guest',
        )
        visibility_clause = or_(
            members_vis,
            and_(vis_norm == 'private', StrategyPost.user_id == user_id),
            and_(vis_norm == 'friends', friends_authors),
        )

        q = StrategyPost.query.filter(visibility_clause)
        if following_only:
            ids = [r.following_id for r in UserFollow.query.filter_by(follower_id=user_id).all()]
            if not ids:
                return jsonify({'success': True, 'posts': [], 'page': page, 'has_more': False}), 200
            q = q.filter(StrategyPost.user_id.in_(ids))

        q = q.order_by(StrategyPost.created_at.desc())
        total = q.count()
        items = q.offset((page - 1) * per_page).limit(per_page).all()

        out = [_serialize_post_row(p, user_id) for p in items]

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

        vis = data.get('visibility') or 'public'
        vis = str(vis).strip().lower() if isinstance(vis, str) else 'public'
        if vis not in _ALLOWED_VISIBILITY:
            vis = 'public'

        post = StrategyPost(
            user_id=user_id,
            strategy_id=sid,
            caption=data.get('caption'),
            images=data.get('images') or [],
            visibility=vis,
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
        if not can_view_strategy_post(user_id, p):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403

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
        user_id = _uid()
        p = StrategyPost.query.get(post_id)
        if not p:
            return jsonify({'success': False, 'error': 'Post not found'}), 404
        if not can_view_strategy_post(user_id, p):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403

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
