import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ProfileProvider } from './context/ProfileContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <ProfileProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ProfileProvider>
    </ThemeProvider>
  </React.StrictMode>
);
