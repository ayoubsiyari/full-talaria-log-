import React from 'react';
import { Sparkles, TrendingUp } from 'lucide-react';
import logo from '../assets/LOGO-10.png';
import { colors, colorUtils } from '../config/colors';

const TalariaLogo = ({ size = 'default', variant = 'default', className = '' }) => {
  const sizeClasses = {
    small: 'w-6 h-6',
    default: 'w-8 h-8',
    large: 'w-12 h-12',
    xlarge: 'w-16 h-16'
  };

  const variants = {
    default: 'bg-[#5FACF9]',
    outline: 'bg-transparent border-2 border-[#5FACF9]',
    dark: 'bg-[#353089]'
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`${sizeClasses[size]} ${variants[variant]} rounded-lg flex items-center justify-center shadow-sm`}>
      <img src={logo} alt="Journal Logo" className="w-18 h-18 rounded-sm" />
        </div>
      <div className="flex flex-col">
        
        
      </div>
    </div>
  );
};

export default TalariaLogo; 