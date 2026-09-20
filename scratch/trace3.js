const fs = require('fs');
const lines = fs.readFileSync('backend/monitorWorker.js', 'utf8').split('\n');
let level = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Strip strings and regex to avoid counting braces inside them
  const stripped = line.replace(/'[^']*'|"[^"]*"|`[^`]*`|\/\/.*$/g, '');
  const open = (stripped.match(/\{/g) || []).length;
  const close = (stripped.match(/\}/g) || []).length;
  level += open - close;
  if (level < 0) { console.log(`L${i+1}: NEGATIVE lvl=${level} | ${line.substring(0,120)}`); break; }
  if (level <= 1 && (open > 0 || close > 0)) {
    console.log(`L${i+1}: lvl=${level} | ${line.substring(0,120)}`);
  }
}
