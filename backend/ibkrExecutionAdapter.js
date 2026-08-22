// =====================================================
// IBKR EXECUTION ADAPTER — Global 170+ Market Trading
// Interactive Brokers Web API (OAuth 2.0)
// Single adapter for NYSE, LSE, TSE, HKEX, NSE, ASX, etc.
// =====================================================

import { BaseBrokerAdapter, registerAdapter } from './brokerAdapter.js';

const IBKR_BASE_URL = 'https://api.ibkr.com/v1/api';

const EXCHANGE_MAP = {
  '.NS': 'NSE', '.BO': 'BSE', '.L': 'LSE', '.T': 'TSEJ',
  '.HK': 'SEHK', '.DE': 'IBIS', '.AX': 'ASX', '.KS': 'KSE',
  '.TO': 'TSE', '.SA': 'BOVESPA', '.PA': 'SBF', '.AS': 'AEB',
  '.SI': 'SGX', '.MI': 'BVME', '.SW': 'EBS', '.ST': 'SFB',
};

export class IBKRAdapter extends BaseBrokerAdapter {
  constructor(credentials = {}) {
    super('IBKR', credentials);
    this.clientId = credentials.apiKey || '';
    this.clientSecret = credentials.apiSecret || '';
    this.accessToken = null;
    this.accountId = credentials.accountId || '';
  }

  async _request(method, endpoint, body = null) {
    if (!this.accessToken) throw new Error('IBKR: Not authenticated.');
    const url = `${IBKR_BASE_URL}${endpoint}`;
    const options = {
      method,
      headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
    };
    if (body && method !== 'GET') options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`IBKR ${response.status}: ${await response.text()}`);
    if (response.status === 204) return {};
    return response.json();
  }

  async authenticate() {
    if (!this.clientId || !this.clientSecret) {
      return { success: false, message: 'IBKR Client ID and Secret required.' };
    }
    try {
      const response = await fetch('https://api.ibkr.com/v1/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.clientId, client_secret: this.clientSecret }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return { success: false, message: `IBKR OAuth failed (${response.status})` };
      const tokenData = await response.json();
      this.accessToken = tokenData.access_token;
      this.isAuthenticated = true;
      return { success: true, message: `IBKR authenticated. 170+ global markets enabled.` };
    } catch (err) {
      return { success: false, message: `IBKR auth failed: ${err.message}` };
    }
  }

  resolveSymbol(ghostTicker) {
    if (!ghostTicker) return null;
    const upper = ghostTicker.toUpperCase().trim();
    for (const [suffix, exchange] of Object.entries(EXCHANGE_MAP)) {
      if (upper.endsWith(suffix.toUpperCase())) {
        return { symbol: upper.replace(suffix.toUpperCase(), ''), exchange };
      }
    }
    if (upper.includes('-USD')) return { symbol: upper.replace('-USD', ''), exchange: 'SMART' };
    return { symbol: upper, exchange: 'SMART' };
  }

  async placeOrder(order) {
    if (!this.isAuthenticated) {
      const auth = await this.authenticate();
      if (!auth.success) return { success: false, orderId: null, filledPrice: 0, message: auth.message };
    }
    const resolved = this.resolveSymbol(order.symbol);
    try {
      const search = await this._request('GET', `/iserver/secdef/search?symbol=${resolved.symbol}&exchange=${resolved.exchange}`);
      if (!search || !search[0]) return { success: false, orderId: null, filledPrice: 0, message: `Contract not found: ${resolved.symbol}` };
      const orderBody = {
        acctId: this.accountId, conid: search[0].conid,
        orderType: (order.type || 'MKT').toUpperCase() === 'MARKET' ? 'MKT' : 'LMT',
        side: order.side.toUpperCase(), quantity: order.quantity, tif: 'DAY',
      };
      if (orderBody.orderType === 'LMT' && order.price) orderBody.price = order.price;
      const result = await this._request('POST', `/iserver/account/${this.accountId}/orders`, { orders: [orderBody] });
      return { success: true, orderId: String(result?.[0]?.order_id || 'IBKR_' + Date.now()), filledPrice: 0, status: 'SUBMITTED', message: `IBKR order for ${resolved.symbol} on ${resolved.exchange}` };
    } catch (err) {
      return { success: false, orderId: null, filledPrice: 0, message: `IBKR order failed: ${err.message}` };
    }
  }

  async getBalance() {
    try {
      const s = await this._request('GET', `/portfolio/${this.accountId}/summary`);
      return { balance: s?.totalcashvalue?.amount || 0, currency: s?.totalcashvalue?.currency || 'USD', buyingPower: s?.buyingpower?.amount || 0 };
    } catch { return { balance: 0, currency: 'USD', buyingPower: 0 }; }
  }

  async getOrderStatus(orderId) {
    try {
      const orders = await this._request('GET', '/iserver/account/orders');
      const o = orders?.orders?.find(x => String(x.orderId) === String(orderId));
      return o ? { status: o.status, filledQty: o.filledQuantity || 0, avgPrice: o.avgPrice || 0 } : { status: 'NOT_FOUND', filledQty: 0, avgPrice: 0 };
    } catch { return { status: 'ERROR', filledQty: 0, avgPrice: 0 }; }
  }

  async cancelOrder(orderId) {
    try { await this._request('DELETE', `/iserver/account/${this.accountId}/order/${orderId}`); return { success: true, message: `Cancelled ${orderId}` }; }
    catch (err) { return { success: false, message: err.message }; }
  }

  async getPositions() {
    try {
      const p = await this._request('GET', `/portfolio/${this.accountId}/positions/0`);
      return (p || []).map(x => ({ symbol: x.contractDesc || 'UNKNOWN', qty: x.position || 0, avgEntry: x.avgCost || 0, currentPrice: x.mktPrice || 0, pnl: x.unrealizedPnl || 0, exchange: x.listingExchange || 'SMART' }));
    } catch { return []; }
  }
}

registerAdapter('IBKR', IBKRAdapter);
