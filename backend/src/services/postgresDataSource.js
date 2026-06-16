import { query } from "./postgresClient.js";
import { classifyQuestionTypes, fallbackQuestionTypes } from "./biClassifier.js";
import { buildIdentityReviewTasksFromMessages } from "./identityMatcher.js";
import { normalizeImportPayload } from "./messageImportNormalizer.js";
import { buildObjectiveDimensions, computeConversationObjectiveMetrics } from "./objectiveMetrics.js";

export async function loginFromPostgres(username, password) {
  const result = await query(
    `
      select
        u.id,
        u.username,
        u.password_hash,
        u.name,
        u.department,
        u.data_scope,
        coalesce(r.key, 'quality_user') as role
      from app_user u
      left join user_role ur on ur.user_id = u.id
      left join role r on r.id = ur.role_id
      where u.username = $1 and u.status = 'active'
      order by r.priority desc nulls last
      limit 1
    `,
    [username]
  );

  const row = result.rows[0];
  if (!row || row.password_hash !== password) {
    return {
      ok: false,
      message: "账号或密码错误"
    };
  }

  return {
    ok: true,
    token: `db-token-${row.id}`,
    user: toUser(row)
  };
}

export async function getDemoUsersFromPostgres() {
  const result = await query(
    `
      select
        u.id,
        u.username,
        u.name,
        u.department,
        u.data_scope,
        coalesce(r.key, 'quality_user') as role
      from app_user u
      left join user_role ur on ur.user_id = u.id
      left join role r on r.id = ur.role_id
      where u.status = 'active'
      order by r.priority desc nulls last, u.created_at asc
    `
  );
  return result.rows.map(toUser);
}

export async function getMessagesFromPostgres(searchParams = new URLSearchParams()) {
  const platform = searchParams.get("platform");
  const role = searchParams.get("role");
  const params = [];
  const where = [];

  if (platform && platform !== "all") {
    params.push(platform);
    where.push(`source_system = $${params.length}`);
  }

  if (role && role !== "all") {
    params.push(role);
    where.push(`normalized_role = $${params.length}`);
  }

  const result = await query(
    `
      select
        id,
        source_system,
        source_chat_id,
        source_sender_id,
        sender_name,
        normalized_role,
        person_id,
        sent_at,
        content,
        message_type,
        media_url,
        media_path,
        media_mime_type,
        media_size_bytes,
        media_width,
        media_height,
        duration_seconds,
        file_name,
        thumbnail_url,
        ocr_text,
        transcript_text,
        media_description,
        image_description,
        link_url,
        link_title,
        attachments,
        structured_content,
        media_metadata
      from raw_message
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by sent_at asc, id asc
      limit 1000
    `,
    params
  );

  return result.rows.map(toRawMessage);
}

export async function getIdentityReviewTasksFromPostgres() {
  const [matchesResult, messagesResult] = await Promise.all([
    query(
    `
      select
        im.id,
        im.status,
        im.confidence,
        im.person_id,
        p.display_name,
        ta.platform_account_id as taobao_account,
        wa.platform_account_id as wechat_account,
        im.evidence_message_id,
        im.evidence
      from identity_match im
      left join person p on p.id = im.person_id
      left join platform_account ta on ta.id = im.taobao_account_id
      left join platform_account wa on wa.id = im.wechat_account_id
      order by im.created_at desc
      limit 100
    `
    ),
    query(
      `
        select
          id,
          source_system,
          source_chat_id,
          source_sender_id,
          sender_name,
          normalized_role,
          sent_at,
          content,
          message_type,
          ocr_text,
          transcript_text,
          media_description,
          image_description,
          link_title,
          link_url
        from raw_message
        where normalized_role = 'customer'
        order by sent_at asc, id asc
        limit 2000
      `
    )
  ]);

  const storedTasks = matchesResult.rows.map((row) => ({
    id: row.id,
    status: row.status,
    confidence: Number(row.confidence || 0),
    recommendedPersonId: row.person_id,
    recommendedName: row.display_name || row.person_id,
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    taobaoAccount: row.taobao_account || "待确认",
    wechatAccount: row.wechat_account || "待确认",
    sourceMessageId: row.evidence_message_id || ""
  }));

  const messages = messagesResult.rows.map((row) => ({
    id: row.id,
    platform: row.source_system,
    sourceChatId: row.source_chat_id,
    sourceSenderId: row.source_sender_id,
    senderName: row.sender_name,
    normalizedRole: row.normalized_role,
    sentAt: row.sent_at,
    content: buildMessageAnalysisText(row),
    messageType: row.message_type
  }));

  return buildIdentityReviewTasksFromMessages(storedTasks, messages);
}

