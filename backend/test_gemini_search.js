import dotenv from 'dotenv';
dotenv.config();
const API_KEY = process.env.GEMINI_API_KEY;
const payload = {
  contents: [{ role: 'user', parts: [{ text: "What is the current price of Bitcoin? Please use google search to find out." }] }],
  tools: [{ googleSearch: {} }]
};
fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
}).then(res => res.json()).then(data => console.log(JSON.stringify(data, null, 2))).catch(console.error);
