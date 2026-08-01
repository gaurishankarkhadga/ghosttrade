import { executePhase3Intercept } from './geminiEngine.js';

async function runTest() {
    console.log("=== STARTING PHASE 3 INTERCEPT EXTRACTION TEST ===");
    
    // Simulate what Gemini would output for a valid bullish setup
    const mockGeminiOutput = `
MODULE 1 — PREDICTION VERDICT & CONDITIONAL TREE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREDICTION VERDICT:
BASE CASE: BULLISH 75%
• IF price holds above 64,500 OB → probability INCREASES to 80%
• IF price breaks below 63,800 liquidity pool → probability DROPS to 30% and thesis FLIPS
• IF volume confirms with above-average green bars → probability INCREASES to 85%
Timeframe: Intraday
Current Price: 65000.50
Primary Target: 67000.00
Extended Target: 69000.00
Downside Risk: 63800.00
Invalidation Level: 63800.00
Risk-to-Reward Ratio: 1:1.67

MODULE 2 — MARKET REGIME CLASSIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGIME: TRENDING-UP
Regime Confidence: 85%
Regime Evidence: Higher highs and higher lows with expanding volume bars confirm uptrend.

MODULE 6 — EXPECTED VALUE CALCULATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Win Probability: 75%
• Potential Reward: $2000.00 (3.07% from current price)
• Loss Probability: 25%
• Potential Risk: $1200.50 (1.84% from current price)
• Expected Value per $100 risked: $1.85
• Verdict: POSITIVE EDGE
`;

    const dummyWs = {
        send: (payload) => {
            const data = JSON.parse(payload);
            if (data.status === 'trade_card') {
                console.log("\n=== ✅ TRADE CARD GENERATED SUCCESSFULLY ===");
                console.log(JSON.stringify(data.tradeData, null, 2));
                
                // Assertions to verify the bug fix
                if (data.tradeData.side !== 'LONG' && data.tradeData.side !== 'SHORT') {
                     console.error("❌ FAILED: tradeData.side must be LONG or SHORT. Got:", data.tradeData.side);
                } else {
                     console.log("✅ Verified: tradeData.side is correctly mapped to", data.tradeData.side);
                }
            }
        }
    };

    const p3Context = {
        ticker: 'BTC-USD',
        hurstData: { meanH: 0.65, isStable: true },
        regimeData: { regime: 'TRENDING' }
    };

    try {
        await executePhase3Intercept(mockGeminiOutput, mockGeminiOutput, p3Context, dummyWs);
    } catch (e) {
        console.error("Test failed:", e);
    }
}

runTest();
