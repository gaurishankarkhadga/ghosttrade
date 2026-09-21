import React, { useMemo } from 'react';
import { ComposedChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp } from 'lucide-react';
import './PriceStoryChart.css';

const CandleShape = (props) => {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;

  const open = Number(payload.open);
  const close = Number(payload.close);
  const high = Number(payload.high);
  const low = Number(payload.low);

  if (isNaN(open) || isNaN(close) || isNaN(high) || isNaN(low)) return null;

  const maxVal = high;
  const minVal = low;
  const range = maxVal - minVal;
  if (range <= 0) return null;

  const isGreen = close >= open;
  const color = isGreen ? '#10b981' : '#ef4444';

  const openPos = (maxVal - open) / range;
  const closePos = (maxVal - close) / range;

  const bodyTop = Math.min(openPos, closePos) * (height || 0);
  const bodyHeight = Math.max(Math.abs(openPos - closePos) * (height || 0), 1);

  return (
    <g className="lm-psc-candle">
      <line
        x1={(x || 0) + (width || 0) / 2}
        y1={y || 0}
        x2={(x || 0) + (width || 0) / 2}
        y2={(y || 0) + (height || 0)}
        stroke={color}
        strokeWidth={1.5}
      />
      <rect
        x={x || 0}
        y={(y || 0) + bodyTop}
        width={width || 0}
        height={bodyHeight}
        fill={color}
        stroke={color}
        strokeWidth={0.5}
        rx={1}
      />
    </g>
  );
};

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="lm-psc-tooltip">
        <div className="lm-psc-tooltip-grid">
          <span>O: {Number(data.open)?.toFixed(2)}</span>
          <span>H: {Number(data.high)?.toFixed(2)}</span>
          <span>L: {Number(data.low)?.toFixed(2)}</span>
          <span>C: {Number(data.close)?.toFixed(2)}</span>
        </div>
      </div>
    );
  }
  return null;
};

const PriceStoryChart = ({ candles = [], entryPrice, stopLoss, takeProfit, direction }) => {
  const hasData = Array.isArray(candles) && candles.length > 0;
  let chartCandles = hasData ? candles : [];

  const ep = Number(entryPrice);
  const sl = Number(stopLoss);
  const tp = Number(takeProfit);

  if (!hasData && !isNaN(ep) && !isNaN(sl) && !isNaN(tp)) {
    const isBuy = (direction || '').toString().toUpperCase() === 'BUY' || (direction || '').toString().toUpperCase() === 'LONG' || (direction || '').toString().toUpperCase() === 'BULLISH';
    const range = Math.abs(tp - sl);
    
    chartCandles = [
      { time: '1', open: ep - (range*0.1), close: ep + (range*0.1), high: ep + (range*0.2), low: ep - (range*0.2) },
      { time: '2', open: ep + (range*0.1), close: isBuy ? sl + (range*0.1) : sl - (range*0.1), high: ep + (range*0.15), low: isBuy ? sl : sl },
      { time: '3', open: isBuy ? sl + (range*0.1) : sl - (range*0.1), close: ep, high: ep + (range*0.1), low: isBuy ? sl : sl },
      { time: '4', open: ep, close: ep + (isBuy ? range*0.4 : -range*0.4), high: ep + (isBuy ? range*0.5 : -range*0.1), low: ep - (isBuy ? range*0.1 : -range*0.5) },
      { time: '5', open: ep + (isBuy ? range*0.4 : -range*0.4), close: tp, high: isBuy ? tp + (range*0.1) : tp, low: isBuy ? tp - (range*0.2) : tp - (range*0.1) }
    ];
  } else if (!hasData || chartCandles.length === 0) {
    return (
      <div className="lm-psc-wrapper">
        <div className="lm-psc-header">
          <TrendingUp className="lm-psc-icon" size={20} />
          <h3 className="lm-psc-title">Price Action</h3>
        </div>
        <p className="lm-psc-subtitle">Each candle shows the battle between buyers and sellers</p>
        <div className="lm-psc-container lm-psc-empty">
          <span>Waiting for price data...</span>
        </div>
      </div>
    );
  }

  const chartData = useMemo(() => {
    return chartCandles.map(c => ({
      ...c,
      wickRange: [Number(c.low) || 0, Number(c.high) || 0],
    }));
  }, [chartCandles]);

  const allValues = [
    ...chartCandles.map(c => Number(c.high)),
    ...chartCandles.map(c => Number(c.low)),
    ep,
    sl,
    tp,
  ].filter(v => !isNaN(v));

  const minVal = allValues.length ? Math.min(...allValues) : 0;
  const maxVal = allValues.length ? Math.max(...allValues) : 100;
  const padding = (maxVal - minVal) * 0.1;

  return (
    <div className="lm-psc-wrapper">
      <div className="lm-psc-header">
        <TrendingUp className="lm-psc-icon" size={20} />
        <h3 className="lm-psc-title">Price Action</h3>
      </div>
      <p className="lm-psc-subtitle">Each candle shows the battle between buyers and sellers</p>

      <div className="lm-psc-container">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 45, bottom: 5, left: 5 }}>
            <XAxis dataKey="time" hide />
            <YAxis domain={[minVal - padding, maxVal + padding]} hide />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }}
            />
            <Bar dataKey="wickRange" shape={<CandleShape />} isAnimationActive={false} />

            {!isNaN(ep) && (
              <ReferenceLine
                y={ep}
                stroke="#facc15"
                strokeDasharray="5 3"
                label={{ position: 'right', value: 'Ref Entry', fill: '#facc15', fontSize: 11, fontWeight: 600 }}
              />
            )}
            {!isNaN(sl) && (
              <ReferenceLine
                y={sl}
                stroke="#ef4444"
                strokeDasharray="5 3"
                label={{ position: 'right', value: 'Inv', fill: '#ef4444', fontSize: 11, fontWeight: 600 }}
              />
            )}
            {!isNaN(tp) && (
              <ReferenceLine
                y={tp}
                stroke="#10b981"
                strokeDasharray="5 3"
                label={{ position: 'right', value: 'Reference', fill: '#10b981', fontSize: 11, fontWeight: 600 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PriceStoryChart;
