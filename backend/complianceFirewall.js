// =====================================================
// COMPLIANCE FIREWALL — Hardcoded Linguistic Barrier
// Intercepts, strips, and replaces prescriptive financial
// advisory language before text reaches the client.
// =====================================================

import { logComplianceViolation } from './memoryLedger.js';

const REPLACEMENT_MAP = [
  // =====================================================
  // ORDERING RULES: Longest/most-specific patterns FIRST.
  // Advisory phrases → Multi-word commands → Directional 
  // composites → Single-word catch-alls (last resort).
  // This prevents double-replacement bugs.
  // =====================================================

  // === TIER 1: Advisory Phrases (consume "buy/sell" before single-word rules can) ===
  { pattern: /\byou\s+should\s+(?:buy|sell|trade|invest)\b/gi, replacement: 'Structural analysis suggests' },
  { pattern: /\bi\s+(?:would|recommend|suggest)\s+(?:buy|sell|trad)(?:e|ing)?\b/gi, replacement: 'Structural confluence indicates' },
  { pattern: /\binvest\s+(?:in|now|here)\b/gi, replacement: 'Accumulation Interest Zone' },
  { pattern: /\bhold\s+(?:your|the)?\s*position\b/gi, replacement: 'Maintain structural thesis' },

  // === TIER 2: Multi-Word Trade Commands ===
  { pattern: /\bgo\s+long\b/gi,       replacement: 'Accumulation Zone Detected' },
  { pattern: /\bgo\s+short\b/gi,      replacement: 'Distribution Zone Detected' },
  { pattern: /\btake\s+profit\b/gi,   replacement: 'Structural Target Reached' },
  { pattern: /\bstop[\s-]?loss\b/gi,  replacement: 'Risk Invalidation Level' },
  { pattern: /\bcut\s+losses?\b/gi,   replacement: 'Risk Invalidation Triggered' },
  { pattern: /\bbook\s+profits?\b/gi, replacement: 'Structural Exit Zone Reached' },
  { pattern: /\bopen\s+a?\s*position\b/gi, replacement: 'Zone of Interest Identified' },
  { pattern: /\bclose\s+(?:your\s+)?position\b/gi, replacement: 'Structural Exit Zone' },
  { pattern: /\benter\s+(?:a\s+)?trade\b/gi, replacement: 'Zone of Interest' },
  { pattern: /\bexit\s+(?:the\s+)?trade\b/gi, replacement: 'Structural Exit Zone' },

  // === TIER 3: Risk Management Terms ===
  { pattern: /\bentry\s+(?:price|point|level|zone)\b/gi, replacement: 'Zone of Interest' },
  { pattern: /\bexit\s+(?:price|point|level|zone)\b/gi, replacement: 'Structural Exit Zone' },
  { pattern: /(?<!Structural )\btarget\s+(?:price|hit|reached)\b/gi, replacement: 'Structural Target Zone' },

  // === TIER 4: Directional Composites (buy/sell + context word) ===
  { pattern: /\bbuy\s+(?:the\s+)?dip\b/gi, replacement: 'Accumulation Zone Near Demand' },
  { pattern: /\bsell\s+(?:the\s+)?rally\b/gi, replacement: 'Distribution Near Supply Zone' },
  { pattern: /\bbuy\s+(?:here|now|this)\b/gi, replacement: 'Bullish Inflection Zone' },
  { pattern: /\bsell\s+(?:here|now|this)\b/gi, replacement: 'Bearish Liquidity Pullback' },

  // === TIER 5: Single-Word Catch-Alls (last resort, maximum false-positive guards) ===
  // "Buy" — but NOT "buyer", "buying", "buyback", and don't consume "at/here/now" (already handled above)
  { pattern: /\bbuy\b(?!er|ing|back|s\b)/gi, replacement: 'Bullish Inflection Zone' },
  // "Sell" — but NOT "seller", "selling", "selloff"  
  { pattern: /\bsell\b(?!er|ing|off|s\b)/gi, replacement: 'Bearish Liquidity Pullback' },
  // "Long" — only as trade directive, NOT "long-term", "long run", "as long as", "how long", "longitude"
  { pattern: /(?<!\bas\s)(?<!\bhow\s)\blong\b(?![\s-]?term|[\s-]?run|[\s-]?range|er|ing|ed|itude)/gi, replacement: 'Accumulation Signal' },
  // "Short" — only as trade directive, NOT "short-term", "shortage", "shortly", "shortfall", "shortcoming"
  { pattern: /\bshort\b(?![\s-]?term|[\s-]?run|[\s-]?range|age|ly|er|ing|ed|fall|coming)/gi, replacement: 'Distribution Block' },

  // === TIER 6: Phase 3 Hard-Block Terms (PRD §4.5) ===
  // Overclaim language that cannot appear anywhere in any output.
  { pattern: /\bguaranteed?\b/gi,                  replacement: 'statistically supported' },
  { pattern: /\bnever\s+lose\b/gi,                 replacement: 'risk-managed' },
  { pattern: /\b100%\s*accurate\b/gi,              replacement: 'calibration-tracked' },
  { pattern: /\brisk[\s-]?free\b/gi,               replacement: 'low-risk-structure' },
  { pattern: /\balways\s+profitable\b/gi,          replacement: 'historically positive EV' },
  { pattern: /\bzero[\s-]?risk\b/gi,               replacement: 'minimal structural risk' },
  { pattern: /\bno[\s-]?risk\b/gi,                 replacement: 'defined-risk setup' },
  { pattern: /\b(?:absolute|100%)\s+certain(?:ty)?\b/gi, replacement: 'high-probability' },

  // === TIER 7: Multilingual Advisory Language (Global Compliance) ===
  // Hindi (\b doesn't work with Devanagari — use direct matching)
  { pattern: /खरीदना\s*चाहिए/g, replacement: 'Bullish Inflection Zone (analysis only)' },
  { pattern: /बेचना\s*चाहिए/g,  replacement: 'Bearish Liquidity Pullback (analysis only)' },
  { pattern: /आपको\s+खरीदना/g,  replacement: 'Bullish Zone detected — user discretion applies' },
  { pattern: /आपको\s+बेचना/g,   replacement: 'Bearish Zone detected — user discretion applies' },
  { pattern: /खरीदें/g,    replacement: 'Bullish Inflection Zone' },
  { pattern: /बेचें/g,     replacement: 'Bearish Liquidity Pullback' },
  { pattern: /खरीदो/g,    replacement: 'Bullish Inflection Zone' },
  { pattern: /बेचो/g,     replacement: 'Bearish Liquidity Pullback' },
  { pattern: /खरीदना/g,   replacement: 'Bullish Accumulation' },
  { pattern: /बेचना/g,    replacement: 'Bearish Distribution' },
  { pattern: /निवेश करें/g, replacement: 'Accumulation Interest Zone' },
  { pattern: /निवेश करो/g,  replacement: 'Accumulation Interest Zone' },
  // Japanese
  { pattern: /買い/g,           replacement: 'Bullish Inflection Zone' },
  { pattern: /売り/g,           replacement: 'Bearish Liquidity Pullback' },
  { pattern: /購入/g,           replacement: 'Accumulation Signal' },
  { pattern: /売却/g,           replacement: 'Distribution Block' },
  // Spanish
  { pattern: /\bcomprar\b/gi,   replacement: 'Bullish Inflection Zone' },
  { pattern: /\bvender\b/gi,    replacement: 'Bearish Liquidity Pullback' },
  { pattern: /\binvertir\b/gi,  replacement: 'Accumulation Interest Zone' },
  // Portuguese
  { pattern: /\bcompre\b/gi,    replacement: 'Bullish Inflection Zone' },
  { pattern: /\bvenda\b/gi,     replacement: 'Bearish Liquidity Pullback' },
  // Arabic
  { pattern: /شراء/g,           replacement: 'Bullish Inflection Zone' },
  { pattern: /بيع/g,            replacement: 'Bearish Liquidity Pullback' },
  // Korean
  { pattern: /매수/g,           replacement: 'Bullish Inflection Zone' },
  { pattern: /매도/g,           replacement: 'Bearish Liquidity Pullback' },
  // French
  { pattern: /\bacheter\b/gi,   replacement: 'Bullish Inflection Zone' },
  { pattern: /\bvendre\b/gi,    replacement: 'Bearish Liquidity Pullback' },
  // German
  { pattern: /\bkaufen\b/gi,    replacement: 'Bullish Inflection Zone' },
  { pattern: /\bverkaufen\b/gi, replacement: 'Bearish Liquidity Pullback' },
];

