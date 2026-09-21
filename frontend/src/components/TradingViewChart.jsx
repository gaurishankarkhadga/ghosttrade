import React, { useEffect, useRef, useState } from 'react';

export default function TradingViewChart({ ticker, theme = 'dark', height = 300 }) {
  const containerRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Smart Parser for TradingView Symbols
  const getTvSymbol = (t) => {
    if (!t) return "BINANCE:BTCUSDT";
    let clean = t.toUpperCase().trim();

    // 1. If it already has a colon, assume it's properly formatted (e.g., BINANCE:BTCUSDT)
    if (clean.includes(':')) return clean;

    // 2. Handle Crypto (BTC-USD, BTCUSDT, BTC)
    if (clean.endsWith('-USD')) return "BINANCE:" + clean.replace('-USD', 'USDT');
    if (clean.endsWith('USDT')) return "BINANCE:" + clean;
    const cryptos = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'LINK', 'MATIC', 'LTC', 'DOT', 'UNI', 'ATOM', 'NEAR', 'APT', 'ARB', 'OP', 'SUI', 'PEPE'];
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
    // E.g., if the AI passes "GOLD", TradingView will just search "GOLD"
    return clean; 
  };

  useEffect(() => {
    const symbol = getTvSymbol(ticker);
    
    // Create script dynamically
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (typeof window.TradingView !== 'undefined' && containerRef.current) {
        new window.TradingView.widget({
          autosize: true,
          symbol: symbol,
          interval: "15",
          timezone: "Etc/UTC",
          theme: theme,
          style: "1",
          locale: "en",
          enable_publishing: false,
          backgroundColor: "rgba(15, 23, 42, 0.4)", // Slate 900 translucent
          gridColor: "rgba(255, 255, 255, 0.05)",
          hide_top_toolbar: true,
          hide_legend: true,
          save_image: false,
          container_id: containerRef.current.id,
          studies: [
            "Volume@tv-basicstudies"
          ]
        });
        setIsLoaded(true);
      }
    };

    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [ticker, theme]);

  return (
    <div style={{ height: height, width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
      {!isLoaded && (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>
          Loading interactive chart for {ticker}...
        </div>
      )}
      <div id={`tv_chart_${ticker?.replace(/[^a-zA-Z0-9]/g, '')}_${Math.random().toString(36).substring(7)}`} ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}
