# backend/routes/profile_routes.py

import logging
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, User, Profile
from datetime import datetime

profile_bp = Blueprint('profile', __name__)

@profile_bp.route('/profiles', methods=['GET'])
@jwt_required()
def get_profiles():
    """Get all profiles for the current user"""
    try:
        user_id = get_jwt_identity()
        profiles = Profile.query.filter_by(user_id=user_id).all()
        
        return jsonify({
            'success': True,
            'profiles': [{
                'id': profile.id,
                'name': profile.name,
                'mode': profile.mode,
                'description': profile.description,
                'is_active': profile.is_active,
                'created_at': profile.created_at.isoformat(),
                'updated_at': profile.updated_at.isoformat()
            } for profile in profiles]
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@profile_bp.route('/profiles', methods=['POST'])
@jwt_required()
def create_profile():
    """Create a new profile for the current user"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or 'name' not in data:
            return jsonify({'success': False, 'error': 'Profile name is required'}), 400
        
        # Check if profile name already exists for this user
        existing_profile = Profile.query.filter_by(user_id=user_id, name=data['name']).first()
        if existing_profile:
            return jsonify({'success': False, 'error': 'Profile name already exists'}), 400
        
        # If this is the first profile, make it active
        existing_profiles = Profile.query.filter_by(user_id=user_id).count()
        is_active = existing_profiles == 0
        
        # Log a warning if 'mode' is missing
        if 'mode' not in data:
            import logging
            logging.warning(f"Profile creation: 'mode' not provided in request data. Defaulting to 'backtest'. Data: {data}")
        
        # Check if the requested mode is locked for new users
        requested_mode = data.get('mode', 'backtest')
        locked_modes = ['journal', 'journal_live']
        if requested_mode in locked_modes:
            return jsonify({
                'success': False, 
                'error': f'{requested_mode.title()} mode is currently locked for new users. Please use Backtest mode for now.'
            }), 403
        
        new_profile = Profile(
            user_id=user_id,
            name=data['name'],
            mode=requested_mode,
            description=data.get('description', ''),
            is_active=is_active
        )
        
        db.session.add(new_profile)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'profile': {
                'id': new_profile.id,
                'name': new_profile.name,
                'mode': new_profile.mode,
                'description': new_profile.description,
                'is_active': new_profile.is_active,
                'created_at': new_profile.created_at.isoformat(),
                'updated_at': new_profile.updated_at.isoformat()
            }
        }), 201
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error creating profile: {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'An unexpected error occurred. Please check the server logs.'}), 500

@profile_bp.route('/profiles/<int:profile_id>', methods=['PUT'])
@jwt_required()
def update_profile(profile_id):
    """Update a profile"""
    try:
        user_id = get_jwt_identity()
        profile = Profile.query.filter_by(id=profile_id, user_id=user_id).first()
        
        if not profile:
            return jsonify({'success': False, 'error': 'Profile not found'}), 404
        
        data = request.get_json()
        
        if 'name' in data:
            # Check if new name already exists for this user
            existing_profile = Profile.query.filter_by(user_id=user_id, name=data['name']).first()
            if existing_profile and existing_profile.id != profile_id:
                return jsonify({'success': False, 'error': 'Profile name already exists'}), 400
            profile.name = data['name']
        
        if 'description' in data:
            profile.description = data['description']

        if 'mode' in data:
            # Optional: Add validation to ensure the mode is valid
            valid_modes = ['backtest', 'journal', 'journal_live']
            if data['mode'] not in valid_modes:
                return jsonify({'success': False, 'error': 'Invalid profile mode specified'}), 400
            profile.mode = data['mode']
        
        profile.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'success': True,
            'profile': {
                'id': profile.id,
                'name': profile.name,
                'description': profile.description,
                'is_active': profile.is_active,
                'created_at': profile.created_at.isoformat(),
                'updated_at': profile.updated_at.isoformat()
            }
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@profile_bp.route('/profiles/<int:profile_id>/activate', methods=['POST'])
@jwt_required()
def activate_profile(profile_id):
    """Activate a profile (deactivate all others)"""
    try:
        user_id = get_jwt_identity()
        profile = Profile.query.filter_by(id=profile_id, user_id=user_id).first()
        
        if not profile:
            return jsonify({'success': False, 'error': 'Profile not found'}), 404
        
        # Deactivate all profiles for this user
        Profile.query.filter_by(user_id=user_id).update({'is_active': False})
        
        # Activate the selected profile
        profile.is_active = True
        profile.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Profile "{profile.name}" activated successfully'
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@profile_bp.route('/profiles/<int:profile_id>', methods=['DELETE'])
@jwt_required()
def delete_profile(profile_id):
    """Delete a profile"""
    try:
        user_id = get_jwt_identity()
        profile = Profile.query.filter_by(id=profile_id, user_id=user_id).first()
        
        if not profile:
            return jsonify({'success': False, 'error': 'Profile not found'}), 404
        
        # Don't allow deletion of the last profile
        profile_count = Profile.query.filter_by(user_id=user_id).count()
        if profile_count <= 1:
            return jsonify({'success': False, 'error': 'Cannot delete the last profile'}), 400
        
        # If this profile is active, activate another one
        if profile.is_active:
            other_profile = Profile.query.filter_by(user_id=user_id).filter(Profile.id != profile_id).first()
            if other_profile:
                other_profile.is_active = True
        
        db.session.delete(profile)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Profile "{profile.name}" deleted successfully'
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

AVAILABLE_MODES = [
    {
        'value': 'backtest',
        'name': 'Backtest',
        'description': 'Simulate trades with full editing access. Ideal for strategy development and learning.',
        'can_manual_entry': True,
        'can_import_from_broker': False,
    },
    {
        'value': 'journal',
        'name': 'Journal',
        'description': 'Manually log trades. Core data is locked after entry, but notes and tags remain editable.',
        'can_manual_entry': True,
        'can_import_from_broker': False,
    },
    {
        'value': 'journal_live',
        'name': 'Journal Live',
        'description': 'Automatically sync trades from your broker. Trade data cannot be edited.',
        'can_manual_entry': False,
        'can_import_from_broker': True,
    }
]

@profile_bp.route('/modes', methods=['GET'])
@jwt_required()
def get_available_modes():
    """Get all available profile modes"""
    return jsonify({'success': True, 'modes': AVAILABLE_MODES}), 200

@profile_bp.route('/profiles/active', methods=['GET'])
@jwt_required()
def get_active_profile():
    """Get the currently active profile for the user"""
    try:
        user_id = get_jwt_identity()
        active_profile = Profile.query.filter_by(user_id=user_id, is_active=True).first()
        
        if not active_profile:
            return jsonify({'success': False, 'error': 'No active profile found'}), 404
        
        return jsonify({
            'success': True,
            'profile': {
                'id': active_profile.id,
                'name': active_profile.name,
                'description': active_profile.description,
                'is_active': active_profile.is_active,
                'created_at': active_profile.created_at.isoformat(),
                'updated_at': active_profile.updated_at.isoformat()
            }
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
