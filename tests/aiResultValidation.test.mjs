import assert from "node:assert/strict";
import test from "node:test";

import { validateAiQualityResult } from "../backend/src/services/aiResultValidation.js";

test("AI result validation accepts the executive profile schema", () => {
  const validation = validateAiQualityResult(
    {
      ai_semantic_score: { total_score: 55 },
      customer_analysis: { semantic_score: 88 },
      compliance_risks: [],
      deductions: [],
      positive_points: [],
      insufficient_evidence: [],
      summary: "整体服务质量稳定。"
    },
    { key: "executive_full" }
  );

  assert.equal(validation.ok, true);
  assert.equal(validation.status, "valid");
});

test("AI result validation rejects provider text that was not valid JSON", () => {
  const validation = validateAiQualityResult(
    {
      raw_content: "not json"
    },
    { key: "review_limited" }
  );

  assert.equal(validation.ok, false);
  assert.equal(validation.status, "invalid");
  assert.match(validation.errors.join(" "), /raw_content/);
});
