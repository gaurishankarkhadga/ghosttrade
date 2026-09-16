import React, { useEffect, useState } from 'react';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';
import './BuyerVsSellerTug.css';

const BuyerVsSellerTug = ({ ofiData }) => {
  const [buyerPct, setBuyerPct] = useState(0);
  
  useEffect(() => {
    const target = ofiData?.buyerPercent ?? 50;
    const timer = setTimeout(() => setBuyerPct(target), 100);
    return () => clearTimeout(timer);
  }, [ofiData]);

  const sellerPct = 100 - buyerPct;

  const getSummary = () => {
    if (buyerPct > 60) return 'Buyers are clearly dominating — strong upward pressure';
    if (sellerPct > 60) return 'Sellers are clearly dominating — strong downward pressure';
    return 'The market is balanced — no dominant force right now';
  };

  return (
    <div className="lm-bvs-container">
      <div className="lm-bvs-header">
        <Activity className="lm-bvs-icon" size={24} />
        <h3 className="lm-bvs-title">Buyer vs Seller Pressure</h3>
      </div>
      <p className="lm-bvs-subtitle">Who is putting more money into the market right now?</p>

      <div className="lm-bvs-bar-container">
        <div 
          className="lm-bvs-bar lm-bvs-bar-buyers" 
          style={{ width: `${buyerPct}%` }}
        >
          {buyerPct > 15 && (
            <div className="lm-bvs-bar-content">
              <TrendingUp size={16} />
              <span>{Math.round(buyerPct)}% Buyers</span>
            </div>
          )}
        </div>
        <div 
          className="lm-bvs-bar lm-bvs-bar-sellers" 
          style={{ width: `${sellerPct}%` }}
        >
          {sellerPct > 15 && (
            <div className="lm-bvs-bar-content">
              <span>{Math.round(sellerPct)}% Sellers</span>
              <TrendingDown size={16} />
            </div>
          )}
        </div>
      </div>

      <div className="lm-bvs-cards">
        <div className="lm-bvs-card lm-bvs-card-green">
          <span className="lm-bvs-card-label">Buyers</span>
          <span className="lm-bvs-card-value">{Math.round(buyerPct)}%</span>
        </div>
        <div className="lm-bvs-card lm-bvs-card-red">
          <span className="lm-bvs-card-label">Sellers</span>
          <span className="lm-bvs-card-value">{Math.round(sellerPct)}%</span>
        </div>
      </div>

      <p className="lm-bvs-summary">{getSummary()}</p>
    </div>
  );
};

export default BuyerVsSellerTug;
