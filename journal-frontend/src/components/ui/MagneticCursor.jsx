import React, { useEffect, useRef, useState } from 'react';

/**
 * Magnetic Cursor Effect Component
 * Creates an interactive cursor that follows mouse movement with magnetic attraction to elements
 */
const MagneticCursor = ({ 
  size = 20, 
  magneticElements = '.magnetic',
  magneticForce = 0.3,
  smoothness = 0.15,
  hideOnTouch = true 
}) => {
  const cursorRef = useRef(null);
  const cursorDotRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [cursorText, setCursorText] = useState('');
  
  const mouse = useRef({ x: 0, y: 0 });
  const cursor = useRef({ x: 0, y: 0 });
  const cursorDot = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Check if device supports hover (not touch device)
    const hasHover = window.matchMedia('(hover: hover)').matches;
    if (!hasHover && hideOnTouch) return;

    setIsVisible(true);

    const handleMouseMove = (e) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      
      // Check for magnetic elements
      const magneticElement = e.target.closest(magneticElements);
      if (magneticElement) {
        const rect = magneticElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Apply magnetic force
        const deltaX = centerX - e.clientX;
        const deltaY = centerY - e.clientY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const maxDistance = Math.max(rect.width, rect.height);
        
        if (distance < maxDistance) {
          const force = (maxDistance - distance) / maxDistance * magneticForce;
          mouse.current.x += deltaX * force;
          mouse.current.y += deltaY * force;
        }
        
        setIsHovering(true);
        setCursorText(magneticElement.dataset.cursorText || '');
      } else {
        setIsHovering(false);
        setCursorText('');
      }
    };

    const handleMouseEnter = () => setIsVisible(true);
    const handleMouseLeave = () => setIsVisible(false);

    // Smooth cursor animation
    const animateCursor = () => {
      // Main cursor
      cursor.current.x += (mouse.current.x - cursor.current.x) * smoothness;
      cursor.current.y += (mouse.current.y - cursor.current.y) * smoothness;
      
      // Cursor dot (faster)
      cursorDot.current.x += (mouse.current.x - cursorDot.current.x) * (smoothness * 2);
      cursorDot.current.y += (mouse.current.y - cursorDot.current.y) * (smoothness * 2);
      
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${cursor.current.x}px, ${cursor.current.y}px)`;
      }
      
      if (cursorDotRef.current) {
        cursorDotRef.current.style.transform = `translate(${cursorDot.current.x}px, ${cursorDot.current.y}px)`;
      }
      
      requestAnimationFrame(animateCursor);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseenter', handleMouseEnter);
    document.addEventListener('mouseleave', handleMouseLeave);
    
    animateCursor();

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseenter', handleMouseEnter);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [magneticElements, magneticForce, smoothness, hideOnTouch]);

  if (!isVisible) return null;

  return (
    <>
      {/* Main cursor */}
      <div
        ref={cursorRef}
        className={`fixed pointer-events-none z-[9999] transition-all duration-300 ${
          isHovering ? 'scale-150' : 'scale-100'
        }`}
        style={{
          left: -size / 2,
          top: -size / 2,
          width: size,
          height: size,
        }}
      >
        <div
          className={`w-full h-full rounded-full border-2 transition-all duration-300 ${
            isHovering 
              ? 'border-blue-400 bg-blue-400/20 backdrop-blur-sm' 
              : 'border-white/50 bg-white/10'
          }`}
        />
        
        {/* Cursor text */}
        {cursorText && (
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 bg-black/80 text-white text-xs rounded whitespace-nowrap">
            {cursorText}
          </div>
        )}
      </div>

      {/* Cursor dot */}
      <div
        ref={cursorDotRef}
        className="fixed pointer-events-none z-[9999]"
        style={{
          left: -2,
          top: -2,
          width: 4,
          height: 4,
        }}
      >
        <div className={`w-full h-full rounded-full transition-all duration-200 ${
          isHovering ? 'bg-blue-400' : 'bg-white'
        }`} />
      </div>
    </>
  );
};

/**
 * Magnetic Button Component
 * Button with magnetic cursor attraction and advanced hover effects
 */
export const MagneticButton = ({ 
  children, 
  className = '', 
  cursorText = '',
  magneticForce = 0.5,
  ...props 
}) => {
  const buttonRef = useRef(null);
  const [isHovering, setIsHovering] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    const handleMouseMove = (e) => {
      const rect = button.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMousePosition({ x, y });
    };

    const handleMouseEnter = () => setIsHovering(true);
    const handleMouseLeave = () => {
      setIsHovering(false);
      setMousePosition({ x: 0, y: 0 });
    };

    button.addEventListener('mousemove', handleMouseMove);
    button.addEventListener('mouseenter', handleMouseEnter);
    button.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      button.removeEventListener('mousemove', handleMouseMove);
      button.removeEventListener('mouseenter', handleMouseEnter);
      button.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <button
      ref={buttonRef}
      className={`magnetic relative overflow-hidden transition-all duration-300 ${className}`}
      data-cursor-text={cursorText}
      style={{
        transform: isHovering 
          ? `translate(${mousePosition.x * 0.1}px, ${mousePosition.y * 0.1}px)` 
          : 'translate(0, 0)'
      }}
      {...props}
    >
      {/* Ripple effect */}
      {isHovering && (
        <div
          className="absolute rounded-full bg-white/20 pointer-events-none animate-ping"
          style={{
            left: mousePosition.x - 10,
            top: mousePosition.y - 10,
            width: 20,
            height: 20,
          }}
        />
      )}
      
      {/* Button content */}
      <span className="relative z-10">{children}</span>
      
      {/* Gradient overlay */}
      <div 
        className="absolute inset-0 opacity-0 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.1) 0%, transparent 50%)`,
          opacity: isHovering ? 1 : 0
        }}
      />
    </button>
  );
};

/**
 * Floating Action Button with magnetic effect
 */
export const FloatingActionButton = ({ 
  icon, 
  onClick, 
  position = 'bottom-right',
  className = '' 
}) => {
  const positionClasses = {
    'bottom-right': 'bottom-8 right-8',
    'bottom-left': 'bottom-8 left-8',
    'top-right': 'top-8 right-8',
    'top-left': 'top-8 left-8'
  };

  return (
    <MagneticButton
      onClick={onClick}
      className={`magnetic fixed ${positionClasses[position]} w-14 h-14 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full shadow-2xl flex items-center justify-center text-white hover:shadow-blue-500/25 transition-all duration-300 ${className}`}
      cursorText="Click me"
    >
      {icon}
    </MagneticButton>
  );
};

export default MagneticCursor;