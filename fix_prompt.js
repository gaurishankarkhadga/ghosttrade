const fs = require('fs');
const path = 'frontend/src/components/PromptInputBar.jsx';
let content = fs.readFileSync(path, 'utf8');

// Fix MARKETS and LANGUAGES duplication
content = content.replace(
  "  const MARKETS = ['Crypto', 'United States', 'India', 'United Kingdom', 'Japan', 'Europe', 'Australia', 'Hong Kong', 'South Korea', 'Canada', 'Brazil', 'Singapore', 'Forex'];\n  const LANGUAGES = ['English', 'Hindi', 'Japanese', 'Spanish', 'Portuguese', 'Arabic', 'Korean', 'French', 'German'];\n  const MARKETS = ['Crypto', 'United States', 'India', 'United Kingdom', 'Japan', 'Europe', 'Australia', 'Hong Kong', 'South Korea', 'Canada', 'Brazil', 'Singapore', 'Forex', 'Nepal'];\n  const LANGUAGES = ['English', 'Hindi', 'Japanese', 'Spanish', 'Portuguese', 'Arabic', 'Korean', 'French', 'German', 'Nepali'];",
  "  const MARKETS = ['Crypto', 'United States', 'India', 'United Kingdom', 'Japan', 'Europe', 'Australia', 'Hong Kong', 'South Korea', 'Canada', 'Brazil', 'Singapore', 'Forex', 'Nepal'];\n  const LANGUAGES = ['English', 'Hindi', 'Japanese', 'Spanish', 'Portuguese', 'Arabic', 'Korean', 'French', 'German', 'Nepali'];"
);

// Fix MARKET_SHORT_NAMES duplication
content = content.replace(
  "    'Forex': 'Forex'\n    'Forex': 'Forex',\n    'Nepal': 'NP'",
  "    'Forex': 'Forex',\n    'Nepal': 'NP'"
);

fs.writeFileSync(path, content);
console.log("Fixed duplicates");
