import assert from "node:assert/strict";
import test from "node:test";

import { importMessagesInPostgres, getImportBatchesFromPostgres } from "../backend/src/services/postgresDataSource.js";
import { closePostgresPool, getDatabaseStatus, isPostgresConfigured, query } from "../backend/src/services/postgresClient.js";

test("PostgreSQL message import is idempotent and records batch errors", async (t) => {
  if (!isPostgresConfigured()) {
    t.skip("PostgreSQL is not configured");
    return;
  }

  const status = await getDatabaseStatus();
  if (!status.connected) {
    t.skip("PostgreSQL is not connected");
    return;
  }

  const suffix = `${Date.now()}_${Math.round(Math.random() * 100000)}`;
  const sourceMessageId = `test_import_msg_${suffix}`;
  const sourceChatId = `test_import_chat_${suffix}`;
  let invalidBatchId = "";

  try {
    const payload = {
      source_system: "taobao",
      mode: "incremental",
      file_name: `test-import-${suffix}.json`,
      messages: [
        {
          source_message_id: sourceMessageId,
          source_chat_id: sourceChatId,
          source_sender_id: "test_sender",
          sender_name: "测试客户",
          time: "2026-06-15 09:12:20",
          role: "客户",
          content: "测试重复导入",
          message_type: "text"
        }
      ]
    };

    const first = await importMessagesInPostgres(payload);
    const second = await importMessagesInPostgres(payload);

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);

    const countResult = await query(
      "select count(*)::int as count from raw_message where source_system = $1 and source_message_id = $2",
      ["taobao", sourceMessageId]
    );
    assert.equal(countResult.rows[0].count, 1);

    const invalid = await importMessagesInPostgres({
      source_system: "wechat",
      messages: [
        {
          source_message_id: `test_invalid_msg_${suffix}`,
          source_chat_id: `test_invalid_chat_${suffix}`,
          source_sender_id: "test_sender",
          time: "2026-06-15T10:00:00+08:00",
          role: "客户",
          message_type: "image"
        }
      ]
    });
    invalidBatchId = invalid.batchId;

    assert.equal(invalid.ok, false);
    assert.equal(invalid.failedCount, 1);

    const detail = await getImportBatchesFromPostgres(new URLSearchParams({ batch_id: invalid.batchId }));
    assert.equal(detail.ok, true);
    assert.equal(detail.detail.id, invalid.batchId);
    assert.equal(detail.detail.errors.length, 1);
    assert.match(detail.detail.errors[0].message, /non-text messages require/);
  } finally {
    await query("delete from raw_message where source_message_id = $1", [sourceMessageId]).catch(() => {});
    await query("delete from import_batch where file_name = $1", [`test-import-${suffix}.json`]).catch(() => {});
    if (invalidBatchId) {
      await query("delete from import_batch where id = $1", [invalidBatchId]).catch(() => {});
    }
    await closePostgresPool();
  }
});
