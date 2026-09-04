import dotenv from 'dotenv';
dotenv.config();
import { AngelOneAdapter } from './adapters/angelOneAdapter.js';

async function test() {
    const adapter = new AngelOneAdapter({
        apiKey: process.env.ANGEL_API_KEY,
        clientCode: process.env.ANGEL_CLIENT_CODE,
        password: process.env.ANGEL_PASSWORD,
        totpSecret: process.env.ANGEL_TOTP_SECRET
    });

    await adapter.authenticate();
    
    const payload = {
        exchange: "NSE",
        symboltoken: "26000",
        interval: "ONE_DAY",
        fromdate: "2023-01-01 09:15",
        todate: "2023-10-01 15:30"
    };
    
    console.log("Payload:", payload);
    const res = await adapter.smartApi.getCandleData(payload);
    console.log("Response:", JSON.stringify(res).substring(0, 500));
}
test();