export async function getConversationsFromPostgres() {
  const result = await query(
    `
      select
        c.id,
        c.customer_person_id,
        coalesce(p.display_name, c.customer_person_id) as customer_name,
        coalesce(u.name, '未分配') as owner,
        c.status,
        c.stage,
        c.started_at,
        c.last_message_at,
        coalesce(array_remove(array_agg(distinct cp.display_name), null), '{}') as participants,
        coalesce(c.timeline, '[]'::jsonb) as timeline
      from conversation c
      left join person p on p.id = c.customer_person_id
      left join app_user u on u.id = c.owner_user_id
      left join conversation_participant cpa on cpa.conversation_id = c.id
      left join person cp on cp.id = cpa.person_id
      group by c.id, p.display_name, u.name
      order by c.last_message_at desc nulls last
      limit 200
    `
  );

  return result.rows.map((row) => ({
    id: row.id,
    customerId: row.customer_person_id,
    customerName: row.customer_name,
    owner: row.owner,
    status: row.status,
    stage: row.stage,
    startedAt: formatDateTime(row.started_at),
    lastMessageAt: formatDateTime(row.last_message_at),
    participants: row.participants || [],
    timeline: Array.isArray(row.timeline) ? row.timeline : []
  }));
}

export async function getQualityResultsFromPostgres() {
  const result = await query(
    `
      select
        qs.id,
        qs.conversation_id,
        coalesce(p.display_name, c.customer_person_id) as customer_name,
        coalesce(u.name, '未分配') as owner,
        qs.objective_score,
        qs.ai_score,
        qs.final_score,
        qs.status,
        qs.objective_metrics,
        qs.dimensions,
        qs.risks
      from quality_score qs
      join conversation c on c.id = qs.conversation_id
      left join person p on p.id = c.customer_person_id
      left join app_user u on u.id = c.owner_user_id
      order by qs.created_at desc
      limit 200
    `
  );

  const conversationIds = result.rows.map((row) => row.conversation_id).filter(Boolean);
  const messagesByConversation = await getConversationMessagesByConversationId(conversationIds);

  return result.rows.map((row) => {
    const storedMetrics = row.objective_metrics || {};
    const messages = messagesByConversation.get(row.conversation_id) || [];
    const computedMetrics = messages.length ? computeConversationObjectiveMetrics(messages) : null;
    const metrics = computedMetrics || storedMetrics;
    const objectiveScore = Number(metrics.objective_score ?? row.objective_score ?? 0);
    const aiScore = Number(row.ai_score || 0);
    const finalScore = Math.min(100, Math.round((objectiveScore + aiScore) * 10) / 10);
    const objectiveDimensions = computedMetrics ? buildObjectiveDimensions(computedMetrics) : [];
    const storedDimensions = Array.isArray(row.dimensions) ? row.dimensions : [];
    const semanticDimensions = storedDimensions.filter((item) => !["响应速度", "回复覆盖率", "流程执行"].includes(item.name));
    return {
      id: row.id,
      conversationId: row.conversation_id,
      customerName: row.customer_name,
      owner: row.owner,
      objectiveScore,
      aiScore,
      finalScore,
      totalScore: finalScore,
      status: row.status,
      responseTime: {
        firstResponseSeconds: metrics.first_response_seconds ?? null,
        longestWaitSeconds: metrics.longest_wait_seconds ?? null,
        averageResponseSeconds: metrics.average_response_seconds ?? null,
        timeoutCount: metrics.timeout_count ?? null,
        replyCoverageRate: metrics.reply_coverage_rate ?? null,
        customerQuestionCount: metrics.customer_question_count ?? null,
        proactiveFollowupCount: metrics.proactive_followup_count ?? null,
        score: metrics.response_score ?? null
      },
      objectiveMetrics: metrics,
      dimensions: [...objectiveDimensions, ...semanticDimensions],
      risks: Array.isArray(row.risks) ? row.risks : []
    };
  });
}

