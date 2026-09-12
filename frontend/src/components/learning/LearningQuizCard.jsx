import React, { useState } from 'react';
import { GraduationCap, CheckCircle } from 'lucide-react';

export default function LearningQuizCard() {
  const [answered, setAnswered] = useState(false);
  
  return (
    <div className="learning-section learning-quiz-card learning-delay-8" style={{ padding: '1.5rem' }}>
      <div className="learning-section-title" style={{ color: '#facc15' }}>
        <GraduationCap size={20} /> Knowledge Check
      </div>
      <p className="learning-quiz-question">Why does the AI consider this a high probability trade?</p>
      
      {!answered ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="learning-quiz-option" onClick={() => setAnswered(true)}>
            The pattern aligns with positive Order Flow and Trend Regime.
          </button>
          <button className="learning-quiz-option wrong" onClick={() => setAnswered(true)} style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.1)' }}>
            Because the price has gone down too much and must go up.
          </button>
          <button className="learning-quiz-option wrong" onClick={() => setAnswered(true)} style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.1)' }}>
            The AI always wins 100% of the time.
          </button>
        </div>
      ) : (
        <div style={{ marginTop: '1.5rem', background: 'rgba(16,185,129,0.1)', border: '1px solid #10b981', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
          <CheckCircle color="#10b981" size={32} style={{ margin: '0 auto 0.5rem auto' }} />
          <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>Correct!</div>
          <div style={{ color: '#cbd5e1', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            We only take trades when multiple mathematical edges align. Prediction is about probability, not certainty.
          </div>
        </div>
      )}
    </div>
  );
}
