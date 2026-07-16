import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const API_KEY = process.env.GEMINI_API_KEY;

const modelsToTest = [
  'models/gemini-3.1-pro-preview',
  'models/gemini-2.5-pro',
  'models/gemini-pro-latest',
  'models/gemini-3-pro-preview',
  'models/gemini-3.5-flash',
  'models/gemini-2.5-flash',
  'models/gemini-2.0-flash',
  'models/gemini-flash-latest',
  'models/gemini-3-flash-preview',
  'models/gemini-3.1-flash-lite',
  'models/gemini-2.0-flash-lite',
  'models/gemini-flash-lite-latest'
];

async function testModels() {
  console.log('Testing models to find valid fallbacks...');
  const workingModels = [];
  
  for (const model of modelsToTest) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:streamGenerateContent?key=${API_KEY}&alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Respond with the word YES." }] }]
        })
      });
      
      if (res.ok) {
        console.log(`✅ SUCCESS: ${model} is working!`);
        workingModels.push(model);
      } else {
        const text = await res.text();
        if (text.includes("limit: 0")) {
           console.log(`❌ FAIL (Limit 0): ${model}`);
        } else if (text.includes("429") || text.includes("RESOURCE_EXHAUSTED")) {
           console.log(`❌ FAIL (Rate Limit): ${model}`);
           // If it's just a rate limit, the model IS supported, we just sent too many requests.
           // However, if we want to find one that works RIGHT NOW, this is failing.
        } else if (text.includes("NOT_FOUND")) {
           console.log(`❌ FAIL (Not Found): ${model}`);
        } else {
           console.log(`❌ FAIL (${res.status}): ${model}`);
        }
      }
    } catch (e) {
      console.log(`❌ EXCEPTION for ${model}:`, e.message);
    }
    // Small delay to avoid triggering rate limit from the test script itself
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('\n--- WORKING MODELS ---');
  console.log(workingModels);
}
testModels();