async function getConversationMessagesByConversationId(conversationIds = []) {
  if (!conversationIds.length) return new Map();

  const result = await query(
    `
      select
        cm.conversation_id,
        rm.id,
        rm.sent_at,
        rm.normalized_role,
        rm.sender_name,
        rm.content,
        rm.message_type,
        rm.ocr_text,
        rm.transcript_text,
        rm.media_description,
        rm.image_description,
        rm.link_title,
        rm.link_url,
        rm.media_path,
        rm.media_url
      from conversation_message cm
      join raw_message rm on rm.id = cm.message_id
      where cm.conversation_id = any($1::text[])
      order by cm.conversation_id asc, cm.sequence_no asc
    `,
    [conversationIds]
  );

  const map = new Map();
  for (const row of result.rows) {
    if (!map.has(row.conversation_id)) map.set(row.conversation_id, []);
    map.get(row.conversation_id).push({
      id: row.id,
      sentAt: row.sent_at,
      role: row.normalized_role,
      speaker: row.sender_name,
      content: buildMessageAnalysisText(row),
      messageType: row.message_type,
      mediaPath: row.media_path,
      mediaUrl: row.media_url,
      linkUrl: row.link_url
    });
  }
  return map;
}

export async function getCustomerProfilesFromPostgres() {
  const result = await query(
    `
      select
        cp.person_id,
        p.display_name,
        cp.taobao_id,
        cp.wechat_id,
        cp.intent_level,
        cp.satisfaction,
        coalesce(u.name, '未分配') as owner,
        cp.tags,
        cp.needs,
        cp.last_active_at
      from customer_profile cp
      left join person p on p.id = cp.person_id
      left join app_user u on u.id = cp.owner_user_id
      order by cp.last_active_at desc nulls last
      limit 500
    `
  );

  return result.rows.map((row) => ({
    id: row.person_id,
    name: row.display_name || row.person_id,
    taobaoId: row.taobao_id || "待确认",
    wechatId: row.wechat_id || "待确认",
    intentLevel: row.intent_level || "未知",
    satisfaction: row.satisfaction || "未知",
    owner: row.owner,
    tags: Array.isArray(row.tags) ? row.tags : [],
    needs: Array.isArray(row.needs) ? row.needs : [],
    lastActiveAt: formatDateTime(row.last_active_at)
  }));
}

export async function getPermissionModelFromPostgres() {
  const [roles, permissions, accounts] = await Promise.all([
    query("select key, name, data_scope, user_count from role order by priority desc"),
    query("select key from permission order by key asc"),
    getDemoUsersFromPostgres()
  ]);

  return {
    roles: roles.rows.map((row) => ({
      key: row.key,
      name: row.name,
      dataScope: row.data_scope,
      userCount: Number(row.user_count || 0)
    })),
    permissions: permissions.rows.map((row) => row.key),
    accounts
  };
}

export async function createAccountRequestInPostgres(payload = {}) {
  const result = await query(
    `
      insert into account_request (name, username, department, role_key, data_scope, note, status)
      values ($1, $2, $3, $4, $5, $6, 'pending')
      returning id, name, username, department, role_key, data_scope, note, status, created_at
    `,
    [
      String(payload.name || "").trim(),
      String(payload.username || "").trim(),
      String(payload.department || "").trim(),
      payload.role || "service_user",
      payload.dataScope || "self",
      payload.note || ""
    ]
  );

  const row = result.rows[0];
  return {
    ok: true,
    message: "账号申请已写入数据库",
    record: {
      id: row.id,
      name: row.name,
      username: row.username,
      department: row.department,
      role: row.role_key,
      dataScope: row.data_scope,
      note: row.note,
      status: row.status,
      createdAt: row.created_at
    },
    persistence: "postgres"
  };
}

