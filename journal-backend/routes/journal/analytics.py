# routes/journal/analytics.py
"""
Analytics and statistics routes for journal entries.
Handles: stats, strategy analysis, symbol analysis, risk summary, performance highlights
"""

from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, JournalEntry, User, Profile
from datetime import datetime
from sqlalchemy import desc, asc
import math
import numpy as np
from . import journal_bp
from .filters import (
    get_active_profile_id, 
    apply_standard_filters, 
    apply_variables_filter,
    build_group_aware_query
)

# Try to import scipy for advanced metrics
try:
    from scipy.stats import linregress
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False


def calculate_basic_stats(entries):
    """Calculate basic statistics from a list of entries."""
    if not entries:
        return {
            'total_trades': 0,
            'winning_trades': 0,
            'losing_trades': 0,
            'win_rate': 0,
            'total_pnl': 0,
            'avg_pnl': 0,
            'profit_factor': None,
            'avg_win': 0,
            'avg_loss': 0,
            'largest_win': 0,
            'largest_loss': 0,
            'avg_rr': 0
        }
    
    total_trades = len(entries)
    winning_trades = [e for e in entries if e.pnl and e.pnl > 0]
    losing_trades = [e for e in entries if e.pnl and e.pnl < 0]
    breakeven_trades = [e for e in entries if e.pnl == 0 or e.pnl is None]
    
    total_pnl = sum(e.pnl for e in entries if e.pnl is not None)
    win_rate = (len(winning_trades) / total_trades * 100) if total_trades > 0 else 0
    
    total_wins = sum(e.pnl for e in winning_trades if e.pnl)
    total_losses = abs(sum(e.pnl for e in losing_trades if e.pnl))
    
    profit_factor = total_wins / total_losses if total_losses > 0 else (total_wins if total_wins > 0 else None)
    
    avg_win = total_wins / len(winning_trades) if winning_trades else 0
    avg_loss = total_losses / len(losing_trades) if losing_trades else 0
    
    largest_win = max((e.pnl for e in entries if e.pnl and e.pnl > 0), default=0)
    largest_loss = min((e.pnl for e in entries if e.pnl and e.pnl < 0), default=0)
    
    rr_values = [e.rr for e in entries if e.rr is not None]
    avg_rr = sum(rr_values) / len(rr_values) if rr_values else 0
    
    return {
        'total_trades': total_trades,
        'winning_trades': len(winning_trades),
        'losing_trades': len(losing_trades),
        'breakeven_trades': len(breakeven_trades),
        'win_rate': round(win_rate, 2),
        'total_pnl': round(total_pnl, 2),
        'avg_pnl': round(total_pnl / total_trades, 2) if total_trades > 0 else 0,
        'profit_factor': round(profit_factor, 2) if profit_factor is not None else None,
        'avg_win': round(avg_win, 2),
        'avg_loss': round(avg_loss, 2),
        'largest_win': round(largest_win, 2),
        'largest_loss': round(largest_loss, 2),
        'avg_rr': round(avg_rr, 2),
        'total_wins': round(total_wins, 2),
        'total_losses': round(total_losses, 2)
    }


