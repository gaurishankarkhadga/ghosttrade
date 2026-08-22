import React from 'react';
import { motion } from 'framer-motion';

export default function AnimatedGhostLogo({ size = 48, className = "" }) {
  // Animation configuration for the SVG drawing effect
  const drawTransition = {
    pathLength: { duration: 2, ease: "easeInOut" },
    opacity: { duration: 1 }
  };

  return (
    <div className={`animated-ghost-logo ${className}`} style={{ width: size, height: size }}>
      <svg 
        viewBox="0 0 100 100" 
        width="100%" 
        height="100%" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Central Candlestick (The 'Spine' of the ghost) */}
        <motion.g
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          {/* Top Wick */}
          <line x1="50" y1="15" x2="50" y2="30" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" filter="url(#neon-glow)" />
          {/* Bottom Wick */}
          <line x1="50" y1="70" x2="50" y2="85" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" filter="url(#neon-glow)" />
          {/* Candle Body */}
          <rect x="44" y="30" width="12" height="40" rx="2" fill="#38bdf8" filter="url(#neon-glow)" />
        </motion.g>

        {/* The Quant Ghost Cloak - Drawn smoothly using framer-motion */}
        <motion.path 
          d="M 22 85 
             V 52 
             C 22 26, 78 26, 78 52 
             V 85 
             C 68 75, 58 92, 50 85 
             C 42 92, 32 75, 22 85 Z"
          stroke="#ffffff" 
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="rgba(255, 255, 255, 0.05)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={drawTransition}
          filter="url(#neon-glow)"
        />

        {/* Cyber Slit Eyes */}
        <motion.g
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 1.5, type: 'spring' }}
        >
          <path d="M 34 46 L 42 48 L 40 43 Z" fill="#38bdf8" filter="url(#neon-glow)" />
          <path d="M 66 46 L 58 48 L 60 43 Z" fill="#38bdf8" filter="url(#neon-glow)" />
        </motion.g>
        
        {/* Animated Pulse Ring underneath the ghost */}
        <motion.ellipse
          cx="50"
          cy="90"
          rx="30"
          ry="4"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="1.5"
          initial={{ scale: 0, opacity: 0.8 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 2 }}
        />
      </svg>
    </div>
  );
}
