let socket = null;
let hasStartedStreaming = false;
let cumulativeText = "";

// Sanitize incoming data to prevent DOM-based XSS
const escapeHTML = (str) => {
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
};

document.addEventListener('DOMContentLoaded', () => {
  startProcess();
});

function startProcess() {
  const loadingIndicator = document.getElementById('loading-indicator');
  const loadingText = document.getElementById('loading-text');
  const content = document.getElementById('content');
  const actionCard = document.getElementById('action-card');

  loadingIndicator.classList.remove('hidden');
  content.classList.add('hidden');
  content.classList.remove('opacity-100');
  actionCard.classList.remove('show-action-card');
  
  loadingText.innerText = 'Extracting chart data...';
  cumulativeText = "";
  content.innerHTML = '';

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
}

function connectWebSocket(dataUrl) {
  const loadingText = document.getElementById('loading-text');
  const statusIndicator = document.querySelector('#status-indicator span:last-child');
  const statusPing = document.querySelector('#status-indicator span:first-child');
  
  loadingText.innerText = 'Connecting to Quantum Node...';
  statusIndicator.innerText = 'Connecting';
  statusIndicator.classList.replace('text-emerald-400', 'text-yellow-400');
  statusPing.classList.replace('bg-emerald-400', 'bg-yellow-400');

  const base64Data = dataUrl.split(',')[1];
  hasStartedStreaming = false;

  chrome.storage.sync.get(['wsUrl'], (result) => {
    const wsUrl = result.wsUrl || 'wss://ghosttrade-test1.onrender.com/stream';
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      loadingText.innerText = 'Secure Channel Established. Analyzing...';
      statusIndicator.innerText = 'Analyzing';
      statusPing.classList.add('animate-pulse');
      statusPing.classList.remove('animate-ping');
      socket.send(JSON.stringify({ type: 'image_payload', image: base64Data }));
    };

    socket.onmessage = (event) => {
      handleWebSocketMessage(event.data);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      showError('Core link severed. Verify backend sequence.');
    };

    socket.onclose = (event) => {
      const loadingIndicator = document.getElementById('loading-indicator');
      statusIndicator.innerText = 'Disconnected';
      statusIndicator.classList.replace('text-yellow-400', 'text-gray-500');
      statusPing.className = 'relative inline-flex rounded-full h-2 w-2 bg-gray-600';
      
      if (event.code !== 1000 && !hasStartedStreaming) {
        loadingIndicator.classList.add('hidden');
        if (!document.getElementById('content').innerHTML.includes('ERROR')) {
          showError('Connection closed unexpectedly.');
        }
      }
    };
  });
}

const icons = {
  header: `<svg class="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`,
  bullet: `<svg class="data-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>`
};

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

function handleWebSocketMessage(messageData) {
  const content = document.getElementById('content');
  const loadingIndicator = document.getElementById('loading-indicator');
  
  try {
    const data = JSON.parse(messageData);
    
    if (data.status === 'error') {
      loadingIndicator.classList.add('hidden');
      const safeMessage = escapeHTML(data.message || '');
      content.innerHTML = `<div class="p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-xs mt-2">\n[SYSTEM FAULT] ${safeMessage}</div>`;
      content.classList.remove('hidden');
      content.classList.add('opacity-100');
    } 
    else if (data.status === 'update') {
      if (!hasStartedStreaming) {
        loadingIndicator.classList.add('hidden');
        content.classList.remove('hidden');
        // Slight delay to allow display:block to apply before animating opacity
        setTimeout(() => content.classList.add('opacity-100'), 50);
        hasStartedStreaming = true;
      }
      
      const safeText = escapeHTML(data.text || '');
      cumulativeText += safeText;
      
      // Update main content
      content.innerHTML = formatText(cumulativeText);
      
      // Extract Probabilities for Action Card
      const bullMatch = cumulativeText.match(/BULLISH Probability: (\d+)%/);
      const bearMatch = cumulativeText.match(/BEARISH Probability: (\d+)%/);
      
      if (bullMatch) {
        document.getElementById('bullish-prob').innerText = bullMatch[1] + '%';
        document.getElementById('action-card').classList.add('show-action-card');
      }
      if (bearMatch) {
        document.getElementById('bearish-prob').innerText = bearMatch[1] + '%';
      }

      // Auto scroll to bottom
      const contentArea = document.getElementById('content-area');
      contentArea.scrollTop = contentArea.scrollHeight;
    } 
    else if (data.status === 'complete') {
      const statusIndicator = document.querySelector('#status-indicator span:last-child');
      const statusPing = document.querySelector('#status-indicator span:first-child');
      statusIndicator.innerText = 'Analysis Complete';
      statusIndicator.classList.replace('text-yellow-400', 'text-emerald-400');
      statusPing.classList.remove('animate-pulse');
      statusPing.className = 'relative inline-flex rounded-full h-2 w-2 bg-emerald-500';
      
      // Final extraction for summary
      const summaryMatch = cumulativeText.match(/MODULE 11 — BEGINNER DECODER[\s\S]*?(?:<br>|\n)+([\s\S]*)$/i);
      if (summaryMatch && summaryMatch[1]) {
        document.getElementById('action-summary').innerHTML = formatText(summaryMatch[1].trim());
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
  content.innerHTML = `<div class="p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-xs">\n[ERROR] ${message}</div>`;
  content.classList.remove('hidden');
  content.classList.add('opacity-100');
}
