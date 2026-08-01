import yf from 'yahoo-finance2';
const yahooFinance = new yf();
async function test() {
  const endDate = new Date();
  const startDate15m = new Date();
  startDate15m.setDate(endDate.getDate() - 58);
  try {
    const data = await yahooFinance.chart('AAPL', { period1: startDate15m.toISOString().split('T')[0], period2: endDate.toISOString().split('T')[0], interval: '15m' });
    console.log("Success! Bars:", data.quotes.length);
  } catch(e) {
    console.error("Error:", e.message);
  }
}
test();
