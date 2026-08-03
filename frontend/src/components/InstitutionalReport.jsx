import React from 'react';
import { ShieldAlert, Zap, TrendingUp, TrendingDown, Target, Shield, Activity, BrainCircuit } from 'lucide-react';
import './MessageBubble.css';

export default function InstitutionalReport({ content, isStreaming }) {
  if (!content) return null;

  // Fallback for generic AI responses (global formatting for non-verdicts)
  if (!content.includes('PREDICTION VERDICT:')) {
    const rawBlocks = content.split(/\n\n+/);
    return (
      <div className="institutional-report">
        {rawBlocks.map((block, idx) => {
          let trimmed = block.replace(/\*\*/g, '').trim(); 
          if (!trimmed) return null;
          
          const lines = trimmed.split('\n');
          const listLines = lines.filter(line => /^[•\-*]|\d+\./.test(line.trim()));
          const isList = lines.length > 1 && listLines.length >= (lines.length / 2);

          if (isList) {
            return (
              <div key={idx} className="report-card">
                <ul className="report-list">
                  {lines.map((line, lIdx) => (
                    <li key={lIdx} className="level-item">
                      <span className="level-bullet"></span>
                      <span>{line.replace(/^[•\-*]\s*|^\d+\.\s*/, '').trim()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          }
          
          return (
            <div key={idx} className="report-card">
              <p className="report-paragraph">{trimmed}</p>
            </div>
          );
        })}
      </div>
    );
  }

  // Parse Sections safely for the institutional Trading Verdict
  const extractSection = (regex) => {
    const match = content.match(regex);
    return match ? match[1].trim() : '';
  };

  const verdictText = extractSection(/PREDICTION VERDICT:([\s\S]*?)(?:TRADE LEVELS:|INSTITUTIONAL REASONING:|MODULE 14|$)/);
  const levelsText = extractSection(/TRADE LEVELS:([\s\S]*?)(?:INSTITUTIONAL REASONING:|MODULE 14|$)/);
  const reasoningText = extractSection(/INSTITUTIONAL REASONING:([\s\S]*?)(?:MODULE 14|$)/);
  const module14Text = extractSection(/MODULE 14 — PHASE 3 SYSTEM VERDICT[\s\S]*?(?:━+|-+)([\s\S]*?)$/);

  // Parse individual fields from Verdict
  const baseCase = (verdictText.match(/BASE CASE:\s*(.*)/i) || [])[1] || '';
  const timeframe = (verdictText.match(/Timeframe:\s*(.*)/i) || [])[1] || '';
  const currentPrice = (verdictText.match(/Current Price:\s*(.*)/i) || [])[1] || '';
  const setupId = (verdictText.match(/matched_setup_id:\s*(.*)/i) || [])[1] || '';

  const isBullish = baseCase.toUpperCase().includes('BULLISH');
  const isBearish = baseCase.toUpperCase().includes('BEARISH');
  const dirColorClass = isBullish ? 'bullish-text' : isBearish ? 'bearish-text' : 'neutral-text';

  // Parse lists
  const parseList = (text) => {
    if (!text) return [];
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('•') || line.startsWith('-') || line.startsWith('*'))
      .map(line => line.replace(/^[•\-*]\s*/, ''));
  };

  const levelsList = parseList(levelsText);
  const reasoningList = parseList(reasoningText);
  const moduleList = parseList(module14Text);

  // Helper to render the cursor on the last item
  const renderCursor = (isActiveSection, isLastItem) => {
    return (isStreaming && isActiveSection && isLastItem) ? <span className="typing-cursor"></span> : null;
  };

  const activeSection = moduleList.length > 0 ? 'module' 
                      : reasoningList.length > 0 ? 'reasoning'
                      : levelsList.length > 0 ? 'levels' 
                      : 'verdict';

  return (
    <div className="institutional-report">
      
      {/* VERDICT SECTION */}
      <div className="report-card primary-verdict">
        <div className="report-card-header">
          <Activity size={16} />
          <span>PREDICTION VERDICT</span>
        </div>
        <div className="verdict-grid">
          <div className="verdict-item highlight">
            <span className="verdict-label">BASE CASE</span>
            <span className={`verdict-value ${dirColorClass}`}>
              {isBullish ? <TrendingUp size={16} /> : isBearish ? <TrendingDown size={16} /> : <Activity size={16} />}
              {baseCase || 'Processing...'}
            </span>
          </div>
          <div className="verdict-item">
            <span className="verdict-label">TIMEFRAME</span>
            <span className="verdict-value">{timeframe || '...'}</span>
          </div>
          <div className="verdict-item">
            <span className="verdict-label">CURRENT PRICE</span>
            <span className="verdict-value font-mono">
              {currentPrice || '...'}
              {renderCursor(activeSection === 'verdict' && !setupId, true)}
            </span>
          </div>
          <div className="verdict-item">
            <span className="verdict-label">SETUP ID</span>
            <span className="verdict-value setup-pill">
              {setupId || '...'}
              {renderCursor(activeSection === 'verdict' && !!setupId, true)}
            </span>
          </div>
        </div>
      </div>

      {/* TRADE LEVELS SECTION */}
      {levelsText && (
        <div className="report-card trade-levels">
          <div className="report-card-header">
            <Target size={16} />
            <span>TRADE LEVELS</span>
          </div>
          <ul className="report-list">
            {levelsList.length > 0 ? levelsList.map((item, idx) => (
              <li key={idx} className="level-item stream-anim">
                <span className="level-bullet"></span>
                <span>
                  {item}
                  {renderCursor(activeSection === 'levels', idx === levelsList.length - 1)}
                </span>
              </li>
            )) : <p className="streaming-text stream-anim">Calculating levels... {renderCursor(activeSection === 'levels', true)}</p>}
          </ul>
        </div>
      )}

      {/* INSTITUTIONAL REASONING SECTION */}
      {reasoningText && (
        <div className="report-card institutional-reasoning">
          <div className="report-card-header">
            <BrainCircuit size={16} />
            <span>INSTITUTIONAL REASONING</span>
          </div>
          <ul className="report-list">
            {reasoningList.length > 0 ? reasoningList.map((item, idx) => (
              <li key={idx} className="reasoning-item stream-anim">
                <span className="reasoning-bullet"></span>
                <span>
                  {item}
                  {renderCursor(activeSection === 'reasoning', idx === reasoningList.length - 1)}
                </span>
              </li>
            )) : <p className="streaming-text stream-anim">Synthesizing institutional data... {renderCursor(activeSection === 'reasoning', true)}</p>}
          </ul>
        </div>
      )}

      {/* MODULE 14 PHASE 3 SYSTEM VERDICT */}
      {module14Text && (
        <div className="report-card module-verdict">
          <div className="report-card-header sys-verdict-header">
            <Shield size={16} />
            <span>MODULE 14 — PHASE 3 SYSTEM VERDICT</span>
          </div>
          <ul className="report-list mono-list">
            {moduleList.map((item, idx) => {
              const isBlock = item.includes('SHIELD MODE ACTIVATED');
              return (
                <li key={idx} className={`stream-anim ${isBlock ? 'shield-block-item' : ''}`}>
                  {isBlock && <ShieldAlert size={14} style={{marginRight: '6px'}}/>}
                  <span>
                    {item}
                    {renderCursor(activeSection === 'module', idx === moduleList.length - 1)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
