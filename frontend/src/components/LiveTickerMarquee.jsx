import React from 'react';

export default function LiveTickerMarquee({ scanData = [] }) {
  const defaultTickers = [
    { ticker: 'BTC-USD', price: '$64,293.93', change: '+2.41%', positive: true, isNSE: false },
    { ticker: 'ETH-USD', price: '$3,491.10', change: '+1.85%', positive: true, isNSE: false },
    { ticker: 'RELIANCE.NS', price: '₹1,280.30', change: '-0.42%', positive: false, isNSE: true },
    { ticker: 'TCS.NS', price: '₹3,892.40', change: '+0.78%', positive: true, isNSE: true },
    { ticker: 'SOL-USD', price: '$148.20', change: '+4.12%', positive: true, isNSE: false },
    { ticker: 'HDFCBANK.NS', price: '₹1,640.15', change: '-0.15%', positive: false, isNSE: true },
    { ticker: 'INFY.NS', price: '₹1,720.80', change: '+1.05%', positive: true, isNSE: true },
    { ticker: 'BNB-USD', price: '$578.40', change: '+0.92%', positive: true, isNSE: false }
  ];

  const marqueeItems = (scanData && scanData.length > 0)
    ? scanData.map(item => ({
        ticker: item.ticker,
        price: item.ticker.includes('.NS') ? `₹${item.currentPrice?.toLocaleString()}` : `$${item.currentPrice?.toLocaleString()}`,
        change: item.score >= 50 ? '+1.85%' : '-0.75%',
        positive: item.score >= 50,
        isNSE: item.ticker.includes('.NS')
      }))
    : defaultTickers;

  const displayList = [...marqueeItems, ...marqueeItems];

  return (
    <div className="ticker-marquee-wrapper font-mono">
      <div className="ticker-marquee-track">
        {displayList.map((item, idx) => (
          <div key={idx} className="marquee-item">
            <span className="font-orbitron font-bold" style={{ color: '#f8fafc' }}>
              {item.ticker}
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {item.price}
            </span>
            <span className={`badge-flat ${item.positive ? 'badge-flat-green' : 'badge-flat-red'}`}>
              {item.change}
            </span>
            <span style={{ color: 'var(--border-medium)', margin: '0 8px' }}>|</span>
          </div>
        ))}
      </div>
    </div>
  );
}
