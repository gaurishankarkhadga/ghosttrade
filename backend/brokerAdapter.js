// =====================================================
// BROKER ADAPTER — Universal Execution Abstraction Layer
// Defines the interface every broker must implement.
// Factory pattern creates the correct adapter at runtime.
//
// ARCHITECTURE:
// GhostTrade Signal → User Clicks Execute → BrokerAdapterFactory
//   → BinanceAdapter (Crypto)
//   → AlpacaAdapter (US Stocks)
//   → IBKRAdapter (170+ Global Markets)
//   → PaperAdapter (Simulation — default fallback)
//
// SAFETY: If any adapter fails to initialize, system falls
// back to PaperAdapter silently. Zero disruption to existing flow.
// =====================================================

/**
 * Base class for all broker adapters.
 * Every adapter MUST implement these methods.
 * Adapters that don't support a method should throw
 * a descriptive error rather than silently failing.
 */
export class BaseBrokerAdapter {
  constructor(brokerName, credentials = {}) {
    this.brokerName = brokerName;
    this.credentials = credentials;
    this.isAuthenticated = false;
    this.lastError = null;
  }

  /**
   * Validates credentials and establishes connection.
   * @returns {{ success: boolean, message: string }}
   */
  async authenticate() {
    throw new Error(`[${this.brokerName}] authenticate() not implemented`);
  }

  /**
   * Places an order on the exchange/broker.
   * @param {Object} order
   * @param {string} order.symbol — Ticker (e.g., 'BTCUSDT', 'AAPL')
   * @param {'BUY'|'SELL'} order.side
   * @param {'MARKET'|'LIMIT'} order.type
   * @param {number} order.quantity
   * @param {number} [order.price] — Required for LIMIT orders
   * @param {number} [order.stopLoss]
   * @param {number} [order.takeProfit]
   * @returns {{ success: boolean, orderId: string, filledPrice: number, message: string }}
   */
  async placeOrder(order) {
    throw new Error(`[${this.brokerName}] placeOrder() not implemented`);
  }

  /**
   * Fetches account balance / buying power.
   * @returns {{ balance: number, currency: string, buyingPower: number }}
   */
  async getBalance() {
    throw new Error(`[${this.brokerName}] getBalance() not implemented`);
  }

  /**
   * Gets the status of an existing order.
   * @param {string} orderId
   * @returns {{ status: string, filledQty: number, avgPrice: number }}
   */
  async getOrderStatus(orderId) {
    throw new Error(`[${this.brokerName}] getOrderStatus() not implemented`);
  }

  /**
   * Cancels an open order.
   * @param {string} orderId
   * @returns {{ success: boolean, message: string }}
   */
  async cancelOrder(orderId) {
    throw new Error(`[${this.brokerName}] cancelOrder() not implemented`);
  }

  /**
   * Gets current open positions.
   * @returns {Array<{ symbol: string, qty: number, avgEntry: number, currentPrice: number, pnl: number }>}
   */
  async getPositions() {
    throw new Error(`[${this.brokerName}] getPositions() not implemented`);
  }

  /**
   * Resolves a GhostTrade ticker to the broker's native symbol format.
   * e.g., 'BTC-USD' → 'BTCUSDT' (Binance) or 'BTC/USD' (Alpaca)
   * @param {string} ghostTicker — GhostTrade's internal ticker format
   * @returns {string} — Broker-native symbol
   */
  resolveSymbol(ghostTicker) {
    return ghostTicker; // Default: pass-through. Override in adapters.
  }
}

// =====================================================
// PAPER ADAPTER — Simulation (Existing Behavior)
// =====================================================

/**
 * Paper trading adapter. Logs trades to MongoDB paper_trades
 * collection without touching any real exchange.
 * This is the DEFAULT adapter — identical to existing behavior.
 */
export class PaperAdapter extends BaseBrokerAdapter {
  constructor() {
    super('PAPER', {});
    this.isAuthenticated = true; // Always "authenticated"
  }

  async authenticate() {
    return { success: true, message: 'Paper trading mode — no authentication required.' };
  }

  async placeOrder(order) {
    // Paper adapter doesn't actually place orders.
    // The execution engine handles DB logging for paper trades.
    return {
      success: true,
      orderId: `PAPER_${Date.now()}`,
      filledPrice: order.price || 0,
      message: 'Paper trade simulated successfully.',
    };
  }

  async getBalance() {
    return { balance: 100000, currency: 'USD', buyingPower: 100000 };
  }

  async getOrderStatus(orderId) {
    return { status: 'FILLED', filledQty: 0, avgPrice: 0 };
  }

  async cancelOrder(orderId) {
    return { success: true, message: 'Paper order cancelled.' };
  }

  async getPositions() {
    return [];
  }
}

// =====================================================
// ADAPTER FACTORY — Creates the right adapter
// =====================================================

// Registry of available adapters (populated by lazy imports)
const adapterRegistry = new Map();

/**
 * Registers a broker adapter class in the factory.
 * Called by each adapter module on import.
 * 
 * @param {string} brokerName — e.g., 'BINANCE', 'ALPACA', 'IBKR'
 * @param {typeof BaseBrokerAdapter} AdapterClass
 */
export function registerAdapter(brokerName, AdapterClass) {
  adapterRegistry.set(brokerName.toUpperCase(), AdapterClass);
  console.log(`[BROKER ADAPTER] Registered adapter: ${brokerName}`);
}

// Always register the Paper adapter
registerAdapter('PAPER', PaperAdapter);

/**
 * Creates a broker adapter instance for the given broker.
 * Falls back to PaperAdapter if the broker is unknown or fails.
 * 
 * @param {string} brokerName — e.g., 'BINANCE', 'ALPACA', 'IBKR', 'PAPER'
 * @param {Object} credentials — Decrypted API credentials
 * @returns {BaseBrokerAdapter}
 */
export function createAdapter(brokerName, credentials = {}) {
  const key = (brokerName || 'PAPER').toUpperCase();
  const AdapterClass = adapterRegistry.get(key);

  if (!AdapterClass) {
    console.warn(`[BROKER ADAPTER] Unknown broker "${key}". Falling back to PAPER mode.`);
    return new PaperAdapter();
  }

  try {
    return new AdapterClass(credentials);
  } catch (err) {
    console.error(`[BROKER ADAPTER] Failed to create ${key} adapter:`, err.message);
    console.warn(`[BROKER ADAPTER] Falling back to PAPER mode for safety.`);
    return new PaperAdapter();
  }
}

/**
 * Lists all registered broker adapters.
 * @returns {string[]}
 */
export function listRegisteredAdapters() {
  return Array.from(adapterRegistry.keys());
}

/**
 * Loads all available adapter modules.
 * Uses dynamic imports so missing adapters don't crash the system.
 */
export async function loadAllAdapters() {
  const adapterModules = [
    './binanceExecutionAdapter.js',
    './alpacaExecutionAdapter.js',
    './ibkrExecutionAdapter.js',
  ];

  for (const modulePath of adapterModules) {
    try {
      await import(modulePath);
    } catch (err) {
      // Non-fatal — adapter just won't be available
      console.warn(`[BROKER ADAPTER] Could not load ${modulePath}: ${err.message}`);
    }
  }

  console.log(`[BROKER ADAPTER] Loaded adapters: ${listRegisteredAdapters().join(', ')}`);
}
