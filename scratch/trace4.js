const fs = require('fs');
const lines = fs.readFileSync('backend/monitorWorker.js', 'utf8').split('\n');
let level = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const stripped = line.replace(/'[^']*'|"[^"]*"|`[^`]*`|\/\/.*$/g, '');
  const open = (stripped.match(/\{/g) || []).length;
  const close = (stripped.match(/\}/g) || []).length;
  if (open > 0 || close > 0) {
    level += open - close;
    console.log(`L${i+1}: lvl=${level} o=${open} c=${close} | ${line.trimEnd().substring(0,140)}`);
  }
}
console.log(`\nFINAL LEVEL: ${level}`);
