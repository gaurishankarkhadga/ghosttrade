import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:5000');

ws.on('open', () => {
  console.log("Connected to WS. Requesting Deep Scan...");
  ws.send(JSON.stringify({
    text: "Execute Deep Scan across all quantitative regimes [Market Region = Crypto]",
    language: "English"
  }));
});

let messageCount = 0;
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.status === 'update') {
    process.stdout.write(msg.text);
    messageCount++;
  } else if (msg.status === 'complete') {
    console.log("\nDeep Scan Complete. Total messages:", messageCount);
    ws.close();
  } else if (msg.error) {
    console.error("Error:", msg.error);
    ws.close();
  }
});

ws.on('error', (err) => console.error("WS Error:", err));
ws.on('close', () => console.log("Connection closed."));

setTimeout(() => {
    console.log("Timeout. Closing...");
    ws.close();
}, 25000);
