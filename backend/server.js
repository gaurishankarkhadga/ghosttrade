import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import cors from '@fastify/cors';
import jwt from 'jsonwebtoken';

// Import our existing Ghost Brain daemon
import { runBulkScanPhase4 } from './scannerEngine.js';
import { startWebSocketPipeline, liveMemoryState } from './websocketEngine.js';

const JWT_SECRET = 'ghost-brain-institutional-secret-key-0x123';
const ACCESS_CODE = 'whalesonly'; // Simple initial auth code
const fastify = Fastify({ logger: false });

fastify.register(cors, { 
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept']
});
fastify.register(fastifyWebsocket);

const connectedClients = new Set();
let isBrainRunning = false;

// In-Memory User Database (Deep Auth System)
const memoryDb = {
    users: [
        { email: 'trader@ghosttrade.io', password: 'whalesonly', role: 'admin' }
    ]
};

// Deeper Authenticate & Issue JWT (Login)
fastify.post('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body;
    
    const user = memoryDb.users.find(u => 
        (u.email === email && u.password === password) || password === ACCESS_CODE
    );

    if (user || password === ACCESS_CODE) {
        const token = jwt.sign({ authenticated: true, email: email || 'demo_user' }, JWT_SECRET, { expiresIn: '24h' });
        return reply.send({ token, email: user?.email || 'demo_user' });
    }
    
    return reply.code(401).send({ error: 'Invalid credentials. Access Denied.' });
});

// Deeper Authenticate & Issue JWT (Sign Up)
fastify.post('/api/auth/signup', async (request, reply) => {
    const { name, email, password } = request.body;

    if (!email || !password) {
        return reply.code(400).send({ error: 'Email and password are required.' });
    }

    const existingUser = memoryDb.users.find(u => u.email === email);
    if (existingUser) {
        return reply.code(409).send({ error: 'Account with this email already exists.' });
    }

    // Register user in memory
    memoryDb.users.push({ name, email, password, role: 'trader' });

    const token = jwt.sign({ authenticated: true, email }, JWT_SECRET, { expiresIn: '24h' });
    return reply.send({ token, email, name });
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

    // Give Binance TCP streams time to populate the zero-latency memory buffers dynamically
    console.log('[DAEMON] Waiting for initial order flow telemetry buffer to fill...');
    for (let i = 0; i < 15; i++) {
        const btcTrades = liveMemoryState.aggTrades['BTC-USD'];
        if (btcTrades && btcTrades.length > 0) {
            console.log(`[DAEMON] Telemetry buffer filled (${btcTrades.length} trades). Proceeding to initial scan.`);
            break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    // Run initial scan immediately after buffer fills so connected client gets data instantly
    try {
        console.log('[DAEMON] Executing initial multi-market scan...');
        const initialResults = await runBulkScanPhase4(activeWatchlist);
        broadcast(initialResults);
    } catch (e) {
        console.error('[DAEMON] Initial scan error:', e.message);
    }

    // Run sequentially instead of overlapping setInterval
    while (true) {
        if (connectedClients.size > 0) {
            try {
                const results = await runBulkScanPhase4(activeWatchlist);
                broadcast(results);
            } catch (e) {
                console.error('[DAEMON] Loop error:', e.message);
            }
        }
        await new Promise(r => setTimeout(r, 3000));
    }
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
