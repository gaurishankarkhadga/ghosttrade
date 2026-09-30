import React, { useState } from 'react';
import { 
  SlidersHorizontal, 
  Calculator, 
  X,
  ShieldCheck,
  BarChart3
} from 'lucide-react';

/**
 * Position Sizing Calculator — Educational math tool only.
 * This is NOT financial advice. Does NOT execute any order.
 * Displays risk/reward calculations for educational purposes.
 * Compliant with SEBI guidelines — no buy/sell recommendations.
 */
export default function InstitutionalExecutionModal({
  isOpen,
  onClose,
  tradeData,
}) {
  if (!isOpen || !tradeData) return null;

  const {
    asset,
    entryPrice,
    stopLoss,
    takeProfit,
    riskPercentage = 2.0,
    kellySize = 5.0,
  } = tradeData;

  const [portfolioSize, setPortfolioSize] = useState(10000);

  const safeEntry = Number(entryPrice) || 0;
  const safeStop = Number(stopLoss) || 0;
  const safeTarget = Number(takeProfit) || 0;
  const safeKelly = Number(kellySize) || 5;
  const safeRisk = Number(riskPercentage) || 2.0;

  // Pure math — no advice
  const halfKellyPct = safeKelly / 2;
  const halfKellyDollar = (portfolioSize * halfKellyPct / 100);
  const fullKellyDollar = (portfolioSize * safeKelly / 100);
  const riskAmountDollar = (portfolioSize * safeRisk / 100);

  const stopDistance = safeEntry > 0 && safeStop > 0 ? Math.abs(safeEntry - safeStop) : 0;
  const targetDistance = safeEntry > 0 && safeTarget > 0 ? Math.abs(safeTarget - safeEntry) : 0;
  const rrr = stopDistance > 0 ? (targetDistance / stopDistance).toFixed(2) : '—';
  const stopPct = safeEntry > 0 && stopDistance > 0 ? (stopDistance / safeEntry * 100).toFixed(2) : '—';
  const targetPct = safeEntry > 0 && targetDistance > 0 ? (targetDistance / safeEntry * 100).toFixed(2) : '—';

  // Units calculation (educational only)
  const unitsHalfKelly = stopDistance > 0 ? (halfKellyDollar / stopDistance).toFixed(2) : '—';
  const unitsRiskBased = stopDistance > 0 ? (riskAmountDollar / stopDistance).toFixed(2) : '—';

  const fPrice = (p) => {
    if (!p || isNaN(Number(p))) return '—';
    const num = Number(p);
    const abs = Math.abs(num);
    if (abs < 0.0001) return num.toFixed(6);
    if (abs < 0.01) return num.toFixed(5);
    if (abs < 1) return num.toFixed(4);
    if (abs < 10) return num.toFixed(3);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0B0F17',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.9)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            background: '#101623',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(52, 211, 153, 0.12)',
                border: '1px solid rgba(52, 211, 153, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <Calculator size={16} color="#34d399" />
            </div>
            <div>
              <div
                style={{
                  fontSize: '13px', fontWeight: 700, color: '#f8fafc',
                  letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: 'monospace'
                }}
              >
                Position Sizing Calculator
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                {asset} — Educational Math Only
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: '#64748b',
              cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* SEBI Disclaimer */}
        <div style={{
          margin: '12px 20px 0',
          padding: '8px 12px',
          background: 'rgba(245,158,11,0.06)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: '8px',
          display: 'flex', alignItems: 'flex-start', gap: '8px'
        }}>
          <ShieldCheck size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: 1.5 }}>
            <strong style={{ color: '#f59e0b' }}>Educational Tool Only.</strong> This calculator does not provide
            investment advice or trading recommendations. All outputs are for educational purposes only, as per SEBI guidelines.
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Setup Key Levels */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
              Setup Key Levels (from AI Analysis)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {[
                { label: 'Reference Price', val: `$${fPrice(entryPrice)}`, color: '#f8fafc' },
                { label: 'Risk Level', val: `$${fPrice(stopLoss)}`, sub: `${stopPct}% gap`, color: '#f87171' },
                { label: 'Target Level', val: `$${fPrice(takeProfit)}`, sub: `${targetPct}% gap`, color: '#34d399' },
              ].map((item, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '8px', padding: '10px 12px'
                }}>
                  <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>{item.label}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: item.color, fontFamily: 'monospace' }}>{item.val}</div>
                  {item.sub && <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{item.sub}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* R:R Display */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
            padding: '12px 16px',
            background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.15)',
            borderRadius: '10px'
          }}>
            <BarChart3 size={16} color="#38bdf8" />
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Risk:Reward Ratio</span>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace' }}>
              1 : {rrr}
            </span>
            <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace', marginLeft: 8 }}>
              (Educational calculation)
            </span>
          </div>

          {/* Portfolio Size Slider */}
          <div style={{
            background: 'rgba(52, 211, 153, 0.04)', border: '1px solid rgba(52, 211, 153, 0.15)',
            borderRadius: '10px', padding: '14px 16px'
          }}>
            <div style={{
              fontSize: '11px', fontWeight: 700, color: '#34d399',
              textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}>
              <SlidersHorizontal size={12} /> Hypothetical Portfolio Size (Educational)
            </div>
            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
              Portfolio: ${portfolioSize.toLocaleString()}
            </label>
            <input
              type="range" min="1000" max="1000000" step="1000"
              value={portfolioSize}
              onChange={(e) => setPortfolioSize(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#34d399' }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
              <div style={{
                padding: '10px 12px', background: 'rgba(52, 211, 153, 0.08)',
                border: '1px solid rgba(52, 211, 153, 0.25)', borderRadius: '8px'
              }}>
                <div style={{ fontSize: '10px', color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Half-Kelly Position Size
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace', marginTop: '4px' }}>
                  ${halfKellyDollar.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                  {halfKellyPct.toFixed(1)}% — Conservative (educational)
                </div>
              </div>
              <div style={{
                padding: '10px 12px', background: 'rgba(245, 158, 11, 0.06)',
                border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: '8px'
              }}>
                <div style={{ fontSize: '10px', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Risk-Based Position Size
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace', marginTop: '4px' }}>
                  ${riskAmountDollar.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                  {safeRisk.toFixed(1)}% risk amount (educational)
                </div>
              </div>
            </div>

            {/* Units calc */}
            {stopDistance > 0 && (
              <div style={{
                marginTop: '10px', padding: '10px 12px',
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Hypothetical Units at Risk-Level Gap (${fPrice(stopDistance)})
                </div>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: '#34d399' }}>Half-Kelly Units</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace' }}>{unitsHalfKelly}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#f59e0b' }}>Risk-Based Units</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace' }}>{unitsRiskBased}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '12px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#94a3b8', fontWeight: 600, fontSize: '13px',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '8px'
            }}
          >
            <X size={14} /> Close Calculator
          </button>
        </div>
      </div>
    </div>
  );
}
