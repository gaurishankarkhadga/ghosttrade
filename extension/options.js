document.addEventListener('DOMContentLoaded', () => {
  const wsUrlInput = document.getElementById('wsUrl');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  // Load saved URL
  chrome.storage.sync.get(['wsUrl'], (result) => {
    if (result.wsUrl) {
      wsUrlInput.value = result.wsUrl;
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
