// =====================================================
// ALPACA EXECUTION ADAPTER — US Stock Live Trading
// Connects to Alpaca Markets REST API using the USER's
// own API key. Supports both Paper and Live trading.
//
// Alpaca provides:
// - $0 commission US stock trading
// - Paper trading mode with separate keys
// - REST + WebSocket APIs
// - Crypto trading (US-based)
//
// Base URLs:
// - Live:  https://api.alpaca.markets
// - Paper: https://paper-api.alpaca.markets
// =====================================================

import { BaseBrokerAdapter, registerAdapter } from './brokerAdapter.js';

const ALPACA_LIVE_URL = 'https://api.alpaca.markets';
const ALPACA_PAPER_URL = 'https://paper-api.alpaca.markets';

export class AlpacaAdapter extends BaseBrokerAdapter {
  constructor(credentials = {}) {
    super('ALPACA', credentials);
    this.apiKey = credentials.apiKey || '';
    this.apiSecret = credentials.apiSecret || '';
    // Alpaca has its own paper mode — separate from GhostTrade paper
    this.isPaperAccount = credentials.isPaper !== false; // Default to paper
    this.baseUrl = this.isPaperAccount ? ALPACA_PAPER_URL : ALPACA_LIVE_URL;
  }

  /**
   * Makes an authenticated request to Alpaca API.
   * Alpaca uses API key + secret in headers (simpler than Binance).
   */
  async _request(method, endpoint, body = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'APCA-API-KEY-ID': this.apiKey,
        'APCA-API-SECRET-KEY': this.apiSecret,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Alpaca API ${response.status}: ${errorBody}`);
    }

    // DELETE requests may return empty body
    if (response.status === 204) return {};
    return response.json();
  }

  // =====================================================
  // INTERFACE IMPLEMENTATION
  // =====================================================

  async authenticate() {
    if (!this.apiKey || !this.apiSecret) {
      return { success: false, message: 'Alpaca API key and secret are required.' };
    }

    try {
      const account = await this._request('GET', '/v2/account');

      if (account.id) {
        this.isAuthenticated = true;
        return {
          success: true,
          message: `Alpaca authenticated. Account: ${account.id} | Status: ${account.status} | Mode: ${this.isPaperAccount ? 'Paper' : 'Live'}`,
        };
      }

      return { success: false, message: 'Alpaca authentication failed — unexpected response.' };
    } catch (err) {
      this.lastError = err.message;
      return { success: false, message: `Alpaca authentication failed: ${err.message}` };
    }
  }

  resolveSymbol(ghostTicker) {
    if (!ghostTicker) return null;

    const upper = ghostTicker.toUpperCase().trim();

    // Remove Yahoo Finance suffixes that don't apply to Alpaca
    const cleaned = upper
      .replace('.NS', '')  // Indian suffix
      .replace('.BO', '')  // BSE suffix
      .replace('.L', '')   // London suffix
      .replace('.T', '')   // Tokyo suffix
      .replace('.HK', '')  // HK suffix
      .replace('.DE', '')  // German suffix
      .replace('.AX', '')  // Australian suffix
      .replace('.KS', '')  // Korean suffix
      .replace('.TO', '')  // Toronto suffix
      .replace('.SA', '')  // Brazil suffix
      .replace('.PA', '')  // Paris suffix
      .replace('.AS', '')  // Amsterdam suffix
      .replace('.SI', ''); // Singapore suffix

    // Crypto: Convert 'BTC-USD' → 'BTC/USD' (Alpaca crypto format)
    if (cleaned.includes('-USD')) {
      return cleaned.replace('-USD', '/USD');
    }

    return cleaned;
  }

  async placeOrder(order) {
    if (!this.isAuthenticated) {
      const auth = await this.authenticate();
      if (!auth.success) return { success: false, orderId: null, filledPrice: 0, message: auth.message };
    }

    const symbol = this.resolveSymbol(order.symbol);
    if (!symbol) {
      return { success: false, orderId: null, filledPrice: 0, message: `Cannot resolve symbol: ${order.symbol}` };
    }

    try {
      const orderBody = {
        symbol,
        qty: String(order.quantity),
        side: order.side.toLowerCase(), // Alpaca uses lowercase
        type: (order.type || 'market').toLowerCase(),
        time_in_force: 'day', // Day order (cancel at market close)
      };

      // Add price for limit orders
      if (orderBody.type === 'limit') {
        if (!order.price) {
          return { success: false, orderId: null, filledPrice: 0, message: 'Price is required for LIMIT orders.' };
        }
        orderBody.limit_price = String(order.price);
      }

      // Add stop loss if provided (Alpaca bracket order)
      if (order.stopLoss && order.takeProfit) {
        orderBody.order_class = 'bracket';
        orderBody.stop_loss = { stop_price: String(order.stopLoss) };
        orderBody.take_profit = { limit_price: String(order.takeProfit) };
      } else if (order.stopLoss) {
        orderBody.order_class = 'oto'; // One-Triggers-Other
        orderBody.stop_loss = { stop_price: String(order.stopLoss) };
      }

      const result = await this._request('POST', '/v2/orders', orderBody);

      console.log(`[ALPACA] Order placed: ${result.id} | ${symbol} ${order.side} | Status: ${result.status}`);

      return {
        success: true,
        orderId: result.id,
        filledPrice: parseFloat(result.filled_avg_price) || 0,
        status: result.status,
        message: `Alpaca order ${result.id} — ${result.status}`,
      };
    } catch (err) {
      console.error(`[ALPACA] Order failed for ${order.symbol}:`, err.message);
      return { success: false, orderId: null, filledPrice: 0, message: `Alpaca order failed: ${err.message}` };
    }
  }

  async getBalance() {
    try {
      const account = await this._request('GET', '/v2/account');

      return {
        balance: parseFloat(account.equity) || 0,
        currency: 'USD',
        buyingPower: parseFloat(account.buying_power) || 0,
        cash: parseFloat(account.cash) || 0,
        portfolioValue: parseFloat(account.portfolio_value) || 0,
      };
    } catch (err) {
      console.error('[ALPACA] Balance fetch failed:', err.message);
      return { balance: 0, currency: 'USD', buyingPower: 0 };
    }
  }

  async getOrderStatus(orderId) {
    try {
      const order = await this._request('GET', `/v2/orders/${orderId}`);

      return {
        status: order.status?.toUpperCase() || 'UNKNOWN',
        filledQty: parseFloat(order.filled_qty) || 0,
        avgPrice: parseFloat(order.filled_avg_price) || 0,
      };
    } catch (err) {
      return { status: 'ERROR', filledQty: 0, avgPrice: 0 };
    }
  }

  async cancelOrder(orderId) {
    try {
      await this._request('DELETE', `/v2/orders/${orderId}`);
      return { success: true, message: `Order ${orderId} cancelled.` };
    } catch (err) {
      return { success: false, message: `Cancel failed: ${err.message}` };
    }
  }

  async getPositions() {
    try {
      const positions = await this._request('GET', '/v2/positions');

      return positions.map(p => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty) || 0,
        avgEntry: parseFloat(p.avg_entry_price) || 0,
        currentPrice: parseFloat(p.current_price) || 0,
        pnl: parseFloat(p.unrealized_pl) || 0,
        pnlPercent: parseFloat(p.unrealized_plpc) || 0,
        side: p.side, // 'long' or 'short'
      }));
    } catch (err) {
      console.error('[ALPACA] Positions fetch failed:', err.message);
      return [];
    }
  }
}

// Auto-register with the factory
registerAdapter('ALPACA', AlpacaAdapter);
