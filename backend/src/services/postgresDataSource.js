import crypto from "node:crypto";
import { query } from "./postgresClient.js";
import { classifyQuestionTypes, fallbackQuestionTypes } from "./biClassifier.js";
import { buildIdentityReviewTasksFromMessages } from "./identityMatcher.js";
import { normalizeImportPayload } from "./messageImportNormalizer.js";
import { buildObjectiveDimensions, computeConversationObjectiveMetrics } from "./objectiveMetrics.js";
import { hashPassword, verifyPassword } from "./passwordService.js";

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
  if (!row || !(await verifyPassword(password, row.password_hash))) {
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

export async function getMessagesFromPostgres(searchParams = new URLSearchParams(), currentUser = null) {
  const platform = searchParams.get("platform");
  const role = searchParams.get("role");
  const params = [];
  const where = [];
  const joins = [];

  if (platform && platform !== "all") {
    params.push(platform);
    where.push(`rm.source_system = $${params.length}`);
  }

  if (role && role !== "all") {
    params.push(role);
    where.push(`rm.normalized_role = $${params.length}`);
  }

  if (isSelfScopedUser(currentUser)) {
    joins.push("join conversation_message cm_scope on cm_scope.message_id = rm.id");
    joins.push("join conversation c_scope on c_scope.id = cm_scope.conversation_id");
    params.push(currentUser.id);
    where.push(`c_scope.owner_user_id = $${params.length}`);
  }

  const result = await query(
    `
      select distinct
        rm.id,
        rm.source_system,
        rm.source_chat_id,
        rm.source_sender_id,
        rm.sender_name,
        rm.normalized_role,
        rm.person_id,
        rm.sent_at,
        rm.content,
        rm.message_type,
        rm.media_url,
        rm.media_path,
        rm.media_mime_type,
        rm.media_size_bytes,
        rm.media_width,
        rm.media_height,
        rm.duration_seconds,
        rm.file_name,
        rm.thumbnail_url,
        rm.ocr_text,
        rm.transcript_text,
        rm.media_description,
        rm.image_description,
        rm.link_url,
        rm.link_title,
        rm.attachments,
        rm.structured_content,
        rm.media_metadata
      from raw_message rm
      ${joins.join("\n")}
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by rm.sent_at asc, rm.id asc
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

export async function getConversationsFromPostgres(currentUser = null) {
  const params = [];
  const where = [];
  addSelfScopeFilter(where, params, currentUser, "c.owner_user_id");

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
      ${where.length ? `where ${where.join(" and ")}` : ""}
      group by c.id, p.display_name, u.name
      order by c.last_message_at desc nulls last
      limit 200
    `,
    params
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

export async function getQualityResultsFromPostgres(currentUser = null) {
  const params = [];
  const where = [];
  addSelfScopeFilter(where, params, currentUser, "c.owner_user_id");

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
        qs.risks,
        qs.manual_adjust_reason,
        qs.scorer_user_id,
        scorer.name as scorer_name,
        qs.reviewed_by,
        reviewer.name as reviewed_by_name,
        qs.reviewed_at,
        qs.created_at,
        qs.updated_at,
        c.status as conversation_status,
        c.stage as conversation_stage,
        c.started_at as conversation_started_at,
        c.last_message_at as conversation_last_message_at
      from quality_score qs
      join conversation c on c.id = qs.conversation_id
      left join person p on p.id = c.customer_person_id
      left join app_user u on u.id = c.owner_user_id
      left join app_user scorer on scorer.id = qs.scorer_user_id
      left join app_user reviewer on reviewer.id = qs.reviewed_by
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by qs.created_at desc
      limit 200
    `,
    params
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
      risks: Array.isArray(row.risks) ? row.risks : [],
      manualAdjustReason: row.manual_adjust_reason || "",
      scorerUserId: row.scorer_user_id || "",
      scorerName: row.scorer_name || "系统",
      reviewedBy: row.reviewed_by || "",
      reviewedByName: row.reviewed_by_name || "",
      reviewedAt: formatDateTime(row.reviewed_at),
      createdAt: formatDateTime(row.created_at),
      updatedAt: formatDateTime(row.updated_at),
      qualityDateKey: formatDateKey(row.created_at),
      qualityDate: formatDate(row.created_at),
      conversationStartedAt: formatDateTime(row.conversation_started_at),
      conversationLastMessageAt: formatDateTime(row.conversation_last_message_at),
      conversationDateKey: formatDateKey(row.conversation_last_message_at || row.conversation_started_at),
      conversationDate: formatDate(row.conversation_last_message_at || row.conversation_started_at),
      conversationStatus: row.conversation_status || "",
      conversationStage: row.conversation_stage || "",
      messages: messages.map(toQualityConversationMessage)
    };
  });
}

export async function adjustQualityScoreInPostgres(payload = {}, currentUser = null) {
  const resultId = String(payload.quality_result_id || payload.qualityResultId || payload.id || "").trim();
  const conversationId = String(payload.conversation_id || payload.conversationId || "").trim();
  const aiScore = normalizeManualScore(payload.ai_score ?? payload.aiScore, 60);
  const reason = normalizeManualAdjustReason(payload.reason || payload.adjust_reason || payload.adjustReason || payload.manual_adjust_reason || payload.manualAdjustReason);
  if (aiScore === null) {
    return {
      ok: false,
      status: "invalid_ai_score",
      message: "ai_score must be a number between 0 and 60."
    };
  }

  if (!reason) {
    return {
      ok: false,
      status: "missing_adjust_reason",
      message: "请填写人工改分理由，便于后续审计。"
    };
  }

  const params = [];
  const where = [];
  if (resultId) {
    params.push(resultId);
    where.push(`qs.id = $${params.length}`);
  } else if (conversationId) {
    params.push(conversationId);
    where.push(`qs.conversation_id = $${params.length}`);
  } else {
    return {
      ok: false,
      status: "missing_quality_result",
      message: "quality_result_id or conversation_id is required."
    };
  }

  const target = await query(
    `
      select qs.id, qs.conversation_id, qs.objective_score, qs.ai_score
      from quality_score qs
      where ${where.join(" and ")}
      order by qs.created_at desc
      limit 1
    `,
    params
  );
  const row = target.rows[0];
  if (!row) {
    return {
      ok: false,
      status: "quality_result_not_found",
      message: "Quality result was not found."
    };
  }

  const objectiveScore = normalizeScore(row.objective_score, 40) ?? 0;
  const finalScore = Math.min(100, Math.round((objectiveScore + aiScore) * 10) / 10);
  const updated = await query(
    `
      update quality_score
      set ai_score = $2,
          final_score = $3,
          manual_adjust_reason = $5,
          status = 'manual_adjusted',
          reviewed_by = nullif($4, ''),
          reviewed_at = now(),
          updated_at = now()
      where id = $1
      returning id, conversation_id, objective_score, ai_score, final_score, status, manual_adjust_reason, reviewed_by, reviewed_at
    `,
    [row.id, aiScore, finalScore, currentUser?.id || "", reason]
  );

  await appendOperationLog({
    actor: currentUser,
    action: "quality_score_manual_adjusted",
    targetType: "quality_score",
    targetId: row.id,
    summary: `人工修正 AI 分：${Number(row.ai_score || 0)} -> ${aiScore}`,
    metadata: {
      conversationId: row.conversation_id,
      oldAiScore: Number(row.ai_score || 0),
      newAiScore: aiScore,
      finalScore,
      reason
    }
  });

  return {
    ok: true,
    status: "manual_adjusted",
    result: {
      id: updated.rows[0].id,
      conversationId: updated.rows[0].conversation_id,
      objectiveScore: Number(updated.rows[0].objective_score || 0),
      aiScore: Number(updated.rows[0].ai_score || 0),
      finalScore: Number(updated.rows[0].final_score || 0),
      status: updated.rows[0].status,
      manualAdjustReason: updated.rows[0].manual_adjust_reason || "",
      reviewedBy: updated.rows[0].reviewed_by || "",
      reviewedAt: formatDateTime(updated.rows[0].reviewed_at)
    }
  };
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

function toQualityConversationMessage(message = {}) {
  return {
    id: message.id,
    sentAt: formatDateTime(message.sentAt),
    role: message.role,
    speaker: message.speaker,
    content: message.content || "",
    messageType: message.messageType || "text",
    mediaPath: message.mediaPath || "",
    mediaUrl: message.mediaUrl || "",
    linkUrl: message.linkUrl || ""
  };
}

export async function getCustomerProfilesFromPostgres(currentUser = null) {
  const params = [];
  const where = [];
  addSelfScopeFilter(where, params, currentUser, "cp.owner_user_id");

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
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by cp.last_active_at desc nulls last
      limit 500
    `,
    params
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
    query(`
      select
        r.key,
        r.name,
        r.data_scope,
        count(ur.user_id) as user_count
      from role r
      left join user_role ur on ur.role_id = r.id
      group by r.id, r.key, r.name, r.data_scope, r.priority
      order by r.priority desc
    `),
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

export async function updateAccountPermissionInPostgres(payload = {}, currentUser = null) {
  const userId = String(payload.user_id || payload.userId || payload.id || "").trim();
  const roleKey = String(payload.role || payload.role_key || payload.roleKey || "").trim();
  const dataScope = String(payload.data_scope || payload.dataScope || "").trim();

  if (!userId || !roleKey || !dataScope) {
    return {
      ok: false,
      status: "missing_required_fields",
      message: "缺少账号、角色或数据范围。"
    };
  }

  if (currentUser?.id === userId) {
    return {
      ok: false,
      status: "self_permission_change_forbidden",
      message: "不能修改当前登录账号的权限，避免误关管理员入口。"
    };
  }

  if (!["all", "department", "self"].includes(dataScope)) {
    return {
      ok: false,
      status: "invalid_data_scope",
      message: "数据范围只能是 all、department 或 self。"
    };
  }

  const [targetUser, targetRole] = await Promise.all([
    query(
      `
        select
          u.id,
          u.username,
          u.name,
          u.department,
          u.data_scope,
          u.status,
          coalesce(r.key, '') as role
        from app_user u
        left join user_role ur on ur.user_id = u.id
        left join role r on r.id = ur.role_id
        where u.id = $1 and u.status = 'active'
        order by r.priority desc nulls last
        limit 1
      `,
      [userId]
    ),
    query("select id, key from role where key = $1 limit 1", [roleKey])
  ]);

  if (!targetUser.rows[0]) {
    return {
      ok: false,
      status: "account_not_found",
      message: "未找到可调整权限的账号。"
    };
  }

  const roleRow = targetRole.rows[0];
  if (!roleRow) {
    return {
      ok: false,
      status: "role_not_found",
      message: "未找到要下放的角色。"
    };
  }

  await query(
    `
      update app_user
      set data_scope = $2, updated_at = now()
      where id = $1
    `,
    [userId, dataScope]
  );
  await query("delete from user_role where user_id = $1", [userId]);
  await query(
    "insert into user_role (user_id, role_id) values ($1, $2) on conflict do nothing",
    [userId, roleRow.id]
  );

  const updated = await query(
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
      where u.id = $1
      order by r.priority desc nulls last
      limit 1
    `,
    [userId]
  );

  await appendOperationLog({
    actor: currentUser,
    action: "permission_updated",
    targetType: "app_user",
    targetId: userId,
    summary: `${targetUser.rows[0].name} 权限已下放为 ${roleKey} / ${dataScope}`,
    metadata: {
      oldRole: targetUser.rows[0].role || "",
      oldDataScope: targetUser.rows[0].data_scope || "",
      newRole: roleKey,
      newDataScope: dataScope
    }
  });

  return {
    ok: true,
    status: "permission_updated",
    message: "账号权限已下放并保存。",
    account: toUser(updated.rows[0])
  };
}

export async function getAccountRequestsFromPostgres() {
  const result = await query(
    `
      select
        ar.id,
        ar.name,
        ar.username,
        ar.department,
        ar.role_key,
        ar.data_scope,
        ar.note,
        ar.status,
        ar.created_at,
        ar.handled_at,
        ar.handled_by,
        u.name as handled_by_name
      from account_request ar
      left join app_user u on u.id = ar.handled_by
      order by
        case ar.status when 'pending' then 0 else 1 end,
        ar.created_at desc
    `
  );
  return result.rows.map(toAccountRequest);
}

export async function createAccountRequestInPostgres(payload = {}, currentUser = null) {
  const name = String(payload.name || "").trim();
  const username = String(payload.username || "").trim();
  const department = String(payload.department || "").trim();
  const role = String(payload.role || payload.role_key || payload.roleKey || "service_user").trim();
  const dataScope = String(payload.dataScope || payload.data_scope || "self").trim();
  const note = String(payload.note || "").trim();

  if (!name || !username || !department) {
    return {
      ok: false,
      status: "missing_required_fields",
      message: "请填写姓名、登录账号和所属部门。"
    };
  }

  if (!["all", "department", "self"].includes(dataScope)) {
    return {
      ok: false,
      status: "invalid_data_scope",
      message: "数据范围只能是 all、department 或 self。"
    };
  }

  const [roleResult, userResult] = await Promise.all([
    query("select id from role where key = $1 limit 1", [role]),
    query("select id from app_user where username = $1 limit 1", [username])
  ]);

  if (!roleResult.rows[0]) {
    return {
      ok: false,
      status: "role_not_found",
      message: "未找到要开通的角色。"
    };
  }

  if (userResult.rows[0]) {
    return {
      ok: false,
      status: "username_exists",
      message: "登录账号已存在，请换一个账号名。"
    };
  }

  const result = await query(
    `
      insert into account_request (name, username, department, role_key, data_scope, note, status)
      values ($1, $2, $3, $4, $5, $6, 'pending')
      returning id, name, username, department, role_key, data_scope, note, status, created_at
    `,
    [name, username, department, role, dataScope, note]
  );

  const row = result.rows[0];
  await appendOperationLog({
    actor: currentUser,
    action: "account_request_created",
    targetType: "account_request",
    targetId: row.id,
    summary: `${name} 的账号开通申请已创建`,
    metadata: { username, role, dataScope }
  });

  return {
    ok: true,
    message: "账号申请已写入数据库",
    record: toAccountRequest(row),
    persistence: "postgres"
  };
}

export async function approveAccountRequestInPostgres(payload = {}, currentUser = null) {
  const requestId = String(payload.request_id || payload.requestId || payload.id || "").trim();
  if (!requestId) {
    return {
      ok: false,
      status: "missing_request_id",
      message: "缺少账号申请 ID。"
    };
  }

  const requestResult = await query(
    `
      select id, name, username, department, role_key, data_scope, note, status, created_at
      from account_request
      where id = $1
      limit 1
    `,
    [requestId]
  );
  const request = requestResult.rows[0];
  if (!request) {
    return {
      ok: false,
      status: "request_not_found",
      message: "未找到账号申请。"
    };
  }

  if (request.status !== "pending") {
    return {
      ok: false,
      status: "request_already_handled",
      message: "该账号申请已经处理过。"
    };
  }

  const [roleResult, userResult] = await Promise.all([
    query("select id, key from role where key = $1 limit 1", [request.role_key]),
    query("select id from app_user where username = $1 limit 1", [request.username])
  ]);
  const role = roleResult.rows[0];
  if (!role) {
    return {
      ok: false,
      status: "role_not_found",
      message: "未找到申请中的角色，无法开通。"
    };
  }

  if (userResult.rows[0]) {
    return {
      ok: false,
      status: "username_exists",
      message: "登录账号已存在，无法重复开通。"
    };
  }

  const initialPassword = normalizeInitialPassword(payload.initial_password || payload.initialPassword) || generateTemporaryPassword();
  const passwordHash = await hashPassword(initialPassword);
  const accountResult = await query(
    `
      insert into app_user (username, password_hash, name, department, data_scope, status)
      values ($1, $2, $3, $4, $5, 'active')
      returning id, username, name, department, data_scope
    `,
    [request.username, passwordHash, request.name, request.department, request.data_scope]
  );
  const accountRow = accountResult.rows[0];
  await query("insert into user_role (user_id, role_id) values ($1, $2) on conflict do nothing", [accountRow.id, role.id]);
  const handled = await query(
    `
      update account_request
      set status = 'approved', handled_by = $2, handled_at = now()
      where id = $1
      returning id, name, username, department, role_key, data_scope, note, status, created_at, handled_at, handled_by
    `,
    [requestId, currentUser?.id || null]
  );

  await appendOperationLog({
    actor: currentUser,
    action: "account_request_approved",
    targetType: "account_request",
    targetId: requestId,
    summary: `${request.name} 的账号已审批开通`,
    metadata: {
      userId: accountRow.id,
      username: accountRow.username,
      role: request.role_key,
      dataScope: request.data_scope
    }
  });

  return {
    ok: true,
    status: "approved",
    message: "账号已审批开通。",
    account: toUser({ ...accountRow, role: request.role_key }),
    request: toAccountRequest(handled.rows[0]),
    initialPassword
  };
}

export async function rejectAccountRequestInPostgres(payload = {}, currentUser = null) {
  const requestId = String(payload.request_id || payload.requestId || payload.id || "").trim();
  const reason = String(payload.reason || "").trim();
  if (!requestId) {
    return {
      ok: false,
      status: "missing_request_id",
      message: "缺少账号申请 ID。"
    };
  }

  const result = await query(
    `
      update account_request
      set status = 'rejected', handled_by = $2, handled_at = now()
      where id = $1 and status = 'pending'
      returning id, name, username, department, role_key, data_scope, note, status, created_at, handled_at, handled_by
    `,
    [requestId, currentUser?.id || null]
  );

  if (!result.rows[0]) {
    return {
      ok: false,
      status: "request_not_found_or_handled",
      message: "未找到待处理的账号申请。"
    };
  }

  await appendOperationLog({
    actor: currentUser,
    action: "account_request_rejected",
    targetType: "account_request",
    targetId: requestId,
    summary: `${result.rows[0].name} 的账号申请已拒绝`,
    metadata: { reason }
  });

  return {
    ok: true,
    status: "rejected",
    message: "账号申请已拒绝。",
    request: toAccountRequest(result.rows[0])
  };
}

export async function getOperationLogsFromPostgres(limit = 30) {
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const result = await query(
    `
      select id, actor_user_id, actor_name, action, target_type, target_id, summary, metadata, created_at
      from operation_log
      order by created_at desc
      limit $1
    `,
    [safeLimit]
  );

  return result.rows.map(toOperationLog);
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

export async function updateMessageMediaEvidenceInPostgres(payload = {}, currentUser = null) {
  const messageId = String(payload.message_id || payload.messageId || payload.id || "").trim();
  if (!messageId) {
    return {
      ok: false,
      status: "missing_message_id",
      message: "message_id is required"
    };
  }

  const allowedFields = [
    { column: "ocr_text", keys: ["ocr_text", "ocrText", "ocr"] },
    { column: "transcript_text", keys: ["transcript_text", "transcriptText", "transcript", "voice_text", "video_text"] },
    { column: "media_description", keys: ["media_description", "mediaDescription", "video_description", "file_summary", "description", "summary"] },
    { column: "image_description", keys: ["image_description", "imageDescription", "image_caption"] }
  ];
  const params = [];
  const setClauses = [];
  const updatedColumns = [];

  for (const field of allowedFields) {
    const value = getPayloadValue(payload, field.keys);
    if (value === undefined || value === null) continue;
    params.push(String(value).trim());
    setClauses.push(`${field.column} = $${params.length}`);
    updatedColumns.push(field.column);
  }

  if (!updatedColumns.length) {
    return {
      ok: false,
      status: "no_fields",
      message: "At least one media evidence field is required.",
      messageId
    };
  }

  params.push(JSON.stringify(buildMediaEvidenceMetadata(payload, currentUser)));
  setClauses.push(`media_metadata = coalesce(media_metadata, '{}'::jsonb) || $${params.length}::jsonb`);
  params.push(messageId);

  const result = await query(
    `
      update raw_message
      set ${setClauses.join(", ")}
      where id = $${params.length}
      returning *
    `,
    params
  );

  const row = result.rows[0];
  if (!row) {
    return {
      ok: false,
      status: "message_not_found",
      message: "Message was not found.",
      messageId
    };
  }

  return {
    ok: true,
    status: "updated",
    messageId,
    updatedColumns,
    record: toRawMessage(row)
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

function addSelfScopeFilter(where, params, currentUser, columnName) {
  if (!isSelfScopedUser(currentUser)) return;
  params.push(currentUser.id);
  where.push(`${columnName} = $${params.length}`);
}

function isSelfScopedUser(currentUser) {
  return Boolean(currentUser?.id) && (currentUser.role === "service_user" || currentUser.dataScope === "self");
}

function getPayloadValue(payload = {}, keys = []) {
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null) return payload[key];
  }
  return undefined;
}

function buildMediaEvidenceMetadata(payload = {}, currentUser = null) {
  return {
    parse_status: payload.parse_status || payload.parseStatus || "processed",
    analysis_text_source: payload.analysis_text_source || payload.analysisTextSource || "manual_or_external_processor",
    processor: payload.processor || "",
    language: payload.language || "",
    confidence: payload.confidence ?? null,
    evidence_updated_by: currentUser?.id || "",
    evidence_updated_at: new Date().toISOString()
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

function toAccountRequest(row = {}) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    department: row.department,
    role: row.role_key,
    dataScope: row.data_scope,
    note: row.note || "",
    status: row.status,
    createdAt: formatDateTime(row.created_at),
    handledAt: formatDateTime(row.handled_at),
    handledBy: row.handled_by || "",
    handledByName: row.handled_by_name || ""
  };
}

function toOperationLog(row = {}) {
  return {
    id: row.id,
    actorUserId: row.actor_user_id || "",
    actorName: row.actor_name || "",
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id || "",
    summary: row.summary,
    metadata: row.metadata || {},
    createdAt: formatDateTime(row.created_at)
  };
}

async function appendOperationLog({ actor = null, action, targetType, targetId = "", summary, metadata = {} } = {}) {
  if (!action || !targetType || !summary) return;

  try {
    await query(
      `
        insert into operation_log (actor_user_id, actor_name, action, target_type, target_id, summary, metadata)
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        actor?.id || null,
        actor?.name || actor?.username || "",
        action,
        targetType,
        targetId,
        summary,
        JSON.stringify(metadata || {})
      ]
    );
  } catch (error) {
    console.warn("[operation_log] append failed:", error instanceof Error ? error.message : String(error));
  }
}

function normalizeInitialPassword(value) {
  const password = String(value || "").trim();
  return password.length >= 8 ? password : "";
}

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let password = "Qi";
  for (let i = 0; i < 10; i += 1) {
    password += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return `${password}!`;
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

function formatDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("zh-CN");
}

function formatDateKey(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeScore(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(max, Math.round(number * 10) / 10));
}

function normalizeManualScore(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max) return null;
  return Math.round(number * 10) / 10;
}

function normalizeManualAdjustReason(value) {
  const reason = String(value || "").trim();
  if (reason.length < 4) return "";
  return reason.slice(0, 1000);
}

function maxDate(values) {
  const timestamps = values.filter(Boolean).map((value) => new Date(value).getTime()).filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps));
}
