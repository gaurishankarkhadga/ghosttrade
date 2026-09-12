const fs = require('fs');
// Let's write a small script to subscribe to WS and print 1 payload
import WebSocket from 'ws';

const WS_URL = `ws://localhost:5000/`;
const ws = new WebSocket(WS_URL);
ws.on('message', data => {
  const msg = JSON.parse(data);
  if (msg.type === 'GHOST_BRAIN_UPDATE') {
    console.log(JSON.stringify(msg.payload[0], null, 2));
    process.exit(0);
  }
});
