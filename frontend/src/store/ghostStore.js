import { create } from 'zustand';

const useGhostStore = create((set, get) => ({
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
  
  logout: () => {
    set({ isAuthenticated: false, token: null, assets: {}, wsStatus: 'DISCONNECTED' });
  }
}));

export default useGhostStore;
