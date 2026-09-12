import React from 'react';

export default function OrderFlowWaterfall({ ofiData }) {
  const buyerPct = typeof ofiData?.buyerPercent === 'number' ? Math.round(ofiData.buyerPercent) : 50;
  const sellerPct = 100 - buyerPct;
  return (
    <div className="learning-flow-bar">
      <div className="learning-flow-buyer" style={{ '--target-width': `${buyerPct}%` }}>{buyerPct}% BUY</div>
      <div className="learning-flow-seller" style={{ '--target-width': `${sellerPct}%` }}>{sellerPct}% SELL</div>
    </div>
  );
}
