import React from 'react';
import { 
  ShieldAlert, 
  Zap, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Shield, 
  Activity, 
  BrainCircuit,
  Compass,
  Scale,
  Layers,
  CheckCircle,
  Crosshair,
  BarChart3
} from 'lucide-react';
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

  // Parse Sections safely using regex boundary matching
  const extractSection = (regex) => {
    const match = content.match(regex);
    return match ? match[1].trim() : '';
  };

  const nextHeaderPattern = '(?:🎯 BEGINNER TAKEAWAY:|⚖️ MATHEMATICAL ASYMMETRY|🔬 FRACTAL MATHEMATICS|🌊 LEVEL 2 ORDER BOOK|🌐 MULTI-TIMEFRAME|🎯 SMART MONEY LIQUIDITY|🛡️ CAPITAL PRESERVATION|TRADE LEVELS:|INSTITUTIONAL REASONING:|MODULE 14|$)';

  const verdictText = extractSection(new RegExp(`PREDICTION VERDICT:([\\s\\S]*?)${nextHeaderPattern}`));
  const beginnerText = extractSection(new RegExp(`🎯 BEGINNER TAKEAWAY:([\\s\\S]*?)${nextHeaderPattern}`));
  const asymmetryText = extractSection(new RegExp(`⚖️ MATHEMATICAL ASYMMETRY[^:]*:([\\s\\S]*?)${nextHeaderPattern}`));
  const fractalText = extractSection(new RegExp(`🔬 FRACTAL MATHEMATICS[^:]*:([\\s\\S]*?)${nextHeaderPattern}`));
  const orderBookText = extractSection(new RegExp(`🌊 LEVEL 2 ORDER BOOK[^:]*:([\\s\\S]*?)${nextHeaderPattern}`));
  const confluenceText = extractSection(new RegExp(`🌐 MULTI-TIMEFRAME[^:]*:([\\s\\S]*?)${nextHeaderPattern}`));
  const liquidityText = extractSection(new RegExp(`🎯 SMART MONEY LIQUIDITY[^:]*:([\\s\\S]*?)${nextHeaderPattern}`));
  const shieldProofText = extractSection(new RegExp(`🛡️ CAPITAL PRESERVATION[^:]*:([\\s\\S]*?)(?:_Data Telemetry|$)`));

  // Legacy sections (for chart image mode / custom AI prompts)
  const levelsText = extractSection(new RegExp(`TRADE LEVELS:([\\s\\S]*?)${nextHeaderPattern}`));
  const reasoningText = extractSection(new RegExp(`INSTITUTIONAL REASONING:([\\s\\S]*?)${nextHeaderPattern}`));
  const module14Text = extractSection(/MODULE 14 — [^\n]+[\s\S]*?(?:━+|-+)([\s\S]*?)$/);

  // Parse individual fields from Verdict
  const baseCase = (verdictText.match(/BASE CASE:\s*(.*)/i) || [])[1] || '';
  const timeframe = (verdictText.match(/Timeframe:\s*(.*)/i) || [])[1] || '';
  const currentPrice = (verdictText.match(/Current Price:\s*(.*)/i) || [])[1] || '';
  const setupId = (verdictText.match(/matched_setup_id:\s*(.*)/i) || [])[1] || '';
  const engineAction = (verdictText.match(/Engine Action:\s*(.*)/i) || [])[1] || '';

  const isBullish = baseCase.toUpperCase().includes('BULLISH');
  const isBearish = baseCase.toUpperCase().includes('BEARISH');
  const isShield = engineAction.includes('SHIELD') || verdictText.includes('SHIELD') || baseCase.includes('SHIELD');
  const dirColorClass = isShield ? 'shield-text' : isBullish ? 'bullish-text' : isBearish ? 'bearish-text' : 'neutral-text';

  // Parse lists
  const parseList = (text) => {
    if (!text) return [];
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('•') || line.startsWith('-') || line.startsWith('*'))
      .map(line => line.replace(/^[•\-*]\s*/, ''));
  };

  const beginnerList = parseList(beginnerText);
  const asymmetryList = parseList(asymmetryText);
  const fractalList = parseList(fractalText);
  const orderBookList = parseList(orderBookText);
  const confluenceList = parseList(confluenceText);
  const liquidityList = parseList(liquidityText);
  const shieldList = parseList(shieldProofText);
  const levelsList = parseList(levelsText);
  const reasoningList = parseList(reasoningText);
  const moduleList = parseList(module14Text);

  return (
    <div className="institutional-report">
      
      {/* 1. PRIMARY PREDICTION VERDICT CARD */}
      <div className={`report-card primary-verdict ${isShield ? 'verdict-shield' : ''}`}>
        <div className="report-card-header">
          <Activity size={16} />
          <span>PREDICTION VERDICT {engineAction ? `— ${engineAction.replace(/_/g, ' ')}` : ''}</span>
        </div>
        <div className="verdict-grid">
          <div className="verdict-item highlight">
            <span className="verdict-label">BASE CASE</span>
            <span className={`verdict-value ${dirColorClass}`}>
              {isShield ? <ShieldAlert size={16} /> : isBullish ? <TrendingUp size={16} /> : isBearish ? <TrendingDown size={16} /> : <Activity size={16} />}
              {baseCase || (isShield ? 'SHIELD MODE ACTIVE' : 'Analyzing...')}
            </span>
          </div>
          <div className="verdict-item">
            <span className="verdict-label">TIMEFRAME</span>
            <span className="verdict-value">{timeframe || 'Intraday (15m/1h)'}</span>
          </div>
          <div className="verdict-item">
            <span className="verdict-label">CURRENT PRICE</span>
            <span className="verdict-value font-mono">
              {currentPrice || '...'}
            </span>
          </div>
          <div className="verdict-item">
            <span className="verdict-label">SETUP FOOTPRINT</span>
            <span className="verdict-value setup-pill">
              {setupId || 'QUANT_CONFLUENCE'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. BEGINNER TAKEAWAY CARD */}
      {beginnerText && (
        <div className="report-card beginner-takeaway-card">
          <div className="report-card-header" style={{ color: '#38bdf8' }}>
            <Compass size={16} />
            <span>BEGINNER TAKEAWAY (DIRECT ACTION)</span>
          </div>
          <ul className="report-list">
            {beginnerList.map((item, idx) => (
              <li key={idx} className="level-item stream-anim">
                <span className="level-bullet" style={{ background: '#38bdf8' }}></span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. MATHEMATICAL ASYMMETRY (1:2.0 RRR) & EXPECTED VALUE CARD */}
      {asymmetryText && (
        <div className="report-card asymmetry-ev-card">
          <div className="report-card-header" style={{ color: '#34d399' }}>
            <Scale size={16} />
            <span>MATHEMATICAL ASYMMETRY (1:2.0 RRR) & EXPECTED VALUE</span>
          </div>
          <ul className="report-list mono-list">
            {asymmetryList.map((item, idx) => {
              const isEV = item.includes('Expected Value');
              const isPositiveEV = isEV && item.includes('+');
              const isNegativeEV = isEV && item.includes('-');
              return (
                <li key={idx} className={`level-item stream-anim ${isEV ? 'ev-highlight' : ''}`} style={{
                  background: isPositiveEV ? 'rgba(52,211,153,0.08)' : isNegativeEV ? 'rgba(239,68,68,0.08)' : 'transparent',
                  padding: isEV ? '6px 10px' : '0',
                  borderRadius: isEV ? 6 : 0,
                  border: isEV ? `1px solid ${isPositiveEV ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)'}` : 'none'
                }}>
                  <span className="level-bullet" style={{ background: isPositiveEV ? '#34d399' : isNegativeEV ? '#ef4444' : '#60a5fa' }}></span>
                  <span style={{ fontWeight: isEV ? 600 : 400, color: isPositiveEV ? '#34d399' : isNegativeEV ? '#f87171' : 'inherit' }}>
                    {item}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 4. FRACTAL MATHEMATICS PROOF (HURST REGIME) CARD */}
      {fractalText && (
        <div className="report-card fractal-proof-card">
          <div className="report-card-header" style={{ color: '#c084fc' }}>
            <Crosshair size={16} />
            <span>FRACTAL MATHEMATICS PROOF (HURST GEOMETRY)</span>
          </div>
          <ul className="report-list mono-list">
            {fractalList.map((item, idx) => (
              <li key={idx} className="reasoning-item stream-anim">
                <span className="reasoning-bullet" style={{ background: '#c084fc' }}></span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. LEVEL 2 ORDER BOOK & ORDER FLOW MATRIX CARD */}
      {orderBookText && (
        <div className="report-card order-book-card">
          <div className="report-card-header" style={{ color: '#fbbf24' }}>
            <Layers size={16} />
            <span>LEVEL 2 ORDER BOOK & ORDER FLOW MATRIX</span>
          </div>
          <ul className="report-list mono-list">
            {orderBookList.map((item, idx) => (
              <li key={idx} className="level-item stream-anim">
                <span className="level-bullet" style={{ background: '#fbbf24' }}></span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 6. MULTI-TIMEFRAME CONFLUENCE MATRIX CARD */}
      {confluenceText && (
        <div className="report-card confluence-matrix-card">
          <div className="report-card-header" style={{ color: '#60a5fa' }}>
            <BarChart3 size={16} />
            <span>MULTI-TIMEFRAME CONFLUENCE MATRIX</span>
          </div>
          <ul className="report-list">
            {confluenceList.map((item, idx) => (
              <li key={idx} className="reasoning-item stream-anim">
                <span className="reasoning-bullet" style={{ background: '#60a5fa' }}></span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 6. SMART MONEY LIQUIDITY SWEEP & BREAKEVEN RADAR */}
      {liquidityText && (
        <div className="report-card liquidity-sweep-card" style={{
          borderColor: 'rgba(168,85,247,0.35)',
          background: 'rgba(168,85,247,0.03)'
        }}>
          <div className="report-card-header" style={{ color: '#c084fc', borderBottomColor: 'rgba(168,85,247,0.15)' }}>
            <Crosshair size={16} />
            <span>SMART MONEY LIQUIDITY SWEEP & BREAKEVEN RADAR</span>
          </div>
          <ul className="report-list">
            {liquidityList.map((item, idx) => (
              <li key={idx} className="reasoning-item stream-anim">
                <span className="reasoning-bullet" style={{ background: '#a855f7' }}></span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 7. CAPITAL PRESERVATION SHIELD PROOF CARD */}
      {shieldProofText && (
        <div className="report-card shield-proof-card" style={{
          borderColor: isShield ? 'rgba(239,68,68,0.35)' : 'rgba(52,211,153,0.35)',
          background: isShield ? 'rgba(239,68,68,0.04)' : 'rgba(52,211,153,0.04)'
        }}>
          <div className="report-card-header" style={{
            color: isShield ? '#f87171' : '#34d399',
            borderBottomColor: isShield ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.15)'
          }}>
            {isShield ? <ShieldAlert size={16} /> : <CheckCircle size={16} />}
            <span>CAPITAL PRESERVATION SHIELD PROOF</span>
          </div>
          <ul className="report-list">
            {shieldList.map((item, idx) => {
              const isGate = item.includes('Gate') || item.includes('Triggered');
              const isTrap = item.includes('Retail Trader Trap');
              const isDefense = item.includes('Capital Defense');
              return (
                <li key={idx} className="reasoning-item stream-anim" style={{
                  color: isGate ? '#fca5a5' : isTrap ? '#fde68a' : isDefense ? '#93c5fd' : 'inherit'
                }}>
                  <span className="reasoning-bullet" style={{
                    background: isShield ? '#ef4444' : '#34d399'
                  }}></span>
                  <span>{item}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* LEGACY TRADE LEVELS (For chart image mode / AI stream) */}
      {levelsText && !asymmetryText && (
        <div className="report-card trade-levels">
          <div className="report-card-header">
            <Target size={16} />
            <span>TRADE LEVELS</span>
          </div>
          <ul className="report-list">
            {levelsList.map((item, idx) => (
              <li key={idx} className="level-item stream-anim">
                <span className="level-bullet"></span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* LEGACY INSTITUTIONAL REASONING (For chart image mode / AI stream) */}
      {reasoningText && !confluenceText && (
        <div className="report-card institutional-reasoning">
          <div className="report-card-header">
            <BrainCircuit size={16} />
            <span>INSTITUTIONAL REASONING</span>
          </div>
          <ul className="report-list">
            {reasoningList.map((item, idx) => (
              <li key={idx} className="reasoning-item stream-anim">
                <span className="reasoning-bullet"></span>
                <span>{item}</span>
              </li>
            ))}
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
                  {isBlock && <ShieldAlert size={14} style={{ marginRight: '6px' }} />}
                  <span>{item}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
