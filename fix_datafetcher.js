const fs = require('fs');
const path = 'backend/dataFetcher.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  "    if (originalUpper.endsWith('.NP')) {\n    if (ticker.toUpperCase().endsWith('.NP')) {",
  "    if (ticker.toUpperCase().endsWith('.NP')) {"
);

fs.writeFileSync(path, content);
