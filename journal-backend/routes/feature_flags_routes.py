# backend/routes/feature_flags_routes.py

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, FeatureFlags, User, Group, GroupFeatureFlags
from datetime import datetime
import json

feature_flags_bp = Blueprint('feature_flags', __name__)

def is_admin_user():
    """Check if the current user is an admin"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    return user and user.is_admin

@feature_flags_bp.route('/feature-flags', methods=['GET'])
@jwt_required()
def get_feature_flags():
    """Get all feature flags (admin only)"""
    if not is_admin_user():
        return jsonify({"error": "Admin access required"}), 403
    
    try:
        flags = FeatureFlags.query.all()
        return jsonify({
            'success': True,
            'flags': [{
                'id': flag.id,
                'name': flag.name,
                'enabled': flag.enabled,
                'description': flag.description,
                'category': flag.category,
                'created_at': flag.created_at.isoformat(),
                'updated_at': flag.updated_at.isoformat()
            } for flag in flags]
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@feature_flags_bp.route('/feature-flags/public', methods=['GET'])
def get_public_feature_flags():
    """Get feature flags for public use (no auth required)"""
    try:
        flags = FeatureFlags.query.all()
        flags_dict = {flag.name: flag.enabled for flag in flags}
        return jsonify({
            'success': True,
            'flags': flags_dict
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@feature_flags_bp.route('/feature-flags/user', methods=['GET'])
@jwt_required()
def get_user_feature_flags():
    """Get feature flags for the current user (includes group overrides)"""
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        # Get global feature flags
        global_flags = FeatureFlags.query.all()
        flags_dict = {flag.name: flag.enabled for flag in global_flags}
        
        # If user is admin, return all flags as enabled
        if user.is_admin:
            return jsonify({
                'success': True,
                'flags': flags_dict,
                'is_admin': True
            }), 200
        
        # If user has a group, apply group-specific overrides
        if user.group_id:
            group_flags = GroupFeatureFlags.query.filter_by(group_id=user.group_id).all()
            for group_flag in group_flags:
                flags_dict[group_flag.feature_name] = group_flag.enabled
        
        return jsonify({
            'success': True,
            'flags': flags_dict,
            'is_admin': False,
            'group_id': user.group_id
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@feature_flags_bp.route('/feature-flags/group/<int:group_id>', methods=['GET'])
@jwt_required()
def get_group_feature_flags(group_id):
    """Get feature flags for a specific group (admin only)"""
    if not is_admin_user():
        return jsonify({"error": "Admin access required"}), 403
    
    try:
        group = Group.query.get_or_404(group_id)
        group_flags = GroupFeatureFlags.query.filter_by(group_id=group_id).all()
        
        return jsonify({
            'success': True,
            'group': {
                'id': group.id,
                'name': group.name,
                'description': group.description
            },
            'flags': [{
                'id': flag.id,
                'feature_name': flag.feature_name,
                'enabled': flag.enabled,
                'created_at': flag.created_at.isoformat(),
                'updated_at': flag.updated_at.isoformat()
            } for flag in group_flags]
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@feature_flags_bp.route('/feature-flags/group/<int:group_id>/bulk', methods=['PUT'])
@jwt_required()
def update_group_feature_flags(group_id):
    """Update feature flags for a specific group (admin only)"""
    if not is_admin_user():
        return jsonify({"error": "Admin access required"}), 403
    
    try:
        group = Group.query.get_or_404(group_id)
        data = request.get_json()
        
        if not data or 'flags' not in data:
            return jsonify({'success': False, 'error': 'Flags data is required'}), 400
        
        updated_flags = []
        for flag_data in data['flags']:
            if 'feature_name' not in flag_data or 'enabled' not in flag_data:
                continue
            
            flag = GroupFeatureFlags.query.filter_by(
                group_id=group_id, 
                feature_name=flag_data['feature_name']
            ).first()
            
            if flag:
                flag.enabled = flag_data['enabled']
                flag.updated_at = datetime.utcnow()
                updated_flags.append(flag)
            else:
                # Create new group feature flag
                new_flag = GroupFeatureFlags(
                    group_id=group_id,
                    feature_name=flag_data['feature_name'],
                    enabled=flag_data['enabled']
                )
                db.session.add(new_flag)
                updated_flags.append(new_flag)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Updated {len(updated_flags)} group feature flags',
            'group': {
                'id': group.id,
                'name': group.name
            },
            'flags': [{
                'id': flag.id,
                'feature_name': flag.feature_name,
                'enabled': flag.enabled,
                'updated_at': flag.updated_at.isoformat()
            } for flag in updated_flags]
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@feature_flags_bp.route('/feature-flags', methods=['POST'])
@jwt_required()
def create_feature_flag():
    """Create a new feature flag (admin only)"""
    if not is_admin_user():
        return jsonify({"error": "Admin access required"}), 403
    
    try:
        data = request.get_json()
        
        if not data or 'name' not in data:
            return jsonify({'success': False, 'error': 'Name is required'}), 400
        
        # Check if flag already exists
        existing_flag = FeatureFlags.query.filter_by(name=data['name']).first()
        if existing_flag:
            return jsonify({'success': False, 'error': 'Feature flag already exists'}), 400
        
        new_flag = FeatureFlags(
            name=data['name'],
            enabled=data.get('enabled', True),
            description=data.get('description', ''),
            category=data.get('category', 'other')
        )
        
        db.session.add(new_flag)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'flag': {
                'id': new_flag.id,
                'name': new_flag.name,
                'enabled': new_flag.enabled,
                'description': new_flag.description,
                'category': new_flag.category,
                'created_at': new_flag.created_at.isoformat(),
                'updated_at': new_flag.updated_at.isoformat()
            }
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@feature_flags_bp.route('/feature-flags/<int:flag_id>', methods=['PUT'])
@jwt_required()
def update_feature_flag(flag_id):
    """Update a feature flag (admin only)"""
    if not is_admin_user():
        return jsonify({"error": "Admin access required"}), 403
    
    try:
        flag = FeatureFlags.query.get_or_404(flag_id)
        data = request.get_json()
        
        if 'enabled' in data:
            flag.enabled = data['enabled']
        if 'description' in data:
            flag.description = data['description']
        if 'category' in data:
            flag.category = data['category']
        
        flag.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'success': True,
            'flag': {
                'id': flag.id,
                'name': flag.name,
                'enabled': flag.enabled,
                'description': flag.description,
                'category': flag.category,
                'created_at': flag.created_at.isoformat(),
                'updated_at': flag.updated_at.isoformat()
            }
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@feature_flags_bp.route('/feature-flags/bulk', methods=['PUT'])
@jwt_required()
def update_feature_flags_bulk():
    """Update multiple feature flags at once (admin only)"""
    if not is_admin_user():
        return jsonify({"error": "Admin access required"}), 403
    
    try:
        data = request.get_json()
        
        if not data or 'flags' not in data:
            return jsonify({'success': False, 'error': 'Flags data is required'}), 400
        
        updated_flags = []
        for flag_data in data['flags']:
            if 'name' not in flag_data or 'enabled' not in flag_data:
                continue
            
            flag = FeatureFlags.query.filter_by(name=flag_data['name']).first()
            if flag:
                flag.enabled = flag_data['enabled']
                flag.updated_at = datetime.utcnow()
                updated_flags.append(flag)
            else:
                # Create new flag if it doesn't exist
                new_flag = FeatureFlags(
                    name=flag_data['name'],
                    enabled=flag_data['enabled'],
                    description=flag_data.get('description', ''),
                    category=flag_data.get('category', 'other')
                )
                db.session.add(new_flag)
                updated_flags.append(new_flag)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Updated {len(updated_flags)} feature flags',
            'flags': [{
                'id': flag.id,
                'name': flag.name,
                'enabled': flag.enabled,
                'description': flag.description,
                'category': flag.category,
                'updated_at': flag.updated_at.isoformat()
            } for flag in updated_flags]
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@feature_flags_bp.route('/feature-flags/<int:flag_id>', methods=['DELETE'])
@jwt_required()
def delete_feature_flag(flag_id):
    """Delete a feature flag (admin only)"""
    if not is_admin_user():
        return jsonify({"error": "Admin access required"}), 403
    
    try:
        flag = FeatureFlags.query.get_or_404(flag_id)
        db.session.delete(flag)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Feature flag "{flag.name}" deleted successfully'
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@feature_flags_bp.route('/feature-flags/initialize', methods=['POST'])
@jwt_required()
def initialize_feature_flags():
    """Initialize default feature flags (admin only)"""
    if not is_admin_user():
        return jsonify({"error": "Admin access required"}), 403
    
    try:
        # Default feature flags
        default_flags = [
            # Core Features
            {'name': 'DASHBOARD', 'enabled': True, 'category': 'core', 'description': 'Main dashboard'},
            {'name': 'JOURNAL', 'enabled': True, 'category': 'core', 'description': 'Trading journal'},
            {'name': 'TRADES', 'enabled': True, 'category': 'core', 'description': 'Trades management'},
            {'name': 'SETTINGS', 'enabled': True, 'category': 'core', 'description': 'User settings'},
            
            # Analytics Features
            {'name': 'ANALYTICS', 'enabled': True, 'category': 'analytics', 'description': 'Main analytics page'},
            {'name': 'ANALYTICS_OVERVIEW', 'enabled': True, 'category': 'analytics', 'description': 'Analytics overview'},
            {'name': 'ANALYTICS_PERFORMANCE', 'enabled': True, 'category': 'analytics', 'description': 'Performance analysis'},
            {'name': 'ANALYTICS_EQUITY', 'enabled': True, 'category': 'analytics', 'description': 'Equity curve'},
            {'name': 'ANALYTICS_CALENDAR', 'enabled': True, 'category': 'analytics', 'description': 'Calendar analysis'},
            {'name': 'ANALYTICS_EXIT_ANALYSIS', 'enabled': True, 'category': 'analytics', 'description': 'Exit analysis'},
            {'name': 'ANALYTICS_PNL_DISTRIBUTION', 'enabled': True, 'category': 'analytics', 'description': 'P&L distribution'},
            {'name': 'ANALYTICS_RECENT_TRADES', 'enabled': True, 'category': 'analytics', 'description': 'Recent trades'},
            {'name': 'ANALYTICS_SYMBOL_ANALYSIS', 'enabled': True, 'category': 'analytics', 'description': 'Symbol analysis'},
            {'name': 'ANALYTICS_STREAKS', 'enabled': True, 'category': 'analytics', 'description': 'Streak analyzer'},
            {'name': 'ANALYTICS_TRADE_DURATION', 'enabled': True, 'category': 'analytics', 'description': 'Trade duration'},
            {'name': 'ANALYTICS_VARIABLES', 'enabled': True, 'category': 'analytics', 'description': 'Variables analysis'},
            {'name': 'ANALYTICS_ALL_METRICS', 'enabled': True, 'category': 'analytics', 'description': 'All metrics'},
            
            # Advanced Features
            {'name': 'AI_DASHBOARD', 'enabled': True, 'category': 'advanced', 'description': 'AI assistant'},
            {'name': 'STRATEGY_BUILDER', 'enabled': True, 'category': 'advanced', 'description': 'Strategy builder'},
            {'name': 'IMPORT_TRADES', 'enabled': True, 'category': 'advanced', 'description': 'Import trades'},
            {'name': 'NOTES', 'enabled': True, 'category': 'advanced', 'description': 'Notes feature'},
            {'name': 'LEARN', 'enabled': True, 'category': 'advanced', 'description': 'Learning section'},
            {'name': 'PROFILE_MANAGEMENT', 'enabled': True, 'category': 'advanced', 'description': 'Profile management'},
            
            # Admin Features
            {'name': 'ADMIN_PANEL', 'enabled': True, 'category': 'admin', 'description': 'Admin panel access'},
            
            # Test Features
            {'name': 'TEST_COMBINATIONS', 'enabled': False, 'category': 'test', 'description': 'Test combinations'},
            {'name': 'TEST_FILTER', 'enabled': False, 'category': 'test', 'description': 'Test filter'},
        ]
        
        created_flags = []
        for flag_data in default_flags:
            existing_flag = FeatureFlags.query.filter_by(name=flag_data['name']).first()
            if not existing_flag:
                new_flag = FeatureFlags(**flag_data)
                db.session.add(new_flag)
                created_flags.append(new_flag)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Initialized {len(created_flags)} feature flags',
            'flags': [{
                'id': flag.id,
                'name': flag.name,
                'enabled': flag.enabled,
                'category': flag.category,
                'description': flag.description
            } for flag in created_flags]
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500 