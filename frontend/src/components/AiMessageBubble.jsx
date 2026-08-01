import React from 'react';
import useGhostStore from '../store/ghostStore';
import './MessageBubble.css';

const TradeExecutionCard = ({ asset, side, entryPrice, stopLoss, takeProfit, riskPercentage, kellySize, price, pattern, regime, source }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [tradeMode, setTradeMode] = React.useState('guided'); // 'guided' | 'pro'
  const [isExecuted, setIsExecuted] = React.useState(false);

  const sideLower = side ? side.toLowerCase() : 'buy';
  const isLong = side === 'LONG';
  
  // Backward compatibility for legacy messages that only had `price` (string)
  const safeEntryPrice = entryPrice || (typeof price === 'string' ? parseFloat(price.replace(/,/g, '')) : price) || 0;
  const safeStopLoss = stopLoss || (isLong ? safeEntryPrice * 0.98 : safeEntryPrice * 1.02);
  const safeTakeProfit = takeProfit || (isLong ? safeEntryPrice * 1.06 : safeEntryPrice * 0.94);
  const safeRisk = riskPercentage || 2;
  
  const formatPrice = (p) => p ? Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
  const fEntry = formatPrice(safeEntryPrice);
  const fStop = formatPrice(safeStopLoss);
  const fTarget = formatPrice(safeTakeProfit);

  const executeTrade = useGhostStore((state) => state.executeTrade);

  const handleExecute = () => {
    setIsExecuted(true);
    executeTrade({ 
      asset, 
      side, 
      entryPrice: safeEntryPrice, 
      stopLoss: safeStopLoss, 
      takeProfit: safeTakeProfit, 
      riskPercentage: safeRisk, 
      kellySize,
      pattern: pattern || 'AUTO_DETECTED',
      regime: regime || 'DYNAMIC_REGIME',
      source: source || 'AI_AGENT'
    });
  };

  if (isExecuted) {
    return (
      <div className={`trade-card executed`}>
        <div className="trade-header">
          <span className="trade-asset">⚡ {asset} ACTIVE</span>
          <span className="trade-status-badge">LIVE</span>
        </div>
        <p className="trade-success-msg">
          GhostTrade is managing your exit based on Institutional Order Flow.
        </p>
      </div>
    );
  }

  if (!isExpanded) {
    return (
      <div className={`trade-card ${sideLower}`}>
        <div className="trade-header">
          <span className="trade-asset">{asset}</span>
          <span className="trade-kelly">KELLY: {kellySize}%</span>
        </div>
        
        <div className="trade-price-row">
          <span className="trade-price-label">Signal Price</span>
          <span className="trade-price-value">${fEntry}</span>
        </div>
        
        <button className={`trade-btn ${sideLower}`} onClick={() => setIsExpanded(true)}>
          Execute {side || 'BUY'} Setup
        </button>
      </div>
    );
  }

  return (
    <div className={`trade-card expanded terminal-${sideLower}`}>
      <div className="terminal-header">
        <span className="terminal-title">EXECUTION TERMINAL</span>
        <div className="mode-toggle">
          <button className={tradeMode === 'guided' ? 'active' : ''} onClick={() => setTradeMode('guided')}>Guided</button>
          <button className={tradeMode === 'pro' ? 'active' : ''} onClick={() => setTradeMode('pro')}>Pro</button>
        </div>
      </div>

      {tradeMode === 'guided' ? (
        <div className="terminal-guided">
          <p className="guided-text">
            Risking <strong>{safeRisk}%</strong> to make <strong>{isLong ? '6' : '6'}%</strong>.<br/>
            Protective Stop Loss is safely set at <strong>${fStop}</strong>.
          </p>
          <button className={`trade-btn ${sideLower} pulse`} onClick={handleExecute}>
            Confirm Auto-Trade
          </button>
        </div>
      ) : (
        <div className="terminal-pro">
          <div className="pro-grid">
            <div className="pro-field">
              <label>LIMIT ENTRY</label>
              <input type="text" value={`$${fEntry}`} readOnly />
            </div>
            <div className="pro-field">
              <label>STOP LOSS (HARD)</label>
              <input type="text" value={`$${fStop}`} readOnly />
            </div>
            <div className="pro-field">
              <label>TAKE PROFIT</label>
              <input type="text" value={`$${fTarget}`} readOnly />
            </div>
            <div className="pro-field">
              <label>SLIPPAGE TOLERANCE</label>
              <select><option>0.5%</option><option>1.0%</option><option>Market</option></select>
            </div>
          </div>
          <div className="pro-actions">
             <button className="cancel-btn" onClick={() => setIsExpanded(false)}>Cancel</button>
             <button className={`trade-btn ${sideLower}`} onClick={handleExecute}>Execute Limit Order</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default function AiMessageBubble({ message }) {
  return (
    <div className="message-wrapper ai">
      <div className="avatar ai">
        <span>GT</span>
      </div>
      
      <div className="message-content">
        {message.content && (
          <p className="message-text">
            {message.content}
          </p>
        )}
        
        {/* Render Generative UI Component if exists */}
        {message.uiComponent === 'TRADE_CARD' && message.tradeData && (
          <TradeExecutionCard {...message.tradeData} />
        )}
      </div>
    </div>
  );
}
