let socket = null;
let hasStartedStreaming = false;
let cumulativeText = "";

// =====================================================
// ENV DETECTION — Works in both Chrome Extension & Local Dev
// =====================================================
const IS_EXTENSION = typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query;

// Sanitize incoming data to prevent DOM-based XSS
const escapeHTML = (str) => {
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
};

// =====================================================
// ENV LOADER
// =====================================================
async function loadEnv() {
  try {
    if (IS_EXTENSION) return {}; // Cannot fetch local files in Chrome extension
    const res = await fetch('.env');
    const text = await res.text();
    const env = {};
    text.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        env[match[1]] = match[2];
      }
    });
    return env;
  } catch(e) {
    console.error('Error loading .env:', e);
    return {};
  }
}

async function getBackendConfig() {
  const env = await loadEnv();
  const defaultWsUrl = env.DEFAULT_WS_URL || 'wss://ghosttrade-test1.onrender.com/stream';
  
  if (IS_EXTENSION) {
    const result = await new Promise(resolve => chrome.storage.sync.get(['wsUrl'], resolve));
    const wsUrl = result.wsUrl || defaultWsUrl;
    let httpUrl = wsUrl.replace('wss://', 'https://').replace('ws://', 'http://');
    if (httpUrl.endsWith('/stream')) httpUrl = httpUrl.slice(0, -7);
    return { wsUrl, httpUrl };
  } else {
    let httpUrl = defaultWsUrl.replace('wss://', 'https://').replace('ws://', 'http://');
    if (httpUrl.endsWith('/stream')) httpUrl = httpUrl.slice(0, -7);
    return { wsUrl: defaultWsUrl, httpUrl };
  }
}

document.addEventListener('DOMContentLoaded', () => {
  startProcess();

  // Toggle WHY reasoning panel
  document.getElementById('toggle-reasoning-btn').addEventListener('click', () => {
    const reasoningContent = document.getElementById('reasoning-content');
    const btn = document.getElementById('toggle-reasoning-btn');
    if (!reasoningContent.classList.contains('visible')) {
      reasoningContent.classList.add('visible');
      btn.classList.add('open');
    } else {
      reasoningContent.classList.remove('visible');
      btn.classList.remove('open');
    }
  });

  // Phase 3: Calibration Panel Logic
  const calibBtn = document.getElementById('calibration-btn');
  const calibPanel = document.getElementById('calibration-panel');
  const closeCalibBtn = calibPanel.querySelector('.close-panel-btn');
  const windowSelect = document.getElementById('calib-window-select');

  if (calibBtn) {
    calibBtn.addEventListener('click', () => {
      calibPanel.classList.remove('hidden');
      loadCalibrationData();
    });
  }

  if (closeCalibBtn) {
    closeCalibBtn.addEventListener('click', () => {
      calibPanel.classList.add('hidden');
    });
  }

  if (windowSelect) {
    windowSelect.addEventListener('change', () => {
      loadCalibrationData();
    });
  }
});