export async function getSyncStatusFromPostgres() {
  const result = await query(
    `
      select
        source_system,
        max(finished_at) filter (where mode = 'full') as last_full_sync_at,
        max(finished_at) filter (where mode = 'incremental') as last_incremental_sync_at,
        count(*) as batch_count
      from import_batch
      group by source_system
    `
  );

  const bySource = new Map(result.rows.map((row) => [row.source_system, row]));
  return {
    mode: "postgres",
    databaseApi: "connected",
    lastFullSyncAt: formatDateTime(maxDate(result.rows.map((row) => row.last_full_sync_at))) || "暂无",
    lastIncrementalSyncAt: formatDateTime(maxDate(result.rows.map((row) => row.last_incremental_sync_at))) || "暂无",
    sourceSystems: [
      toSourceStatus("taobao", "淘宝聊天记录", bySource),
      toSourceStatus("wechat", "微信聊天记录", bySource),
      { name: "淘宝-微信关联记录", status: "database", expectedFields: ["taobao_id", "wechat_id", "evidence_message_id"] }
    ],
    syncChecks: ["原始数据完整保留", "按来源去重", "失败重试", "同步日志", "字段标准化"]
  };
}

export async function getBiDashboardFromPostgres(baseDashboard = {}) {
  const result = await query(
    `
      select content, message_type, ocr_text, transcript_text, media_description, image_description, link_title, link_url
      from raw_message
      where normalized_role = 'customer'
      order by sent_at desc
      limit 2000
    `
  );
  const questionTypes = classifyQuestionTypes(result.rows);

  return {
    ...baseDashboard,
    meta: {
      ...(baseDashboard.meta || {}),
      questionCategoryDefinition: "从客户消息的文本、语音转写、图片OCR、视频/文件描述中按花卉园艺业务规则识别分类；一条消息可同时命中多个分类。"
    },
    questionTypes: questionTypes.length ? questionTypes : fallbackQuestionTypes()
  };
}

