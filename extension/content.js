let shadowRoot = null;
let socket = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_ANALYSIS') {
    startAnalysis(message.image);
  }
});

function initUI() {
  if (document.getElementById('sotix-overlay-container')) {
    return;
  }
  const container = document.createElement('div');
  container.id = 'sotix-overlay-container';
  container.style.position = 'fixed';
  container.style.top = '20px';
  container.style.right = '20px';
  container.style.zIndex = '2147483647'; // Maximum z-index
  container.style.pointerEvents = 'none';

  shadowRoot = container.attachShadow({ mode: 'closed' });
  
  // Inject local Tailwind CSS scoped to the Shadow Root
  const tailwindLink = document.createElement('link');
  tailwindLink.rel = 'stylesheet';
  tailwindLink.href = chrome.runtime.getURL('tailwind.min.css');
  shadowRoot.appendChild(tailwindLink);
  
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('styles.css');
  shadowRoot.appendChild(link);
  
  const ui = document.createElement('div');
  ui.id = 'sotix-ui';
  ui.className = 'hidden flex flex-col gap-4 p-5 rounded-2xl bg-gray-900 bg-opacity-80 backdrop-blur-xl border border-gray-700/50 text-white shadow-[0_8px_30px_rgb(0,0,0,0.4)] w-[360px] font-sans pointer-events-auto transition-all duration-300 transform scale-95 opacity-0';
  ui.style.position = 'absolute';
  ui.style.top = '0px';
  ui.style.right = '0px';
  
  ui.innerHTML = `
    <div id="drag-handle" class="flex justify-between items-center pb-3 border-b border-gray-700/50 cursor-move">
      <div class="flex items-center gap-3">
        <div class="relative flex items-center justify-center w-6 h-6 rounded-full bg-gray-800 border border-gray-600">
          <div class="absolute w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"></div>
        </div>
        <h2 class="text-[17px] font-bold bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent tracking-wide">Sotix AI Nexus</h2>
      </div>
      <button id="close-btn" class="p-1 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-gray-500">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </button>
    </div>
    <div id="content-area" class="relative min-h-[140px] max-h-[450px] overflow-y-auto">
      <div id="loading-indicator" class="hidden absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900/50 rounded-lg z-10 backdrop-blur-sm">
        <svg class="w-8 h-8 text-emerald-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <span class="text-sm font-medium text-emerald-400 animate-pulse" id="loading-text">Establishing link...</span>
      </div>
      <div id="content" class="text-[14px] text-gray-200 whitespace-pre-wrap leading-relaxed space-y-2 pb-2">
        Awaiting input...
      </div>
    </div>
    <div class="flex items-center justify-center gap-2 text-[10px] text-gray-400 mt-1 pt-3 border-t border-gray-700/50 uppercase tracking-widest font-semibold">
      <svg class="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
      Mathematical Integrity
    </div>
  `;
  shadowRoot.appendChild(ui);
  document.body.appendChild(container);

  // Implement dragging capability
  const dragHandle = shadowRoot.getElementById('drag-handle');
  let isDragging = false;
  let offsetX, offsetY;

  dragHandle.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = ui.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    ui.style.right = 'auto'; // Disable right-anchor so we can move with left/top
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(e) {
    if (!isDragging) return;
    ui.style.left = `${e.clientX - offsetX}px`;
    ui.style.top = `${e.clientY - offsetY}px`;
  }

  function onMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  shadowRoot.getElementById('close-btn').addEventListener('click', () => {
    ui.classList.remove('scale-100', 'opacity-100');
    ui.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
      ui.classList.add('hidden');
    }, 300);
    if (socket) {
      socket.close();
      socket = null;
    }
  });
}

function startAnalysis(dataUrl) {
  initUI();
  const ui = shadowRoot.getElementById('sotix-ui');
  const content = shadowRoot.getElementById('content');
  const loadingIndicator = shadowRoot.getElementById('loading-indicator');
  const loadingText = shadowRoot.getElementById('loading-text');
  
  ui.classList.remove('hidden');
  // Trigger transition
  setTimeout(() => {
    ui.classList.remove('scale-95', 'opacity-0');
    ui.classList.add('scale-100', 'opacity-100');
  }, 10);

  content.innerHTML = '';
  loadingIndicator.classList.remove('hidden');
  loadingText.innerText = 'Connecting to Quantum Node...';

  const base64Data = dataUrl.split(',')[1];

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
  }

  chrome.storage.sync.get(['wsUrl'], (result) => {
    const wsUrl = result.wsUrl || 'ws://localhost:5000/stream';
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      loadingText.innerText = 'Secure Channel Established. Analyzing Matrix...';
      socket.send(JSON.stringify({ type: 'image_payload', image: base64Data }));
    };

    let hasStartedStreaming = false;

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'error') {
          loadingIndicator.classList.add('hidden');
          content.innerHTML += `<div class="p-3 bg-red-900/30 border border-red-800 rounded text-red-300 font-mono text-xs">\n[SYSTEM FAULT] ${data.message}</div>`;
        } else if (data.status === 'update') {
          if (!hasStartedStreaming) {
            loadingIndicator.classList.add('hidden');
            hasStartedStreaming = true;
            content.innerHTML = '<div class="font-mono text-emerald-400 text-xs mb-2 opacity-75">>> INCOMING STREAM: DECRYPTED</div>';
          }
          
          // Use marked.js or basic parsing if needed, or just append formatted
          const textSpan = document.createElement('span');
          // Handle basic bold syntax from gemini: **text**
          let formattedText = data.text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
          textSpan.innerHTML = formattedText;
          content.appendChild(textSpan);
          content.parentElement.scrollTop = content.parentElement.scrollHeight;
        } else if (data.status === 'complete') {
          content.innerHTML += '<div class="font-mono text-gray-500 text-xs mt-3 pt-2 border-t border-gray-700/30 opacity-75">>> STREAM TERMINATED</div>';
        }
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    socket.onerror = (error) => {
      loadingIndicator.classList.add('hidden');
      content.innerHTML = `<div class="p-3 bg-red-900/30 border border-red-800 rounded text-red-300 font-mono text-xs">\n[ERROR] Core link severed. Verify backend sequence.</div>`;
    };

    socket.onclose = (event) => {
      if (event.code !== 1000) {
        if (!hasStartedStreaming) loadingIndicator.classList.add('hidden');
        // Connection closed unexpectedly
      }
    };
  });
}
