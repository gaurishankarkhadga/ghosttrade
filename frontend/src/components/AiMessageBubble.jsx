import React from 'react';
import './MessageBubble.css';

// Generative UI Micro-Components
const TradeExecutionCard = ({ asset, side, price, kellySize }) => {
  const sideLower = side ? side.toLowerCase() : 'buy';
  return (
    <div className={`trade-card ${sideLower}`}>
      <div className="trade-header">
        <span className="trade-asset">{asset}</span>
        <span className="trade-kelly">KELLY: {kellySize}%</span>
      </div>
      
      <div className="trade-price-row">
        <span className="trade-price-label">Limit Price</span>
        <span className="trade-price-value">${price}</span>
      </div>
      
      <button className={`trade-btn ${sideLower}`}>
        Execute {side || 'BUY'}
      </button>
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
