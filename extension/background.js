chrome.action.onClicked.addListener((tab) => {
  if (!tab.url || tab.url.startsWith('chrome://')) return;

  // Capture the visible tab invisibly at the V8 engine level
  chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 }, (dataUrl) => {
    if (chrome.runtime.lastError) {
      console.error('Stealth Capture Error:', chrome.runtime.lastError);
      return;
    }

    // Send the captured image to the isolated UI injector
    chrome.tabs.sendMessage(tab.id, {
      type: 'START_ANALYSIS',
      image: dataUrl
    });
  });
});
