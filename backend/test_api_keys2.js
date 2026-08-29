import 'dotenv/config';

async function testAlpaca(isLive = false) {
  const url = isLive ? 'https://api.alpaca.markets/v2/account' : 'https://paper-api.alpaca.markets/v2/account';
  const keyStr = process.env.ALPACA_SECURITY_KEY || '';
  let keyId = keyStr;
  let secret = '';
  if (keyStr.includes(',')) [keyId, secret] = keyStr.split(',');
  else if (keyStr.includes(':')) [keyId, secret] = keyStr.split(':');

  try {
    const res = await fetch(url, { headers: { 'APCA-API-KEY-ID': keyId.trim(), 'APCA-API-SECRET-KEY': secret.trim() || 'dummy' }});
    const json = await res.json().catch(() => ({}));
    console.log(`Alpaca ${isLive ? 'Live' : 'Paper'} -> Status: ${res.status}, Message: ${json.message || 'Unknown'}`);
  } catch (e) {
    console.log(`Alpaca Error: ${e.message}`);
  }
}

async function testBinance() {
  const key = process.env.BINANCE_SECURITY_KEY || '';
  try {
    const res = await fetch('https://api.binance.com/api/v3/account', { headers: { 'X-MBX-APIKEY': key.trim() }});
    const json = await res.json().catch(() => ({}));
    console.log(`Binance -> Status: ${res.status}, Code: ${json.code}, Message: ${json.msg}`);
  } catch (e) {
    console.log(`Binance Error: ${e.message}`);
  }
}

async function run() {
  await testAlpaca(false);
  await testAlpaca(true);
  await testBinance();
}

run();
