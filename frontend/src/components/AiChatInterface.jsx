import React, { useRef, useEffect } from 'react';
import useGhostStore from '../store/ghostStore';
import PromptInputBar from './PromptInputBar';
import AiMessageBubble from './AiMessageBubble';
import UserMessageBubble from './UserMessageBubble';
import { CanvasRevealEffect } from './ui/SignInFlow';
import './AiChatInterface.css';

export default function AiChatInterface() {
  const { chatHistory, isThinking, sendPrompt } = useGhostStore();
  const chatEndRef = useRef(null);

  // Auto-scroll to the bottom when a new message arrives
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, isThinking]);

  return (
    <div className="ai-chat-interface">

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

              <div className="chat-suggestion-chips">
                {[
                  { label: 'Analyze Macro Regime' },
                  { label: 'Scan Order Flow' },
                  { label: 'Identify Kelly Setups' }
                ].map((chip, i) => (
                  <button
                    key={i}
                    onClick={() => sendPrompt(chip.label)}
                    className="chat-chip"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="chat-messages-container">
            {chatHistory.map((msg, index) => {
              if (msg.role === 'user') {
                return <UserMessageBubble key={`msg-${index}`} content={msg.content} />;
              }
              return <AiMessageBubble key={`msg-${index}`} message={msg} />;
            })}

            {isThinking && (
              <div className="self-start flex items-center gap-4 py-4 px-6 bg-slate-800/20 rounded-2xl border border-slate-700/30 backdrop-blur-sm" style={{ alignSelf: 'flex-start' }}>
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-ghost-accent animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 rounded-full bg-ghost-accent animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 rounded-full bg-ghost-accent animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
                <span className="font-mono text-xs text-ghost-accent/80 uppercase tracking-widest">
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
