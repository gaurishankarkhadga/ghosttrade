import fetch from 'node-fetch';
import WebSocket from 'ws';

const EMAIL = "ggs699000@gmail.com";
const PASSWORD = "Gshankar@413";
const API_URL = "http://localhost:5000";

async function startAutoTrader() {
  console.log(`[AUTO-TRADER] Logging in as ${EMAIL}...`);
  
  let loginRes;
  try {
    loginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    });
  } catch (err) {
    console.error(`[AUTO-TRADER] Login request failed:`, err.message);
    process.exit(1);
  }

  const loginData = await loginRes.json();
  if (!loginRes.ok) {
    console.error(`[AUTO-TRADER] Login failed:`, loginData);
    process.exit(1);
  }

  const token = loginData.token;
  const userEmail = loginData.email;
  console.log(`[AUTO-TRADER] Login successful. User: ${userEmail}`);

  const WS_URL = `ws://localhost:5000/?token=${token}`;
  console.log(`[AUTO-TRADER] Connecting to WebSocket...`);
  const ws = new WebSocket(WS_URL);

  const executedTrades = new Set(); 

  ws.on('open', () => {
    console.log(`[AUTO-TRADER] WebSocket connected! Listening for GhostTrade v3.0 GHOST_BRAIN_UPDATE signals...`);
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      
      if (msg.type === 'GHOST_BRAIN_UPDATE') {
        const assets = msg.payload; 
        
        for (const assetData of Object.values(assets)) {
          if (!assetData) continue;
          
          if (assetData.status === 'success' && assetData.tradeCard && !assetData.tradeCard.signalBlocked) {
            const side = assetData.tradeCard.side;
            const { stopLoss, takeProfit } = assetData.tradeCard;
            const currentPrice = assetData.currentPrice;
            const score = assetData.tradeCard.signalScore;
            const assetName = assetData.tradeCard.asset || assetData.ticker;

            const tradeId = `${assetName}-${side}-${currentPrice}`;
            if (executedTrades.has(tradeId)) continue;
            executedTrades.add(tradeId);

            console.log(`\n[AUTO-TRADER] 🚨 ACTIONABLE SIGNAL FOUND: ${assetName} ${side} @ ${currentPrice} (Score: ${score})`);
            console.log(`[AUTO-TRADER] ⚡ Executing Trade automatically using user credentials...`);
            
            const execRes = await fetch(`${API_URL}/api/execution/trade`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                asset: assetName,
                side,
                entryPrice: currentPrice,
                stopLoss,
                takeProfit,
                accountBalance: 10000, 
                regime: assetData.tradeCard.regime || 'UNKNOWN',
                mode: 'PAPER' 
              })
            });

            const execData = await execRes.json();
            if (execRes.ok) {
              console.log(`[AUTO-TRADER] ✅ TRADE EXECUTED SUCCESSFULLY:`, execData);
            } else {
              console.error(`[AUTO-TRADER] ❌ TRADE REJECTED:`, execData);
            }
          }
        }
      }
    } catch (err) { }
  });

  ws.on('close', () => {
    console.log(`[AUTO-TRADER] WebSocket closed. Reconnecting in 5s...`);
    setTimeout(startAutoTrader, 5000);
  });
}

startAutoTrader();
