import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, Copy, Check } from 'lucide-react';
import useGhostStore from '../store/ghostStore';
import './PerformanceDashboard.css';

export default function PerformanceDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('signals'); // 'signals' | 'pending' | 'active' | 'closed' | 'prompts'
  const allPaperTrades = useGhostStore((state) => state.activePaperTrades) || [];
  const activePaperTrades = allPaperTrades.filter(t => t.status === 'OPEN');
  const pendingPaperTrades = allPaperTrades.filter(t => t.status === 'PENDING_CONFIRMATION');
  const closedPaperTrades = useGhostStore((state) => state.closedPaperTrades) || [];
  const promptLogs = useGhostStore((state) => state.promptLogs) || [];
  const aiSignals = useGhostStore((state) => state.aiSignals) || [];
  const systemPerformance = useGhostStore((state) => state.systemPerformance) || {
    totalTrades: 0, wins: 0, losses: 0, winRate: 0, averageWinPercent: 0, averageLossPercent: 0, systemEV: 0, netPnlPercent: 0
  };
  const cancelTrade = useGhostStore((state) => state.cancelTrade);
  const approveTrade = useGhostStore((state) => state.approveTrade);
  const initAuditData = useGhostStore((state) => state.initAuditData);
  const liveAssets = useGhostStore((state) => state.assets) || {};

  useEffect(() => {
    initAuditData();
  }, [initAuditData]);

  const [now, setNow] = useState(Date.now());
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopyData = () => {
    let textToCopy = '';
    
    if (activeTab === 'active') {
      textToCopy = 'Asset\tStatus\tDuration\tEntry Price\tTarget (TP)\tInvalidation (SL)\tLive Price\tUnrealized PnL\n';
      activePaperTrades.forEach(trade => {
        const liveAsset = liveAssets[trade.asset];
        const currentPrice = liveAsset ? liveAsset.currentPrice : trade.entryPrice;
        let unrealizedPnL = trade.side === 'LONG' ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice;
        textToCopy += `${trade.asset} (${trade.side})\tLIVE\t${formatDuration(trade.executedAt)}\t$${formatPrice(trade.entryPrice)}\t$${formatPrice(trade.takeProfit)}\t$${formatPrice(trade.stopLoss)}\t$${formatPrice(currentPrice)}\t$${formatPrice(unrealizedPnL)}\n`;
      });
    } else if (activeTab === 'closed') {
      textToCopy = 'Time\tAsset\tStatus\tEntry Price\tExit Price\tNet PnL\n';
      [...closedPaperTrades].reverse().forEach(trade => {
        textToCopy += `${formatDate(trade.closedAt || trade.executedAt)}\t${trade.asset} (${trade.side})\t${trade.status}\t$${formatPrice(trade.entryPrice)}\t${trade.status === 'CANCELLED' ? '-' : `$${formatPrice(trade.closedPrice)}`}\t${trade.status === 'CANCELLED' ? '0.00%' : `${formatPrice(trade.pnl)}%`}\n`;
      });
    } else if (activeTab === 'prompts') {
      textToCopy = 'Timestamp\tRaw User Prompt\tAI Processing Result\tAI Response\n';
      [...promptLogs].reverse().forEach(log => {
        textToCopy += `${formatDate(log.timestamp)}\t${(log.prompt || '').replace(/\n/g, ' ')}\t${log.resultType}\t${(log.aiOutput || 'No response recorded').replace(/\n/g, ' ')}\n`;
      });
    } else if (activeTab === 'signals') {
      textToCopy = 'Timestamp\tAsset\tDirection\tConfidence\tTarget\tStop Loss\tOutcome\tResolution Time\n';
      aiSignals.forEach(sig => {
        textToCopy += `${formatDate(sig.timestamp)}\t${sig.ticker}\t${sig.direction}\t${sig.calibratedConfidence || sig.rawConfidence}%\t$${formatPrice(sig.primaryTarget)}\t$${formatPrice(sig.invalidationLevel)}\t${sig.resolvedOutcome || 'PENDING'}\t${sig.resolvedAt ? formatDate(sig.resolvedAt) : 'N/A'}\n`;
      });
    }

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      });
    }
  };

  useEffect(() => {
    if (activePaperTrades.length > 0) {
      const interval = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(interval);
    }
  }, [activePaperTrades.length]);

  // Calculate Metrics based on AI Signals Verification (as per user request: software does not execute trades)
  const resolvedSignals = aiSignals.filter(sig => sig.resolvedOutcome === 'CORRECT' || sig.resolvedOutcome === 'INCORRECT');
  const totalPredictions = resolvedSignals.length;
  const wins = aiSignals.filter(sig => sig.resolvedOutcome === 'CORRECT').length;
  const losses = aiSignals.filter(sig => sig.resolvedOutcome === 'INCORRECT').length;
  const winRate = totalPredictions > 0 ? Math.round((wins / totalPredictions) * 100) : 0;
  const pendingCount = aiSignals.filter(sig => !sig.resolvedOutcome).length;
  const blockedCount = aiSignals.filter(sig => sig.signalBlocked).length;

  let totalWinR = 0;
  let validWins = 0;

  resolvedSignals.forEach(sig => {
    if (sig.resolvedOutcome === 'CORRECT') {
      if (sig.currentPrice && sig.primaryTarget && sig.invalidationLevel) {
        const risk = Math.abs(sig.currentPrice - sig.invalidationLevel);
        const reward = Math.abs(sig.primaryTarget - sig.currentPrice);
        if (risk > 0) {
          totalWinR += (reward / risk);
          validWins++;
        }
      } else {
        totalWinR += 2.0; // Fallback to 2R for missing data
        validWins++;
      }
    }
  });

  const avgWinR = validWins > 0 ? (totalWinR / validWins) : 2.0;
  const winPct = totalPredictions > 0 ? (wins / totalPredictions) : 0;
  const lossPct = totalPredictions > 0 ? (losses / totalPredictions) : 0;
  const edgeExpectancy = (winPct * avgWinR) - (lossPct * 1.0);

  const formatPrice = (p) => p ? Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
  const formatDate = (isoString) => new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const formatDuration = (executedAt) => {
    if (!executedAt) return '--:--';
    const diff = Math.max(0, Math.floor((now - new Date(executedAt).getTime()) / 1000));
    const m = Math.floor(diff / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="audit-page-container">
      <div className="audit-header">
        <button className="audit-back-btn" onClick={() => navigate('/terminal')}>
          <ArrowLeft size={16} /> Back to Terminal
        </button>
        <h2 className="audit-title">
          <Activity size={18} color="#38bdf8" /> 
          Institutional Performance & Audit Ledger
        </h2>
      </div>

      <div style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>Realized PnL Performance (Closed Trades)</div>
      <div className="metrics-grid" style={{ marginBottom: '24px' }}>
        <div className="metric-box">
          <span className="metric-box-label">Total Closed Trades</span>
          <span className="metric-box-value">{systemPerformance.totalTrades}</span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">System Win Rate</span>
          <span className="metric-box-value">{systemPerformance.winRate}%</span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">Average Win</span>
          <span className="metric-box-value" style={{ color: '#34d399' }}>+{systemPerformance.averageWinPercent}%</span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">Average Loss</span>
          <span className="metric-box-value" style={{ color: '#f87171' }}>-{systemPerformance.averageLossPercent}%</span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">System EV / Trade</span>
          <span className="metric-box-value" style={{ color: systemPerformance.systemEV >= 0 ? '#34d399' : '#f87171' }}>
            {systemPerformance.systemEV >= 0 ? '+' : ''}{systemPerformance.systemEV}%
          </span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">Total Net PnL</span>
          <span className="metric-box-value" style={{ color: systemPerformance.netPnlPercent >= 0 ? '#34d399' : '#f87171' }}>
            {systemPerformance.netPnlPercent >= 0 ? '+' : ''}{systemPerformance.netPnlPercent}%
          </span>
        </div>
      </div>

      <div style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>AI Signals Verification (Predicted vs Actual)</div>
      <div className="metrics-grid">
        <div className="metric-box">
          <span className="metric-box-label">Verified Predictions</span>
          <span className="metric-box-value">{totalPredictions}</span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">AI Win Rate</span>
          <span className="metric-box-value">
            {winRate}%
          </span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">Wins (Correct)</span>
          <span className="metric-box-value" style={{ color: '#34d399' }}>
            {wins}
          </span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">Losses (Incorrect)</span>
          <span className="metric-box-value" style={{ color: '#f87171' }}>
            {losses}
          </span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">Pending Verification</span>
          <span className="metric-box-value" style={{ color: '#60A5FA' }}>
            {pendingCount}
          </span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">Edge Expectancy</span>
          <span className="metric-box-value" style={{ color: (() => {
            if (totalPredictions < 5) return '#94A3B8';
            return edgeExpectancy > 0 ? '#34d399' : edgeExpectancy < 0 ? '#f87171' : '#94A3B8';
          })() }}>
            {totalPredictions < 5 ? 'N/A' : `${edgeExpectancy >= 0 ? '+' : ''}${edgeExpectancy.toFixed(2)}R`}
          </span>
          <span style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>(Win%×{avgWinR.toFixed(1)}R - Loss%×1R)</span>
        </div>
      </div>

      <div className="audit-tabs">
        <div className="audit-tabs-group">
          <button 
            className={`audit-tab-btn ${activeTab === 'signals' ? 'active' : ''}`}
            onClick={() => setActiveTab('signals')}
          >
            AI Verification Ledger ({resolvedSignals.length})
          </button>
          <button 
            className={`audit-tab-btn ${activeTab === 'unresolved' ? 'active' : ''}`}
            onClick={() => setActiveTab('unresolved')}
          >
            Unresolved Signals ({aiSignals.length - resolvedSignals.length})
          </button>
          <button 
            className={`audit-tab-btn ${activeTab === 'prompts' ? 'active' : ''}`}
            onClick={() => setActiveTab('prompts')}
          >
            Prompt Audit ({promptLogs.length})
          </button>
          <button 
            className={`audit-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            Pending Approvals ({pendingPaperTrades.length})
            {pendingPaperTrades.length > 0 && <span className="pulse-indicator" style={{marginLeft: '6px', display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 8px #f59e0b'}}></span>}
          </button>
          <button 
            className={`audit-tab-btn ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            Active Trades ({activePaperTrades.length})
          </button>
          <button 
            className={`audit-tab-btn ${activeTab === 'closed' ? 'active' : ''}`}
            onClick={() => setActiveTab('closed')}
          >
            Trade Audit Ledger ({closedPaperTrades.length})
          </button>
        </div>
        <button className="audit-copy-btn" onClick={handleCopyData}>
          {copySuccess ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
          {copySuccess ? 'Copied' : 'Copy Data'}
        </button>
      </div>

      <div className="audit-content">
        {activeTab === 'pending' && (
          <table className="audit-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Source</th>
                <th>Pattern / Regime</th>
                <th>Entry Price</th>
                <th>Target (TP)</th>
                <th>Invalidation (SL)</th>
                <th>Recommended Size</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingPaperTrades.length === 0 && (
                <tr><td colSpan="8"><div className="empty-audit-state">No pending setups awaiting approval.</div></td></tr>
              )}
              {pendingPaperTrades.map(trade => (
                <tr key={trade.id}>
                  <td>
                    <span style={{ fontWeight: 600, color: '#f8fafc' }}>{trade.asset}</span>
                    <span className={`status-badge pending`} style={{ marginLeft: 8, background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid #f59e0b' }}>{trade.side}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: '11px', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                      {trade.source === 'SCANNER' ? '🤖 SCANNER' : '👁️ SCREENSHOT'}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontSize: '12px', color: '#CBD5E1' }}>{trade.pattern || 'N/A'}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>{trade.regime || 'N/A'}</div>
                  </td>
                  <td>${formatPrice(trade.entryPrice)}</td>
                  <td style={{ color: '#34d399' }}>${formatPrice(trade.takeProfit)}</td>
                  <td style={{ color: '#f87171' }}>${formatPrice(trade.stopLoss)}</td>
                  <td style={{ fontWeight: 600 }}>{trade.kellySize ? `${(trade.kellySize * 100).toFixed(2)}%` : '0.00%'}</td>
                  <td style={{ display: 'flex', gap: '8px' }}>
                    <button className="trade-btn buy" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => approveTrade(trade.id)}>Approve</button>
                    <button className="cancel-action-btn" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => cancelTrade(trade.id)}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'active' && (
          <table className="audit-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Entry Price</th>
                <th>Target (TP)</th>
                <th>Invalidation (SL)</th>
                <th>Live Price</th>
                <th>Unrealized PnL</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activePaperTrades.length === 0 && (
                <tr><td colSpan="9"><div className="empty-audit-state">No active trades in the market.</div></td></tr>
              )}
              {activePaperTrades.map(trade => {
                const liveAsset = liveAssets[trade.asset];
                const currentPrice = liveAsset ? liveAsset.currentPrice : trade.entryPrice;
                let unrealizedPnL = trade.side === 'LONG' ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice;

                return (
                  <tr key={trade.id}>
                    <td>
                      <span style={{ fontWeight: 600, color: '#f8fafc' }}>{trade.asset}</span>
                      <span className={`status-badge open`} style={{ marginLeft: 8 }}>{trade.side}</span>
                    </td>
                    <td><span className="status-badge open">LIVE</span></td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: '#CBD5E1' }}>{formatDuration(trade.executedAt)}</td>
                    <td>${formatPrice(trade.entryPrice)}</td>
                    <td>${formatPrice(trade.takeProfit)}</td>
                    <td>${formatPrice(trade.stopLoss)}</td>
                    <td style={{ color: '#f8fafc' }}>${formatPrice(currentPrice)}</td>
                    <td style={{ color: unrealizedPnL >= 0 ? '#34d399' : '#f87171' }}>
                      {unrealizedPnL >= 0 ? '+' : ''}${formatPrice(unrealizedPnL)}
                    </td>
                    <td>
                      <button className="cancel-action-btn" onClick={() => cancelTrade(trade.id)}>Force Exit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {activeTab === 'closed' && (
          <table className="audit-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Asset</th>
                <th>Status</th>
                <th>Entry Price</th>
                <th>Exit Price</th>
                <th>Net PnL</th>
              </tr>
            </thead>
            <tbody>
              {closedPaperTrades.length === 0 && (
                <tr><td colSpan="6"><div className="empty-audit-state">No historical trade data.</div></td></tr>
              )}
              {[...closedPaperTrades].reverse().map(trade => (
                <tr key={trade.id}>
                  <td>{formatDate(trade.closedAt || trade.executedAt)}</td>
                  <td>
                    <span style={{ fontWeight: 600, color: '#f8fafc' }}>{trade.asset}</span>
                    <span className={`status-badge ${trade.status.toLowerCase()}`} style={{ marginLeft: 8, background: 'transparent', border: '1px solid currentColor' }}>{trade.side}</span>
                  </td>
                  <td><span className={`status-badge ${trade.status.toLowerCase()}`}>{trade.status}</span></td>
                  <td>${formatPrice(trade.entryPrice)}</td>
                  <td>{trade.status === 'CANCELLED' ? '-' : `$${formatPrice(trade.closedPrice)}`}</td>
                  <td style={{ color: trade.pnl > 0 ? '#34d399' : trade.pnl < 0 ? '#f87171' : '#94a3b8' }}>
                    {trade.status === 'CANCELLED' ? '0.00%' : `${trade.pnl > 0 ? '+' : ''}${formatPrice(trade.pnl)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'prompts' && (
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Interaction Type</th>
                <th>User Prompt</th>
                <th>AI Reasoning</th>
                <th>Market Verification</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {promptLogs.length === 0 && (
                <tr><td colSpan="6"><div className="empty-audit-state">No chat prompts logged in this session.</div></td></tr>
              )}
              {[...promptLogs].reverse().map((log, i) => {
                let statusText = log.resultType === 'TRADE_CARD' ? 'Trade Verification' : 'Conversational AI';
                let statusClass = log.resultType === 'TRADE_CARD' ? 'open' : 'win';
                let icon = log.resultType === 'TRADE_CARD' ? <Activity size={12} /> : <Check size={12} />;

                const userPromptText = log.prompt || 'Image Analysis / General Chat';
                const aiResponseText = log.aiOutput || 'No response recorded.';
                const resolvedGrade = log.resolvedOutcome;
                const resolvedReason = log.resolvedReason;

                return (
                  <tr key={log._id || log.id || i}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(log.timestamp)}</td>
                    <td><span className={`status-badge ${statusClass}`}>{icon} {statusText}</span></td>
                    <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#94A3B8' }} title={userPromptText}>
                      "{userPromptText}"
                    </td>
                    <td style={{ maxWidth: '250px', fontSize: '11px', color: '#CBD5E1', lineHeight: '1.4' }}>
                      {aiResponseText}
                    </td>
                    <td style={{ maxWidth: '200px', fontSize: '11px' }}>
                      {resolvedGrade ? (
                        <div style={{ color: resolvedGrade === 'CORRECT' ? '#34D399' : resolvedGrade === 'INCORRECT' ? '#F87171' : '#FBBF24' }}>
                          <strong>{resolvedGrade === 'CORRECT' ? 'Accurate' : resolvedGrade === 'INCORRECT' ? 'Failed' : 'Neutral'}</strong>
                          <div style={{ marginTop: '2px', color: '#94a3b8' }}>{resolvedReason}</div>
                        </div>
                      ) : (
                        <span style={{ color: '#64748B' }}>Pending Verification</span>
                      )}
                    </td>
                    <td style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                      {resolvedGrade 
                        ? <span style={{ color: '#34d399' }}>VERIFIED</span>
                        : (log.auditDue ? <span style={{ color: '#f59e0b' }}>DUE: {formatDate(log.auditDue)}</span> : 'PENDING')
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {activeTab === 'signals' && (
          <table className="audit-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Status</th>
                <th>AI Strategy</th>
                <th style={{ textAlign: 'center' }}>Confidence</th>
                <th style={{ textAlign: 'center' }}>Targets</th>
                <th style={{ textAlign: 'center' }}>AI Correct?</th>
                <th>Verification Outcome</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {resolvedSignals.length === 0 && (
                <tr><td colSpan="8"><div className="empty-audit-state">No verified predictions recorded yet.</div></td></tr>
              )}
              {resolvedSignals.map(sig => {
                const isWin = sig.resolvedOutcome === 'CORRECT';
                const isLoss = sig.resolvedOutcome === 'INCORRECT';
                const isBlocked = sig.signalBlocked;
                const isPending = !sig.resolvedOutcome;

                let statusText = 'Tracking Live';
                let statusClass = 'open';
                let icon = <Activity size={12} />;

                if (isBlocked) {
                  icon = <div style={{width: 10, height: 10, borderRadius: '50%', border: '2px solid currentColor', display: 'inline-block'}} />;
                  if (isPending) {
                    statusText = 'Safety Block (Tracking)';
                    statusClass = 'cancelled';
                  } else if (isWin) {
                    statusText = 'Block Verified (Correct)';
                    statusClass = 'win';
                    icon = <Check size={12} />;
                  } else if (isLoss) {
                    statusText = 'Missed Move (Incorrect)';
                    statusClass = 'loss';
                    icon = <ArrowLeft size={12} style={{ transform: 'rotate(-45deg)' }} />;
                  } else {
                    statusText = 'Safety Blocked';
                    statusClass = 'error';
                  }
                } else {
                  if (isWin) {
                    if (sig.resolvedReason && sig.resolvedReason.toLowerCase().includes('target progress')) {
                      statusText = 'Target Progress (Win)';
                    } else if (sig.resolvedReason && sig.resolvedReason.toLowerCase().includes('high-water mark')) {
                      statusText = 'Direction Confirmed (Win)';
                    } else if (sig.resolvedReason && sig.resolvedReason.toLowerCase().includes('expiration')) {
                      statusText = 'Expired in Profit (Win)';
                    } else {
                      statusText = 'Verified (Win)';
                    }
                    statusClass = 'win';
                    icon = <Check size={12} />;
                  } else if (isLoss) {
                    if (sig.resolvedReason && sig.resolvedReason.toLowerCase().includes('invalidation')) {
                      statusText = 'Stop Hit (Loss)';
                    } else if (sig.resolvedReason && sig.resolvedReason.toLowerCase().includes('expiration')) {
                      statusText = 'Expired in Loss (Loss)';
                    } else {
                      statusText = 'Missed Move (Loss)';
                    }
                    statusClass = 'loss';
                    icon = <ArrowLeft size={12} style={{ transform: 'rotate(-45deg)' }} />;
                  }
                }

                // Humanize Regime
                let humanReason = sig.regime || 'Technical Pattern';
                if (humanReason === 'RANDOM_WALK') humanReason = 'Choppy Market';
                if (humanReason === 'MEAN_REVERTING') humanReason = 'Reversal';
                if (humanReason === 'TRENDING') humanReason = 'Trend Following';

                return (
                  <React.Fragment key={sig._id}>
                    <tr>
                      <td>
                        <span style={{ fontWeight: 600, color: '#f8fafc' }}>{sig.ticker || 'UNKNOWN'}</span>
                        <span className={`status-badge ${sig.direction === 'BULLISH' ? 'open' : sig.direction === 'BEARISH' ? 'loss' : 'cancelled'}`} style={{ marginLeft: 8 }}>
                          {sig.direction}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${statusClass}`}>{icon} {statusText}</span>
                      </td>
                      <td>
                        <div style={{ fontSize: '11px', color: '#E2E8F0' }}>{humanReason}</div>
                        <div style={{ fontSize: '10px', color: '#94A3B8' }}>({sig.tradeTimeframe})</div>
                      </td>
                      <td style={{ fontWeight: 600, textAlign: 'center' }}>{sig.calibratedConfidence || sig.rawConfidence}%</td>
                      <td style={{ fontSize: '11px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                        {(!isBlocked && sig.primaryTarget > 0) ? (
                          <>
                            <div style={{ color: '#34D399' }}>TP: ${formatPrice(sig.primaryTarget)}</div>
                            <div style={{ color: '#F87171' }}>SL: ${formatPrice(sig.invalidationLevel)}</div>
                          </>
                        ) : (
                          <span style={{ color: '#64748B' }}>N/A</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                        {isWin ? (
                          <span style={{ color: '#34D399' }}>TRUE</span>
                        ) : isLoss ? (
                          <span style={{ color: '#F87171' }}>FALSE</span>
                        ) : (
                          <span style={{ color: '#60A5FA' }}>PENDING</span>
                        )}
                      </td>
                      <td style={{ maxWidth: '250px', fontSize: '11px', lineHeight: '1.4' }}>
                        {isPending ? (
                          <span style={{ color: '#64748B' }}>
                            {isBlocked ? sig.blockedReason + ' (Awaiting verification...)' : 'Awaiting resolution...'}
                          </span>
                        ) : (
                          <span style={{ color: isWin ? '#34D399' : isLoss ? '#F87171' : '#CBD5E1' }}>
                            {sig.resolvedReason || 'Verified'}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '10px', color: '#CBD5E1', whiteSpace: 'nowrap' }}>
                        <div>Gen: {formatDate(sig.timestamp)}</div>
                        {!isPending && sig.resolvedAt && <div>Ver: {formatDate(sig.resolvedAt)}</div>}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan="8" style={{ padding: '8px 16px', background: '#0F172A', borderBottom: '1px solid #1E293B' }}>
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
                          <strong>Prompt:</strong> "{sig.userPrompt || 'Chart Analysis'}"
                        </div>
                        <div style={{ fontSize: '10px', color: '#CBD5E1', maxHeight: '45px', overflowY: 'auto', paddingRight: '8px', lineHeight: '1.4' }}>
                          <strong>AI Proof:</strong> {sig.predictionSummary || 'No textual proof recorded for this signal.'}
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}

        {activeTab === 'unresolved' && (
          <table className="audit-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Status</th>
                <th>AI Strategy</th>
                <th style={{ textAlign: 'center' }}>Confidence</th>
                <th style={{ textAlign: 'center' }}>Targets</th>
                <th style={{ textAlign: 'center' }}>Current State</th>
                <th>Verification Outcome</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {aiSignals.filter(s => s.resolvedOutcome !== 'CORRECT' && s.resolvedOutcome !== 'INCORRECT').length === 0 && (
                <tr><td colSpan="8"><div className="empty-audit-state">No unresolved or pending signals.</div></td></tr>
              )}
              {aiSignals.filter(s => s.resolvedOutcome !== 'CORRECT' && s.resolvedOutcome !== 'INCORRECT').map(sig => {
                const isBlocked = sig.signalBlocked;
                const isPending = !sig.resolvedOutcome;
                const isInconclusive = sig.resolvedOutcome === 'INCONCLUSIVE';

                let statusText = 'Tracking Live';
                let statusClass = 'open';
                let icon = <Activity size={12} />;

                if (isBlocked) {
                  icon = <div style={{width: 10, height: 10, borderRadius: '50%', border: '2px solid currentColor', display: 'inline-block'}} />;
                  if (isPending) {
                    statusText = 'Safety Block (Tracking)';
                    statusClass = 'cancelled';
                  } else {
                    statusText = 'Safety Blocked';
                    statusClass = 'error';
                  }
                } else {
                   if (isInconclusive) {
                      statusText = 'Flat / Inconclusive';
                      statusClass = 'cancelled';
                   }
                }

                // Humanize Regime
                let humanReason = sig.regime || 'Technical Pattern';
                if (humanReason === 'RANDOM_WALK') humanReason = 'Choppy Market';
                if (humanReason === 'MEAN_REVERTING') humanReason = 'Reversal';
                if (humanReason === 'TRENDING') humanReason = 'Trend Following';

                return (
                  <React.Fragment key={sig._id}>
                    <tr>
                      <td>
                        <span style={{ fontWeight: 600, color: '#f8fafc' }}>{sig.ticker || 'UNKNOWN'}</span>
                        <span className={`status-badge ${sig.direction === 'BULLISH' ? 'open' : sig.direction === 'BEARISH' ? 'loss' : 'cancelled'}`} style={{ marginLeft: 8 }}>
                          {sig.direction}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${statusClass}`}>{icon} {statusText}</span>
                      </td>
                      <td>
                        <div style={{ fontSize: '11px', color: '#E2E8F0' }}>{humanReason}</div>
                        <div style={{ fontSize: '10px', color: '#94A3B8' }}>({sig.tradeTimeframe})</div>
                      </td>
                      <td style={{ fontWeight: 600, textAlign: 'center' }}>{sig.calibratedConfidence || sig.rawConfidence}%</td>
                      <td style={{ fontSize: '11px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                        {(!isBlocked && sig.primaryTarget > 0) ? (
                          <>
                            <div style={{ color: '#34D399' }}>TP: ${formatPrice(sig.primaryTarget)}</div>
                            <div style={{ color: '#F87171' }}>SL: ${formatPrice(sig.invalidationLevel)}</div>
                          </>
                        ) : (
                          <span style={{ color: '#64748B' }}>N/A</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                        {isInconclusive ? (
                           <span style={{ color: '#FBBF24' }}>INCONCLUSIVE</span>
                        ) : (
                           <span style={{ color: '#60A5FA' }}>PENDING</span>
                        )}
                      </td>
                      <td style={{ maxWidth: '250px', fontSize: '11px', lineHeight: '1.4' }}>
                        {isPending ? (
                          <span style={{ color: '#64748B' }}>
                            {isBlocked ? sig.blockedReason + ' (Awaiting verification...)' : 'Awaiting resolution...'}
                          </span>
                        ) : (
                          <span style={{ color: '#FBBF24' }}>
                            {sig.resolvedReason || 'Inconclusive or Flat Market'}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '10px', color: '#CBD5E1', whiteSpace: 'nowrap' }}>
                        <div>Gen: {formatDate(sig.timestamp)}</div>
                        {!isPending && sig.resolvedAt && <div>Ver: {formatDate(sig.resolvedAt)}</div>}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan="8" style={{ padding: '8px 16px', background: '#0F172A', borderBottom: '1px solid #1E293B' }}>
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
                          <strong>Prompt:</strong> "{sig.userPrompt || 'Chart Analysis'}"
                        </div>
                        <div style={{ fontSize: '10px', color: '#CBD5E1', maxHeight: '45px', overflowY: 'auto', paddingRight: '8px', lineHeight: '1.4' }}>
                          <strong>AI Proof:</strong> {sig.predictionSummary || 'No textual proof recorded for this signal.'}
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
