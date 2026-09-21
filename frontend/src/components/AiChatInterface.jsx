import React, { useRef, useEffect, useState } from 'react';
import { Plus, Shield, Zap, CheckCircle } from 'lucide-react';
import useGhostStore from '../store/ghostStore';
import PromptInputBar from './PromptInputBar';
import AiMessageBubble from './AiMessageBubble';
import UserMessageBubble from './UserMessageBubble';
import { CanvasRevealEffect } from './ui/SignInFlow';
import CandleThinkingIndicator from './CandleThinkingIndicator';
import './AiChatInterface.css';

const thinkingMessages = [
  "Analyzing Order Flow...",
  "Validating Hurst Matrix...",
  "Running Kelly Risk Models...",
  "Extracting Institutional Sentiment...",
  "Synthesizing Neural Data..."
];


function MatrixTerminalLoader() {
  const [logs, setLogs] = useState([]);
  
  useEffect(() => {
    const fullLogs = [
      "> INITIATING DEEP SCAN PROTOCOL v2.0.1",
      "> CONNECTING TO BINANCE LIQUIDITY POOLS... [OK]",
      "> EXTRACTING LEVEL 2 ORDER BOOK... [OK]",
      "> COMPUTING HURST EXPONENT (H)...",
      "> REGIME DETECTED: TRENDING_BULLISH (H=0.68)",
      "> APPLYING KELLY CRITERION RISK MATRIX...",
      "> VALIDATING TRADE LOGIC... [OK]",
      "> SYNTHESIZING FINAL INTELLIGENCE REPORT..."
    ];
    
    let currentLog = 0;
    const interval = setInterval(() => {
      if (currentLog < fullLogs.length) {
        setLogs(prev => {
           // Prevent duplicates if React strict mode double-fires
           if(prev.includes(fullLogs[currentLog])) return prev;
           return [...prev, fullLogs[currentLog]];
        });
        currentLog++;
      } else {
        clearInterval(interval);
      }
    }, 450); // 450ms per line for that hacker feel
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="matrix-terminal-loader">
      <div className="matrix-header">
        <span className="title" style={{ marginLeft: 0, fontWeight: "bold" }}>[// GHOST_ENGINE_RUNTIME]</span>
      </div>
      <div className="matrix-body font-mono">
        {logs.map((log, i) => (
          <div key={i} className="matrix-line">{log}</div>
        ))}
        <div className="matrix-line blink-cursor" style={{ marginTop: '5px' }}>_</div>
      </div>
    </div>
  );
}

export default function AiChatInterface() {
  const { chatHistory, isThinking, sendPrompt, assets, clearChat, executionMode, executeTrade } = useGhostStore();
  const chatEndRef = useRef(null);
  const lastMessageCount = useRef(0);

  const [executedTradeIds, setExecutedTradeIds] = useState(new Set());
  
  const lastMessage = chatHistory[chatHistory.length - 1];
  const isActiveTrade = lastMessage?.role === 'ai' && lastMessage?.uiComponent === 'TRADE_CARD' && lastMessage?.tradeData && !executedTradeIds.has(lastMessage.id);
  const tradeData = isActiveTrade ? lastMessage.tradeData : null;
  const isShield = tradeData?.signalBlocked === true;
  const sideLower = tradeData?.side ? tradeData.side.toLowerCase() : 'buy';
  const isLiveMode = executionMode !== 'PAPER';

  const handleFloatingExecute = async () => {
    if (isShield || !tradeData) return;
    setExecutedTradeIds(prev => new Set(prev).add(lastMessage.id));
    await executeTrade({
      asset: tradeData.asset,
      side: tradeData.side,
      entryPrice: tradeData.entryPrice || 0,
      stopLoss: tradeData.stopLoss || 0,
      takeProfit: tradeData.takeProfit || 0,
      riskPercentage: tradeData.riskPercentage || 2.0,
      kellySize: tradeData.kellySize,
      pattern: tradeData.pattern || 'AUTO_DETECTED',
      regime: tradeData.regime || 'DYNAMIC_REGIME',
      source: tradeData.source || 'AI_AGENT'
    });
  };

  // Auto-scroll to the bottom when a new message arrives or when text is streaming
  useEffect(() => {
    const scrollToBottom = () => {
      if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    };
    
    const lastMessage = chatHistory[chatHistory.length - 1];
    const isStreaming = lastMessage?.isGenerating;
    
    if (chatEndRef.current) {
      if (chatHistory.length > lastMessageCount.current || isStreaming) {
         chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
         lastMessageCount.current = chatHistory.length;
      }
    }

    window.addEventListener('chat-scroll', scrollToBottom);
    return () => window.removeEventListener('chat-scroll', scrollToBottom);
  }, [chatHistory, isThinking]);
  
  const activeTickers = Object.keys(assets);

  return (
    <div className="ai-chat-interface">
      {/* Top Left New Chat Button */}
      <button 
        className="icon-action-btn new-chat-icon-btn" 
        onClick={clearChat}
      >
        <Plus size={16} />
        <span className="dock-tooltip">New Chat</span>
      </button>

      {chatHistory.length === 0 && (
        <div className="chat-horizon-glow">
          <CanvasRevealEffect
            animationSpeed={3}
            colors={[[56, 189, 248], [241, 245, 249]]}
            dotSize={4}
            showGradient={false}
          />
        </div>
      )}

      {/* Scrollable Chat Area */}
      <div className="chat-scroll-container">
        {chatHistory.length === 0 ? (
          <div className="chat-empty-state">

            <h1 className="chat-hero-title">
              COMMAND THE <span className="chat-hero-highlight">ENGINE</span>
            </h1>
            <p className="chat-hero-subtitle">
              Ask Ghostrade to analyze any asset or strategy.
            </p>

            {/* Input is in the middle of the screen when empty */}
            <div className="chat-empty-input-wrapper">
              <PromptInputBar onSend={sendPrompt} disabled={isThinking} hideLegal={true} />
            </div>
          </div>
        ) : (
          <div className="chat-messages-container">
            {chatHistory.map((msg, index) => {
              if (msg.role === 'user') {
                return <UserMessageBubble key={`msg-${index}`} content={msg.content} imageBase64={msg.imageBase64} />;
              }
              // Hide the empty AI bubble that gets pushed before the stream starts to prevent the "empty circle" layout shift
              if (msg.role === 'ai' && !msg.content && isThinking && index === chatHistory.length - 1) {
                return null;
              }
              return <AiMessageBubble key={`msg-${index}`} message={msg} />;
            })}

            {isThinking && <MatrixTerminalLoader />}

            <div ref={chatEndRef} style={{ height: '1rem' }} />
          </div>
        )}
      </div>

      {/* Solid Apple-Grade Dock Area (Only when chatting) */}
      {chatHistory.length > 0 && (
        <div className="chat-dock">
          <div className="chat-dock-container" style={{ position: 'relative' }}>
            
            {/* Floating Action Button */}
            {isActiveTrade && (
              <div className="ghostrade-seq-step-anim-down" style={{ 
                position: 'absolute', 
                bottom: '100%', 
                left: 0, 
                right: 0, 
                marginBottom: '14px',
                display: 'flex', 
                justifyContent: 'center',
                zIndex: 50,
                pointerEvents: 'none'
              }}>
                <button 
                  onClick={handleFloatingExecute}
                  disabled={isShield}
                  style={{ 
                    pointerEvents: 'auto',
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px',
                    padding: '10px 24px', 
                    borderRadius: '30px', 
                    fontSize: '12px', 
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    color: 'var(--text-primary)',
                    background: 'var(--surface-strong)',
                    border: '1px solid var(--border-strong)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    cursor: isShield ? 'not-allowed' : 'pointer',
                    transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s',
                    whiteSpace: 'nowrap',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)'
                  }}
                  onMouseEnter={(e) => { 
                    if(!isShield) {
                      e.currentTarget.style.transform = 'scale(1.04)';
                      e.currentTarget.style.background = 'var(--color-ghost-obsidian)';
                    }
                  }}
                  onMouseLeave={(e) => { 
                    if(!isShield) {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.background = 'var(--surface-strong)';
                    }
                  }}
                >
                  {isShield 
                    ? <><Shield size={16} style={{ color: 'var(--text-muted)' }} /> Shield Mode</>
                    : isLiveMode
                      ? <><Zap size={16} style={{ color: 'var(--text-muted)' }} /> Track Setup</>
                      : <><CheckCircle size={16} style={{ color: 'var(--text-muted)' }} /> Keep It</>
                  }
                </button>
              </div>
            )}

            <PromptInputBar onSend={sendPrompt} disabled={isThinking} />
          </div>
        </div>
      )}
    </div>
  );
}