async function loadCalibrationData() {
  const container = document.getElementById('calibration-curve-container');
  const windowDays = document.getElementById('calib-window-select').value;
  const summaryBox = document.getElementById('calibration-summary');
  
  container.innerHTML = '<div class="text-center text-xs text-[var(--text-muted)] py-4">Loading calibration data...</div>';
  
  try {
    const config = await getBackendConfig();
    const backendUrl = config.httpUrl;

    const res = await fetch(`${backendUrl}/api/calibration?days=${windowDays}`);
    const data = await res.json();
    
    if (data.error) throw new Error(data.message);

    // Update Summary Box
    document.getElementById('calib-total-signals').innerText = data.totalSignals;
    document.getElementById('calib-mean-error').innerText = data.overallCalibrationError !== null ? `${data.overallCalibrationError}%` : 'N/A';
    
    const warningEl = document.getElementById('calib-warning');
    if (data.earlyDataWarning) {
      warningEl.innerText = data.earlyDataWarning;
      warningEl.classList.remove('hidden');
    } else {
      warningEl.classList.add('hidden');
    }
    
    summaryBox.classList.remove('hidden');

    // Render Curve
    container.innerHTML = '';
    data.curve.forEach(bucket => {
      const isNull = bucket.actual === null;
      const actualText = isNull ? '--%' : `${bucket.actual}%`;
      const errorText = isNull ? '' : `Error: ${bucket.error}%`;
      const dotColor = isNull ? 'var(--text-muted)' : (bucket.error <= 10 ? 'var(--emerald)' : (bucket.error <= 20 ? 'var(--amber)' : 'var(--red)'));
      
      const html = `
        <div class="bg-[var(--bg-card)] border border-[var(--border)] rounded p-2 text-xs flex justify-between items-center">
          <div class="w-1/3">
            <div class="text-[var(--text-muted)]">Predicted</div>
            <div class="font-mono text-[var(--text-main)]">${bucket.bucket}</div>
          </div>
          <div class="w-1/3 text-center">
            <div class="text-[var(--text-muted)]">Actual</div>
            <div class="font-mono text-[var(--text-main)]" style="color: ${dotColor}">${actualText}</div>
          </div>
          <div class="w-1/3 text-right">
            <div class="text-[var(--text-muted)]">Signals: ${bucket.n}</div>
            <div class="font-mono ${bucket.isEarlyData ? 'text-[var(--amber)]' : 'text-[var(--text-muted)]'} text-[10px]">${errorText}</div>
          </div>
        </div>
      `;
      container.innerHTML += html;
    });

  } catch (err) {
    container.innerHTML = `<div class="text-center text-xs text-[var(--red)] py-4">Failed to load calibration data:<br>${escapeHTML(err.message)}</div>`;
  }
}

function startProcess() {
  const loadingIndicator = document.getElementById('loading-indicator');
  const loadingText = document.getElementById('loading-text');
  const content = document.getElementById('content');
  const actionCard = document.getElementById('action-card');
  const reasoningContainer = document.getElementById('reasoning-container');
  const reasoningContent = document.getElementById('reasoning-content');

  loadingIndicator.classList.remove('hidden');
  content.classList.add('hidden');
  content.classList.remove('visible');
  actionCard.classList.remove('show-action-card');
  const shieldCard = document.getElementById('shield-card');
  if(shieldCard) shieldCard.classList.remove('show-shield-card');
  reasoningContainer.classList.remove('visible');
  reasoningContent.classList.remove('visible');
  reasoningContent.innerHTML = '';

  // Reset paper trading state
  const simActions = document.getElementById('simulate-actions-container');
  if (simActions) simActions.classList.add('hidden');
  const paperPanel = document.getElementById('paper-trade-panel');
  if (paperPanel) paperPanel.classList.add('hidden');

  loadingText.innerText = 'Extracting chart data...';
  cumulativeText = "";
  content.innerHTML = '';

  // Reset status indicator
  const statusDot = document.getElementById('status-dot');
  const statusLabel = document.getElementById('status-label');
  statusDot.className = 'gt-status-dot';
  statusLabel.className = 'gt-status-label';
  statusLabel.innerText = 'Standby';

  if (IS_EXTENSION) {
    // === PRODUCTION: Chrome Extension Mode ===
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        showError('No active tab found.');
        return;
      }

      const tab = tabs[0];
      if (tab.url && tab.url.startsWith('chrome://')) {
        showError('Cannot analyze Chrome internal pages.');
        return;
      }

      setTimeout(() => {
        chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 85 }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            console.error('Capture Error:', chrome.runtime.lastError);
            showError('Failed to capture screen.');
            return;
          }
          connectWebSocket(dataUrl);
        });
      }, 150);
    });
  } else {
    // === DEVELOPMENT: Local testing mode ===
    // Skip screen capture — send a placeholder directly to the WebSocket
    loadingText.innerText = 'DEV MODE — Connecting to local backend...';
    connectWebSocket(null);
  }
}

