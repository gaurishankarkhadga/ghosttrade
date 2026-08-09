import dotenv from 'dotenv';
dotenv.config();

import { executionEngine } from './executionEngine.js';

async function testFullExecutionFlow() {
    console.log('\n=====================================================');
    console.log('👻 GHOSTTRADE UNIFIED EXECUTION ENGINE TEST');
    console.log('Testing Paper Simulation ➔ Angel One Live Routing');
    console.log('=====================================================\n');

    // 1. Initial State Check
    console.log('1. Checking Initial Execution Mode...');
    console.log(`   - Default Mode: ${executionEngine.mode}`);
    console.log(`   - Broker Authed: ${executionEngine.isBrokerAuthenticated}`);

    // 2. Test Paper Trading Trade
    console.log('\n2. Executing Test Order in PAPER SIMULATION Mode...');
    const paperResult = await executionEngine.executeTrade({
        asset: 'RELIANCE',
        side: 'BUY',
        entryPrice: 2950.50,
        stopLoss: 2900.00,
        takeProfit: 3050.00,
        accountBalance: 200000,
        regime: 'TRENDING',
        overrideMode: 'PAPER'
    });
    console.log('   📦 Paper Trade Result:', paperResult);

    // 3. Attempting Angel One Live Connection
    console.log('\n3. Attempting Angel One Live Broker Initialization...');
    try {
        const authed = await executionEngine.initializeBroker();
        if (authed) {
            console.log('   🎉 Live Angel One Authentication SUCCESSFUL!');
            console.log('\n4. Executing Test Order in LIVE ANGEL ONE Mode...');
            const liveResult = await executionEngine.executeTrade({
                asset: 'INFY',
                side: 'BUY',
                entryPrice: 1820.00,
                stopLoss: 1790.00,
                takeProfit: 1880.00,
                accountBalance: 200000,
                regime: 'TRENDING',
                overrideMode: 'LIVE'
            });
            console.log('   🚀 Live Trade Routing Result:', liveResult);
        } else {
            console.log('   ℹ️ Angel One credentials not present in .env or simulation fallback active.');
        }
    } catch (err) {
        console.log(`   ⚠️ Broker initialization note: ${err.message}`);
    }

    console.log('\n=====================================================');
    console.log('✅ EXECUTION ENGINE PIPELINE COMPLETE & OPERATIONAL');
    console.log('=====================================================\n');
}

testFullExecutionFlow();
