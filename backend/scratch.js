import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

async function test() {
    const symbol = 'BTC-USD';
    const startDate1h = new Date();
    startDate1h.setDate(startDate1h.getDate() - 2); 
    
    // No period2!
    const res1h = await yahooFinance.chart(symbol, { 
        period1: startDate1h.toISOString().split('T')[0], 
        interval: '1h' 
    });

    if (res1h && res1h.quotes && res1h.quotes.length > 0) {
        const lastQuote = res1h.quotes[res1h.quotes.length - 1];
        const lastQuote2 = res1h.quotes[res1h.quotes.length - 2];
        console.log("2nd Last Quote Date:", lastQuote2.date);
        console.log("2nd Last Quote Close:", lastQuote2.close);
        console.log("Last Quote Date:", lastQuote.date);
        console.log("Last Quote Close:", lastQuote.close);
        
        const quote = await yahooFinance.quote(symbol);
        console.log("True Live Price:", quote.regularMarketPrice);
    }
}

test();
