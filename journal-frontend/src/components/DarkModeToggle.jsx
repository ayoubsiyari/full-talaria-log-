import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { ThemeContext } from '../context/ThemeContext';

export default function DarkModeToggle({ className = '' }) {
  const context = React.useContext(ThemeContext);
  if (!context || typeof context.isDarkMode === 'undefined') {
    throw new Error('DarkModeToggle must be used within a ThemeProvider');
  }
  const { isDarkMode, toggleTheme } = context;

  const handleClick = () => {
    console.log('DarkModeToggle clicked! Current isDarkMode:', isDarkMode);
    toggleTheme();
  };

  return (
    <button
      onClick={handleClick}
      className={`p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200 ${className}`}
      aria-label="Toggle dark mode"
    >
      {isDarkMode ? (
        <Sun className="h-5 w-5 text-yellow-500" />
      ) : (
        <Moon className="h-5 w-5 text-gray-600" />
      )}
    </button>
  );
}
