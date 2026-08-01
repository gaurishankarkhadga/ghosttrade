import WebSocket from 'ws';
const ws = new WebSocket('wss://stream.binance.com:9443/stream?streams=btcusdt@aggTrade');
ws.on('open', () => console.log('connected'));
ws.on('message', (data) => {
    console.log(data.toString());
    process.exit(0);
});
