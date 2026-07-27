import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useGhostStore = create(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      token: null,
      wsStatus: 'DISCONNECTED',
      assets: {}, // { 'BTC-USD': { score: 50, flowBias: 'NEUTRAL', kellySize: 10, ... } }
      
      login: async (credentials) => {
        try {
          const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
          const endpoint = credentials.isSignup ? '/api/auth/signup' : '/api/auth/login';
          
          const payload = credentials.isSignup 
            ? { name: credentials.name, email: credentials.email, password: credentials.password }
            : { email: credentials.email, password: credentials.password };

          const res = await fetch(`${baseUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          const data = await res.json();
          
          if (res.ok && data.token) {
            set({ isAuthenticated: true, token: data.token });
            get().connectWebSocket(data.token);
            return { success: true, message: 'Authentication successful.' };
          }
          
          return { success: false, message: data.error || 'Authentication failed.' };
        } catch (e) {
          console.error('Auth request failed:', e);
          return { success: false, message: 'Network error. Could not reach authentication server.' };
        }
      },

      connectWebSocket: (token) => {
        set({ wsStatus: 'CONNECTING' });
        
        // Dynamically resolve WebSocket URL (wss:// for https://, ws:// for http://)
        const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        const wsUrl = baseUrl.replace(/^http/, 'ws') + `?token=${token}`;
        
        const ws = new WebSocket(wsUrl);
        
        ws.onopen = () => set({ wsStatus: 'CONNECTED' });
        ws.onclose = () => {
          set({ wsStatus: 'DISCONNECTED' });
          // Reconnect logic
          setTimeout(() => {
            if (get().isAuthenticated) get().connectWebSocket(get().token);
          }, 2000);
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'GHOST_BRAIN_UPDATE') {
              // data.payload is array of asset results from the Phase 4 bulk scan
              const newAssets = { ...get().assets };
              data.payload.forEach(asset => {
                 newAssets[asset.ticker] = asset;
              });
              set({ assets: newAssets });
            }
          } catch (e) {
            console.error('WS Parse Error', e);
          }
        };
      },
      // --- AI Chat Logic ---
      chatHistory: [],
      isThinking: false,

      sendPrompt: async (prompt) => {
        // 1. Add user prompt to history
        set((state) => ({
          chatHistory: [...state.chatHistory, { role: 'user', content: prompt }],
          isThinking: true
        }));

        // 2. Simulate AI Processing & Backend Latency (Zero-Friction Context)
        setTimeout(() => {
          const state = get();
          const assets = state.assets;
          let aiResponse = { role: 'ai', content: '' };
          
          // 1. Check for command overrides
          if (prompt.toLowerCase().includes('clear') || prompt.toLowerCase().includes('reset')) {
            set({ chatHistory: [], isThinking: false });
            return;
          }

          // 2. Dynamic Asset NLP (No hardcoding)
          const availableKeys = Object.keys(assets);
          let targetAsset = null;
          let targetAssetKey = null;

          for (const key of availableKeys) {
            // Strip suffixes to match conversational prompts (e.g., "RELIANCE.NS" -> "RELIANCE", "BTC-USD" -> "BTC")
            const tickerToken = key.split('-')[0].split('.')[0].toLowerCase();
            if (prompt.toLowerCase().includes(tickerToken) || prompt.toLowerCase().includes(key.toLowerCase())) {
              targetAsset = assets[key];
              targetAssetKey = key;
              break;
            }
          }

            if (targetAsset) {
            const formattedPrice = targetAsset.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            
            let summary = '';
            
            const regimeText = targetAsset.macroRegime === 'TRENDING' ? 'a strong trending regime' : 
                               targetAsset.macroRegime === 'MEAN_REVERTING' ? 'a mean-reverting regime' : 
                               'a random-walk/flat regime';
                               
            if (targetAsset.flowBias.includes('SELL')) {
              summary = `${targetAssetKey} exhibits ${regimeText}. Institutional order flow indicates aggressive distribution at current levels.`;
            } else if (targetAsset.flowBias.includes('BUY')) {
              summary = `${targetAssetKey} exhibits ${regimeText}. Institutional order flow indicates accumulation at current levels.`;
            } else if (targetAsset.flowBias.includes('UNAVAILABLE')) {
              summary = `${targetAssetKey} exhibits ${regimeText}. Order flow telemetry is unavailable for this sector, relying on price-action shield.`;
            } else {
              summary = `${targetAssetKey} exhibits ${regimeText}. Institutional order flow is mixed (NEUTRAL). Capital preservation recommended unless structural edge triggers.`;
            }
            
            aiResponse.content = summary;
            
            // Generate a Smart UI Card for actionable edges (Long or Short)
            if (targetAsset.flowBias.includes('BUY') || (targetAsset.macroRegime === 'TRENDING' && !targetAsset.shieldTriggered)) {
              aiResponse.uiComponent = 'TRADE_CARD';
              aiResponse.tradeData = {
                asset: targetAssetKey,
                side: 'LONG',
                price: formattedPrice,
                kellySize: targetAsset.recommendedSize
              };
            } else if (targetAsset.flowBias.includes('SELL')) {
              aiResponse.uiComponent = 'TRADE_CARD';
              aiResponse.tradeData = {
                asset: targetAssetKey,
                side: 'SHORT',
                price: formattedPrice,
                kellySize: targetAsset.recommendedSize
              };
            }
          } else {
            const availableList = availableKeys.length > 0 
              ? availableKeys.map(k => k.split('-')[0].split('.')[0]).join(', ') 
              : 'None (Awaiting Node Sync)';
            aiResponse.content = `[SYSTEM] Command unparseable or asset not found in active data stream.\nCurrently buffering: ${availableList}.`;
          }

          set((state) => ({
            chatHistory: [...state.chatHistory, aiResponse],
            isThinking: false
          }));
        }, 800); // 800ms synthetic processing time for MVP
      },
      
      logout: () => {
        set({ isAuthenticated: false, token: null, assets: {}, wsStatus: 'DISCONNECTED', chatHistory: [] });
      }
    }),
    {
      name: 'ghosttrade-auth-storage',
      partialize: (state) => ({ 
        isAuthenticated: state.isAuthenticated, 
        token: state.token,
        chatHistory: state.chatHistory
      }),
    }
  )
);

export default useGhostStore;
