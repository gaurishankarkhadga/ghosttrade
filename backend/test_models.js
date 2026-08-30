import dotenv from 'dotenv';
dotenv.config();

const API_KEYS = (process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(k => k.length > 0);

const modelsToTest = [
  'models/gemini-2.5-flash',
  'models/gemini-1.5-flash',
  'models/gemini-flash-latest',
  'models/gemini-pro-latest',
  'models/gemini-2.5-pro',
  'models/gemini-1.5-pro'
];

async function testModels() {
  if (!API_KEYS.length) {
    console.log("No API keys found in .env");
    return;
  }
  const key = API_KEYS[0];
  console.log(`Testing with key ending in ...${key.slice(-4)}\n`);

  for (const model of modelsToTest) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Hello" }] }]
        })
      });

      if (response.ok) {
        console.log(`✅ [WORKING] ${model}`);
      } else {
        const errData = await response.json();
        console.log(`❌ [FAILED] ${model} - ${response.status} - ${errData.error?.message || 'Unknown error'}`);
      }
    } catch (e) {
      console.log(`❌ [FAILED] ${model} - Fetch Error: ${e.message}`);
    }
  }
}

testModels();
