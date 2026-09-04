import fs from 'fs';
import path from 'path';

const SCRIP_MASTER_URL = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
const CACHE_FILE = path.join(process.cwd(), 'angel_scrip_master.json');

// In-memory dictionary for quick O(1) lookups: symbol -> { token, lotsize, instrumenttype }
let scripDictionary = null;
let isDownloading = false;

/**
 * Downloads and parses the Angel One Scrip Master.
 * Filters strictly for NFO (Derivatives) to save memory.
 * Caches it locally to avoid massive 50MB downloads on every restart.
 */
export async function initializeScripMaster() {
    if (scripDictionary) return;
    if (isDownloading) {
        // Wait if already downloading
        while (isDownloading) {
            await new Promise(r => setTimeout(r, 500));
        }
        return;
    }

    isDownloading = true;

    try {
        let rawData;

        // 1. Try to load from local cache first
        if (fs.existsSync(CACHE_FILE)) {
            const stats = fs.statSync(CACHE_FILE);
            const hoursOld = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);

            // Scrip master updates daily. If cache is older than 24 hours, redownload.
            if (hoursOld < 24) {
                console.log(`[SCRIP MASTER] Loading Angel One Scrip Master from cache (${hoursOld.toFixed(1)} hours old)...`);
                const fileContent = fs.readFileSync(CACHE_FILE, 'utf-8');
                rawData = JSON.parse(fileContent);
            }
        }

        // 2. Download from Angel One API if no cache or cache is stale
        if (!rawData) {
            console.log('[SCRIP MASTER] Downloading fresh Angel One Scrip Master (50MB+)...');
            const res = await fetch(SCRIP_MASTER_URL, { signal: AbortSignal.timeout(30000) });
            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
            rawData = await res.json();
            
            // Filter to save disk space
            console.log(`[SCRIP MASTER] Downloaded ${rawData.length} scrips. Filtering for NFO...`);
            const nfoData = rawData.filter(s => s.exch_seg === 'NFO');
            
            // Save to cache
            fs.writeFileSync(CACHE_FILE, JSON.stringify(nfoData));
            console.log(`[SCRIP MASTER] Saved ${nfoData.length} NFO scrips to cache.`);
            rawData = nfoData;
        }

        // 3. Build in-memory dictionary
        scripDictionary = {};
        for (const scrip of rawData) {
            // We only care about NFO (F&O). If we loaded from cache, it's already filtered.
            if (scrip.exch_seg === 'NFO') {
                scripDictionary[scrip.symbol] = {
                    token: scrip.token,
                    lotsize: scrip.lotsize,
                    instrumenttype: scrip.instrumenttype,
                    expiry: scrip.expiry
                };
            }
        }

        console.log(`[SCRIP MASTER] Successfully indexed ${Object.keys(scripDictionary).length} active F&O contracts.`);
    } catch (err) {
        console.error('[SCRIP MASTER] Failed to initialize Scrip Master:', err.message);
        // Do not crash the system, fallback to empty dict
        scripDictionary = {};
    } finally {
        isDownloading = false;
    }
}

/**
 * Looks up a precise symbol token and lot size for an Angel One symbol.
 * 
 * @param {string} symbol - The generated symbol (e.g. 'BANKNIFTY26SEP2452000CE')
 * @returns {Object|null} { token, lotsize, instrumenttype }
 */
export async function getScripInfo(symbol) {
    if (!scripDictionary) {
        await initializeScripMaster();
    }
    
    // Exact match
    if (scripDictionary[symbol]) {
        return scripDictionary[symbol];
    }
    
    // Fuzzy match: Sometimes Angel One uses single digit dates (e.g. 5OCT24 instead of 05OCT24)
    // We try to find the match manually if exact match fails
    const match = Object.keys(scripDictionary).find(k => k === symbol || k.replace('0', '') === symbol);
    
    if (match) {
        return scripDictionary[match];
    }
    
    return null;
}

/**
 * Robustly finds the closest upcoming expiry date string (e.g. '29SEP26') for a base symbol (e.g. 'BANKNIFTY')
 * by extracting it directly from the Scrip Master. This prevents any holiday or weekly/monthly listing issues.
 */
export async function getClosestExpiry(baseSymbol) {
    if (!scripDictionary) {
        await initializeScripMaster();
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find all unique expiries for the base symbol
    const expiries = new Set();
    const regex = new RegExp(`^${baseSymbol}([0-9]{2}[A-Z]{3}[0-9]{2})[0-9]+[CP]E$`);

    for (const symbol in scripDictionary) {
        const match = symbol.match(regex);
        if (match) {
            expiries.add(match[1]); // e.g. 29SEP26
        }
    }

    if (expiries.size === 0) return null;

    // Convert strings like 29SEP26 to actual Date objects for sorting
    const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
    
    let closestExpiry = null;
    let closestDiff = Infinity;

    for (const expStr of expiries) {
        const day = parseInt(expStr.substring(0, 2), 10);
        const monthStr = expStr.substring(2, 5);
        const year = 2000 + parseInt(expStr.substring(5, 7), 10); // Assume 20xx
        
        const expDate = new Date(year, MONTHS[monthStr], day);
        
        const diff = expDate.getTime() - today.getTime();
        
        // We want the closest expiry that hasn't passed yet (diff >= 0)
        // Adding a small negative buffer for same-day expiry just in case timezone shift
        if (diff > -86400000 && diff < closestDiff) {
            closestDiff = diff;
            closestExpiry = expStr;
        }
    }

    return closestExpiry;
}
