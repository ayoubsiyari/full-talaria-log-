# routes/journal/advanced.py
"""
Advanced analytics routes for journal entries.
Handles: streaks, equity curves, variable combinations, market benchmark
"""

from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, JournalEntry, User, Profile
from datetime import datetime, timedelta
from itertools import combinations
import numpy as np
from . import journal_bp
from .filters import (
    get_active_profile_id, 
    apply_standard_filters, 
    apply_variables_filter,
    build_group_aware_query
)

# Try to import yfinance for market benchmark
try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False


@journal_bp.route('/streaks', methods=['GET'])
@jwt_required()
def streak_analysis():
    """
    Analyze winning and losing streaks.
    """
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)
        
        query = build_group_aware_query(user_id, profile_id)
        query = query.order_by(JournalEntry.date.asc())
        query = apply_standard_filters(query)
        entries = query.all()
        
        variables_param = request.args.get('variables')
        entries = apply_variables_filter(entries, variables_param)
        
        if not entries:
            return jsonify({
                'current_streak': {'type': None, 'count': 0},
                'max_winning_streak': 0,
                'max_losing_streak': 0,
                'avg_winning_streak': 0,
                'avg_losing_streak': 0,
                'streaks': []
            }), 200
        
        # Calculate streaks
        streaks = []
        current_streak_type = None
        current_streak_count = 0
        current_streak_pnl = 0
        
        for entry in entries:
            if entry.pnl is None:
                continue
            
            is_win = entry.pnl > 0
            streak_type = 'win' if is_win else 'loss'
            
            if streak_type == current_streak_type:
                current_streak_count += 1
                current_streak_pnl += entry.pnl
            else:
                if current_streak_type is not None:
                    streaks.append({
                        'type': current_streak_type,
                        'count': current_streak_count,
                        'pnl': round(current_streak_pnl, 2)
                    })
                current_streak_type = streak_type
                current_streak_count = 1
                current_streak_pnl = entry.pnl
        
        # Add final streak
        if current_streak_type is not None:
            streaks.append({
                'type': current_streak_type,
                'count': current_streak_count,
                'pnl': round(current_streak_pnl, 2)
            })
        
        # Calculate statistics
        winning_streaks = [s['count'] for s in streaks if s['type'] == 'win']
        losing_streaks = [s['count'] for s in streaks if s['type'] == 'loss']
        
        max_winning = max(winning_streaks) if winning_streaks else 0
        max_losing = max(losing_streaks) if losing_streaks else 0
        avg_winning = sum(winning_streaks) / len(winning_streaks) if winning_streaks else 0
        avg_losing = sum(losing_streaks) / len(losing_streaks) if losing_streaks else 0
        
        # Current streak
        current_streak = streaks[-1] if streaks else {'type': None, 'count': 0}
        
        return jsonify({
            'current_streak': current_streak,
            'max_winning_streak': max_winning,
            'max_losing_streak': max_losing,
            'avg_winning_streak': round(avg_winning, 1),
            'avg_losing_streak': round(avg_losing, 1),
            'total_winning_streaks': len(winning_streaks),
            'total_losing_streaks': len(losing_streaks),
            'streaks': streaks[-20:]  # Return last 20 streaks
        }), 200

    except Exception as e:
        print(" streak_analysis error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/equities', methods=['GET'])
@jwt_required()
def get_equity_curve():
    """
    Get equity curve data for charting.
    """
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)
        
        # Get initial balance from profile
        profile = Profile.query.get(profile_id)
        initial_balance = float(profile.initial_balance) if profile and profile.initial_balance else 0
        
        query = build_group_aware_query(user_id, profile_id)
        query = query.order_by(JournalEntry.date.asc())
        query = apply_standard_filters(query)
        entries = query.all()
        
        variables_param = request.args.get('variables')
        entries = apply_variables_filter(entries, variables_param)
        
        if not entries:
            return jsonify({
                'equity_curve': [],
                'initial_balance': initial_balance,
                'final_balance': initial_balance,
                'max_drawdown': 0,
                'max_drawdown_pct': 0
            }), 200
        
        # Build equity curve
        equity_curve = []
        running_balance = initial_balance
        peak_balance = initial_balance
        max_drawdown = 0
        max_drawdown_pct = 0
        
        for entry in entries:
            if entry.pnl is not None:
                running_balance += entry.pnl
                
                # Track peak and drawdown
                if running_balance > peak_balance:
                    peak_balance = running_balance
                
                drawdown = peak_balance - running_balance
                drawdown_pct = (drawdown / peak_balance * 100) if peak_balance > 0 else 0
                
                if drawdown > max_drawdown:
                    max_drawdown = drawdown
                if drawdown_pct > max_drawdown_pct:
                    max_drawdown_pct = drawdown_pct
                
                equity_curve.append({
                    'date': entry.date.isoformat() if entry.date else None,
                    'balance': round(running_balance, 2),
                    'pnl': round(entry.pnl, 2),
                    'trade_id': entry.id,
                    'symbol': entry.symbol,
                    'drawdown': round(drawdown, 2),
                    'drawdown_pct': round(drawdown_pct, 2)
                })
        
        return jsonify({
            'equity_curve': equity_curve,
            'initial_balance': initial_balance,
            'final_balance': round(running_balance, 2),
            'peak_balance': round(peak_balance, 2),
            'max_drawdown': round(max_drawdown, 2),
            'max_drawdown_pct': round(max_drawdown_pct, 2),
            'total_return': round(running_balance - initial_balance, 2),
            'total_return_pct': round((running_balance - initial_balance) / initial_balance * 100, 2) if initial_balance > 0 else 0
        }), 200

    except Exception as e:
        print(" get_equity_curve error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/variables-analysis', methods=['GET'])
@jwt_required()
def variables_analysis():
    """
    Analyze performance by custom variables.
    """
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)
        
        query = build_group_aware_query(user_id, profile_id)
        query = apply_standard_filters(query)
        entries = query.all()
        
        req_variables_param = request.args.get('variables')
        entries = apply_variables_filter(entries, req_variables_param)
        
        if not entries:
            return jsonify({
                'variables': {},
                'total_trades': 0
            }), 200
        
        # Collect all variable names and their values
        variable_stats = {}
        
        for entry in entries:
            variables = entry.variables or {}
            if not isinstance(variables, dict):
                continue
            
            for var_name, var_values in variables.items():
                if var_name not in variable_stats:
                    variable_stats[var_name] = {}
                
                # Handle list or single value
                if isinstance(var_values, list):
                    values = var_values
                else:
                    values = [var_values]
                
                for val in values:
                    if val is None:
                        continue
                    val_str = str(val).strip()
                    if not val_str:
                        continue
                    
                    if val_str not in variable_stats[var_name]:
                        variable_stats[var_name][val_str] = {
                            'trades': [],
                            'count': 0,
                            'wins': 0,
                            'losses': 0,
                            'total_pnl': 0
                        }
                    
                    stats = variable_stats[var_name][val_str]
                    stats['trades'].append(entry)
                    stats['count'] += 1
                    if entry.pnl and entry.pnl > 0:
                        stats['wins'] += 1
                    elif entry.pnl and entry.pnl < 0:
                        stats['losses'] += 1
                    stats['total_pnl'] += entry.pnl or 0
        
        # Format results
        result = {}
        for var_name, values in variable_stats.items():
            result[var_name] = []
            for val, stats in values.items():
                win_rate = (stats['wins'] / stats['count'] * 100) if stats['count'] > 0 else 0
                avg_pnl = stats['total_pnl'] / stats['count'] if stats['count'] > 0 else 0
                
                result[var_name].append({
                    'value': val,
                    'count': stats['count'],
                    'wins': stats['wins'],
                    'losses': stats['losses'],
                    'win_rate': round(win_rate, 1),
                    'total_pnl': round(stats['total_pnl'], 2),
                    'avg_pnl': round(avg_pnl, 2)
                })
            
            # Sort by count descending
            result[var_name].sort(key=lambda x: x['count'], reverse=True)
        
        return jsonify({
            'variables': result,
            'total_trades': len(entries)
        }), 200

    except Exception as e:
        print(" variables_analysis error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/combinations-filter', methods=['GET'])
@jwt_required()
def combinations_filter():
    """
    Analyze variable combinations performance.
    """
    try:
        user_id = int(get_jwt_identity())
        profile_id = get_active_profile_id(user_id)
        
        query = build_group_aware_query(user_id, profile_id)
        query = apply_standard_filters(query)
        entries = query.all()
        
        variables_param = request.args.get('variables')
        entries = apply_variables_filter(entries, variables_param)
        
        min_trades = int(request.args.get('min_trades', 5))
        combination_level = int(request.args.get('combination_level', 2))
        combination_level = min(max(combination_level, 2), 4)  # Limit 2-4
        
        if not entries:
            return jsonify({
                'combinations': [],
                'total_combinations': 0
            }), 200
        
        # Build variable combinations
        combo_stats = {}
        
        for entry in entries:
            variables = entry.variables or {}
            if not isinstance(variables, dict) or len(variables) < 2:
                continue
            
            # Create variable:value pairs
            var_value_pairs = []
            for var_name, var_values in variables.items():
                if isinstance(var_values, list) and var_values:
                    val = str(var_values[0]).strip()
                elif var_values:
                    val = str(var_values).strip()
                else:
                    continue
                if val:
                    var_value_pairs.append(f"{var_name}:{val}")
            
            if len(var_value_pairs) < 2:
                continue
            
            # Generate combinations
            for level in range(2, min(combination_level + 1, len(var_value_pairs) + 1)):
                for combo in combinations(var_value_pairs, level):
                    combo_key = ' + '.join(sorted(combo))
                    
                    if combo_key not in combo_stats:
                        combo_stats[combo_key] = {
                            'trades': [],
                            'count': 0,
                            'wins': 0,
                            'total_pnl': 0
                        }
                    
                    combo_stats[combo_key]['trades'].append(entry)
                    combo_stats[combo_key]['count'] += 1
                    if entry.pnl and entry.pnl > 0:
                        combo_stats[combo_key]['wins'] += 1
                    combo_stats[combo_key]['total_pnl'] += entry.pnl or 0
        
        # Format and filter results
        results = []
        for combo_key, stats in combo_stats.items():
            if stats['count'] < min_trades:
                continue
            
            win_rate = (stats['wins'] / stats['count'] * 100) if stats['count'] > 0 else 0
            
            # Calculate profit factor
            wins_pnl = sum(t.pnl for t in stats['trades'] if t.pnl and t.pnl > 0)
            losses_pnl = abs(sum(t.pnl for t in stats['trades'] if t.pnl and t.pnl < 0))
            profit_factor = wins_pnl / losses_pnl if losses_pnl > 0 else (wins_pnl if wins_pnl > 0 else None)
            
            results.append({
                'combination': combo_key,
                'trades': stats['count'],
                'wins': stats['wins'],
                'win_rate': round(win_rate, 1),
                'total_pnl': round(stats['total_pnl'], 2),
                'profit_factor': round(profit_factor, 2) if profit_factor else None
            })
        
        # Sort by profit factor
        results.sort(key=lambda x: x['profit_factor'] if x['profit_factor'] else 0, reverse=True)
        
        return jsonify({
            'combinations': results[:50],  # Limit to top 50
            'total_combinations': len(results)
        }), 200

    except Exception as e:
        print(" combinations_filter error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/market/benchmark', methods=['GET'])
@jwt_required(optional=True)
def market_benchmark():
    """Return daily closing prices for a benchmark symbol."""
    if not YFINANCE_AVAILABLE:
        return jsonify({'error': 'yfinance not available'}), 503
    
    try:
        symbol = request.args.get('symbol', 'SPY')
        start = request.args.get('start')
        end = request.args.get('end')
        
        if not start or not end:
            return jsonify({'error': 'start and end dates required'}), 400
        
        ticker = yf.Ticker(symbol)
        data = ticker.history(start=start, end=end)
        
        if data.empty:
            return jsonify({'error': 'No data found for symbol'}), 404
        
        result = []
        for date, row in data.iterrows():
            result.append({
                'date': date.strftime('%Y-%m-%d'),
                'close': round(row['Close'], 2),
                'volume': int(row['Volume'])
            })
        
        return jsonify({
            'symbol': symbol,
            'data': result
        }), 200

    except Exception as e:
        print(" market_benchmark error:", e)
        return jsonify({'error': str(e)}), 500
