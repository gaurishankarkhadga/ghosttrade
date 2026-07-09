let sockets = {}; // Map of tabId to WebSocket instance

chrome.action.onClicked.addListener((tab) => {
  if (!tab.url || tab.url.startsWith('chrome://')) return;

  // Show UI instantly to eliminate perceived lag
  chrome.tabs.sendMessage(tab.id, { type: 'INIT_UI' }).catch(() => {});

  // Wait 100ms to allow the INIT_UI message to be processed and render before the V8 thread locks up capturing the screen
  setTimeout(() => {
    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 50 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('Stealth Capture Error:', chrome.runtime.lastError);
        return;
      }

      // Send the captured image to the isolated UI injector
      chrome.tabs.sendMessage(tab.id, {
        type: 'START_ANALYSIS',
        image: dataUrl
      }).catch(() => {});
    });
  }, 100);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONNECT_WS') {
    const tabId = sender.tab.id;
    
    // Close existing socket for this tab if any
    if (sockets[tabId]) {
      sockets[tabId].close();
    }

    chrome.storage.sync.get(['wsUrl'], (result) => {
      const wsUrl = result.wsUrl || 'wss://ghosttrade-test1.onrender.com/stream';
      const socket = new WebSocket(wsUrl);
      sockets[tabId] = socket;

      socket.onopen = () => {
        chrome.tabs.sendMessage(tabId, { type: 'WS_OPEN' }).catch(()=>{});
        socket.send(JSON.stringify({ type: 'image_payload', image: message.image }));
      };

      socket.onmessage = (event) => {
        chrome.tabs.sendMessage(tabId, { type: 'WS_MESSAGE', data: event.data }).catch(()=>{});
      };

      socket.onerror = (error) => {
        chrome.tabs.sendMessage(tabId, { type: 'WS_ERROR' }).catch(()=>{});
      };

      socket.onclose = (event) => {
        chrome.tabs.sendMessage(tabId, { type: 'WS_CLOSE', code: event.code }).catch(()=>{});
        delete sockets[tabId];
      };
    });
  } else if (message.type === 'DISCONNECT_WS') {
    const tabId = sender.tab.id;
    if (sockets[tabId]) {
      sockets[tabId].close();
      delete sockets[tabId];
    }
  }
});
