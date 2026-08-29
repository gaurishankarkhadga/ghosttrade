import 'dotenv/config';
import crypto from 'crypto';

async function testBinanceSigned() {
  console.log('--- Testing Binance Signed Request ---');
  const apiKey = process.env.BINANCE_API_KEY || '';
  const secretKey = process.env.BINANCE_SECURITY_KEY || '';
  
  if (!apiKey || !secretKey) {
    console.log('❌ Missing Binance API Key or Secret Key');
    return;
  }
  
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = crypto.createHmac('sha256', secretKey).update(queryString).digest('hex');
  
  const url = `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`;
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey.trim()
      }
    });
    const json = await res.json().catch(() => ({}));
    
    if (res.ok) {
      console.log('✅ Binance Authenticated Successfully! We can see your balances.');
    } else {
      console.log(`❌ Binance Auth Failed: ${json.msg || res.statusText} (Code: ${json.code})`);
    }
  } catch (e) {
    console.log(`❌ Binance Request Error: ${e.message}`);
  }
}

testBinanceSigned();
