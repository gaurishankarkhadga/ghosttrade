import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

const token = jwt.sign({email: 'test@ghosttrade.com', role: 'admin'}, 'GHOST_TRADE_JWT_SECRET_KEY_998877_PROD', {expiresIn: '7d'});
fetch('http://localhost:5000/api/broker/status', {
    headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json()).then(console.log).catch(console.error);