/**
 * Sanitizes a text chunk through the compliance firewall.
 * Applies all regex replacements sequentially for maximum coverage.
 * Designed for hot-path streaming — minimal allocations.
 * 
 * @param {string} text - Raw text chunk from AI model
 * @returns {string} - Compliant text safe for client delivery
 */
export function sanitizeChunk(text) {
  if (!text || typeof text !== 'string') return text;
  
  let sanitized = text;
  for (const rule of REPLACEMENT_MAP) {
    sanitized = sanitized.replace(rule.pattern, rule.replacement);
  }
  return sanitized;
}

/**
 * Validates that a full response contains no banned terms.
 * Logs any violations to MongoDB via the memory ledger.
 *
 * @param {string} fullText   - Complete AI response
 * @param {string} [signalHash] - Signal ID for DB linkage
 * @returns {{ clean: boolean, violations: string[] }}
 */
export async function auditCompliance(fullText, signalHash) {
  if (!fullText) return { clean: true, violations: [] };
  
  const violations = [];
  const AUDIT_PATTERNS = [
    // Phase 2 terms — exclude structural label forms like "Stop Loss: $xxx" and "Take Profit: $xxx"
    // These are emitted by Module 14 verdict and are data labels, not advisories
    { term: 'buy',        pattern: /\bbuy\b(?!er|ing|back|s\b)/gi },
    { term: 'sell',       pattern: /\bsell\b(?!er|ing|off|s\b)/gi },
    { term: 'go long',    pattern: /\bgo\s+long\b/gi },
    { term: 'go short',   pattern: /\bgo\s+short\b/gi },
    // Only flag "take profit" as advisory when NOT followed by a colon (not a label)
    { term: 'take profit', pattern: /\btake\s+profit\b(?!\s*:)/gi },
    // Only flag "stop loss" as advisory when NOT followed by a colon (not a label)
    { term: 'stop loss',  pattern: /\bstop[\s-]?loss\b(?!\s*:)/gi },
    // Phase 3 hard-block terms (PRD §4.5)
    { term: 'guaranteed',        pattern: /\bguaranteed?\b/gi },
    { term: 'never lose',        pattern: /\bnever\s+lose\b/gi },
    { term: '100% accurate',     pattern: /\b100%\s*accurate\b/gi },
    { term: 'risk-free',         pattern: /\brisk[\s-]?free\b/gi },
    { term: 'always profitable', pattern: /\balways\s+profitable\b/gi },
    { term: 'zero risk',         pattern: /\bzero[\s-]?risk\b/gi },
  ];
  
  for (const check of AUDIT_PATTERNS) {
    if (check.pattern.test(fullText)) {
      violations.push(check.term);
    }
    check.pattern.lastIndex = 0;
  }

  // Log violations to DB (await to ensure it writes before process exists)
  if (violations.length > 0 && signalHash) {
    try {
      const logPromises = violations.map(term => {
        const idx = fullText.toLowerCase().indexOf(term.toLowerCase());
        const context = idx >= 0 ? fullText.substring(Math.max(0, idx - 30), idx + 60) : '';
        return logComplianceViolation(term, context, signalHash);
      });
      await Promise.all(logPromises);
    } catch (err) {
      console.error('[COMPLIANCE] Error logging violations:', err);
    }
  }
  
  return { clean: violations.length === 0, violations };
}
