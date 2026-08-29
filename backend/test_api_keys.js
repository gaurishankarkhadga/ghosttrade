import 'dotenv/config';

async function testAlpaca(isLive = false) {
  const url = isLive ? 'https://api.alpaca.markets/v2/account' : 'https://paper-api.alpaca.markets/v2/account';
  console.log(`\n--- Testing Alpaca (${isLive ? 'Live' : 'Paper'}) ---`);
  const keyStr = process.env.ALPACA_SECURITY_KEY || '';
  if (!keyStr) {
    console.log('❌ ALPACA_SECURITY_KEY not found');
    return;
  }
  
  let keyId = keyStr;
  let secret = '';
  if (keyStr.includes(',')) [keyId, secret] = keyStr.split(',');
  else if (keyStr.includes(':')) [keyId, secret] = keyStr.split(':');

  try {
    const res = await fetch(url, { headers: { 'APCA-API-KEY-ID': keyId.trim(), 'APCA-API-SECRET-KEY': secret.trim() || 'dummy' }});
    console.log(`Status: ${res.status}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

async function testBinance() {
  console.log('\n--- Testing Binance ---');
  const key = process.env.BINANCE_SECURITY_KEY;
  if (!key) {
    console.log('❌ BINANCE_SECURITY_KEY not found');
    return;
  }
  
  try {
    const res = await fetch('https://api.binance.com/api/v3/userDataStream', { method: 'POST', headers: { 'X-MBX-APIKEY': key.trim() }});
    console.log(`Status: ${res.status}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

async function testIG() {
  console.log('\n--- Testing IG ---');
  const clientId = process.env.IG_CLIENT_ID;
  if (!clientId) {
    console.log('❌ IG_CLIENT_ID not found');
    return;
  }
  
  try {
    const res = await fetch('https://api.ig.com/gateway/dealer/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-IG-API-KEY': clientId.trim(), 'Version': '2' },
      body: JSON.stringify({ identifier: clientId.trim(), password: 'test' })
    });
    console.log(`Status: ${res.status}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

async function run() {
  await testAlpaca(false);
  await testAlpaca(true);
  await testBinance();
  await testIG();
}

run();
