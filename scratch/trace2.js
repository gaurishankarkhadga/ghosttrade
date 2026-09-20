const fs = require('fs');
const lines = fs.readFileSync('backend/geminiEngine.js', 'utf8').split('\n');
let inFunc = false;
let level = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('async function executePhase3Intercept')) { inFunc = true; level = 0; }
  if (!inFunc) continue;
  const open = (line.match(/\{/g) || []).length;
  const close = (line.match(/\}/g) || []).length;
  level += open - close;
  if (level <= 2) {
    console.log(`L${i+1}: lvl=${level} | ${line.trimEnd().substring(0, 140)}`);
  }
  if (level === 0 && i > 700) { console.log('--- FUNCTION CLOSED ---'); break; }
}