function connectWebSocket(dataUrl) {
  const loadingText = document.getElementById('loading-text');
  const statusDot = document.getElementById('status-dot');
  const statusLabel = document.getElementById('status-label');

  loadingText.innerText = 'Connecting to Quantum Node...';
  statusLabel.innerText = 'Connecting';
  statusLabel.className = 'gt-status-label connecting';
  statusDot.className = 'gt-status-dot connecting';

  const base64Data = dataUrl ? dataUrl.split(',')[1] : null;
  hasStartedStreaming = false;

  // Determine WS URL using getBackendConfig
  getBackendConfig().then((config) => {
    socket = new WebSocket(config.wsUrl);

    socket.onopen = () => {
      loadingText.innerText = 'Secure Channel Established. Analyzing...';
      statusLabel.innerText = 'Analyzing';

      if (base64Data) {
        socket.send(JSON.stringify({ type: 'image_payload', image: base64Data }));
      } else {
        // DEV MODE: send a test signal so backend knows to respond
        loadingText.innerText = 'DEV MODE — Send an image via backend test or use extension.';
        socket.send(JSON.stringify({ type: 'image_payload', image: 'DEV_TEST_PLACEHOLDER' }));
      }
    };

    socket.onmessage = (event) => {
      handleWebSocketMessage(event.data);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      showError('Core link severed. Verify backend is running.');
    };

    socket.onclose = (event) => {
      const loadingIndicator = document.getElementById('loading-indicator');
      statusLabel.innerText = 'Disconnected';
      statusLabel.className = 'gt-status-label disconnected';
      statusDot.className = 'gt-status-dot disconnected';

      if (event.code !== 1000 && !hasStartedStreaming) {
        loadingIndicator.classList.add('hidden');
        if (!document.getElementById('content').innerHTML.includes('gt-error')) {
          showError('Connection closed unexpectedly.');
        }
      }
    };
  });
}

// =====================================================
// ICONS
// =====================================================
const icons = {
  header: `<svg style="width:12px;height:12px;color:#10B981;flex-shrink:0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`,
  bullet: `<svg class="data-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>`
};

