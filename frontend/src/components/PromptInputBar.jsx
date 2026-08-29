import React, { useState, useRef, useEffect } from 'react';
import { Plus, Zap, ChevronDown, Activity, ArrowRight, Globe, BookOpen, MessageSquare } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import useGhostStore from '../store/ghostStore';
import './PromptInputBar.css';

export default function PromptInputBar({ onSend, disabled }) {
  const [prompt, setPrompt] = useState('');
  const [market, setMarket] = useState(() => localStorage.getItem('ghosttrade_market') || 'Crypto');
  const [language, setLanguage] = useState(() => localStorage.getItem('ghosttrade_language') || 'English');
  const [isMarketDropdownOpen, setIsMarketDropdownOpen] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const dropdownRef = useRef(null);
  const langDropdownRef = useRef(null);

  const MARKETS = ['Crypto', 'United States', 'India', 'United Kingdom', 'Japan', 'Europe', 'Australia', 'Hong Kong', 'South Korea', 'Canada', 'Brazil', 'Singapore', 'Forex'];
  const LANGUAGES = ['English', 'Hindi', 'Japanese', 'Spanish', 'Portuguese', 'Arabic', 'Korean', 'French', 'German'];

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsMarketDropdownOpen(false);
      }
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target)) {
        setIsLangDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  const { assets, isSimpleMode, toggleSimpleMode } = useGhostStore();
  
  // Filter activeTickers based on selected market (simple heuristic for UI chips)
  let activeTickers = Object.keys(assets);
  if (market === 'Crypto') {
    activeTickers = activeTickers.filter(t => t.endsWith('-USD'));
  } else if (market === 'India') {
    activeTickers = activeTickers.filter(t => t.endsWith('.NS') || t.endsWith('.BO'));
  } else if (market === 'United Kingdom') {
    activeTickers = activeTickers.filter(t => t.endsWith('.L'));
  } else if (market === 'Japan') {
    activeTickers = activeTickers.filter(t => t.endsWith('.T'));
  } else if (market === 'Europe') {
    activeTickers = activeTickers.filter(t => t.endsWith('.DE') || t.endsWith('.PA') || t.endsWith('.AS'));
  } else if (market === 'Australia') {
    activeTickers = activeTickers.filter(t => t.endsWith('.AX'));
  } else if (market === 'Hong Kong') {
    activeTickers = activeTickers.filter(t => t.endsWith('.HK'));
  } else if (market === 'South Korea') {
    activeTickers = activeTickers.filter(t => t.endsWith('.KS'));
  } else if (market === 'Canada') {
    activeTickers = activeTickers.filter(t => t.endsWith('.TO'));
  } else if (market === 'Brazil') {
    activeTickers = activeTickers.filter(t => t.endsWith('.SA'));
  } else if (market === 'Singapore') {
    activeTickers = activeTickers.filter(t => t.endsWith('.SI'));
  } else if (market === 'Forex') {
    activeTickers = activeTickers.filter(t => t.endsWith('=X'));
  } else if (market === 'United States') {
    activeTickers = activeTickers.filter(t => !t.includes('.') && !t.includes('-') && !t.includes('='));
  }

  // Show ALL assets without any filtering limits.
  // The winning assets will be highlighted green automatically via CSS.
  let displayTickers = activeTickers;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [prompt]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if ((prompt.trim() || attachedImage) && !disabled) {
      onSend({ text: prompt.trim(), imageBase64: attachedImage, market, language });
      setPrompt('');
      setAttachedImage(null);
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

  const handleDeepScan = () => {
    if (!disabled) {
      onSend({ text: `Execute Deep Scan across all quantitative regimes`, imageBase64: null, market, language });
    }
  };

  const handleAttachClick = () => {
    if (fileInputRef.current && !disabled) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Output base64 without the data URL prefix if backend expects raw base64, 
        // but backend usually wants the prefix or we can strip it later. Let's keep the prefix for preview.
        setAttachedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const removeAttachment = () => {
    setAttachedImage(null);
  };

  const isActive = (prompt.trim() || attachedImage) && !disabled;

  return (
    <form onSubmit={handleSubmit} className="bolt-prompt-form">
      <div className="bolt-prompt-container">
        {/* Integrated Quick Action Chips — Enriched with Global Signal Data */}
        <div className="quick-action-row-integrated">
          {displayTickers.length > 0 ? (
            displayTickers.map(ticker => {
               const assetData = assets[ticker];
               const signal = assetData?.signalData;
               const hasTradeSignal = signal?.action === 'TRADE';
               const isShield = signal?.action === 'SHIELD_MODE';
               const direction = signal?.direction;
               
               // Determine chip visual state from global cache
               let chipClass = 'quick-action-chip-integrated';
               let chipIcon = '⚡ ';
               
               if (assetData?.status === 'error') {
                 chipClass += ' error-chip';
                 chipIcon = '⚠️ ';
               } else if (hasTradeSignal) {
                 chipClass += ' winning-chip';
                 chipIcon = direction === 'BULLISH' ? '🟢 ' : '🔴 ';
               } else if (isShield) {
                 chipIcon = '🛡️ ';
               } else if (assetData?.recommendedSize > 0) {
                 chipClass += ' winning-chip';
               }
               
               const title = hasTradeSignal 
                 ? `${direction} | Score: ${signal.score}/100 | ${signal.tradeSide}` 
                 : isShield 
                   ? `Shield Mode: ${signal?.reason?.substring(0, 60) || 'No edge'}` 
                   : assetData?.status === 'error' 
                     ? 'API Rate Limited' 
                     : `Score: ${assetData?.score || 0}/100`;

               return (
                 <button 
                   key={ticker}
                   type="button"
                   className={chipClass} 
                   onClick={() => onSend({ text: ticker.split('-')[0].split('.')[0], imageBase64: null, market, language })}
                   disabled={disabled}
                   title={title}
                 >
                   {chipIcon}{ticker}
                 </button>
               );
            })
          ) : (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="quick-action-chip-skeleton"></div>
            ))
          )}
        </div>

        {attachedImage && (
          <div className="prompt-attachment-preview">
            <img src={attachedImage} alt="Attachment" />
            <button type="button" className="remove-attachment-btn" onClick={removeAttachment}>
              <Plus size={12} style={{ transform: 'rotate(45deg)' }} />
            </button>
          </div>
        )}

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
        <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileChange} />

        <div className="bolt-prompt-footer">
          <div className="bolt-left-actions">
            <button type="button" onClick={handleAttachClick} className="bolt-icon-btn round-bg" title="Attach file" disabled={disabled}>
              <Plus size={16} strokeWidth={2.5} />
            </button>
            <button type="button" onClick={toggleSimpleMode} className="bolt-icon-btn round-bg" title={isSimpleMode ? "Switch to Pro Mode" : "Switch to Learning Mode"} disabled={disabled} style={{ color: isSimpleMode ? '#facc15' : '#38bdf8' }}>
              {isSimpleMode ? <BookOpen size={16} strokeWidth={2.5} /> : <Zap size={16} strokeWidth={2.5} />}
            </button>
            <div className="market-dropdown-container" ref={dropdownRef}>
              <div className="bolt-model-selector" onClick={() => { setIsMarketDropdownOpen(!isMarketDropdownOpen); setIsLangDropdownOpen(false); }}>
                <Globe size={14} fill="none" stroke="currentColor" strokeWidth={2} /> 
                {market} <ChevronDown size={14} />
              </div>
              <AnimatePresence>
                {isMarketDropdownOpen && (
                  <motion.div 
                    className="market-dropdown-menu"
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                  >
                    {MARKETS.map(m => (
                      <div 
                        key={m} 
                        className={`market-dropdown-item ${market === m ? 'active' : ''}`}
                        onClick={() => { 
                          setMarket(m); 
                          localStorage.setItem('ghosttrade_market', m);
                          setIsMarketDropdownOpen(false); 
                        }}
                      >
                        {m}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <div className="market-dropdown-container" ref={langDropdownRef}>
              <div className="bolt-model-selector" onClick={() => { setIsLangDropdownOpen(!isLangDropdownOpen); setIsMarketDropdownOpen(false); }}>
                <MessageSquare size={14} fill="none" stroke="currentColor" strokeWidth={2} /> 
                {language} <ChevronDown size={14} />
              </div>
              <AnimatePresence>
                {isLangDropdownOpen && (
                  <motion.div 
                    className="market-dropdown-menu language-menu"
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                  >
                    {LANGUAGES.map(l => (
                      <div 
                        key={l} 
                        className={`market-dropdown-item ${language === l ? 'active' : ''}`}
                        onClick={() => { 
                          setLanguage(l); 
                          localStorage.setItem('ghosttrade_language', l);
                          setIsLangDropdownOpen(false); 
                        }}
                      >
                        {l}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
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
