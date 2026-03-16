import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid,
  Legend,
  ReferenceLine
} from 'recharts';
import { 
  Box, 
  Typography, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel,
  CircularProgress
} from '@mui/material';

const timeFrameOptions = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

// Helper function to get the start of the week (Sunday)
const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  const start = new Date(d);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

// Helper function to get the end of the week (Saturday)
const getEndOfWeek = (date) => {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

// Helper function to get the start of the month
const getStartOfMonth = (date) => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

// Helper function to get the end of the month
const getEndOfMonth = (date) => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
};

// Helper function to get the start of the quarter
const getStartOfQuarter = (date) => {
  const quarter = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), quarter * 3, 1);
};

// Helper function to get the end of the quarter
const getEndOfQuarter = (date) => {
  const quarter = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), (quarter + 1) * 3, 0, 23, 59, 59, 999);
};

// Helper function to get the start of the year
const getStartOfYear = (date) => {
  return new Date(date.getFullYear(), 0, 1);
};

// Helper function to get the end of the year
const getEndOfYear = (date) => {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
};

const formatDate = (date, timeFrame) => {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Invalid Date';
    
    const pad = (num) => String(num).padStart(2, '0');
    
    switch (timeFrame) {
      case 'daily':
        return d.toLocaleDateString('en-US', { 
          year: 'numeric',
          month: 'short', 
          day: 'numeric' 
        });
        
      case 'weekly': {
        const weekStart = getStartOfWeek(d);
        const weekEnd = getEndOfWeek(d);
        const startMonth = weekStart.toLocaleString('default', { month: 'short' });
        const endMonth = weekEnd.toLocaleString('default', { month: 'short' });
        const year = weekStart.getFullYear() === weekEnd.getFullYear() 
          ? ` ${weekStart.getFullYear()}` 
          : ` ${weekStart.getFullYear()}/${weekEnd.getFullYear()}`;
        return `${startMonth} ${weekStart.getDate()} - ${endMonth} ${weekEnd.getDate()}${year}`;
      }
      
      case 'monthly':
        return d.toLocaleString('default', { 
          year: 'numeric',
          month: 'long' 
        });
        
      case 'quarterly': {
        const quarter = Math.ceil((d.getMonth() + 1) / 3);
        const quarterStart = getStartOfQuarter(d);
        const quarterEnd = getEndOfQuarter(d);
        return `Q${quarter} ${d.getFullYear()}`;
      }
      
      case 'yearly':
        return d.getFullYear().toString();
        
      default:
        return d.toISOString().split('T')[0];
    }
  } catch (e) {
    console.error('Error formatting date:', date, e);
    return 'Invalid Date';
  }
};

const processData = (rawData, timeFrame) => {
  if (!rawData || !rawData.length) return [];
  
  const groupedData = {};
  
  // First, sort all data by date to ensure proper grouping
  const sortedData = [...rawData]
    .filter(entry => entry && entry.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  sortedData.forEach(entry => {
    if (!entry.date) return;
    
    let date;
    try {
      date = new Date(entry.date);
      if (isNaN(date.getTime())) return; // Skip invalid dates
    } catch (e) {
      console.error('Invalid date:', entry.date, e);
      return;
    }
    
    let periodStart, periodEnd, key, sortKey;
    
    switch (timeFrame) {
      case 'daily':
        periodStart = new Date(date);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodStart.getDate() + 1);
        key = periodStart.toISOString();
        sortKey = periodStart.getTime();
        break;
        
      case 'weekly':
        periodStart = getStartOfWeek(date);
        periodEnd = getEndOfWeek(date);
        key = periodStart.toISOString();
        sortKey = periodStart.getTime();
        break;
      
      case 'monthly':
        periodStart = getStartOfMonth(date);
        periodEnd = getEndOfMonth(date);
        key = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`;
        sortKey = periodStart.getTime();
        break;
        
      case 'quarterly': {
        periodStart = getStartOfQuarter(date);
        periodEnd = getEndOfQuarter(date);
        const quarter = Math.ceil((periodStart.getMonth() + 1) / 3);
        key = `${periodStart.getFullYear()}-Q${quarter}`;
        sortKey = periodStart.getTime();
        break;
      }
      
      case 'yearly':
        periodStart = getStartOfYear(date);
        periodEnd = getEndOfYear(date);
        key = periodStart.getFullYear().toString();
        sortKey = periodStart.getTime();
        break;
        
      default:
        periodStart = new Date(date);
        periodStart.setHours(0, 0, 0, 0);
        key = periodStart.toISOString();
        sortKey = periodStart.getTime();
    }
    
    if (!groupedData[key]) {
      groupedData[key] = {
        date: periodStart.toISOString(),
        sortKey,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd ? periodEnd.toISOString() : null,
        pnl: 0,
        count: 0,
        rawDate: new Date(periodStart),
        formattedDate: formatDate(periodStart, timeFrame)
      };
    }
    
    if (typeof entry.pnl === 'number') {
      groupedData[key].pnl += entry.pnl;
      groupedData[key].count++;
    }
  });
  
  // Sort by the sortKey for consistent ordering
  return Object.values(groupedData).sort((a, b) => a.sortKey - b.sortKey);
};

const InteractivePerformanceChart = ({ data: rawData = [], loading = false }) => {
  const [timeFrame, setTimeFrame] = useState('weekly');
  
  const chartData = useMemo(() => {
    return processData(rawData, timeFrame);
  }, [rawData, timeFrame]);
  
  const handleTimeFrameChange = (event) => {
    setTimeFrame(event.target.value);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress />
      </Box>
    );
  }

  if (!chartData || chartData.length === 0) {
    return (
      <Box textAlign="center" p={3}>
        <Typography variant="body1">No data available for the selected time period.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6" component="h2">Performance Overview</Typography>
        <FormControl variant="outlined" size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="timeframe-select-label">Time Frame</InputLabel>
          <Select
            labelId="timeframe-select-label"
            value={timeFrame}
            onChange={handleTimeFrameChange}
            label="Time Frame"
          >
            {timeFrameOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      
      <Box sx={{ width: '100%', height: 400, mt: 2 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{
              top: 5,
              right: 20,
              left: 10,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="formattedDate"
              tick={{ fontSize: 12 }}
              interval={Math.max(0, Math.ceil(chartData.length / 10) - 1)} // Show fewer labels for better readability
              minTickGap={50} // Minimum gap between ticks
            />
            <YAxis 
              label={{ 
                value: 'P&L ($)', 
                angle: -90, 
                position: 'insideLeft',
                style: { textAnchor: 'middle' }
              }}
            />
            <Tooltip 
              formatter={(value, name, props) => {
                const data = props.payload;
                const start = data.periodStart ? new Date(data.periodStart).toLocaleDateString() : '';
                const end = data.periodEnd ? new Date(data.periodEnd).toLocaleDateString() : '';
                const period = start && end ? `${start} - ${end}` : data.formattedDate;
                
                return [
                  `$${Number(value).toFixed(2)}`, 
                  'P&L',
                  `Trades: ${data.count || 0}`,
                  `Period: ${period}`
                ];
              }}
              labelStyle={{ fontWeight: 'bold' }}
            />
            <Legend />
            <ReferenceLine y={0} stroke="#000" />
            <Line
              type="monotone"
              dataKey="pnl"
              name="Profit & Loss"
              stroke="#8884d8"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  
  );
};

export default InteractivePerformanceChart;