const reasonIcons = {
  macro: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`,
  candle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4M16 2v4M8 18v4M16 18v4"/><rect x="6" y="6" width="4" height="12" rx="1"/><rect x="14" y="6" width="4" height="12" rx="1"/></svg>`,
  smart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
  indicator: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  trap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  research: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`
};

// =====================================================
// TEXT FORMATTERS
// =====================================================
function formatText(text) {
  let html = text;

  // Format Module Headers
  html = html.replace(/MODULE (\d+) — (.*)/g, (match, num, title) => {
    return `<div class="module-header">${icons.header} MODULE ${num} &mdash; ${title}</div>`;
  });

  // Format Bold text
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="highlight-text">$1</strong>');

  // Format Confluence Score line
  html = html.replace(/CONFLUENCE SCORE: (\d)\/7/g, (match, score) => {
    const s = parseInt(score);
    const color = s >= 5 ? 'var(--emerald)' : s >= 4 ? 'var(--amber)' : 'var(--red)';
    return `<div class="data-point" style="margin-top:6px"><strong class="highlight-text" style="color:${color}">CONFLUENCE SCORE: ${score}/7</strong></div>`;
  });

  // Format Expected Value verdict
  html = html.replace(/Verdict: (POSITIVE EDGE|NEGATIVE EDGE|NEUTRAL)/g, (match, verdict) => {
    const color = verdict === 'POSITIVE EDGE' ? 'var(--emerald)' : verdict === 'NEGATIVE EDGE' ? 'var(--red)' : 'var(--amber)';
    return `<strong class="highlight-text" style="color:${color}">Verdict: ${verdict}</strong>`;
  });

  // Format REGIME line
  html = html.replace(/REGIME: (\S+)/g, (match, regime) => {
    return `<strong class="highlight-text">REGIME: ${regime}</strong>`;
  });

  // Format Bullets
  html = html.replace(/• (.*)/g, (match, content) => {
    return `<div class="data-point">${icons.bullet}<span>${content}</span></div>`;
  });

  // Replace newlines with breaks for unformatted text
  html = html.replace(/\n/g, '<br>');

  // Clean up double breaks after divs
  html = html.replace(/<\/div><br>/g, '</div>');

  return html;
}

/**
 * Formats Module 4 reasoning text into visual color-coded cards.
 * Each bullet point becomes its own card with a matching icon.
 */
function formatReasoningCards(rawText) {
  // Remove the module header line
  let text = rawText.replace(/MODULE 4[^\n]*/i, '').trim();

  // Remove the ZERO FAULT POLICY line if present
  text = text.replace(/\(ZERO FAULT POLICY[^)]*\)\.?/i, '').trim();

  // Define card mappings: keyword -> { type, title, icon }
  const cardDefs = [
    { key: 'Macro', type: 'macro', title: 'Macro Context', icon: reasonIcons.macro },
    { key: 'Candlestick', type: 'candle', title: 'Candlestick Psychology', icon: reasonIcons.candle },
    { key: 'Institutional', type: 'smart', title: 'Institutional Footprints', icon: reasonIcons.smart },
    { key: 'Smart Money', type: 'smart', title: 'Smart Money Activity', icon: reasonIcons.smart },
    { key: 'Indicator', type: 'indicator', title: 'Indicator Confluence', icon: reasonIcons.indicator },
    { key: 'Trap', type: 'trap', title: 'Trap Detection', icon: reasonIcons.trap },
    { key: 'Fakeout', type: 'trap', title: 'Fakeout Alert', icon: reasonIcons.trap },
    { key: 'Deep Research', type: 'deep-research', title: 'Live News Verification', icon: reasonIcons.research },
    { key: 'strongest argument AGAINST', type: 'trap', title: 'Counter-Thesis', icon: reasonIcons.trap },
    { key: 'What I might be missing', type: 'trap', title: 'Blind Spot Alert', icon: reasonIcons.trap },
    { key: 'Confidence adjustment', type: 'indicator', title: 'Confidence Calibration', icon: reasonIcons.indicator }
  ];

  // Split on bullet points
  const bullets = text.split(/•/).filter(b => b.trim().length > 0);

  if (bullets.length === 0) {
    // Fallback: just render as formatted text
    return `<div class="reason-card indicator"><div class="reason-icon">${reasonIcons.indicator}</div><div class="reason-body"><div class="reason-title">Analysis</div><div class="reason-text">${formatText(text)}</div></div></div>`;
  }

  let cardsHtml = '';
  for (const bullet of bullets) {
    const trimmed = bullet.trim();
    if (!trimmed) continue;

    // Find which card type this bullet matches
    let matched = null;
    for (const def of cardDefs) {
      if (trimmed.toLowerCase().includes(def.key.toLowerCase())) {
        matched = def;
        break;
      }
    }

    // Default to indicator if no match
    if (!matched) {
      matched = { type: 'indicator', title: 'Signal', icon: reasonIcons.indicator };
    }

    // Extract the content after the label (e.g., "Macro 1-Year Context: ..." -> "...")
    let content = trimmed;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx !== -1 && colonIdx < 60) {
      content = trimmed.substring(colonIdx + 1).trim();
    }

    // Clean up escaped HTML entities for display
    content = content.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    // Re-escape for safe display
    content = escapeHTML(content);

    cardsHtml += `
      <div class="reason-card ${matched.type}">
        <div class="reason-icon">${matched.icon}</div>
        <div class="reason-body">
          <div class="reason-title">${matched.title}</div>
          <div class="reason-text">${content}</div>
        </div>
      </div>`;
  }

  return cardsHtml || `<div class="reason-card indicator"><div class="reason-icon">${reasonIcons.indicator}</div><div class="reason-body"><div class="reason-title">Analysis</div><div class="reason-text">Deep reasoning data loading...</div></div></div>`;
}

// =====================================================
// WEBSOCKET MESSAGE HANDLER
// =====================================================
function handleWebSocketMessage(messageData) {
  const content = document.getElementById('content');
  const loadingIndicator = document.getElementById('loading-indicator');

  try {
    const data = JSON.parse(messageData);

    if (data.type === 'regime_invalidated') {
      loadingIndicator.classList.add('hidden');
      const safeMessage = escapeHTML(data.message || '');
      content.innerHTML = `<div class="gt-error">[ALERT] ${safeMessage}</div>` + content.innerHTML;
      content.classList.remove('hidden');
      content.classList.add('visible');
      // Update action card to reflect invalidation
      const actionCard = document.getElementById('action-card');
      if (actionCard && actionCard.classList.contains('show-action-card')) {
        document.getElementById('simulate-btn').classList.add('hidden');
      }
      return;
    }

    if (data.status === 'error') {
      loadingIndicator.classList.add('hidden');
      const safeMessage = escapeHTML(data.message || '');
      content.innerHTML = `<div class="gt-error">[SYSTEM FAULT] ${safeMessage}</div>`;
      content.classList.remove('hidden');
      content.classList.add('visible');
    }
    else if (data.status === 'update') {
      if (!hasStartedStreaming) {
        loadingIndicator.classList.add('hidden');
        content.classList.remove('hidden');
        setTimeout(() => content.classList.add('visible'), 50);
        hasStartedStreaming = true;
      }

      const safeText = escapeHTML(data.text || '');
      cumulativeText += safeText;

      // Split Module 10 (Deep Reasoning) + Module 11 (Counter-Thesis) into reasoning panel
      const reasoningMarker = 'MODULE 10';
      const splitIndex = cumulativeText.indexOf(reasoningMarker);
      if (splitIndex !== -1) {
        const mainText = cumulativeText.substring(0, splitIndex);
        const reasoningText = cumulativeText.substring(splitIndex);
        content.innerHTML = formatText(mainText);
        // Render reasoning + counter-thesis as visual cards
        document.getElementById('reasoning-content').innerHTML = formatReasoningCards(reasoningText);
        document.getElementById('reasoning-container').classList.add('visible');
      } else {
        content.innerHTML = formatText(cumulativeText);
      }

      // Extract Probabilities or Shield Mode for Action Card
      const shieldMatch = cumulativeText.match(/SHIELD MODE ACTIVE — (.*)/);
      // === FIXED: Match both old format and BASE CASE format ===
      const bullMatch = cumulativeText.match(/(?:BASE\s*CASE[:\s]*BULLISH|BULLISH)\s*(?:Probability[:\s]*)?\s*(\d+)%/i);
      const bearMatch = cumulativeText.match(/(?:BASE\s*CASE[:\s]*BEARISH|BEARISH)\s*(?:Probability[:\s]*)?\s*(\d+)%/i);

      if (shieldMatch) {
        document.getElementById('shield-reason').innerText = shieldMatch[1];
        document.getElementById('shield-card').classList.add('show-shield-card');
        document.getElementById('action-card').classList.remove('show-action-card');
        // §2.1 — Hide simulate button during shield mode
        document.getElementById('simulate-actions-container').classList.add('hidden');
      } else if (bullMatch || bearMatch) {
        if (bullMatch) document.getElementById('bullish-prob').innerText = bullMatch[1] + '%';
        if (bearMatch) document.getElementById('bearish-prob').innerText = bearMatch[1] + '%';
        
        document.getElementById('action-card').classList.add('show-action-card');
        const shieldCard = document.getElementById('shield-card');
        if(shieldCard) shieldCard.classList.remove('show-shield-card');
        
        // §2.1 — Show simulate actions container for actionable predictions
        const actionsContainer = document.getElementById('simulate-actions-container');
        if (actionsContainer) actionsContainer.classList.remove('hidden');
      }

      // Auto scroll to bottom
      const contentArea = document.getElementById('content-area');
      contentArea.scrollTop = contentArea.scrollHeight;
    }
    else if (data.status === 'complete') {
      const statusDot = document.getElementById('status-dot');
      const statusLabel = document.getElementById('status-label');
      statusLabel.innerText = 'Complete';
      statusLabel.className = 'gt-status-label';
      statusDot.className = 'gt-status-dot';

      // Final extraction for summary
      const scenarioMarker = 'SCENARIO A';
      const scenarioIdx = cumulativeText.indexOf(scenarioMarker);
      if (scenarioIdx !== -1) {
        let endIdx = cumulativeText.indexOf('SCENARIO B', scenarioIdx);
        if (endIdx === -1) endIdx = cumulativeText.indexOf('MODULE 3', scenarioIdx);
        if (endIdx === -1) endIdx = cumulativeText.length;
        let txt = cumulativeText.substring(scenarioIdx, endIdx);
        txt = txt.replace(/SCENARIO A[^\n]*/i, '').trim();
        txt = txt.replace(/^"|"$/g, '');
        if (txt) {
          document.getElementById('action-summary').innerHTML = formatText(txt);
        } else {
          document.getElementById('action-summary').innerText = 'Prediction ready.';
        }
      } else {
        document.getElementById('action-summary').innerText = 'Prediction ready.';
      }
    }
  } catch (e) {
    console.error('Failed to parse WS message', e);
  }
}

function showError(message) {
  const loadingIndicator = document.getElementById('loading-indicator');
  const content = document.getElementById('content');
  loadingIndicator.classList.add('hidden');
  content.innerHTML = `<div class="gt-error">[ERROR] ${escapeHTML(message)}<br><br><a href="#" id="retry-btn" style="color:var(--emerald);text-decoration:underline;cursor:pointer;">Retry Connection</a></div>`;
  content.classList.remove('hidden');
  content.classList.add('visible');
  
  // Need to use event listener instead of inline onclick for extension CSP
  setTimeout(() => {
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', (e) => {
      e.preventDefault();
      startProcess();
    });
  }, 10);
}

// =====================================================
// §2.1 — VIRTUAL PAPER TRADING ENGINE
// Zero-risk simulated execution feedback loop
// =====================================================

/**
 * Extracts price levels from the cumulative AI analysis text.
 * Returns { currentPrice, primaryTarget, invalidationLevel, direction }
 */
function extractTradeLevels(text) {
  const currentPriceMatch = text.match(/Current\s*Price[:\s]*\$?([\d,]+\.?\d*)/i);
  const targetMatch = text.match(/Primary\s*Target[:\s]*\$?([\d,]+\.?\d*)/i);
  const invalidationMatch = text.match(/Invalidation\s*(?:Level)?[:\s]*\$?([\d,]+\.?\d*)/i);
  const downRiskMatch = text.match(/Downside\s*Risk[:\s]*\$?([\d,]+\.?\d*)/i);
  // === FIXED: Match BASE CASE format ===
  const bullMatch = text.match(/(?:BASE\s*CASE[:\s]*BULLISH|BULLISH)\s*(?:Probability[:\s]*)?\s*(\d+)%/i);
  const bearMatch = text.match(/(?:BASE\s*CASE[:\s]*BEARISH|BEARISH)\s*(?:Probability[:\s]*)?\s*(\d+)%/i);

  const bullProb = bullMatch ? parseInt(bullMatch[1]) : 0;
  const bearProb = bearMatch ? parseInt(bearMatch[1]) : 0;
  
  return {
    currentPrice: currentPriceMatch ? parseFloat(currentPriceMatch[1].replace(/,/g, '')) : null,
    primaryTarget: targetMatch ? parseFloat(targetMatch[1].replace(/,/g, '')) : null,
    invalidationLevel: invalidationMatch ? parseFloat(invalidationMatch[1].replace(/,/g, '')) : null,
    downRisk: downRiskMatch ? parseFloat(downRiskMatch[1].replace(/,/g, '')) : null,
    direction: bullProb > bearProb ? 'BULLISH' : 'BEARISH',
    bullProb,
    bearProb,
  };
}

/**
 * Loads the discipline index from chrome.storage.local
 */
function loadDisciplineIndex(callback) {
  if (IS_EXTENSION) {
    chrome.storage.local.get(['paperTrades', 'disciplineWins', 'disciplineTotal'], (result) => {
      callback({
        trades: result.paperTrades || [],
        wins: result.disciplineWins || 0,
        total: result.disciplineTotal || 0,
      });
    });
  } else {
    // Dev mode fallback — use localStorage
    const wins = parseInt(localStorage.getItem('disciplineWins') || '0');
    const total = parseInt(localStorage.getItem('disciplineTotal') || '0');
    callback({ trades: [], wins, total });
  }
}

/**
 * Saves a new paper trade and updates discipline index
 */
function savePaperTrade(trade, isDisciplined, callback) {
  if (IS_EXTENSION) {
    chrome.storage.local.get(['paperTrades', 'disciplineTotal', 'disciplineWins'], (result) => {
      const trades = result.paperTrades || [];
      if (trade) trades.push(trade);
      // Keep only last 50 trades to prevent storage bloat
      const trimmed = trades.slice(-50);
      const newTotal = (result.disciplineTotal || 0) + 1;
      const newWins = (result.disciplineWins || 0) + (isDisciplined ? 1 : 0);
      chrome.storage.local.set({ 
        paperTrades: trimmed, 
        disciplineTotal: newTotal,
        disciplineWins: newWins
      }, () => {
        if (callback) callback(newTotal);
      });
    });
  } else {
    const total = parseInt(localStorage.getItem('disciplineTotal') || '0') + 1;
    const wins = parseInt(localStorage.getItem('disciplineWins') || '0') + (isDisciplined ? 1 : 0);
    localStorage.setItem('disciplineTotal', String(total));
    localStorage.setItem('disciplineWins', String(wins));
    if (callback) callback(total);
  }
}

/**
 * Updates the discipline index display
 */
function updateDisciplineDisplay() {
  loadDisciplineIndex((data) => {
    const scoreEl = document.getElementById('discipline-score');
    const fillEl = document.getElementById('discipline-fill');
    if (scoreEl) scoreEl.textContent = `${data.wins}/${data.total}`;
    if (fillEl) {
      const percent = data.total > 0 ? Math.round((data.wins / data.total) * 100) : 0;
      fillEl.style.width = `${percent}%`;
    }
  });
}

/**
 * Shows the paper trading panel with extracted levels
 */
function showPaperTradePanel(levels) {
  const panel = document.getElementById('paper-trade-panel');
  const dirEl = document.getElementById('paper-direction');
  const entryEl = document.getElementById('paper-entry');
  const slEl = document.getElementById('paper-sl');
  const targetEl = document.getElementById('paper-target');

  if (!panel) return;

  // Populate fields
  dirEl.textContent = levels.direction;
  dirEl.className = `gt-paper-value ${levels.direction === 'BULLISH' ? 'bullish-val' : 'bearish-val'}`;
  
  entryEl.textContent = levels.currentPrice ? `$${levels.currentPrice.toLocaleString()}` : '—';
  
  const slPrice = levels.invalidationLevel || levels.downRisk;
  slEl.textContent = slPrice ? `$${slPrice.toLocaleString()}` : '—';
  
  targetEl.textContent = levels.primaryTarget ? `$${levels.primaryTarget.toLocaleString()}` : '—';

  // Update discipline display
  updateDisciplineDisplay();

  // Show panel
  panel.classList.remove('hidden');

  // Log the paper trade
  const trade = {
    direction: levels.direction,
    entry: levels.currentPrice,
    stopLoss: slPrice,
    target: levels.primaryTarget,
    timestamp: new Date().toISOString(),
    bullProb: levels.bullProb,
    bearProb: levels.bearProb,
  };

  savePaperTrade(trade, () => {
    updateDisciplineDisplay();
    document.getElementById('paper-status').textContent = 
      `Setup simulated at ${new Date().toLocaleTimeString()}. Track your discipline.`;
  });
}

// === Wire up event listeners after DOM ready ===
document.addEventListener('DOMContentLoaded', () => {
  // Simulate Setup button
  const simBtn = document.getElementById('simulate-btn');
  if (simBtn) {
    simBtn.addEventListener('click', () => {
      const levels = extractTradeLevels(cumulativeText);
      if (levels.currentPrice || levels.primaryTarget) {
        document.getElementById('simulate-actions-container').classList.add('hidden');
        showPaperTradePanel(levels);
      } else {
        document.getElementById('paper-status').textContent = 
          'Could not extract price levels from analysis.';
      }
    });
  }

  // FOMO / Ignore Setup button
  const fomoBtn = document.getElementById('fomo-btn');
  if (fomoBtn) {
    fomoBtn.addEventListener('click', () => {
      document.getElementById('simulate-actions-container').classList.add('hidden');
      savePaperTrade(null, false, () => {
        updateDisciplineDisplay();
        const summary = document.getElementById('action-summary');
        const oldText = summary.innerText;
        summary.innerText = '[LOGGED: Setup Ignored / Broken Rule]';
        summary.style.color = 'var(--red)';
        setTimeout(() => { 
          summary.innerText = oldText; 
          summary.style.color = '';
        }, 3000);
      });
    });
  }

  // Close paper panel
  const closeBtn = document.getElementById('close-paper-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('paper-trade-panel').classList.add('hidden');
    });
  }

  // Load discipline index on popup open
  updateDisciplineDisplay();
});

