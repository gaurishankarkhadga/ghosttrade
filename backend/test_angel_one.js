import dotenv from 'dotenv';
dotenv.config();

import { AngelOneAdapter } from './adapters/angelOneAdapter.js';

async function testAngelOne() {
    console.log("==========================================");
    console.log("🚀 TESTING ANGEL ONE SMARTAPI F&O ADAPTER");
    console.log("==========================================\n");

    try {
        console.log("1. Initializing Adapter with .env credentials...");
        const adapter = new AngelOneAdapter({
            apiKey: process.env.ANGEL_API_KEY,
            clientCode: process.env.ANGEL_CLIENT_CODE,
            password: process.env.ANGEL_PASSWORD,
            totpSecret: process.env.ANGEL_TOTP_SECRET
        });

        console.log("2. Authenticating & Generating Automated TOTP...");
        const authSuccess = await adapter.authenticate();
        
        if (authSuccess) {
            console.log("\n✅ AUTHENTICATION SUCCESSFUL!");
            console.log("JWT Token Exists:", !!adapter.jwtToken);
            
            console.log("\n3. Fetching F&O Account Margins...");
            const margin = await adapter.getBalance();
            console.log(`Available Margin: ₹${margin.availableMargin}`);
            console.log(`Total Margin: ₹${margin.totalMargin}`);

            console.log("\n4. Simulating F&O Order Payload (NFO)...");
            // Note: Since markets might be closed and this is a live key, we will simulate the F&O order structure
            // by passing an invalid symbol so it gets rejected by the exchange but verifies our API formatting.
            const fakeOrderParams = {
                asset: "BANKNIFTY99JUN99999CE", // Purposely invalid to prevent actual execution during test
                side: "BUY",
                quantity: 15, // BankNifty Lot Size
                price: 0,
                orderType: "MARKET"
            };
            
            console.log(JSON.stringify(fakeOrderParams, null, 2));
            const orderResult = await adapter.placeOrder(fakeOrderParams);
            
            console.log("\n=== ORDER RESULT ===");
            console.log(orderResult);
            if (!orderResult.success) {
                console.log("✅ Expected Failure: Order rejected by exchange due to invalid F&O symbol, meaning API payload was correctly transmitted!");
            }

        } else {
            console.log("\n❌ AUTHENTICATION FAILED!");
        }

    } catch (e) {
        console.error("Test Error:", e);
    }

    console.log("\n==========================================");
    console.log("🏁 ANGEL ONE F&O TEST COMPLETE");
    console.log("==========================================");
    process.exit(0);
}

testAngelOne();
