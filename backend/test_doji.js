import { isHammer } from './patternEngine.js';

const dojiCandle = {
  open: 100.00,
  close: 100.00,
  high: 100.01,
  low: 95.00,
  volume: 1000
};

const normalHammer = {
  open: 100.00,
  close: 101.00, // Body is 1.00
  high: 101.05,
  low: 95.00,
  volume: 1000
};

console.log("Testing Doji Candle:", isHammer(null, dojiCandle));
console.log("Testing Normal Hammer:", isHammer(null, normalHammer));
