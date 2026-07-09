let socket = null;
let hasStartedStreaming = false;

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

  loadingIndicator.classList.remove('hidden');
  loadingText.innerText = 'Capturing matrix...';
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

    // Wait a brief moment to ensure the popup is fully rendered before capturing
    // Sometimes capturing immediately can catch the popup animating in.
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
  loadingText.innerText = 'Connecting to Quantum Node...';

  const base64Data = dataUrl.split(',')[1];
  hasStartedStreaming = false;

  chrome.storage.sync.get(['wsUrl'], (result) => {
    const wsUrl = result.wsUrl || 'wss://ghosttrade-test1.onrender.com/stream';
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      loadingText.innerText = 'Secure Channel Established. Analyzing Matrix...';
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
      if (event.code !== 1000 && !hasStartedStreaming) {
        loadingIndicator.classList.add('hidden');
        if (!document.getElementById('content').innerHTML.includes('ERROR')) {
          showError('Connection closed unexpectedly.');
        }
      }
    };
  });
}

function handleWebSocketMessage(messageData) {
  const content = document.getElementById('content');
  const loadingIndicator = document.getElementById('loading-indicator');
  
  try {
    const data = JSON.parse(messageData);
    
    if (data.status === 'error') {
      loadingIndicator.classList.add('hidden');
      const safeMessage = escapeHTML(data.message || '');
      content.innerHTML += `<div class="p-3 bg-red-900/30 border border-red-800 rounded text-red-300 font-mono text-xs mt-2">\n[SYSTEM FAULT] ${safeMessage}</div>`;
    } 
    else if (data.status === 'update') {
      if (!hasStartedStreaming) {
        loadingIndicator.classList.add('hidden');
        hasStartedStreaming = true;
        content.innerHTML = '<div class="font-mono text-emerald-400 text-xs mb-2 opacity-75">>> INCOMING STREAM: DECRYPTED</div>';
      }
      
      const textSpan = document.createElement('span');
      const safeText = escapeHTML(data.text || '');
      let formattedText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
      textSpan.innerHTML = formattedText;
      content.appendChild(textSpan);
      
      // Auto scroll to bottom
      const contentArea = document.getElementById('content-area');
      contentArea.scrollTop = contentArea.scrollHeight;
    } 
    else if (data.status === 'complete') {
      content.innerHTML += '<div class="font-mono text-gray-500 text-xs mt-3 pt-2 border-t border-gray-700/30 opacity-75">>> STREAM TERMINATED</div>';
    }
  } catch (e) {
    console.error('Failed to parse WS message', e);
  }
}

function showError(message) {
  const loadingIndicator = document.getElementById('loading-indicator');
  const content = document.getElementById('content');
  loadingIndicator.classList.add('hidden');
  content.innerHTML = `<div class="p-3 bg-red-900/30 border border-red-800 rounded text-red-300 font-mono text-xs">\n[ERROR] ${message}</div>`;
}
