import React, { useState, useEffect } from 'react';
import useGhostStore from './store/ghostStore';

import AuthGateway from './components/AuthGateway';
import LiveTickerMarquee from './components/LiveTickerMarquee';
import CommandPalette from './components/CommandPalette';
import TerminalNavbar from './components/TerminalNavbar';
import MarketOverviewHeader from './components/MarketOverviewHeader';
import QuantBentoCard from './components/QuantBentoCard';
import AssetDeepDiveModal from './components/AssetDeepDiveModal';
import OrderBookInspector from './components/OrderBookInspector';
import TradeExecutionModal from './components/TradeExecutionModal';
import TelemetryFooter from './components/TelemetryFooter';

export default function App() {
  const { isAuthenticated, scanData, isConnected, login, logout, connectWebSocket } = useGhostStore();

  const [activeMarket, setActiveMarket] = useState('ALL'); // 'ALL' | 'CRYPTO' | 'NSE'
  const [searchQuery, setSearchQuery] = useState('');
  const [isCmdKOpen, setIsCmdKOpen] = useState(false);
  const [selectedAssetForDeepDive, setSelectedAssetForDeepDive] = useState(null);
  const [selectedAssetForTrade, setSelectedAssetForTrade] = useState(null);

  useEffect(() => {
    if (isAuthenticated) {
      connectWebSocket();
    }
  }, [isAuthenticated, connectWebSocket]);

  if (!isAuthenticated) {
    return <AuthGateway onLoginSuccess={(key) => login(key)} />;
  }

  // Filter scan data by market type and search query
  const filteredAssets = (scanData && scanData.length > 0)
    ? scanData.filter(item => {
        const matchesMarket = activeMarket === 'ALL'
          || (activeMarket === 'CRYPTO' && item.ticker.includes('-USD'))
          || (activeMarket === 'NSE' && item.ticker.includes('.NS'));
        const matchesSearch = item.ticker.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesMarket && matchesSearch;
      })
    : [
        {
          ticker: 'BTC-USD',
          currentPrice: 64293.93,
          score: 70,
          flowBias: 'STRONG_BUY',
          macroRegime: 'TRENDING',
          sentimentBias: 'NEUTRAL',
          recommendedSize: 27.89,
          evNet: 2.65,
          shieldTriggered: false,
          sector: 'STORE_OF_VALUE'
        },
        {
          ticker: 'RELIANCE.NS',
          currentPrice: 1280.30,
          score: 20,
          flowBias: 'NEUTRAL',
          macroRegime: 'TRENDING',
          sentimentBias: 'BEARISH',
          recommendedSize: 0.00,
          evNet: -0.15,
          shieldTriggered: true,
          sentimentAlerts: ['BEARISH CLOUD: Negative news sentiment detected.'],
          sector: 'INDIAN_NSE'
        }
      ];

  const activeAssetForL2 = filteredAssets[0] || null;

  return (
    <div className="app-container">
      {/* Live Market Marquee */}
      <LiveTickerMarquee scanData={scanData} />

      {/* Top Navbar */}
      <TerminalNavbar
        activeMarket={activeMarket}
        onSelectMarket={(m) => setActiveMarket(m)}
        searchQuery={searchQuery}
        onSearchChange={(q) => setSearchQuery(q)}
        onOpenCmdK={() => setIsCmdKOpen(true)}
        isConnected={isConnected}
        onLockTerminal={() => logout()}
      />

      {/* Main Workspace */}
      <main className="main-workspace">
        {/* Macro Regime Strip */}
        <MarketOverviewHeader scanData={scanData} />

        {/* Bento Grid & Order Book Inspector Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr', gap: '24px' }}>
          {/* Left: Bento Asset Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="font-orbitron font-bold" style={{ fontSize: '1.1rem', color: '#f8fafc' }}>
                MONITORED QUANT ASSETS ({filteredAssets.length})
              </h2>
              <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                FILTER: {activeMarket}
              </span>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '20px'
            }}>
              {filteredAssets.map((asset, idx) => (
                <QuantBentoCard
                  key={`${asset.ticker}-${idx}`}
                  asset={asset}
                  onOpenDeepDive={(a) => setSelectedAssetForDeepDive(a)}
                  onOpenTradeModal={(a) => setSelectedAssetForTrade(a)}
                />
              ))}
            </div>
          </div>

          {/* Right: Level 2 Order Book Depth Inspector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <OrderBookInspector activeAsset={activeAssetForL2} />
          </div>
        </div>
      </main>

      {/* Hardware Telemetry Footer */}
      <TelemetryFooter isConnected={isConnected} totalAssets={filteredAssets.length} />

      {/* Command Palette (Cmd+K) */}
      <CommandPalette
        isOpen={isCmdKOpen}
        onClose={() => setIsCmdKOpen(false)}
        onSelectMarket={(m) => setActiveMarket(m)}
        onSelectTicker={(symbol) => setSearchQuery(symbol)}
      />

      {/* Deep Analytics Modal */}
      {selectedAssetForDeepDive && (
        <AssetDeepDiveModal
          asset={selectedAssetForDeepDive}
          onClose={() => setSelectedAssetForDeepDive(null)}
          onOpenTradeModal={(a) => setSelectedAssetForTrade(a)}
        />
      )}

      {/* Live Trade Execution Modal */}
      {selectedAssetForTrade && (
        <TradeExecutionModal
          asset={selectedAssetForTrade}
          onClose={() => setSelectedAssetForTrade(null)}
        />
      )}
    </div>
  );
}
