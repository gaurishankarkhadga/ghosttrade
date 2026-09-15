import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data/nepse');

// Top Nepali stocks to track in the Data Lake
const WATCHLIST = ['NABIL', 'CIT', 'NTC', 'CBBL', 'GBIME', 'HIDCL', 'API', 'UPPER'];

async function runScraper() {
  console.log("=========================================");
  console.log("   LAUNCHING PUPPETEER (CLOUDFLARE BYPASS)");
  console.log("=========================================");

  await fs.mkdir(DATA_DIR, { recursive: true });

  // Launch browser (headless: 'new' is the modern standard)
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  const page = await browser.newPage();
  
  // Mask the browser as a real user
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  console.log("Solving Cloudflare challenge...");
  // Go to the main charting page to acquire cookies and pass the JS challenge
  await page.goto('https://nepsealpha.com/trading/chart', { waitUntil: 'networkidle2', timeout: 60000 });
  console.log("Challenge solved. Fetching data...");

  for (const symbol of WATCHLIST) {
    const to = Math.floor(Date.now() / 1000);
    const from = to - (3 * 365 * 24 * 60 * 60); 
    const url = `https://nepsealpha.com/trading/1/history?symbol=${symbol}&resolution=1D&to=${to}&from=${from}`;
    
    console.log(`[NEPSE SCRAPER] Fetching ${symbol}...`);
    
    try {
      // Execute the fetch INSIDE the browser context where Cloudflare is already bypassed
      const rawData = await page.evaluate(async (fetchUrl) => {
        const response = await fetch(fetchUrl);
        return response.json();
      }, url);

      if (rawData.s !== 'ok' || !rawData.t || rawData.t.length === 0) {
        console.error(`[ERROR] No valid data returned for ${symbol}`);
        continue;
      }

      // Convert TradingView format into Ghosttrade Object Array
      const formattedData = [];
      for (let i = 0; i < rawData.t.length; i++) {
        formattedData.push({
          timestamp: rawData.t[i] * 1000,
          open: rawData.o[i],
          high: rawData.h[i],
          low: rawData.l[i],
          close: rawData.c[i],
          volume: rawData.v[i] || 0
        });
      }

      const filePath = path.join(DATA_DIR, `${symbol}_1D.json`);
      await fs.writeFile(filePath, JSON.stringify(formattedData, null, 2));
      console.log(`[SUCCESS] Saved ${formattedData.length} real historical bars for ${symbol}.NP`);
      
    } catch (error) {
      console.error(`[ERROR] Failed to fetch ${symbol}:`, error.message);
    }
    
    // Sleep for 2 seconds to act like a human
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  await browser.close();
  console.log("=========================================");
  console.log("   NEPSE SYNC COMPLETE.");
  console.log("   AI Engines are now ready for Nepal.");
  console.log("=========================================");
}

runScraper();
