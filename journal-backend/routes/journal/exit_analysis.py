# routes/journal/exit_analysis.py
"""
Exit analysis routes for journal entries.
Handles: trade exit analysis, exit metrics, exit summary
"""

from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, JournalEntry, User
from datetime import datetime
from . import journal_bp
from .filters import (
    get_active_profile_id, 
    apply_standard_filters, 
    apply_variables_filter,
    build_group_aware_query
)


def calculate_exit_metrics(entry):
    """Calculate exit analysis metrics for a single trade."""
    metrics = {
        'id': entry.id,
        'symbol': entry.symbol,
        'direction': entry.direction,
        'pnl': entry.pnl,
        'rr': entry.rr,
    }
    
    # Calculate MFE/MAE if high_price and low_price are available
    if entry.high_price is not None and entry.low_price is not None:
        if entry.direction == 'long':
            # For long trades
            mfe = entry.high_price - entry.entry_price  # Maximum Favorable Excursion
            mae = entry.entry_price - entry.low_price   # Maximum Adverse Excursion
            exit_efficiency = (entry.exit_price - entry.entry_price) / mfe if mfe > 0 else 0
        else:
            # For short trades
            mfe = entry.entry_price - entry.low_price
            mae = entry.high_price - entry.entry_price
            exit_efficiency = (entry.entry_price - entry.exit_price) / mfe if mfe > 0 else 0
        
        metrics['mfe'] = round(mfe, 4)
        metrics['mae'] = round(mae, 4)
        metrics['exit_efficiency'] = round(exit_efficiency * 100, 2)  # As percentage
    
    # Calculate duration if open_time and close_time are available
    if entry.open_time and entry.close_time:
        duration = (entry.close_time - entry.open_time).total_seconds()
        metrics['duration_seconds'] = int(duration)
        metrics['duration_minutes'] = round(duration / 60, 2)
        metrics['duration_hours'] = round(duration / 3600, 2)
    
    # Calculate R-multiple efficiency
    if entry.stop_loss is not None and entry.take_profit is not None:
        risk = abs(entry.entry_price - entry.stop_loss)
        reward = abs(entry.take_profit - entry.entry_price)
        planned_rr = reward / risk if risk > 0 else 0
        
        actual_move = abs(entry.exit_price - entry.entry_price)
        actual_rr = actual_move / risk if risk > 0 else 0
        
        metrics['planned_rr'] = round(planned_rr, 2)
        metrics['actual_rr'] = round(actual_rr, 2)
        metrics['rr_efficiency'] = round((actual_rr / planned_rr * 100), 2) if planned_rr > 0 else 0
    
    return metrics


@journal_bp.route('/trade/<int:trade_id>/exit-analysis', methods=['GET'])
@jwt_required()
def exit_analysis(trade_id):
    """
    Get detailed exit analysis for a specific trade.
    """
    try:
        user_id = int(get_jwt_identity())
        
        entry = JournalEntry.query.filter_by(id=trade_id, user_id=user_id).first()
        if not entry:
            return jsonify({'error': 'Trade not found'}), 404
        
        metrics = calculate_exit_metrics(entry)
        
        return jsonify(metrics), 200

    except Exception as e:
        print(" exit_analysis error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/analytics/exit-metrics', methods=['GET'])
@jwt_required()
def exit_metrics_analysis():
    """
    Get aggregated exit metrics for all trades.
    """
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
                'avg_exit_efficiency': 0,
                'avg_mfe': 0,
                'avg_mae': 0,
                'trades_with_exit_data': 0
            }), 200
        
        # Calculate metrics for all trades
        exit_efficiencies = []
        mfes = []
        maes = []
        durations = []
        rr_efficiencies = []
        
        for entry in entries:
            metrics = calculate_exit_metrics(entry)
            
            if 'exit_efficiency' in metrics:
                exit_efficiencies.append(metrics['exit_efficiency'])
            if 'mfe' in metrics:
                mfes.append(metrics['mfe'])
            if 'mae' in metrics:
                maes.append(metrics['mae'])
            if 'duration_minutes' in metrics:
                durations.append(metrics['duration_minutes'])
            if 'rr_efficiency' in metrics:
                rr_efficiencies.append(metrics['rr_efficiency'])
        
        result = {
            'total_trades': len(entries),
            'trades_with_exit_data': len(exit_efficiencies),
            'avg_exit_efficiency': round(sum(exit_efficiencies) / len(exit_efficiencies), 2) if exit_efficiencies else 0,
            'avg_mfe': round(sum(mfes) / len(mfes), 4) if mfes else 0,
            'avg_mae': round(sum(maes) / len(maes), 4) if maes else 0,
            'avg_duration_minutes': round(sum(durations) / len(durations), 2) if durations else 0,
            'avg_rr_efficiency': round(sum(rr_efficiencies) / len(rr_efficiencies), 2) if rr_efficiencies else 0,
        }
        
        # Add distribution data
        if exit_efficiencies:
            result['exit_efficiency_distribution'] = {
                'below_50': len([e for e in exit_efficiencies if e < 50]),
                '50_to_75': len([e for e in exit_efficiencies if 50 <= e < 75]),
                '75_to_100': len([e for e in exit_efficiencies if 75 <= e <= 100]),
                'above_100': len([e for e in exit_efficiencies if e > 100]),
            }
        
        return jsonify(result), 200

    except Exception as e:
        print(" exit_metrics_analysis error:", e)
        return jsonify({'error': str(e)}), 500


@journal_bp.route('/exit-analysis-summary', methods=['GET'])
@jwt_required()
def exit_analysis_summary():
    """
    Get comprehensive exit analysis summary.
    """
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
                'summary': {
                    'total_trades': 0,
                    'trades_analyzed': 0
                },
                'recommendations': []
            }), 200
        
        # Analyze all trades
        all_metrics = []
        early_exits = 0
        late_exits = 0
        optimal_exits = 0
        
        for entry in entries:
            metrics = calculate_exit_metrics(entry)
            all_metrics.append(metrics)
            
            if 'exit_efficiency' in metrics:
                if metrics['exit_efficiency'] < 50:
                    early_exits += 1
                elif metrics['exit_efficiency'] > 100:
                    late_exits += 1
                else:
                    optimal_exits += 1
        
        # Generate recommendations
        recommendations = []
        
        analyzed_count = len([m for m in all_metrics if 'exit_efficiency' in m])
        if analyzed_count > 0:
            early_pct = early_exits / analyzed_count * 100
            late_pct = late_exits / analyzed_count * 100
            
            if early_pct > 30:
                recommendations.append({
                    'type': 'warning',
                    'message': f'{early_pct:.1f}% of trades exited before capturing 50% of available move. Consider holding trades longer.'
                })
            
            if late_pct > 20:
                recommendations.append({
                    'type': 'info',
                    'message': f'{late_pct:.1f}% of trades gave back profits after peak. Consider tighter trailing stops.'
                })
        
        return jsonify({
            'summary': {
                'total_trades': len(entries),
                'trades_analyzed': analyzed_count,
                'early_exits': early_exits,
                'late_exits': late_exits,
                'optimal_exits': optimal_exits
            },
            'recommendations': recommendations
        }), 200

    except Exception as e:
        print(" exit_analysis_summary error:", e)
        return jsonify({'error': str(e)}), 500
