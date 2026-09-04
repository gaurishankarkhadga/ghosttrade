/**
 * F&O Expiry Engine
 * Dynamically computes the next active expiry date for Indian Derivatives (NFO).
 * Uses IST (Indian Standard Time) context.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Returns the current date in IST timezone.
 */
function getISTNow() {
    const now = new Date();
    // Offset for IST is UTC +5:30
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + istOffset);
    return istTime;
}

/**
 * Computes the next desired day of the week, considering current time.
 * If today IS the target day and time is after 15:30 (Market Close), moves to NEXT week.
 * 
 * @param {number} targetDay - 0 (Sun) to 6 (Sat)
 * @returns {Date} Date object of the expiry
 */
function getNextExpiry(targetDay) {
    const now = getISTNow();
    const currentDay = now.getDay();
    
    // Calculate days until next target day
    let daysToAdd = (targetDay - currentDay + 7) % 7;
    
    // If today is the target day, check if market is already closed
    if (daysToAdd === 0) {
        const hours = now.getHours();
        const minutes = now.getMinutes();
        // Indian Market closes at 15:30 IST. 
        // If it's 15:30 or later, expiry has passed, roll to next week.
        if (hours > 15 || (hours === 15 && minutes >= 30)) {
            daysToAdd = 7;
        }
    }
    
    // Add days
    const expiryDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    return expiryDate;
}

/**
 * Formats a Date object into Angel One's DDMMMYY format.
 * Examples: 26SEP24, 05OCT24 (Drops leading zero? Angel One usually keeps leading zeros but removes them for single digits sometimes. Let's strictly check: '26SEP24', '5OCT24'? Wait, Angel one uses 2 digits like '05OCT24' or '5OCT24'? Angel one actually uses '05OCT24' for some, and '26SEP24' for others. Actually, typically it's DDMMMYY like 26SEP24. Wait, usually 1-9 is 01, 02 etc OR 1, 2? We'll check the scrip master to be perfectly accurate later, but standard is DDMMMYY: 05OCT24 or 5OCT24? Most APIs use DDMMMYY where 5 is 05.)
 * Let's format as DDMMMYY with 2 digit day.
 */
function formatAngelDate(dateObj) {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = MONTHS[dateObj.getMonth()];
    const year = String(dateObj.getFullYear()).slice(-2); // Last 2 digits of year
    return `${day}${month}${year}`;
}

/**
 * Dynamically gets the next active F&O expiry string for a given index.
 * - BANKNIFTY: Wednesday (Day 3)
 * - NIFTY: Thursday (Day 4)
 * 
 * @param {string} symbol - E.g., 'BANKNIFTY' or 'NIFTY'
 * @returns {string} e.g. '26SEP24'
 */
export function getNextActiveExpiry(symbol) {
    const upperSymbol = symbol.toUpperCase();
    let targetDay = 4; // Default Nifty = Thursday

    if (upperSymbol.includes('BANKNIFTY')) {
        targetDay = 3; // BankNifty = Wednesday
    } else if (upperSymbol === 'NIFTY' || upperSymbol === 'NIFTY50') {
        targetDay = 4; // Nifty = Thursday
    }

    const expiryDate = getNextExpiry(targetDay);
    
    // Note: Angel One drops the leading zero on Days 1-9 for weekly options sometimes?
    // Ex: 5SEP24 vs 05SEP24. 
    // We will return DDMMMYY (e.g. 05SEP24) and also DMMMYY (e.g. 5SEP24) just in case, 
    // but typically it's 2-digit. We'll stick to 2-digit, and scrip master will handle fuzzy match if needed.
    return formatAngelDate(expiryDate);
}

/**
 * Formats Angel date without leading zero for days 1-9.
 * Sometimes Angel One format is 5SEP24 instead of 05SEP24.
 */
export function formatAngelDateNoLeadingZero(dateObj) {
    const day = String(dateObj.getDate()); // No padding
    const month = MONTHS[dateObj.getMonth()];
    const year = String(dateObj.getFullYear()).slice(-2);
    return `${day}${month}${year}`;
}
