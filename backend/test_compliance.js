// =====================================================
// COMPLIANCE FIREWALL — Unit Tests
// =====================================================

import { sanitizeChunk, auditCompliance } from './complianceFirewall.js';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let passed = 0;
let failed = 0;

function assert(testName, input, expected) {
  const result = sanitizeChunk(input);
  if (result === expected) {
    console.log(`${GREEN}  PASS${RESET} ${testName}`);
    passed++;
  } else {
    console.log(`${RED}  FAIL${RESET} ${testName}`);
    console.log(`       Input:    "${input}"`);
    console.log(`       Expected: "${expected}"`);
    console.log(`       Got:      "${result}"`);
    failed++;
  }
}

console.log(`\n${BOLD}=== COMPLIANCE FIREWALL TEST SUITE ===${RESET}\n`);

// --- Direct Trade Commands ---
console.log(`${YELLOW}[Direct Trade Commands]${RESET}`);
assert('go long', 'You should go long here', 'You should Accumulation Zone Detected here');
assert('go short', 'Go short at resistance', 'Distribution Zone Detected at resistance');
assert('take profit', 'Take profit at 50000', 'Structural Target Reached at 50000');
assert('stop loss', 'Set stop loss at 48000', 'Set Risk Invalidation Level at 48000');
assert('stop-loss', 'Your stop-loss should be at 48000', 'Your Risk Invalidation Level should be at 48000');

// --- Single Word Directives ---
console.log(`\n${YELLOW}[Single Word Directives]${RESET}`);
assert('buy standalone', 'Buy at this level', 'Bullish Inflection Zone at this level');
assert('sell standalone', 'Sell at resistance', 'Bearish Liquidity Pullback at resistance');
assert('BUY uppercase', 'BUY now', 'Bullish Inflection Zone');
assert('Sell capitalized', 'Sell immediately', 'Bearish Liquidity Pullback immediately');

// --- Should NOT match (false positive prevention) ---
console.log(`\n${YELLOW}[False Positive Prevention]${RESET}`);
assert('buyer preserved', 'Buyers are stepping in', 'Buyers are stepping in');
assert('selling preserved', 'Selling pressure is high', 'Selling pressure is high');
assert('long-term preserved', 'The long-term trend is bullish', 'The long-term trend is bullish');
assert('short-term preserved', 'Short-term outlook is bearish', 'Short-term outlook is bearish');
assert('shortage preserved', 'There is a shortage of supply', 'There is a shortage of supply');
assert('shortly preserved', 'Price will shortly test resistance', 'Price will shortly test resistance');
assert('as long as preserved', 'As long as price holds above 50K', 'As long as price holds above 50K');
assert('buyback preserved', 'A buyback was announced', 'A buyback was announced');
assert('selloff preserved', 'A selloff occurred at market open', 'A selloff occurred at market open');

// --- Composite Phrases ---
console.log(`\n${YELLOW}[Composite Phrases]${RESET}`);
assert('buy the dip', 'Buy the dip at 45000', 'Accumulation Zone Near Demand at 45000');
assert('sell the rally', 'Sell the rally at 52000', 'Distribution Near Supply Zone at 52000');
assert('entry point', 'The entry point is 49000', 'The Zone of Interest is 49000');
assert('exit zone', 'Exit zone at 53000', 'Structural Exit Zone at 53000');

// --- Advisory Phrases ---
console.log(`\n${YELLOW}[Advisory Phrases]${RESET}`);
assert('you should buy', 'You should buy BTC', 'Structural analysis suggests BTC');
assert('you should sell', 'You should sell ETH', 'Structural analysis suggests ETH');
assert('i recommend buying', 'I recommend buying ETH', 'Structural confluence indicates ETH');

// --- Audit Compliance ---
console.log(`\n${YELLOW}[Audit Compliance Check]${RESET}`);
const cleanResult = auditCompliance('Bullish Inflection Zone detected at 50000');
assert('clean text passes audit', 
  cleanResult.clean ? 'CLEAN' : 'DIRTY', 
  'CLEAN');

const dirtyResult = auditCompliance('You should buy BTC and sell ETH');
assert('dirty text fails audit',
  dirtyResult.clean ? 'CLEAN' : 'DIRTY',
  'DIRTY');

console.log(`\n${BOLD}=== RESULTS ===${RESET}`);
console.log(`${GREEN}Passed: ${passed}${RESET} | ${failed > 0 ? RED : GREEN}Failed: ${failed}${RESET}\n`);

process.exit(failed > 0 ? 1 : 0);
