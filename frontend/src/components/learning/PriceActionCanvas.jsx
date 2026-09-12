import React, { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

const CustomCandlestick = (props) => {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;
  
  const { open, close, high, low } = payload;
  if (open == null || close == null || high == null || low == null) return null;

  const { value } = props;
  if (!value || value.length < 2) return null;
  
  const [minVal, maxVal] = value;
  const range = maxVal - minVal;
  if (range === 0) return null;

  const isGreen = close >= open;
  const color = isGreen ? '#10b981' : '#ef4444';
  
  const openPos = (maxVal - open) / range;
  const closePos = (maxVal - close) / range;
  
  const bodyTop = Math.min(openPos, closePos) * height;
  const bodyHeight = Math.max(Math.abs(openPos - closePos) * height, 1);

  return (
    <g>
      <line 
        x1={x + width / 2} 
        y1={y} 
        x2={x + width / 2} 
        y2={y + height} 
        stroke={color} 
        strokeWidth={1} 
      />
      <rect 
        x={x} 
        y={y + bodyTop} 
        width={width} 
        height={bodyHeight} 
        fill={color} 
        stroke={color}
        strokeWidth={0.5}
        rx={1}
      />
    </g>
  );
};

const PriceActionCanvas = React.memo(({ candles = [], entryPrice, stopLoss, takeProfit, direction }) => {
  if (!candles || candles.length === 0) {
    return (
      <div className="learning-chart-container" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <p className="learning-section-label">Waiting for market data...</p>
      </div>
    );
  }

  const chartData = useMemo(() => {
    return candles.map(c => ({
      ...c,
      wickRange: [c.low, c.high],
    }));
  }, [candles]);

  const minPrice = Math.min(...candles.map(c => c.low), stopLoss || Infinity, takeProfit || Infinity);
  const maxPrice = Math.max(...candles.map(c => c.high), stopLoss || -Infinity, takeProfit || -Infinity);
  const padding = (maxPrice - minPrice) * 0.1;

  return (
    <div className="learning-section learning-delay-2">
      <div className="learning-section-title">
        📈 Price Action & Entry
      </div>
      <div className="learning-chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="time" hide />
            <YAxis domain={[minPrice - padding, maxPrice + padding]} hide />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155' }}
              itemStyle={{ color: '#f8fafc' }}
              labelStyle={{ display: 'none' }}
              formatter={(value, name, props) => {
                const { open, high, low, close } = props.payload;
                return [
                  `O: ${open?.toFixed(2)} H: ${high?.toFixed(2)} L: ${low?.toFixed(2)} C: ${close?.toFixed(2)}`,
                  'OHLC'
                ];
              }}
            />
            <Bar dataKey="wickRange" shape={<CustomCandlestick />} />
            
            {entryPrice && (
              <ReferenceLine y={entryPrice} stroke="#facc15" strokeDasharray="3 3" label={{ position: 'right', value: 'ENTRY', fill: '#facc15', fontSize: 10 }} />
            )}
            {stopLoss && (
              <ReferenceLine y={stopLoss} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'right', value: 'SL', fill: '#ef4444', fontSize: 10 }} />
            )}
            {takeProfit && (
              <ReferenceLine y={takeProfit} stroke="#10b981" strokeDasharray="3 3" label={{ position: 'right', value: 'TP', fill: '#10b981', fontSize: 10 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="learning-section-label">
        Every candle represents the battle between buyers and sellers. We wait for alignment.
      </div>
    </div>
  );
});

export default PriceActionCanvas;
