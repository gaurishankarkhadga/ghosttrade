const fs = require('fs');
const lines = fs.readFileSync('backend/geminiEngine.js', 'utf8').split('\n');
// Find the executePhase3Intercept function and track brace levels
let inFunc = false;
let level = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('async function executePhase3Intercept')) { inFunc = true; level = 0; }
  if (!inFunc) continue;
  const open = (line.match(/\{/g) || []).length;
  const close = (line.match(/\}/g) || []).length;
  level += open - close;
  // Print lines where level changes significantly or is <= 1
  if (level <= 1 || open > 0 || close > 0) {
    console.log(`L${i+1}: lvl=${level} | ${line.trimEnd().substring(0, 120)}`);
  }
  if (level === 0 && i > 700) { console.log('--- FUNCTION CLOSED ---'); break; }
}
