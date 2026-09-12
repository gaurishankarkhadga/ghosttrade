import dotenv from 'dotenv';
dotenv.config();
import { fetchAngelOneOHLCV } from './dataFetcher.js';
fetchAngelOneOHLCV("BANKNIFTY", "1d", 100).then(res => console.log(res ? res.length : "null")).catch(console.error);
