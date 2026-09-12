import React from 'react';
import { Compass } from 'lucide-react';
import './LearningMode.css';

export default function MarketAnalogyCard({ regime, direction }) {
  const safeRegime = regime?.toLowerCase() || 'random_walk';
  const isTrend = safeRegime === 'trending';
  const isMeanRev = safeRegime === 'mean_reverting';
  
  return (
    <div className="learning-section learning-delay-7">
      <div className="learning-section-title">
        <Compass size={18} /> Market Physics Analogy
      </div>
      <div className={`learning-analogy-card ${safeRegime}`}>
        <div style={{ position: 'relative', zIndex: 2 }}>
          {isTrend && <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏄‍♂️</div>}
          {isMeanRev && <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏓</div>}
          {!isTrend && !isMeanRev && <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎲</div>}
          <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
            {isTrend ? 'Riding the Current' : isMeanRev ? 'The Rubber Band' : 'Walking in the Dark'}
          </div>
        </div>
        
        {isTrend && (
          <div className="learning-river-scene">
            <div className="learning-river-water" />
          </div>
        )}
      </div>
      <div className="learning-section-label">
        {isTrend 
          ? "The market is flowing strongly in one direction. We align our trade with the momentum, like surfing a wave."
          : isMeanRev
            ? "The market is snapping back and forth. Price stretched too far and is snapping back to average."
            : "The market lacks clear direction. Strict risk control is essential here."}
      </div>
    </div>
  );
}
