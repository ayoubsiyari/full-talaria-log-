import React, { useEffect, useRef, useState } from 'react';

/**
 * Advanced Particle System Component
 * Creates beautiful floating particles with various effects
 */
const ParticleSystem = ({ 
  particleCount = 50, 
  colors = ['#3090FF', '#232CF4', '#ffffff'], 
  speed = 1,
  size = { min: 1, max: 3 },
  opacity = { min: 0.1, max: 0.6 },
  interactive = true,
  connectionDistance = 150,
  showConnections = false
}) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const particlesRef = useRef([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Particle class
  class Particle {
    constructor(canvas) {
      this.canvas = canvas;
      this.reset();
      this.y = Math.random() * canvas.height;
      this.vx = (Math.random() - 0.5) * speed;
      this.vy = (Math.random() - 0.5) * speed;
    }

    reset() {
      this.x = Math.random() * this.canvas.width;
      this.y = -10;
      this.size = Math.random() * (size.max - size.min) + size.min;
      this.opacity = Math.random() * (opacity.max - opacity.min) + opacity.min;
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.vx = (Math.random() - 0.5) * speed;
      this.vy = Math.random() * speed + 0.5;
      this.life = 1;
      this.decay = Math.random() * 0.01 + 0.005;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.life -= this.decay;

      // Interactive effect with mouse
      if (interactive) {
        const dx = mouseRef.current.x - this.x;
        const dy = mouseRef.current.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 100) {
          const force = (100 - distance) / 100;
          this.vx += (dx / distance) * force * 0.01;
          this.vy += (dy / distance) * force * 0.01;
        }
      }

      // Boundary checks
      if (this.x < 0 || this.x > this.canvas.width || 
          this.y > this.canvas.height || this.life <= 0) {
        this.reset();
      }

      // Damping
      this.vx *= 0.99;
      this.vy *= 0.99;
    }

    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = this.opacity * this.life;
      
      // Create gradient for particle
      const gradient = ctx.createRadialGradient(
        this.x, this.y, 0,
        this.x, this.y, this.size
      );
      gradient.addColorStop(0, this.color);
      gradient.addColorStop(1, 'transparent');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      
      // Add glow effect
      ctx.shadowBlur = this.size * 2;
      ctx.shadowColor = this.color;
      ctx.fill();
      
      ctx.restore();
    }
  }

  // Initialize particles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateDimensions = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      setDimensions({ width: rect.width, height: rect.height });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    // Create particles
    particlesRef.current = Array.from({ length: particleCount }, () => new Particle(canvas));

    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, [particleCount]);

  // Mouse tracking
  useEffect(() => {
    if (!interactive) return;

    const handleMouseMove = (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [interactive]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Update and draw particles
      particlesRef.current.forEach(particle => {
        particle.update();
        particle.draw(ctx);
      });

      // Draw connections between nearby particles
      if (showConnections) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        
        for (let i = 0; i < particlesRef.current.length; i++) {
          for (let j = i + 1; j < particlesRef.current.length; j++) {
            const p1 = particlesRef.current[i];
            const p2 = particlesRef.current[j];
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < connectionDistance) {
              const opacity = 1 - (distance / connectionDistance);
              ctx.globalAlpha = opacity * 0.3;
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
          }
        }
        ctx.globalAlpha = 1;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [showConnections, connectionDistance]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{
        width: '100%',
        height: '100%',
        zIndex: 1
      }}
    />
  );
};

/**
 * Floating Orbs Component
 * Creates larger, slower-moving orbs for background ambiance
 */
export const FloatingOrbs = ({ count = 5 }) => {
  const [orbs, setOrbs] = useState([]);

  useEffect(() => {
    const newOrbs = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 200 + 100,
      color: ['#3090FF', '#232CF4', '#8B5CF6'][Math.floor(Math.random() * 3)],
      opacity: Math.random() * 0.1 + 0.05,
      duration: Math.random() * 20 + 20
    }));
    setOrbs(newOrbs);
  }, [count]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {orbs.map((orb) => (
        <div
          key={orb.id}
          className="absolute rounded-full blur-3xl"
          style={{
            left: `${orb.x}%`,
            top: `${orb.y}%`,
            width: `${orb.size}px`,
            height: `${orb.size}px`,
            background: `radial-gradient(circle, ${orb.color}${Math.floor(orb.opacity * 255).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
            animation: `float ${orb.duration}s ease-in-out infinite alternate`,
            transform: 'translate(-50%, -50%)'
          }}
        />
      ))}
    </div>
  );
};

/**
 * Animated Grid Component
 * Creates a dynamic grid background with wave effects
 */
export const AnimatedGrid = ({ 
  gridSize = 50, 
  color = 'rgba(255, 255, 255, 0.05)',
  waveEffect = true 
}) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    const updateDimensions = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    const animate = () => {
      timeRef.current += 0.01;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;

      // Draw vertical lines
      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        
        if (waveEffect) {
          for (let y = 0; y <= canvas.height; y += 5) {
            const wave = Math.sin((x + y + timeRef.current * 50) * 0.01) * 2;
            ctx.lineTo(x + wave, y);
          }
        } else {
          ctx.lineTo(x, canvas.height);
        }
        
        ctx.stroke();
      }

      // Draw horizontal lines
      for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        
        if (waveEffect) {
          for (let x = 0; x <= canvas.width; x += 5) {
            const wave = Math.sin((x + y + timeRef.current * 50) * 0.01) * 2;
            ctx.lineTo(x, y + wave);
          }
        } else {
          ctx.lineTo(canvas.width, y);
        }
        
        ctx.stroke();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', updateDimensions);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gridSize, color, waveEffect]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
};

export default ParticleSystem;
