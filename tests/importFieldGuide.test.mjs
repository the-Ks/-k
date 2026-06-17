import assert from "node:assert/strict";
import test from "node:test";

import { getImportFieldGuide } from "../backend/src/services/dataSource.js";

test("import field guide exposes required source and message fields", () => {
  const guide = getImportFieldGuide();
  const requiredFields = new Set(guide.required.map((item) => item.field));

  assert.equal(guide.ok, true);
  assert.equal(requiredFields.has("source_system"), true);
  assert.equal(requiredFields.has("messages"), true);
  assert.equal(requiredFields.has("source_message_id"), true);
  assert.equal(requiredFields.has("source_chat_id"), true);
  assert.equal(requiredFields.has("source_sender_id"), true);
  assert.equal(Array.isArray(guide.template.messages), true);
});
