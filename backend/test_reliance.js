import { handleGeminiConnection } from './geminiEngine.js';

// Mock WebSocket
const ws = {
  send: (msg) => console.log('WS SEND:', msg)
};

async function test() {
  console.log('Testing RELIANCE.NS...');
  await handleGeminiConnection(ws, { prompt: 'RELIANCE', imageBase64: null, language: 'English' });
  console.log('Done');
}

test().catch(console.error);
