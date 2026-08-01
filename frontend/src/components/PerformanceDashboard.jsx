import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, Copy, Check } from 'lucide-react';
import useGhostStore from '../store/ghostStore';
import './PerformanceDashboard.css';

export default function PerformanceDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('active'); // 'pending' | 'active' | 'closed' | 'prompts'
  const allPaperTrades = useGhostStore((state) => state.activePaperTrades) || [];
  const activePaperTrades = allPaperTrades.filter(t => t.status === 'OPEN');
  const pendingPaperTrades = allPaperTrades.filter(t => t.status === 'PENDING_CONFIRMATION');
  const closedPaperTrades = useGhostStore((state) => state.closedPaperTrades) || [];
  const promptLogs = useGhostStore((state) => state.promptLogs) || [];
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

  // Calculate Metrics
  const totalClosed = closedPaperTrades.length;
  const wins = closedPaperTrades.filter(t => t.status === 'WIN').length;
  const losses = closedPaperTrades.filter(t => t.status === 'LOSS').length;
  const winRate = (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
  
  const totalPnL = closedPaperTrades.reduce((acc, trade) => acc + (trade.pnl || 0), 0);

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

      <div className="metrics-grid">
        <div className="metric-box">
          <span className="metric-box-label">Total Executions</span>
          <span className="metric-box-value">{totalClosed + activePaperTrades.length}</span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">Win Rate</span>
          <span className="metric-box-value">
            {winRate}%
          </span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">Wins</span>
          <span className="metric-box-value" style={{ color: '#34d399' }}>
            {wins}
          </span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">Losses</span>
          <span className="metric-box-value" style={{ color: '#f87171' }}>
            {losses}
          </span>
        </div>
        <div className="metric-box">
          <span className="metric-box-label">Realized PnL</span>
          <span className={`metric-box-value ${totalPnL > 0 ? 'positive' : totalPnL < 0 ? 'negative' : ''}`}>
            {totalPnL > 0 ? '+' : ''}{formatPrice(totalPnL)}%
          </span>
        </div>
      </div>

      <div className="audit-tabs">
        <div className="audit-tabs-group">
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
          <button 
            className={`audit-tab-btn ${activeTab === 'prompts' ? 'active' : ''}`}
            onClick={() => setActiveTab('prompts')}
          >
            Prompt Audit ({promptLogs.length})
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
                <th>Raw User Prompt</th>
                <th>AI Processing Result</th>
                <th>AI Response / Rationale</th>
              </tr>
            </thead>
            <tbody>
              {promptLogs.length === 0 && (
                <tr><td colSpan="4"><div className="empty-audit-state">No prompts logged in current session.</div></td></tr>
              )}
              {[...promptLogs].reverse().map(log => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(log.timestamp)}</td>
                  <td style={{ width: '25%' }}><span className="prompt-text">{log.prompt}</span></td>
                  <td style={{ width: '20%' }}>
                    {log.resultType === 'TRADE_CARD' && <span className="status-badge card">Trade Generated</span>}
                    {log.resultType === 'FALLBACK' && <span className="status-badge fallback">Capital Preservation</span>}
                    {log.resultType === 'ERROR' && <span className="status-badge error">Unparseable Error</span>}
                  </td>
                  <td style={{ width: '45%', color: '#94A3B8', fontSize: '11px', lineHeight: '1.4' }}>
                    {log.aiOutput ? log.aiOutput : <span style={{ fontStyle: 'italic', opacity: 0.5 }}>No response recorded</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
