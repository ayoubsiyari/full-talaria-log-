import React from 'react';
import { addDays, format, isSameDay, parseISO } from 'date-fns';

const DateRangePicker = ({ ranges, onChange, staticRanges = [] }) => {
  const handleRangeClick = (range) => {
    onChange(range);
  };

  const renderStaticRange = (staticRange, index) => {
    const range = staticRange.range();
    return (
      <button
        key={index}
        onClick={() => handleRangeClick(range)}
        className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        {staticRange.label}
      </button>
    );
  };

  return (
    <div className="p-4 w-full max-w-md">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
          Quick Select
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {staticRanges.map((range, index) => (
            <button
              key={index}
              onClick={() => handleRangeClick(range.range())}
              className="text-sm px-3 py-1.5 text-left rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-medium text-gray-900 dark:text-white">
          {ranges[0]?.startDate
            ? format(new Date(ranges[0].startDate), 'MMM d, yyyy')
            : 'Start Date'}
        </div>
        <div className="text-sm font-medium text-gray-900 dark:text-white">
          {ranges[0]?.endDate
            ? format(new Date(ranges[0].endDate), 'MMM d, yyyy')
            : 'End Date'}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs text-center text-gray-500 dark:text-gray-400 mb-2">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, index) => {
          const date = addDays(new Date(), -14 + index);
          const isSelected =
            ranges[0]?.startDate &&
            ranges[0]?.endDate &&
            date >= new Date(ranges[0].startDate) &&
            date <= new Date(ranges[0].endDate);
          const isToday = isSameDay(date, new Date());
          
          return (
            <button
              key={index}
              onClick={() => {
                const newRange = {
                  startDate: date,
                  endDate: date,
                  key: 'selection',
                };
                handleRangeClick(newRange);
              }}
              className={`w-8 h-8 rounded-full text-sm flex items-center justify-center ${
                isSelected
                  ? 'bg-blue-500 text-white'
                  : isToday
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white'
              }`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default DateRangePicker;
