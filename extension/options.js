document.addEventListener('DOMContentLoaded', () => {
  const wsUrlInput = document.getElementById('wsUrl');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  async function loadEnv() {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) return {}; // Cannot fetch local files in Chrome extension
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
      return {};
    }
  }

  // Load saved URL
  loadEnv().then(env => {
    const defaultWsUrl = env.DEFAULT_WS_URL || 'wss://ghosttrade-test1.onrender.com/stream';
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(['wsUrl'], (result) => {
        if (result.wsUrl) {
          wsUrlInput.value = result.wsUrl;
        } else {
          wsUrlInput.value = defaultWsUrl;
        }
      });
    } else {
      // Fallback for local testing
      wsUrlInput.value = defaultWsUrl;
    }
  });

  saveBtn.addEventListener('click', () => {
    const url = wsUrlInput.value.trim();
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      showStatus('Invalid WebSocket URL. Must start with ws:// or wss://', 'error');
      return;
    }

    chrome.storage.sync.set({ wsUrl: url }, () => {
      showStatus('Configuration saved successfully.', 'success');
    });
  });

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.classList.remove('hidden', 'bg-emerald-900/40', 'text-emerald-400', 'bg-red-900/40', 'text-red-400');
    
    if (type === 'success') {
      statusEl.classList.add('bg-emerald-900/40', 'text-emerald-400');
    } else {
      statusEl.classList.add('bg-red-900/40', 'text-red-400');
    }
    
    setTimeout(() => {
      statusEl.classList.add('hidden');
    }, 3000);
  }
});
