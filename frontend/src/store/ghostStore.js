import { create } from 'zustand';

const useGhostStore = create((set, get) => ({
  isAuthenticated: false,
  token: null,
  wsStatus: 'DISCONNECTED',
  assets: {}, // { 'BTC-USD': { score: 50, flowBias: 'NEUTRAL', kellySize: 10, ... } }
  
  login: async (password) => {
    try {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.token) {
        set({ isAuthenticated: true, token: data.token });
        get().connectWebSocket(data.token);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Login failed', e);
      return false;
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
  
  logout: () => {
    set({ isAuthenticated: false, token: null, assets: {}, wsStatus: 'DISCONNECTED' });
  }
}));

export default useGhostStore;
