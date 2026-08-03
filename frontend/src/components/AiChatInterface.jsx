import React, { useRef, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import useGhostStore from '../store/ghostStore';
import PromptInputBar from './PromptInputBar';
import AiMessageBubble from './AiMessageBubble';
import UserMessageBubble from './UserMessageBubble';
import { CanvasRevealEffect } from './ui/SignInFlow';
import './AiChatInterface.css';

const thinkingMessages = [
  "Analyzing Order Flow...",
  "Validating Hurst Matrix...",
  "Running Kelly Risk Models...",
  "Extracting Institutional Sentiment...",
  "Synthesizing Neural Data..."
];

function DynamicThinkingIndicator() {
  const [msgIdx, setMsgIdx] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentMsg = thinkingMessages[msgIdx];
    let timeout;
    
    if (isDeleting) {
      if (displayedText.length > 0) {
        timeout = setTimeout(() => {
          setDisplayedText(currentMsg.substring(0, displayedText.length - 1));
        }, 20); // Fast delete speed
      } else {
        setIsDeleting(false);
        setMsgIdx((prev) => (prev + 1) % thinkingMessages.length);
      }
    } else {
      if (displayedText.length < currentMsg.length) {
        timeout = setTimeout(() => {
          setDisplayedText(currentMsg.substring(0, displayedText.length + 1));
        }, 40); // Smooth typing speed
      } else {
        // Pause before deleting
        timeout = setTimeout(() => {
          setIsDeleting(true);
        }, 1500); 
      }
    }

    return () => clearTimeout(timeout);
  }, [displayedText, isDeleting, msgIdx]);

  return (
    <div className="thinking-indicator single-line-think">
      <div className="thinking-gt-icon">GT</div>
      <span className="thinking-text font-mono" style={{ fontSize: '0.85rem' }}>
        {displayedText}<span className="typing-cursor" style={{ marginLeft: '2px', height: '12px' }}></span>
      </span>
    </div>
  );
}

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
              // Hide the empty AI bubble that gets pushed before the stream starts to prevent the "empty circle" layout shift
              if (msg.role === 'ai' && !msg.content && isThinking && index === chatHistory.length - 1) {
                return null;
              }
              return <AiMessageBubble key={`msg-${index}`} message={msg} />;
            })}

            {isThinking && <DynamicThinkingIndicator />}

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
