const fs = require('fs');
const check = require('syntax-error');

const file = 'backend/geminiEngine.js';
const src = fs.readFileSync(file);
const err = check(src, file);
if (err) {
  console.error(err);
} else {
  console.log("No syntax errors!");
}
