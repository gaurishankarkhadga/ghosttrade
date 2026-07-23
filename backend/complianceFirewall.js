// =====================================================
// COMPLIANCE FIREWALL — Hardcoded Linguistic Barrier
// Intercepts, strips, and replaces prescriptive financial
// advisory language before text reaches the client.
// =====================================================

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
    // Phase 2 terms
    { term: 'buy',        pattern: /\bbuy\b(?!er|ing|back)/gi },
    { term: 'sell',       pattern: /\bsell\b(?!er|ing|off)/gi },
    { term: 'go long',    pattern: /\bgo\s+long\b/gi },
    { term: 'go short',   pattern: /\bgo\s+short\b/gi },
    { term: 'take profit',pattern: /\btake\s+profit\b/gi },
    { term: 'stop loss',  pattern: /\bstop[\s-]?loss\b/gi },
    // Phase 3 hard-block terms (PRD §4.5)
    { term: 'guaranteed',       pattern: /\bguaranteed?\b/gi },
    { term: 'never lose',       pattern: /\bnever\s+lose\b/gi },
    { term: '100% accurate',    pattern: /\b100%\s*accurate\b/gi },
    { term: 'risk-free',        pattern: /\brisk[\s-]?free\b/gi },
    { term: 'always profitable', pattern: /\balways\s+profitable\b/gi },
    { term: 'zero risk',        pattern: /\bzero[\s-]?risk\b/gi },
  ];
  
  for (const check of AUDIT_PATTERNS) {
    if (check.pattern.test(fullText)) {
      violations.push(check.term);
    }
    check.pattern.lastIndex = 0;
  }

  // Log violations to DB asynchronously (non-blocking)
  if (violations.length > 0 && signalHash) {
    import('./memoryLedger.js').then(({ logComplianceViolation }) => {
      for (const term of violations) {
        const idx = fullText.toLowerCase().indexOf(term.toLowerCase());
        const context = idx >= 0 ? fullText.substring(Math.max(0, idx - 30), idx + 60) : '';
        logComplianceViolation(term, context, signalHash);
      }
    }).catch(() => {});
  }
  
  return { clean: violations.length === 0, violations };
}
