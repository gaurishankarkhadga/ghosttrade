import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import cors from '@fastify/cors';
import jwt from 'jsonwebtoken';

// Import our existing Ghost Brain daemon
import { runBulkScanPhase4 } from './scannerEngine.js';
import { startWebSocketPipeline } from './websocketEngine.js';

const JWT_SECRET = 'ghost-brain-institutional-secret-key-0x123';
const ACCESS_CODE = 'whalesonly'; // Simple initial auth code
const fastify = Fastify({ logger: false });

fastify.register(cors, { origin: '*' });
fastify.register(fastifyWebsocket);

const connectedClients = new Set();
let isBrainRunning = false;

// Authenticate and issue JWT
fastify.post('/api/auth/login', async (request, reply) => {
    const { password } = request.body;
    if (password === ACCESS_CODE) {
        const token = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '24h' });
        return reply.send({ token });
    }
    return reply.code(401).send({ error: 'Unauthorized' });
});

// Broadcast latest Ghost Brain math to all authenticated frontend clients
function broadcast(payload) {
    const message = JSON.stringify({ type: 'GHOST_BRAIN_UPDATE', payload });
    for (const client of connectedClients) {
        if (client.readyState === 1) { // OPEN
            client.send(message);
        }
    }
}

// The Ghost Brain Execution Loop (Multi-Market: Crypto + NSE)
async function runGhostBrainLoop() {
    if (isBrainRunning) return;
    isBrainRunning = true;
    
    console.log('[DAEMON] Starting Ghost Brain Multi-Market Backend Loop (Binance + NSE)...');
    
    // Start WebSocket for Crypto level 2 depth
    await startWebSocketPipeline(['BTC-USD', 'ETH-USD', 'SOL-USD']);
    
    // Combined multi-market ticker array
    const activeWatchlist = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'RELIANCE.NS', 'TCS.NS', 'INFY.NS'];

    setInterval(async () => {
        if (connectedClients.size === 0) return; // Don't burn CPU if no UI is watching
        try {
            const results = await runBulkScanPhase4(activeWatchlist);
            broadcast(results);
        } catch (e) {
            console.error('[DAEMON] Loop error:', e.message);
        }
    }, 3000); // Compute every 3 seconds for safe rate limits
}

// Secure WebSocket endpoint for the React UI
fastify.register(async function (fastify) {
    fastify.get('/', { websocket: true }, (socket, req) => {
        const token = req.query.token;
        try {
            jwt.verify(token, JWT_SECRET);
        } catch (e) {
            socket.close(1008, 'Unauthorized');
            return;
        }

        connectedClients.add(socket);
        console.log(`[WS] Client Connected. Total viewers: ${connectedClients.size}`);
        
        // Start the engine if it's the first client
        runGhostBrainLoop();

        socket.on('close', () => {
            connectedClients.delete(socket);
            console.log(`[WS] Client Disconnected. Total viewers: ${connectedClients.size}`);
        });
    });
});

const start = async () => {
    try {
        await fastify.listen({ port: 5000, host: '0.0.0.0' });
        console.log('🚀 Fastify Server listening on http://localhost:5000');
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
