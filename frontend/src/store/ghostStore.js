import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const useGhostStore = create(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      token: null,
      email: null,
      role: 'trader',
      promptsUsed: 0,
      isSimpleMode: false,
      wsStatus: 'DISCONNECTED',
      
      syncSubscription: async (planId) => {
        // Optimistically update the role instantly to prevent route race conditions
        set({ role: planId });
        const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        try {
          const res = await fetch(`${baseUrl}/api/auth/paddle-sync`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${get().token}` 
            },
            body: JSON.stringify({ role: planId })
          });
          const data = await res.json();
          if (data.token && data.role) {
            set({ role: data.role, token: data.token });
          }
        } catch (e) {
          console.error('[SYNC] Failed to sync subscription', e);
        }
      },
      assets: {}, // { 'BTC-USD': { score: 50, flowBias: 'NEUTRAL', kellySize: 10, ... } }
      
      // --- Execution State ---
      executionMode: 'PAPER',
      connectedBrokers: [],
      globalMarkets: null,

      // --- Broker Management ---
      fetchBrokerStatus: async () => {
        try {
          const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
          const res = await fetch(`${baseUrl}/api/broker/status`, {
            headers: { 'Authorization': `Bearer ${get().token}` }
          });
          const data = await res.json();
          set({ connectedBrokers: data.brokers || [] });
          return data;
        } catch (e) {
          console.error('[BROKER] Failed to fetch broker status:', e);
          return { brokers: [] };
        }
      },

      connectBroker: async ({ broker, apiKey, apiSecret, accountId, isPaper }) => {
        try {
          const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
          const res = await fetch(`${baseUrl}/api/broker/keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${get().token}` },
            body: JSON.stringify({ broker, apiKey, apiSecret, accountId, isPaper })
          });
          const data = await res.json();
          if (data.success) {
            await get().fetchBrokerStatus();
          }
          return data;
        } catch (e) {
          return { success: false, error: e.message };
        }
      },

      disconnectBroker: async (broker) => {
        try {
          const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
          await fetch(`${baseUrl}/api/broker/keys/${broker}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${get().token}` }
          });
          set({ executionMode: 'PAPER' });
          await get().fetchBrokerStatus();
        } catch (e) {
          console.error('[BROKER] Disconnect failed:', e);
        }
      },

      setExecutionMode: async (mode) => {
        try {
          const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
          const res = await fetch(`${baseUrl}/api/execution/mode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${get().token}` },
            body: JSON.stringify({ mode })
          });
          const data = await res.json();
          set({ executionMode: data.mode || 'PAPER' });
          return data;
        } catch (e) {
          set({ executionMode: 'PAPER' });
          return { mode: 'PAPER' };
        }
      },

      fetchMarketStatus: async () => {
        try {
          const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
          const res = await fetch(`${baseUrl}/api/markets`);
          const data = await res.json();
          set({ globalMarkets: data });
          return data;
        } catch (e) {
          return null;
        }
      toggleSimpleMode: () => set((state) => ({ isSimpleMode: !state.isSimpleMode })),

      // --- Paper Trading State ---
      activePaperTrades: [],
      closedPaperTrades: [],
      
      // --- Audit State ---
      promptLogs: [],
      aiSignals: [],
      systemPerformance: null,


      initAuditData: async () => {
        try {
          const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
          const res = await fetch(`${baseUrl}/api/audit`, {
            headers: { 'Authorization': `Bearer ${get().token}` }
          });
          const data = await res.json();
          if (res.ok) {
            set({
              activePaperTrades: data.activePaperTrades || [],
              closedPaperTrades: data.closedPaperTrades || [],
              promptLogs: data.promptLogs || [],
              aiSignals: data.aiSignals || [],
              systemPerformance: data.systemPerformance || null
            });
          }
        } catch (e) {
          console.error("Failed to load audit data from DB:", e);
        }
      },

      executeTrade: async (tradeData) => {
        const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        try {
          const res = await fetch(`${baseUrl}/api/execution/trade`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${get().token}` },
            body: JSON.stringify({
              asset: tradeData.asset,
              side: tradeData.side || 'BUY',
              entryPrice: tradeData.entryPrice,
              stopLoss: tradeData.stopLoss,
              takeProfit: tradeData.takeProfit,
              accountBalance: 100000,
              regime: tradeData.regime || 'TRENDING',
              mode: get().executionMode || 'PAPER'
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            const newTrade = {
              ...tradeData,
              id: data.tradeId || `trade_${Date.now()}`,
              status: 'OPEN',
              mode: data.mode,
              quantity: data.quantity,
              executedAt: new Date().toISOString()
            };
            set((state) => ({
              activePaperTrades: [...state.activePaperTrades, newTrade]
            }));
            return { success: true, data };
          }
          return { success: false, reason: data.reason || data.error };
        } catch (e) {
          console.error("Failed to execute trade via engine:", e);
          return { success: false, reason: e.message };
        }
      },

      approveTrade: async (tradeId) => {
        let tradeToApprove = null;
        set((state) => {
          tradeToApprove = state.activePaperTrades.find(t => t.id === tradeId);
          if (!tradeToApprove) return state;
          
          return {
            activePaperTrades: state.activePaperTrades.map(t => 
              t.id === tradeId ? { ...t, status: 'OPEN', executedAt: new Date().toISOString() } : t
            )
          };
        });
        
        if (tradeToApprove) {
          try {
            const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
            await fetch(`${baseUrl}/api/audit/trade/${tradeId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${get().token}` },
              body: JSON.stringify({ status: 'OPEN', executedAt: new Date().toISOString() })
            });
          } catch (e) {
            console.error("Failed to sync approve to DB:", e);
          }
        }
      },

      cancelTrade: async (tradeId) => {
        let tradeToCancel = null;
        set((state) => {
          tradeToCancel = state.activePaperTrades.find(t => t.id === tradeId);
          if (!tradeToCancel) return state;
          
          return {
            activePaperTrades: state.activePaperTrades.filter(t => t.id !== tradeId),
            closedPaperTrades: [...state.closedPaperTrades, { ...tradeToCancel, status: 'CANCELLED', closedAt: new Date().toISOString() }]
          };
        });
        
        if (tradeToCancel) {
          try {
            const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
            await fetch(`${baseUrl}/api/audit/trade/${tradeId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${get().token}` },
              body: JSON.stringify({ status: 'CANCELLED', closedAt: new Date().toISOString() })
            });
          } catch (e) {
            console.error("Failed to sync cancel to DB:", e);
          }
        }
      },
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
            set({ isAuthenticated: true, token: data.token, email: data.email, role: data.role || 'trader', promptsUsed: data.promptsUsed || 0 });
            get().connectWebSocket(data.token);
            get().initAuditData(); // Fetch global DB on login
            get().fetchBrokerStatus(); // Fetch connected brokers
            get().fetchMarketStatus(); // Fetch global market status
            return { success: true, message: 'Authentication successful.' };
          }
          
          return { success: false, message: data.error || 'Authentication failed.' };
        } catch (e) {
          console.error('Auth request failed:', e);
          return { success: false, message: 'Network error. Could not reach authentication server.' };
        }
      },

      connectWebSocket: (tokenArg, retryCount = 0) => {
        const token = tokenArg || get().token;
        if (!token) {
          console.warn('[WS] No token available for WebSocket connection');
          return;
        }
        set({ wsStatus: 'CONNECTING' });
        
        // Dynamically resolve WebSocket URL (wss:// for https://, ws:// for http://)
        const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        const wsUrl = baseUrl.replace(/^http/, 'ws') + `?token=${token}`;
        
        const ws = new WebSocket(wsUrl);
        
        ws.onopen = () => set({ wsStatus: 'CONNECTED' });
        ws.onclose = () => {
          set({ wsStatus: 'DISCONNECTED' });
          // Exponential backoff reconnect logic (max 30 seconds)
          const backoff = Math.min(1000 * Math.pow(2, retryCount), 30000);
          console.log(`[WS] Disconnected. Reconnecting in ${backoff/1000}s...`);
          setTimeout(() => {
            if (get().isAuthenticated) get().connectWebSocket(get().token, retryCount + 1);
          }, backoff);
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'GHOST_BRAIN_UPDATE') {
              // data.payload is array of enriched asset results from the Global Scanner
              // Each asset now includes signalData and tradeCard (pre-computed for all traders)
              const newAssets = {};
              let withSignals = 0;
              data.payload.forEach(asset => {
                 newAssets[asset.ticker] = asset;
                 if (asset.signalData && asset.signalData.action !== 'NO_SIGNAL') withSignals++;
              });
              
              set((state) => {
                return { 
                  assets: { ...state.assets, ...newAssets }
                };
              });
              
              console.log(`[GHOST BRAIN] Global cache update: ${Object.keys(newAssets).length} assets | ${withSignals} with signals`);
            } else if (data.type === 'AUDIT_UPDATE') {
              console.log('[GHOST BRAIN] Audit update received. Refreshing audit data...');
              get().initAuditData();
            }
          } catch (e) {
            console.error('WS Parse Error', e);
          }
        };
      },
      // --- AI Chat Logic ---
      chatHistory: [],
      isThinking: false,
      clearChat: () => set({ chatHistory: [], isThinking: false }),

      sendPrompt: async (promptData) => {
        const { text, imageBase64, market, language } = typeof promptData === 'string' 
          ? { text: promptData, imageBase64: null, market: 'Global', language: 'English' } 
          : promptData;

        // 1. Check for command overrides
        if (text.toLowerCase().includes('clear') || text.toLowerCase().includes('reset')) {
          set({ chatHistory: [], isThinking: false });
          return;
        }

        // 2. Add user prompt to history
        set((state) => ({
          chatHistory: [...state.chatHistory, { role: 'user', content: text, imageBase64: imageBase64 }],
          isThinking: true
        }));

        const aiMessageId = Date.now();
        set((state) => ({
          chatHistory: [...state.chatHistory, { id: aiMessageId, role: 'ai', content: '', isGenerating: true }]
        }));

        const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        const token = get().token;
        const wsUrl = baseUrl.replace(/^http/, 'ws') + `/api/chat/stream${token ? `?token=${token}` : ''}`;
        
        const chatWs = new WebSocket(wsUrl);
        let accumulatedContent = '';
        let streamBuffer = ''; // Buffer for broken JSON chunks

        chatWs.onopen = () => {
          chatWs.send(JSON.stringify({ 
             type: 'START_ANALYSIS', 
             prompt: `[Context: Market Region = ${market || 'Global'}]\n${text}`, 
             image: imageBase64,
             language: language || 'English',
             isSimpleMode: get().isSimpleMode
          }));
        };

        chatWs.onmessage = (event) => {
          streamBuffer += event.data;
          let data;
          
          try {
            data = JSON.parse(streamBuffer);
            streamBuffer = ''; // Clear buffer on successful parse
          } catch (e) {
            // Incomplete JSON chunk, wait for the next message to complete it
            return;
          }
          
          try {
            if (data.status === 'update') {
               accumulatedContent += data.text;
               set((state) => ({
                 chatHistory: state.chatHistory.map(msg => 
                    msg.id === aiMessageId ? { ...msg, content: accumulatedContent } : msg
                 ),
                 isThinking: false
               }));
            } else if (data.status === 'trade_card') {
               set((state) => ({
                 chatHistory: state.chatHistory.map(msg => 
                    msg.id === aiMessageId ? { ...msg, uiComponent: 'TRADE_CARD', tradeData: data.tradeData } : msg
                 )
               }));
            } else if (data.status === 'complete') {
               chatWs.close();
               set(state => ({ 
                 promptsUsed: state.promptsUsed + 1,
                 chatHistory: state.chatHistory.map(msg => 
                    msg.id === aiMessageId ? { ...msg, isGenerating: false } : msg
                 )
               }));
               
               const finalMessage = get().chatHistory.find(m => m.id === aiMessageId);
               const newPromptLog = {
                 id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                 timestamp: new Date().toISOString(),
                 prompt: text,
                 resultType: finalMessage.uiComponent === 'TRADE_CARD' ? 'TRADE_CARD' : 'TEXT',
                 aiOutput: finalMessage.content,
                 priceAtTime: data.priceAtTime || null
               };
               set(state => ({ promptLogs: [...state.promptLogs, newPromptLog] }));
               
               fetch(`${baseUrl}/api/audit/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${get().token}` },
                body: JSON.stringify(newPromptLog)
              }).catch(e => console.error("Failed to sync prompt audit:", e));
            } else if (data.status === 'error') {
               if (data.message === 'FREE_TRIAL_EXCEEDED') {
                 set(state => ({ 
                   promptsUsed: 3, 
                   isThinking: false,
                   chatHistory: state.chatHistory.map(msg => 
                      msg.id === aiMessageId ? { ...msg, isGenerating: false } : msg
                   )
                 }));
                 chatWs.close();
                 return;
               }
               accumulatedContent += `\n\n[SYSTEM ERROR] ${data.message}`;
               set((state) => ({
                 chatHistory: state.chatHistory.map(msg => 
                    msg.id === aiMessageId ? { ...msg, content: accumulatedContent, isGenerating: false } : msg
                 ),
                 isThinking: false
               }));
               chatWs.close();
            }
          } catch (e) {
             console.error('Chat Stream Parse Error', e);
          }
        };

        chatWs.onerror = () => {
           set((state) => ({
                 chatHistory: state.chatHistory.map(msg => 
                    msg.id === aiMessageId ? { ...msg, content: accumulatedContent + "\n\n[SYSTEM ERROR] Failed to connect to analysis engine.", isGenerating: false } : msg
                 ),
                 isThinking: false
           }));
        };
      },
      
      logout: () => {
        set({ isAuthenticated: false, token: null, email: null, role: 'trader', promptsUsed: 0, assets: {}, wsStatus: 'DISCONNECTED', chatHistory: [], activePaperTrades: [], closedPaperTrades: [], promptLogs: [] });
      }
    }),
    {
      name: 'ghosttrade-auth', // storage key
      storage: createJSONStorage(() => sessionStorage), // === SECURITY: Move from localStorage to sessionStorage ===
      partialize: (state) => ({
        // Only persist auth credentials — all other state is fetched fresh from DB
        isAuthenticated: state.isAuthenticated,
        token: state.token,
        email: state.email,
        role: state.role,
        promptsUsed: state.promptsUsed,
        isSimpleMode: state.isSimpleMode
      }),
    }
  )
);

export default useGhostStore;
