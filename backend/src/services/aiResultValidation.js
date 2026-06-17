export function validateAiQualityResult(result, promptProfile = {}) {
  const errors = [];
  if (!isPlainObject(result)) {
    return invalid(["result must be a JSON object"]);
  }

  if (Object.prototype.hasOwnProperty.call(result, "raw_content")) {
    errors.push("result.raw_content is not allowed; provider output was not valid JSON");
  }

  const profileKey = promptProfile.key || "review_limited";
  if (profileKey === "executive_full") {
    validateExecutiveResult(result, errors);
  } else if (profileKey === "service_coaching") {
    validateServiceResult(result, errors);
  } else {
    validateQualityReviewResult(result, errors);
  }

  return errors.length ? invalid(errors) : { ok: true, status: "valid", errors: [] };
}

function validateExecutiveResult(result, errors) {
  requireObject(result, "ai_semantic_score", errors);
  requireNumber(result.ai_semantic_score, "total_score", errors);
  requireObject(result, "customer_analysis", errors);
  requireNumber(result.customer_analysis, "semantic_score", errors);
  requireArray(result, "compliance_risks", errors, { maxLength: 6 });
  requireArray(result, "deductions", errors, { maxLength: 6 });
  requireArray(result, "positive_points", errors, { maxLength: 6 });
  requireArray(result, "insufficient_evidence", errors);
  requireString(result, "summary", errors);
}

function validateQualityReviewResult(result, errors) {
  requireObject(result, "review_score", errors);
  requireNumber(result.review_score, "total_score", errors);
  requireObject(result, "customer_signal", errors);
  requireArray(result, "risk_reminders", errors);
  requireArray(result, "review_items", errors);
  requireArray(result, "positive_points", errors);
  requireArray(result, "insufficient_evidence", errors);
  requireString(result, "summary", errors);
}

function validateServiceResult(result, errors) {
  requireObject(result, "self_improvement", errors);
  requireNumber(result.self_improvement, "service_quality_score", errors);
  requireObject(result, "customer_followup", errors);
  requireArray(result, "risk_reminders", errors);
  requireArray(result, "improvement_items", errors);
  requireArray(result, "positive_points", errors);
  requireArray(result, "insufficient_evidence", errors);
  requireString(result, "summary", errors);
}

function requireObject(parent, key, errors) {
  if (!isPlainObject(parent?.[key])) {
    errors.push(`${key} must be an object`);
  }
}

function requireNumber(parent, key, errors) {
  if (!Number.isFinite(parent?.[key])) {
    errors.push(`${key} must be a number`);
  }
}

function requireArray(parent, key, errors, options = {}) {
  const value = parent?.[key];
  if (!Array.isArray(value)) {
    errors.push(`${key} must be an array`);
    return;
  }

  if (options.maxLength && value.length > options.maxLength) {
    errors.push(`${key} must contain at most ${options.maxLength} items`);
  }
}

function requireString(parent, key, errors) {
  if (typeof parent?.[key] !== "string") {
    errors.push(`${key} must be a string`);
  }
}

function invalid(errors) {
  return { ok: false, status: "invalid", errors };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

