import { sanitizeChunk, auditCompliance } from './complianceFirewall.js';
import assert from 'assert';

async function runTests() {
  console.log("Starting Compliance Firewall Tests...");

  // Test sanitizeChunk
  const rawText1 = "You should buy this stock right now! It is 100% accurate and risk-free.";
  const sanitized1 = sanitizeChunk(rawText1);
  assert.ok(!sanitized1.includes("buy"), "Should have removed 'buy'");
  assert.ok(!sanitized1.includes("100% accurate"), "Should have removed '100% accurate'");
  assert.ok(!sanitized1.includes("risk-free"), "Should have removed 'risk-free'");
  assert.ok(sanitized1.includes("calibration-tracked"), "Should have replaced '100% accurate' with 'calibration-tracked'");
  console.log("✓ sanitizeChunk handled tier 1 and tier 6 words properly.");

  const rawText2 = "Go long here, then take profit at the target.";
  const sanitized2 = sanitizeChunk(rawText2);
  assert.ok(!sanitized2.includes("Go long"), "Should have removed 'Go long'");
  assert.ok(!sanitized2.includes("take profit"), "Should have removed 'take profit'");
  console.log("✓ sanitizeChunk handled multi-word trade commands.");

  // Test auditCompliance
  const fullResponse1 = "This setup looks bullish. You should buy and it is guaranteed.";
  const auditResult1 = await auditCompliance(fullResponse1, "test-hash-123");
  assert.strictEqual(auditResult1.clean, false, "Should not be clean");
  assert.ok(auditResult1.violations.includes("buy"), "Should detect 'buy' violation");
  assert.ok(auditResult1.violations.includes("guaranteed"), "Should detect 'guaranteed' violation");
  console.log("✓ auditCompliance detected violations correctly.");

  const fullResponse2 = "The structural confluence indicates a bullish inflection zone. Statistically supported.";
  const auditResult2 = await auditCompliance(fullResponse2, "test-hash-456");
  assert.strictEqual(auditResult2.clean, true, "Should be clean");
  assert.strictEqual(auditResult2.violations.length, 0, "Should have 0 violations");
  console.log("✓ auditCompliance passed clean text.");

  console.log("All compliance tests passed!");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
