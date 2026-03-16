import React, { createContext, useState, useEffect, useContext } from 'react';

export const ThemeContext = createContext({
  isDarkMode: false,
  toggleTheme: () => console.warn('ThemeContext not initialized - toggleTheme called'),
});

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export function ThemeProvider({ children }) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Try to get the theme from localStorage or system preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    // Default to system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    console.log('ThemeContext: isDarkMode changed to:', isDarkMode);
    // Set the theme class on the root element
    document.documentElement.classList.toggle('dark', isDarkMode);
    // Save the theme preference
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    console.log('ThemeContext: Applied dark class:', document.documentElement.classList.contains('dark'));
  }, [isDarkMode]);

  const toggleTheme = () => {
    console.log('ThemeContext: toggleTheme called, current isDarkMode:', isDarkMode);
    setIsDarkMode(!isDarkMode);
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