@journal_bp.route('/stats', methods=['GET'])
@jwt_required()
def stats():
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)

        current_user = User.query.get(user_id)
        if not current_user:
            return jsonify({'error': 'User not found'}), 404

        # Build base query
        if current_user.account_type == 'group' and current_user.group_id:
            group_members = User.query.filter_by(
                group_id=current_user.group_id,
                account_type='individual'
            ).all()
            user_ids = [member.id for member in group_members]
            
            if user_ids:
                query = JournalEntry.query.filter(
                    JournalEntry.user_id.in_(user_ids)
                ).order_by(JournalEntry.date.asc())
            else:
                query = JournalEntry.query.filter_by(user_id=-1)
        else:
            query = JournalEntry.query.filter_by(user_id=user_id, profile_id=profile_id).order_by(JournalEntry.date.asc())
        
        # Apply standard filters
        query = apply_standard_filters(query)
        
        entries = query.all()
        
        # Apply variables filter
        variables_param = request.args.get('variables')
        entries = apply_variables_filter(entries, variables_param)
        
        stats_data = calculate_basic_stats(entries)
        
        # Add date range info
        if entries:
            stats_data['first_trade_date'] = min(e.date for e in entries if e.date).isoformat()
            stats_data['last_trade_date'] = max(e.date for e in entries if e.date).isoformat()
        
        return jsonify(stats_data), 200

    except Exception as e:
        print(" stats error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/strategy-analysis', methods=['GET'])
@jwt_required()
def strategy_analysis():
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)
        
        query = build_group_aware_query(user_id, profile_id)
        query = apply_standard_filters(query)
        entries = query.all()
        
        variables_param = request.args.get('variables')
        entries = apply_variables_filter(entries, variables_param)
        
        # Group by strategy
        strategies = {}
        for entry in entries:
            strategy = entry.strategy or 'No Strategy'
            if strategy not in strategies:
                strategies[strategy] = []
            strategies[strategy].append(entry)
        
        result = []
        for strategy_name, strategy_entries in strategies.items():
            stats = calculate_basic_stats(strategy_entries)
            stats['strategy'] = strategy_name
            result.append(stats)
        
        # Sort by profit factor
        result.sort(key=lambda x: x['profit_factor'] if x['profit_factor'] is not None else 0, reverse=True)
        
        return jsonify(result), 200

    except Exception as e:
        print(" strategy_analysis error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/symbol-analysis', methods=['GET'])
@jwt_required()
def symbol_analysis():
    """Return performance metrics grouped by symbol/pair for the current user"""
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)
        
        query = build_group_aware_query(user_id, profile_id)
        query = apply_standard_filters(query)
        entries = query.all()
        
        variables_param = request.args.get('variables')
        entries = apply_variables_filter(entries, variables_param)
        
        # Group by symbol
        symbols = {}
        for entry in entries:
            symbol = entry.symbol or 'Unknown'
            if symbol not in symbols:
                symbols[symbol] = []
            symbols[symbol].append(entry)
        
        result = []
        for symbol_name, symbol_entries in symbols.items():
            stats = calculate_basic_stats(symbol_entries)
            stats['symbol'] = symbol_name
            result.append(stats)
        
        # Sort by total PnL
        result.sort(key=lambda x: x['total_pnl'], reverse=True)
        
        return jsonify(result), 200

    except Exception as e:
        print(" symbol_analysis error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/risk-summary', methods=['GET'])
@jwt_required()
def risk_summary():
    """Return distribution of R-multiples and risk stats for the current user."""
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)
        
        query = build_group_aware_query(user_id, profile_id)
        query = apply_standard_filters(query)
        entries = query.all()
        
        variables_param = request.args.get('variables')
        entries = apply_variables_filter(entries, variables_param)
        
        if not entries:
            return jsonify({
                'total_trades': 0,
                'avg_risk': 0,
                'max_risk': 0,
                'min_risk': 0,
                'r_multiple_distribution': [],
                'risk_amount_distribution': []
            }), 200
        
        # Calculate R-multiple distribution
        r_multiples = [e.rr for e in entries if e.rr is not None]
        risk_amounts = [e.risk_amount for e in entries if e.risk_amount is not None]
        
        avg_risk = sum(risk_amounts) / len(risk_amounts) if risk_amounts else 0
        max_risk = max(risk_amounts) if risk_amounts else 0
        min_risk = min(risk_amounts) if risk_amounts else 0
        
        # Create R-multiple buckets
        r_buckets = {}
        for r in r_multiples:
            bucket = math.floor(r)
            bucket_key = f"{bucket}R to {bucket+1}R"
            r_buckets[bucket_key] = r_buckets.get(bucket_key, 0) + 1
        
        r_distribution = [{'range': k, 'count': v} for k, v in sorted(r_buckets.items())]
        
        return jsonify({
            'total_trades': len(entries),
            'avg_risk': round(avg_risk, 2),
            'max_risk': round(max_risk, 2),
            'min_risk': round(min_risk, 2),
            'avg_r_multiple': round(sum(r_multiples) / len(r_multiples), 2) if r_multiples else 0,
            'r_multiple_distribution': r_distribution
        }), 200

    except Exception as e:
        print(" risk_summary error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/pnl-distribution', methods=['GET'])
@jwt_required()
def pnl_distribution():
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)
        
        query = build_group_aware_query(user_id, profile_id)
        query = apply_standard_filters(query)
        entries = query.all()
        
        variables_param = request.args.get('variables')
        entries = apply_variables_filter(entries, variables_param)
        
        if not entries:
            return jsonify({
                'histogram': [],
                'percentiles': {},
                'stats': {}
            }), 200
        
        pnl_values = [e.pnl for e in entries if e.pnl is not None]
        
        if not pnl_values:
            return jsonify({
                'histogram': [],
                'percentiles': {},
                'stats': {}
            }), 200
        
        # Calculate histogram
        min_pnl = min(pnl_values)
        max_pnl = max(pnl_values)
        bucket_count = 20
        bucket_size = (max_pnl - min_pnl) / bucket_count if max_pnl != min_pnl else 1
        
        buckets = {}
        for pnl in pnl_values:
            bucket_idx = int((pnl - min_pnl) / bucket_size) if bucket_size > 0 else 0
            bucket_idx = min(bucket_idx, bucket_count - 1)
            bucket_start = min_pnl + bucket_idx * bucket_size
            bucket_end = bucket_start + bucket_size
            bucket_key = f"{round(bucket_start, 2)} to {round(bucket_end, 2)}"
            buckets[bucket_key] = buckets.get(bucket_key, 0) + 1
        
        histogram = [{'range': k, 'count': v} for k, v in buckets.items()]
        
        # Calculate percentiles
        sorted_pnl = sorted(pnl_values)
        n = len(sorted_pnl)
        percentiles = {
            'p10': sorted_pnl[int(n * 0.1)] if n > 0 else 0,
            'p25': sorted_pnl[int(n * 0.25)] if n > 0 else 0,
            'p50': sorted_pnl[int(n * 0.5)] if n > 0 else 0,
            'p75': sorted_pnl[int(n * 0.75)] if n > 0 else 0,
            'p90': sorted_pnl[int(n * 0.9)] if n > 0 else 0,
        }
        
        return jsonify({
            'histogram': histogram,
            'percentiles': {k: round(v, 2) for k, v in percentiles.items()},
            'stats': {
                'mean': round(sum(pnl_values) / len(pnl_values), 2),
                'min': round(min_pnl, 2),
                'max': round(max_pnl, 2),
                'std': round(np.std(pnl_values), 2) if len(pnl_values) > 1 else 0
            }
        }), 200

    except Exception as e:
        print(" pnl_distribution error:", e)
        return jsonify({'error': str(e)}), 500
