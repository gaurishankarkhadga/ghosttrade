import React, { useEffect, useRef, useState, memo } from 'react';

function TradingViewChart({ ticker, theme = 'dark', height = 300 }) {
  const containerRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Smart Parser for TradingView Symbols
  const getTvSymbol = (t) => {
    if (!t) return "BINANCE:BTCUSDT";
    let clean = t.toUpperCase().trim();

    // 1. If it already has a colon, assume it's properly formatted (e.g., BINANCE:BTCUSDT)
    if (clean.includes(':')) return clean;

    // 2. Handle Crypto (BTC-USD, BTCUSDT, BTC, JASMY-USD, etc.)
    if (clean.endsWith('-USD')) return "BINANCE:" + clean.replace('-USD', 'USDT');
    if (clean.endsWith('USDT')) return "BINANCE:" + clean;

    const cryptos = [
      'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'LINK', 'MATIC',
      'LTC', 'DOT', 'UNI', 'ATOM', 'NEAR', 'APT', 'ARB', 'OP', 'SUI', 'PEPE',
      'JASMY', 'SHIB', 'RENDER', 'FET', 'TAO', 'INJ', 'TIA', 'SEI', 'STX', 'FIL',
      'RUNE', 'AAVE', 'MKR', 'GRT', 'PENDLE', 'LDO', 'CRV', 'WIF', 'BONK', 'FLOKI',
      'STRK', '2Z'
    ];
    if (cryptos.includes(clean)) return "BINANCE:" + clean + "USDT";

    // 3. Handle Indian Stocks (RELIANCE.NS, TCS.BO, RELIANCE)
    if (clean.endsWith('.NS')) return "NSE:" + clean.replace('.NS', '');
    if (clean.endsWith('.BO')) return "BSE:" + clean.replace('.BO', '');
    
    const indianStocks = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK', 'LT', 'AXISBANK'];
    if (indianStocks.includes(clean)) return "NSE:" + clean;

    // 4. Handle US Stocks (AAPL, TSLA)
    const usStocks = ['AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META'];
    if (usStocks.includes(clean)) return "NASDAQ:" + clean;

    // 5. Generic Fallback: Let TradingView try to guess without an exchange prefix
    return clean; 
  };

  useEffect(() => {
    if (!containerRef.current) return;
    setIsLoaded(false);

    // Reset container DOM
    containerRef.current.innerHTML = '';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.height = '100%';
    widgetDiv.style.width = '100%';
    containerRef.current.appendChild(widgetDiv);

    // Embed modern TradingView Advanced Real-Time Chart widget (fully mobile-ready & popup-free)
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;

    const widgetConfig = {
      autosize: true,
      symbol: getTvSymbol(ticker),
      interval: "15",
      timezone: "Etc/UTC",
      theme: theme,
      style: "1",
      locale: "en",
      enable_publishing: false,
      backgroundColor: "rgba(15, 23, 42, 0.4)",
      gridColor: "rgba(255, 255, 255, 0.05)",
      hide_top_toolbar: true,
      hide_legend: true,
      hide_side_toolbar: true,
      save_image: false,
      allow_symbol_change: false,
      calendar: false,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
      disabled_features: [
        "popup_hints",
        "show_interval_dialog_on_key_press",
        "use_localstorage_for_settings",
        "header_resolutions",
        "edit_buttons_in_legend"
      ]
    };

    script.innerHTML = JSON.stringify(widgetConfig);

    script.onload = () => {
      setIsLoaded(true);
    };

    containerRef.current.appendChild(script);

    // Safety fallback to dismiss loading placeholder once iframe is mounted
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 1500);

    return () => {
      clearTimeout(timer);
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [ticker, theme]);

  return (
    <div style={{ height: height, width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', position: 'relative' }}>
      {!isLoaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13, background: 'rgba(15, 23, 42, 0.6)', zIndex: 1, pointerEvents: 'none' }}>
          Loading interactive chart for {ticker}...
        </div>
      )}
      <div 
        className="tradingview-widget-container" 
        ref={containerRef} 
        style={{ height: '100%', width: '100%' }} 
      />
    </div>
  );
}

export default memo(TradingViewChart);
