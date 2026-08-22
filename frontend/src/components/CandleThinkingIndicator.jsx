import React from 'react';

export default function CandleThinkingIndicator({ size = 40 }) {
  return (
    <div className="candle-thinking-container" style={{ width: size, height: size * 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size} height={size * 1.5} viewBox="0 0 24 60" fill="none" xmlns="http://www.w3.org/2000/svg">
        
        {/* Simple continuous wick line. Hidden behind the body. */}
        <line 
          x1="12" y1="6" x2="12" y2="54" 
          strokeWidth="2" strokeLinecap="square"
          className="simple-wick"
        />
        
        {/* Simple solid body matching the screenshot. */}
        <rect 
          x="5" width="14" 
          strokeWidth="0"
          className="simple-body"
        />
      </svg>

      <style>{`
        /* 
          The absolute simplest, smoothest breathing animation.
          It smoothly pulses up (Green) and smoothly pulses down (Red).
        */
        
        .simple-wick {
          animation: wickColor 2s ease-in-out infinite;
        }
        
        .simple-body {
          animation: bodyBreathe 2s ease-in-out infinite;
        }

        /* Color switches exactly as the body crosses the center */
        @keyframes wickColor {
          0%, 49.9% { stroke: #10b981; } /* Green */
          50%, 100% { stroke: #ef4444; } /* Red */
        }

        /* Perfectly fluid sine-wave breathing motion */
        @keyframes bodyBreathe {
          0%   { y: 30px; height: 0px;  fill: #10b981; } /* Center (Open) */
          25%  { y: 10px; height: 20px; fill: #10b981; } /* Max High */
          49.9%{ y: 30px; height: 0px;  fill: #10b981; } /* Back to Center */
          50%  { y: 30px; height: 0px;  fill: #ef4444; } /* Flip to Red */
          75%  { y: 30px; height: 20px; fill: #ef4444; } /* Max Low */
          100% { y: 30px; height: 0px;  fill: #ef4444; } /* Back to Center */
        }
      `}</style>
    </div>
  );
}
