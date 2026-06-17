import assert from "node:assert/strict";
import test from "node:test";

import { normalizeImportPayload, normalizeMessageRole, normalizeSourceSystem } from "../backend/src/services/messageImportNormalizer.js";

test("message import normalizer accepts aliased fields and maps Chinese roles", () => {
  const result = normalizeImportPayload({
    source_system: "taobao",
    messages: [
      {
        message_id: "tb_msg_001",
        chat_id: "tb_chat_1001",
        sender_id: "tb_customer_7788",
        sender_name: "清风",
        time: "2026-06-15 09:12:20",
        role: "客户",
        text: "这个产品一般多久能看到效果？"
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceSystem, "taobao");
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].value.normalizedRole, "customer");
  assert.equal(result.messages[0].value.messageType, "text");
});

test("message import normalizer requires evidence for non-text messages", () => {
  const result = normalizeImportPayload({
    source_system: "wechat",
    messages: [
      {
        source_message_id: "wx_msg_001",
        source_chat_id: "wx_group_01",
        source_sender_id: "wx_user_01",
        send_time: "2026-06-15T10:00:00+08:00",
        role: "客户",
        message_type: "image"
      }
    ]
  });

  assert.equal(result.ok, false);
  assert.match(result.messages[0].errors.join(" "), /non-text messages require/);
});

test("source and role normalization reject unknown sources but tolerate unknown roles", () => {
  assert.equal(normalizeSourceSystem("unknown"), "");
  assert.equal(normalizeMessageRole("临时访客"), "unknown");
});
