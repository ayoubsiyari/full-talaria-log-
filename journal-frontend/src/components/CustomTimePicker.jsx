import React, { useState, useRef, useEffect } from 'react';
import { Clock, X, ChevronDown, Check } from 'lucide-react';

const CustomTimePicker = ({ 
  value, 
  onChange, 
  name, 
  className = "", 
  disabled = false,
  placeholder = "Select date and time"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(value ? new Date(value) : new Date());
  const [selectedHour, setSelectedHour] = useState(value ? new Date(value).getHours() : 0);
  const [selectedMinute, setSelectedMinute] = useState(value ? new Date(value).getMinutes() : 0);
  const pickerRef = useRef(null);
  const hourScrollRef = useRef(null);
  const minuteScrollRef = useRef(null);

  useEffect(() => {
    if (value) {
      try {
        // Parse the date string to avoid timezone conversion
        if (value.includes('T')) {
          // Handle ISO format: YYYY-MM-DDTHH:MM
          const [datePart, timePart] = value.split('T');
          const [year, month, day] = datePart.split('-').map(Number);
          const [hours, minutes] = timePart.split(':').map(Number);
          const date = new Date(year, month - 1, day, hours, minutes);
          setSelectedDate(date);
          setSelectedHour(hours);
          setSelectedMinute(minutes);
        } else {
          // Fallback to regular Date parsing
          const date = new Date(value);
          setSelectedDate(date);
          setSelectedHour(date.getHours());
          setSelectedMinute(date.getMinutes());
        }
      } catch (error) {
        console.error('Error parsing date value:', error);
        // Fallback to current date
        const now = new Date();
        setSelectedDate(now);
        setSelectedHour(now.getHours());
        setSelectedMinute(now.getMinutes());
      }
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Maintain scroll position for hour selector
  useEffect(() => {
    if (hourScrollRef.current && selectedHour !== null) {
      const scrollTop = selectedHour * 16; // 16px per hour (h-4)
      hourScrollRef.current.scrollTop = scrollTop - 32; // Center the selected hour
    }
  }, [selectedHour, isOpen]);

  // Maintain scroll position for minute selector
  useEffect(() => {
    if (minuteScrollRef.current && selectedMinute !== null) {
      const scrollTop = selectedMinute * 16; // 16px per minute (h-4)
      minuteScrollRef.current.scrollTop = scrollTop - 32; // Center the selected minute
    }
  }, [selectedMinute, isOpen]);

  const formatDisplayValue = () => {
    if (!value) return '';
    const date = new Date(value);
    const dateStr = date.toLocaleDateString();
    const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    return `${dateStr} ${timeStr}`;
  };

  const handleDateChange = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dateValue = e.target.value;
    if (dateValue) {
      // Parse the date in local time to avoid timezone conversion
      const [year, month, day] = dateValue.split('-').map(Number);
      const newDate = new Date(year, month - 1, day, selectedHour, selectedMinute);
      console.log(`Date selected: ${dateValue} -> Local date: ${newDate.toLocaleDateString()}`);
      setSelectedDate(newDate);
    }
  };

  const handleTimeChange = (hour, minute) => {
    // Create a new date in local time to avoid timezone conversion
    const newDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      hour,
      minute
    );
    setSelectedHour(hour);
    setSelectedMinute(minute);
    setSelectedDate(newDate);
  };

  const handleSetTime = () => {
    updateValue(selectedDate);
    setIsOpen(false);
  };

  const updateValue = (date) => {
    // Use local time format instead of UTC to avoid timezone conversion
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const localDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    console.log(`Setting ${name} to: ${localDateTime} (Local date: ${date.toLocaleDateString()})`);
    
    onChange({
      target: {
        name: name,
        value: localDateTime
      }
    });
  };

  const clearValue = () => {
    onChange({
      target: {
        name: name,
        value: ''
      }
    });
    setIsOpen(false);
  };

  const renderTimePicker = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = Array.from({ length: 60 }, (_, i) => i);

    return (
      <div className="flex items-center space-x-3">
        {/* Hours */}
        <div className="flex flex-col items-center">
          <div className="text-xs font-medium text-gray-500 mb-1">Hour</div>
          <div className="relative">
            <div className="w-12 h-16 bg-white border border-gray-200 rounded-md overflow-hidden shadow-sm">
              <div 
                ref={hourScrollRef}
                className="h-full overflow-y-auto scrollbar-hide"
                style={{ scrollBehavior: 'smooth' }}
              >
                {hours.map(hour => (
                  <button
                    key={hour}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleTimeChange(hour, selectedMinute);
                    }}
                    className={`w-full h-4 flex items-center justify-center text-xs font-medium transition-all duration-200 ${
                      selectedHour === hour 
                        ? 'bg-blue-500 text-white' 
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    {hour.toString().padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="flex flex-col items-center justify-center">
          <div className="text-xs font-medium text-gray-500 mb-1">:</div>
          <div className="w-1 h-16 bg-gradient-to-b from-gray-200 via-gray-300 to-gray-200 rounded-full"></div>
        </div>

        {/* Minutes */}
        <div className="flex flex-col items-center">
          <div className="text-xs font-medium text-gray-500 mb-1">Minute</div>
          <div className="relative">
            <div className="w-12 h-16 bg-white border border-gray-200 rounded-md overflow-hidden shadow-sm">
              <div 
                ref={minuteScrollRef}
                className="h-full overflow-y-auto scrollbar-hide"
                style={{ scrollBehavior: 'smooth' }}
              >
                {minutes.map(minute => (
                  <button
                    key={minute}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleTimeChange(selectedHour, minute);
                    }}
                    className={`w-full h-4 flex items-center justify-center text-xs font-medium transition-all duration-200 ${
                      selectedMinute === minute 
                        ? 'bg-blue-500 text-white' 
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    {minute.toString().padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Set Button */}
        <div className="flex flex-col items-center justify-center">
          <div className="text-xs font-medium text-gray-500 mb-1">Set</div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSetTime();
            }}
            className="w-12 h-16 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors duration-200 flex items-center justify-center"
          >
            <Check size={16} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="relative" ref={pickerRef}>
      {/* Input Field */}
      <div
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setIsOpen(!isOpen);
        }}
        className={`w-full p-3 bg-white border border-blue-200/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[#040028] transition-all duration-200 cursor-pointer flex items-center justify-between ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-300'
        } ${className}`}
      >
        <span className={`${value ? 'text-[#040028]' : 'text-gray-500'} truncate flex-1 mr-2`}>
          {formatDisplayValue() || placeholder}
        </span>
        <div className="flex items-center space-x-2 flex-shrink-0">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clearValue();
              }}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X size={12} />
            </button>
          )}
          <div className="flex items-center space-x-1">
            <Clock size={14} className="text-gray-400" />
            <ChevronDown size={12} className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div 
          className="absolute top-full left-0 right-0 sm:right-auto mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 sm:min-w-[280px] backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center">
              <Clock size={16} className="mr-2 text-blue-500" />
              Date & Time
            </h3>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Date Input */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center">
              📅 Date
            </label>
            <input
              type="date"
              value={`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`}
              onChange={handleDateChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              className="w-full p-2 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 hover:bg-white transition-colors"
            />
          </div>

          {/* Time Picker */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center">
              ⏰ Time (24h)
            </label>
            {renderTimePicker()}
          </div>

          {/* Quick Actions */}
          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const now = new Date();
                setSelectedDate(now);
                setSelectedHour(now.getHours());
                setSelectedMinute(now.getMinutes());
                updateValue(now);
                setIsOpen(false);
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
            >
              ⚡ Now
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clearValue();
              }}
              className="text-xs text-gray-600 hover:text-gray-800 font-medium px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              🗑️ Clear
            </button>
          </div>
        </div>
      )}

      {/* Custom scrollbar styles */}
      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default CustomTimePicker;
