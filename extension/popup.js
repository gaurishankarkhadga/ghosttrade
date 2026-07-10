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
});

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
        chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 50 }, (dataUrl) => {
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

  // Determine WS URL
  const getWsUrl = (callback) => {
    if (IS_EXTENSION) {
      chrome.storage.sync.get(['wsUrl'], (result) => {
        // PRODUCTION CONNECTION HIDDEN FOR NOW
        // callback(result.wsUrl || 'wss://... production url ...');
        callback(result.wsUrl || 'ws://localhost:5000/stream');
      });
    } else {
      // Local dev: connect to localhost backend
      callback('ws://localhost:5000/stream');
    }
  };

  getWsUrl((wsUrl) => {
    socket = new WebSocket(wsUrl);

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
    { key: 'Deep Research', type: 'deep-research', title: 'Live News Verification', icon: reasonIcons.research }
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

      // Split Module 4 into reasoning panel
      const module4Marker = 'MODULE 4';
      const splitIndex = cumulativeText.indexOf(module4Marker);
      if (splitIndex !== -1) {
        const mainText = cumulativeText.substring(0, splitIndex);
        const reasoningText = cumulativeText.substring(splitIndex);
        content.innerHTML = formatText(mainText);
        // Render reasoning as visual cards
        document.getElementById('reasoning-content').innerHTML = formatReasoningCards(reasoningText);
        document.getElementById('reasoning-container').classList.add('visible');
      } else {
        content.innerHTML = formatText(cumulativeText);
      }

      // Extract Probabilities or Shield Mode for Action Card
      const shieldMatch = cumulativeText.match(/SHIELD MODE ACTIVE — (.*)/);
      const bullMatch = cumulativeText.match(/BULLISH Probability: (\d+)%/);
      const bearMatch = cumulativeText.match(/BEARISH Probability: (\d+)%/);

      if (shieldMatch) {
        document.getElementById('shield-reason').innerText = shieldMatch[1];
        document.getElementById('shield-card').classList.add('show-shield-card');
        document.getElementById('action-card').classList.remove('show-action-card');
      } else if (bullMatch) {
        document.getElementById('bullish-prob').innerText = bullMatch[1] + '%';
        document.getElementById('action-card').classList.add('show-action-card');
        const shieldCard = document.getElementById('shield-card');
        if(shieldCard) shieldCard.classList.remove('show-shield-card');
      }
      
      if (bearMatch) {
        document.getElementById('bearish-prob').innerText = bearMatch[1] + '%';
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
  content.innerHTML = `<div class="gt-error">[ERROR] ${message}</div>`;
  content.classList.remove('hidden');
  content.classList.add('visible');
}