export async function importMessagesInPostgres(payload = {}) {
  const normalized = normalizeImportPayload(payload);

  if (normalized.payloadErrors.length) {
    return {
      ok: false,
      message: "导入参数不完整",
      errors: normalized.payloadErrors
    };
  }

  const sourceSystem = normalized.sourceSystem;
  const batchId = `batch_${sourceSystem}_${Date.now()}`;
  await query(
    `
      insert into import_batch (id, source_system, mode, file_name, status, total_count, started_at, metadata)
      values ($1, $2, $3, $4, 'running', $5, now(), $6::jsonb)
    `,
    [batchId, sourceSystem, normalized.mode, normalized.fileName, normalized.messages.length, JSON.stringify(normalized.batchMetadata)]
  );

  let successCount = 0;
  let failedCount = 0;
  const errors = [];

  for (const normalizedMessage of normalized.messages) {
    if (!normalizedMessage.valid) {
      failedCount += 1;
      errors.push({
        index: normalizedMessage.index,
        message: normalizedMessage.errors.join("; ")
      });
      continue;
    }

    const message = normalizedMessage.value;
    try {
      await query(
        `
          insert into raw_message (
            source_system,
            source_message_id,
            source_chat_id,
            source_sender_id,
            sender_name,
            sent_at,
            role_raw,
            normalized_role,
            content,
            message_type,
            media_url,
            media_path,
            media_mime_type,
            media_size_bytes,
            media_width,
            media_height,
            duration_seconds,
            file_name,
            thumbnail_url,
            ocr_text,
            transcript_text,
            media_description,
            image_description,
            link_url,
            link_title,
            attachments,
            structured_content,
            media_metadata,
            raw_payload,
            import_batch_id
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26::jsonb, $27::jsonb, $28::jsonb, $29::jsonb, $30
          )
          on conflict (source_system, source_message_id) do update set
            source_chat_id = excluded.source_chat_id,
            source_sender_id = excluded.source_sender_id,
            sender_name = excluded.sender_name,
            sent_at = excluded.sent_at,
            role_raw = excluded.role_raw,
            normalized_role = excluded.normalized_role,
            content = excluded.content,
            message_type = excluded.message_type,
            media_url = excluded.media_url,
            media_path = excluded.media_path,
            media_mime_type = excluded.media_mime_type,
            media_size_bytes = excluded.media_size_bytes,
            media_width = excluded.media_width,
            media_height = excluded.media_height,
            duration_seconds = excluded.duration_seconds,
            file_name = excluded.file_name,
            thumbnail_url = excluded.thumbnail_url,
            ocr_text = excluded.ocr_text,
            transcript_text = excluded.transcript_text,
            media_description = excluded.media_description,
            image_description = excluded.image_description,
            link_url = excluded.link_url,
            link_title = excluded.link_title,
            attachments = excluded.attachments,
            structured_content = excluded.structured_content,
            media_metadata = excluded.media_metadata,
            raw_payload = excluded.raw_payload,
            import_batch_id = excluded.import_batch_id
        `,
        [
          sourceSystem,
          message.sourceMessageId,
          message.sourceChatId,
          message.sourceSenderId,
          message.senderName,
          message.sentAt,
          message.roleRaw,
          message.normalizedRole,
          message.content,
          message.messageType,
          message.mediaUrl,
          message.mediaPath,
          message.mediaMimeType,
          message.mediaSizeBytes,
          message.mediaWidth,
          message.mediaHeight,
          message.durationSeconds,
          message.fileName,
          message.thumbnailUrl,
          message.ocrText,
          message.transcriptText,
          message.mediaDescription,
          message.imageDescription,
          message.linkUrl,
          message.linkTitle,
          JSON.stringify(message.attachments),
          JSON.stringify(message.structuredContent),
          JSON.stringify(message.mediaMetadata),
          JSON.stringify(message.rawPayload),
          batchId
        ]
      );
      successCount += 1;
    } catch (error) {
      failedCount += 1;
      errors.push({
        index: normalizedMessage.index,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  await query(
    `
      update import_batch
      set status = $2,
          success_count = $3,
          failed_count = $4,
          finished_at = now(),
          error_message = $5
      where id = $1
    `,
    [batchId, failedCount ? "completed_with_errors" : "completed", successCount, failedCount, errors.length ? JSON.stringify(errors.slice(0, 5)) : null]
  );

  return {
    ok: failedCount === 0,
    batchId,
    sourceSystem,
    totalCount: normalized.messages.length,
    successCount,
    failedCount,
    errors
  };
}

function toRawMessage(row) {
  return {
    id: row.id,
    platform: row.source_system,
    sourceChatId: row.source_chat_id,
    sourceSenderId: row.source_sender_id,
    senderName: row.sender_name,
    normalizedRole: row.normalized_role,
    personId: row.person_id,
    sentAt: formatDateTime(row.sent_at),
    content: row.content || "",
    analysisText: buildMessageAnalysisText(row),
    messageType: row.message_type || "text",
    mediaUrl: row.media_url || "",
    mediaPath: row.media_path || "",
    mediaMimeType: row.media_mime_type || "",
    mediaSizeBytes: row.media_size_bytes === null || row.media_size_bytes === undefined ? null : Number(row.media_size_bytes),
    mediaWidth: row.media_width,
    mediaHeight: row.media_height,
    durationSeconds: row.duration_seconds === null || row.duration_seconds === undefined ? null : Number(row.duration_seconds),
    fileName: row.file_name || "",
    thumbnailUrl: row.thumbnail_url || "",
    ocrText: row.ocr_text || "",
    transcriptText: row.transcript_text || "",
    mediaDescription: row.media_description || row.image_description || "",
    imageDescription: row.image_description || "",
    linkUrl: row.link_url || "",
    linkTitle: row.link_title || "",
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    structuredContent: row.structured_content && typeof row.structured_content === "object" ? row.structured_content : {},
    mediaMetadata: row.media_metadata && typeof row.media_metadata === "object" ? row.media_metadata : {}
  };
}

function buildMessageAnalysisText(row = {}) {
  return [
    row.content,
    row.transcript_text,
    row.ocr_text,
    row.media_description,
    row.image_description,
    row.link_title,
    row.link_url
  ]
    .filter(Boolean)
    .join(" / ");
}

function toSourceStatus(key, name, bySource) {
  const row = bySource.get(key);
  return {
    name,
    status: row ? "synced" : "waiting",
    expectedFields: ["time", "role", "content/text", "message_type", "media_url/media_path", "transcript_text/ocr_text/media_description", "source_chat_id", "source_sender_id"]
  };
}

function toUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    department: row.department,
    dataScope: row.data_scope,
    permissions: row.role === "super_admin" ? ["*"] : []
  };
}

function formatDateTime(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function maxDate(values) {
  const timestamps = values.filter(Boolean).map((value) => new Date(value).getTime()).filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps));
}
