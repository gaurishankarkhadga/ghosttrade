import React, { useState, useRef, useEffect } from 'react';
import { Plus, Zap, ChevronDown, Activity, ArrowRight, BrainCircuit } from 'lucide-react';
import './PromptInputBar.css';

export default function PromptInputBar({ onSend, disabled }) {
  const [prompt, setPrompt] = useState('');
  const [engine, setEngine] = useState('Ghost Engine v3');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [prompt]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (prompt.trim() && !disabled) {
      onSend(prompt.trim());
      setPrompt('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const toggleEngine = () => {
    setEngine(prev => prev === 'Ghost Engine v3' ? 'Hurst Matrix' : 'Ghost Engine v3');
  };

  const handleDeepScan = () => {
    if (!disabled) {
      onSend('Execute Deep Scan across all quantitative regimes');
    }
  };

  const handleAttachClick = () => {
    if (fileInputRef.current && !disabled) {
      fileInputRef.current.click();
    }
  };

  const isActive = prompt.trim() && !disabled;

  return (
    <form onSubmit={handleSubmit} className="bolt-prompt-form">
      <div className="bolt-prompt-container">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask GhostTrade anything..."
          disabled={disabled}
          rows={1}
          className="bolt-prompt-textarea"
        />
        
        {/* Hidden File Input for native attachment dialog */}
        <input type="file" ref={fileInputRef} style={{ display: 'none' }} />

        <div className="bolt-prompt-footer">
          <div className="bolt-left-actions">
            <button type="button" onClick={handleAttachClick} className="bolt-icon-btn round-bg" title="Attach file" disabled={disabled}>
              <Plus size={16} strokeWidth={2.5} />
            </button>
            <div className="bolt-model-selector" onClick={toggleEngine}>
              {engine === 'Ghost Engine v3' ? <Zap size={14} fill="currentColor" /> : <BrainCircuit size={14} />} 
              {engine} <ChevronDown size={14} />
            </div>
          </div>
          <div className="bolt-right-actions">
            <button type="button" onClick={handleDeepScan} className="bolt-text-btn" disabled={disabled}>
              <Activity size={14} /> <span>Deep Scan</span>
            </button>
            <button
              type="submit"
              disabled={!isActive}
              className={`bolt-submit-btn-wide ${isActive ? 'active' : 'disabled'}`}
            >
              Execute <ArrowRight size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
