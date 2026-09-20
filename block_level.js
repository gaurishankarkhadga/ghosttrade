const fs = require('fs');
const lines = fs.readFileSync('backend/geminiEngine.js', 'utf8').split('\n');
let level = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;
  const open = (line.match(/\{/g) || []).length;
  const close = (line.match(/\}/g) || []).length;
  level += open - close;
  if (level < 0) {
    console.log(`Negative level at line ${i + 1}`);
  }
}
console.log("Final level:", level);
