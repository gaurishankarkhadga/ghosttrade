import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
const token = jwt.sign({ sub: 'trader@ghosttrade.io', email: 'trader@ghosttrade.io', role: 'trader', iss: 'ghosttrade', aud: 'ghosttrade-client' }, 'ghost-brain-dev-secret-CHANGE-IN-PROD-0xDEV', { expiresIn: '24h' });
const ws = new WebSocket('ws://localhost:5000/api/chat/stream?token=' + token, {
  origin: 'http://localhost:5173'
});
ws.on('open', () => { console.log('Connected'); ws.close(); });
ws.on('error', (err) => console.error('WS Error:', err.message));
ws.on('close', (code, reason) => console.log('Closed', code, reason.toString()));
ws.on('message', (msg) => console.log('Message:', msg.toString()));
