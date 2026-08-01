import React, { useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import useGhostStore from '../store/ghostStore';
import PromptInputBar from './PromptInputBar';
import AiMessageBubble from './AiMessageBubble';
import UserMessageBubble from './UserMessageBubble';
import { CanvasRevealEffect } from './ui/SignInFlow';
import './AiChatInterface.css';

export default function AiChatInterface() {
  const { chatHistory, isThinking, sendPrompt, assets, clearChat } = useGhostStore();
  const chatEndRef = useRef(null);

  // Auto-scroll to the bottom when a new message arrives
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
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
              WHAT WILL YOU <span className="chat-hero-highlight">TRADE</span> TODAY?
            </h1>
            <p className="chat-hero-subtitle">
              Ask GhostTrade to analyze any asset or strategy.
            </p>

            {/* Input is in the middle of the screen when empty */}
            <div className="chat-empty-input-wrapper">
              <PromptInputBar onSend={sendPrompt} disabled={isThinking} />
            </div>
          </div>
        ) : (
          <div className="chat-messages-container">
            {chatHistory.map((msg, index) => {
              if (msg.role === 'user') {
                return <UserMessageBubble key={`msg-${index}`} content={msg.content} imageBase64={msg.imageBase64} />;
              }
              return <AiMessageBubble key={`msg-${index}`} message={msg} />;
            })}

            {isThinking && (
              <div className="thinking-indicator">
                <div className="thinking-dots">
                  <span className="thinking-dot" style={{ animationDelay: '0ms' }}></span>
                  <span className="thinking-dot" style={{ animationDelay: '150ms' }}></span>
                  <span className="thinking-dot" style={{ animationDelay: '300ms' }}></span>
                </div>
                <span className="thinking-text">
                  Synthesizing Math Matrix...
                </span>
              </div>
            )}

            <div ref={chatEndRef} style={{ height: '1rem' }} />
          </div>
        )}
      </div>

      {/* Solid Apple-Grade Dock Area (Only when chatting) */}
      {chatHistory.length > 0 && (
        <div className="chat-dock">
          <div className="chat-dock-container">
            <PromptInputBar onSend={sendPrompt} disabled={isThinking} />
          </div>
        </div>
      )}
    </div>
  );
}
