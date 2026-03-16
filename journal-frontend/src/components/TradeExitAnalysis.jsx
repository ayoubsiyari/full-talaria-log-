import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  Typography,
  Box,
  Paper,
  Divider,
  Grid,
  IconButton,
  Tooltip
} from '@mui/material';
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer, ReferenceLine, Scatter } from 'recharts';
import { format, parseISO } from 'date-fns';
import { X, Info } from 'lucide-react';
import { fetchWithAuth } from '../utils/fetchUtils';

const TradeExitAnalysis = ({ tradeId, open, onClose }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAnalysis = async () => {
      if (!open || !tradeId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const data = await fetchWithAuth(`/api/journal/trade/${tradeId}/exit-analysis`);
        setAnalysis(data);
      } catch (err) {
        console.error('Error fetching exit analysis:', err);
        setError(err.message || 'Failed to load exit analysis');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [open, tradeId]);

  const formatDate = (dateString) => {
    try {
      if (!dateString) return 'N/A';
      return format(parseISO(dateString), 'MMM d, yyyy HH:mm');
    } catch (e) {
      return dateString;
    }
  };

  const formatPrice = (value) => {
    return value != null ? parseFloat(value).toFixed(4) : 'N/A';
  };

  const calculatePercentageChange = (price, entryPrice) => {
    if (entryPrice === 0 || price == null || entryPrice == null) return 0;
    return ((price - entryPrice) / entryPrice) * 100;
  };

  const renderChart = () => {
    if (!analysis || !analysis.trade) return null;
    
    const { trade } = analysis;
    
    const entry = parseFloat(trade.entry_price);
    const exit = parseFloat(trade.exit_price);
    const high = parseFloat(trade.high_price || exit);
    const low = parseFloat(trade.low_price || entry);
    const stop_loss = trade.stop_loss ? parseFloat(trade.stop_loss) : null;
    const take_profit = trade.take_profit ? parseFloat(trade.take_profit) : null;
    
    const directionMultiplier = trade.direction?.toLowerCase() === 'long' ? 1 : -1;

    const updraw = calculatePercentageChange(high, entry) * directionMultiplier;
    const drawdown = calculatePercentageChange(low, entry) * directionMultiplier;
    
    const maxUpdraw = Math.max(0, updraw, calculatePercentageChange(exit, entry) * directionMultiplier);
    const maxDrawdown = Math.min(0, drawdown, calculatePercentageChange(exit, entry) * directionMultiplier);

    const exitPercent = calculatePercentageChange(exit, entry) * directionMultiplier;
    const tpPercent = take_profit ? calculatePercentageChange(take_profit, entry) * directionMultiplier : null;
    const slPercent = stop_loss ? calculatePercentageChange(stop_loss, entry) * directionMultiplier : null;
    
    const chartData = [{
      name: 'Trade',
      updraw: maxUpdraw,
      drawdown: maxDrawdown,
      exit: exitPercent,
    }];
    
    return (
      <Box sx={{ height: 400, mt: 2 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
            <XAxis dataKey="name" tick={false} axisLine={false} />
            <YAxis 
              domain={[-100, 100]}
              tickFormatter={(value) => `${value}%`}
              width={80}
              label={{ value: '% From Entry', angle: -90, position: 'insideLeft' }}
            />
            <RechartsTooltip 
              contentStyle={{ backgroundColor: '#2d2d2d', border: 'none', borderRadius: '8px' }}
              labelStyle={{ color: '#fff' }}
              itemStyle={{ color: '#fff' }}
              formatter={(value, name) => {
                const sign = value > 0 ? '+' : '';
                if (name === 'updraw') return [`${sign}${value.toFixed(2)}%`, 'Max Updraw'];
                if (name === 'drawdown') return [`${value.toFixed(2)}%`, 'Max Drawdown'];
                if (name === 'exit') return [`${sign}${value.toFixed(2)}%`, 'Exit'];
                return [value, name];
              }}
            />
            <Legend 
              verticalAlign="top" 
              height={36}
              payload={[
                { value: 'Updraw (Profit Potential)', type: 'square', color: 'rgba(76, 175, 80, 0.7)' },
                { value: 'Drawdown (Adverse Movement)', type: 'square', color: 'rgba(244, 67, 54, 0.7)' },
                { value: 'Exit Point', type: 'diamond', color: '#000' },
              ]}
            />

            <Bar dataKey="updraw" fill="rgba(76, 175, 80, 0.7)" barSize={60} />
            <Bar dataKey="drawdown" fill="rgba(244, 67, 54, 0.7)" barSize={60} />

            <ReferenceLine y={0} stroke="#ffc107" strokeDasharray="3 3" label={{ value: 'Entry', position: 'right', fill: '#ffc107' }} />

            {tpPercent !== null && (
              <ReferenceLine y={tpPercent} stroke="#4caf50" strokeDasharray="3 3" label={{ value: `TP (${tpPercent.toFixed(2)}%)`, position: 'right', fill: '#4caf50' }} />
            )}
            {slPercent !== null && (
              <ReferenceLine y={slPercent} stroke="#f44336" strokeDasharray="3 3" label={{ value: `SL (${slPercent.toFixed(2)}%)`, position: 'right', fill: '#f44336' }} />
            )}

            <Scatter 
              dataKey="exit" 
              fill="#000" 
              shape={(props) => {
                const { cx, cy } = props;
                return (
                  <path 
                    d={`M${cx - 6},${cy} L${cx},${cy - 6} L${cx + 6},${cy} L${cx},${cy + 6} Z`}
                    fill="#000000"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
    );
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '80vh',
          maxHeight: '90vh',
          width: '90%',
          maxWidth: '1200px',
        }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box display="flex" alignItems="center" gap={1}>
            <span>Exit Analysis - Trade #{tradeId}</span>
            <Tooltip title="Shows price movement around your trade execution">
              <Info size={16} />
            </Tooltip>
          </Box>
          <IconButton onClick={onClose} size="small">
            <X size={20} />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
      {analysis && !loading && (
      <Box>
        <Paper elevation={0} sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="subtitle2" color="textSecondary">Symbol</Typography>
              <Typography variant="body1">{analysis.trade.symbol}</Typography>
            </Grid>
            <Grid item xs={6} sm={3} md={2}>
              <Typography variant="subtitle2" color="textSecondary">Direction</Typography>
              <Typography 
                variant="body1" 
                color={analysis.trade.direction?.toLowerCase() === 'long' ? 'success.main' : 'error.main'}
              >
                {analysis.trade.direction}
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3} md={2}>
              <Typography variant="subtitle2" color="textSecondary">Entry Price</Typography>
              <Typography variant="body1">{formatPrice(analysis.trade.entry_price)}</Typography>
            </Grid>
            <Grid item xs={6} sm={3} md={2}>
              <Typography variant="subtitle2" color="textSecondary">Exit Price</Typography>
              <Typography 
                variant="body1" 
                color={analysis.trade.pnl >= 0 ? 'success.main' : 'error.main'}
              >
                {formatPrice(analysis.trade.exit_price)}
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3} md={3}>
              <Typography variant="subtitle2" color="textSecondary">P&L</Typography>
              <Typography 
                variant="body1" 
                color={analysis.trade.pnl >= 0 ? 'success.main' : 'error.main'}
              >
                {analysis.trade.pnl >= 0 ? '+' : ''}{parseFloat(analysis.trade.pnl).toFixed(2)}%
              </Typography>
            </Grid>
            
            <Grid item xs={6} sm={3} md={2}>
              <Typography variant="subtitle2" color="textSecondary">Take Profit</Typography>
              <Typography variant="body1">
                {formatPrice(analysis.trade.take_profit)}
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3} md={2}>
              <Typography variant="subtitle2" color="textSecondary">Stop Loss</Typography>
              <Typography variant="body1">
                {formatPrice(analysis.trade.stop_loss)}
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3} md={2}>
              <Typography variant="subtitle2" color="textSecondary">Entry Time</Typography>
              <Typography variant="body2">{formatDate(analysis.trade.entry_time)}</Typography>
            </Grid>
            <Grid item xs={6} sm={3} md={2}>
              <Typography variant="subtitle2" color="textSecondary">Exit Time</Typography>
              <Typography variant="body2">
                {formatDate(analysis.trade.exit_time)}
              </Typography>
            </Grid>
          </Grid>
        </Paper>
        
        <Box mt={4}>
          <Typography variant="h6" gutterBottom>Price Movement</Typography>
          <Divider sx={{ mb: 2 }} />
          {renderChart()}
        </Box>
      </Box>
    )}
  </DialogContent>
  
  <DialogActions>
    <Button onClick={onClose} color="primary">
      Close
    </Button>
  </DialogActions>
</Dialog>
); };

export default TradeExitAnalysis;

