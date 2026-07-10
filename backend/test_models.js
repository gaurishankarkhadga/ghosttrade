import dotenv from 'dotenv';
dotenv.config();
const API_KEY = process.env.GEMINI_API_KEY;

const modelsToTest = [
  'models/gemini-2.0-flash',
  'models/gemini-2.0-flash-lite',
  'models/gemini-pro-latest',
  'models/gemini-flash-latest',
  'models/gemini-3-flash-preview',
  'models/gemini-3.1-flash-lite'
];

async function testModels() {
  for (const model of modelsToTest) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:streamGenerateContent?key=${API_KEY}&alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Hello" }] }]
        })
      });
      
      if (res.ok) {
        console.log(`✅ SUCCESS: ${model} works!`);
        break; // Stop if we find a working one
      } else {
        const text = await res.text();
        if (text.includes("limit: 0")) {
           console.log(`❌ FAIL (Limit 0): ${model}`);
        } else if (text.includes("429") || text.includes("RESOURCE_EXHAUSTED")) {
           console.log(`❌ FAIL (Rate Limit): ${model}`);
        } else {
           console.log(`❌ FAIL (${res.status}): ${model} ->`, text.substring(0, 50));
        }
      }
    } catch (e) {
      console.log(`❌ EXCEPTION for ${model}:`, e.message);
    }
  }
}
testModels();
