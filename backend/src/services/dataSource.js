import {
  biDashboard,
  conversations,
  customerProfiles,
  identityReviewTasks,
  messages,
  overview,
  permissionModel,
  qualityResults,
  ruleConfig,
  syncStatus,
  users
} from "../data/mockData.js";
import { runAiQualityEvaluation } from "./aiQualityService.js";
import { hashPassword, verifyPassword } from "./passwordService.js";
import { getDatabaseStatus, isPostgresConfigured } from "./postgresClient.js";
import {
  adjustQualityScoreInPostgres,
  createAccountRequestInPostgres,
  getAccountRequestsFromPostgres,
  getConversationsFromPostgres,
  getCustomerProfilesFromPostgres,
  getDemoUsersFromPostgres,
  getIdentityReviewTasksFromPostgres,
  getImportBatchesFromPostgres,
  getBiDashboardFromPostgres,
  getMessagesFromPostgres,
  getPermissionModelFromPostgres,
  getOperationLogsFromPostgres,
  getQualityResultsFromPostgres,
  getSyncStatusFromPostgres,
  importMessagesInPostgres,
  loginFromPostgres,
  approveAccountRequestInPostgres,
  rejectAccountRequestInPostgres,
  updateAccountPermissionInPostgres,
  updateMessageMediaEvidenceInPostgres
} from "./postgresDataSource.js";

const accountRequests = [];
const operationLogs = [];

export async function getDemoUsers() {
  return fromPostgres(() => getDemoUsersFromPostgres(), () => users.map(({ passwordHash, ...user }) => user));
}

export async function login(username, password) {
  return fromPostgres(() => loginFromPostgres(username, password), () => loginFromMock(username, password));
}

async function loginFromMock(username, password) {
  const user = users.find((item) => item.username === username);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return {
      ok: false,
      message: "账号或密码错误"
    };
  }

  const { passwordHash: _, ...safeUser } = user;
  return {
    ok: true,
    token: `mock-token-${safeUser.id}`,
    user: safeUser
  };
}

export async function getOverview(role) {
  if (role === "super_admin") return overview.superAdmin;
  if (role === "service_user") return overview.serviceUser;
  return overview.qualityUser;
}

export async function getSyncStatus() {
  return fromPostgres(() => getSyncStatusFromPostgres(), () => syncStatus);
}

export async function getMessages(searchParams = new URLSearchParams(), currentUser = null) {
  return fromPostgres(() => getMessagesFromPostgres(searchParams, currentUser), () => getMessagesFromMock(searchParams, currentUser));
}

function getMessagesFromMock(searchParams = new URLSearchParams(), currentUser = null) {
  const platform = searchParams.get("platform");
  const role = searchParams.get("role");
  const allowedChatIds = getSelfScopedMockChatIds(currentUser);

  return messages.filter((item) => {
    if (allowedChatIds && !allowedChatIds.has(item.sourceChatId)) return false;
    if (platform && platform !== "all" && item.platform !== platform) return false;
    if (role && role !== "all" && item.normalizedRole !== role) return false;
    return true;
  });
}

function getSelfScopedMockRecords(records, currentUser) {
  if (!isSelfScopedUser(currentUser)) return records;
  return records.filter((item) => item.owner === currentUser.name);
}

function getSelfScopedMockChatIds(currentUser) {
  if (!isSelfScopedUser(currentUser)) return null;

  const customerIds = new Set(
    getSelfScopedMockRecords(conversations, currentUser)
      .map((item) => item.customerId)
      .filter(Boolean)
  );
  if (!customerIds.size) return new Set();

  return new Set(
    messages
      .filter((item) => customerIds.has(item.personId))
      .map((item) => item.sourceChatId)
      .filter(Boolean)
  );
}

function isSelfScopedUser(currentUser) {
  return Boolean(currentUser?.id) && (currentUser.role === "service_user" || currentUser.dataScope === "self");
}

export async function getIdentityReviewTasks() {
  return fromPostgres(() => getIdentityReviewTasksFromPostgres(), () => identityReviewTasks);
}

export async function getConversations(currentUser = null) {
  return fromPostgres(() => getConversationsFromPostgres(currentUser), () => getSelfScopedMockRecords(conversations, currentUser));
}

export async function getQualityResults(currentUser = null) {
  if (isPostgresConfigured()) {
    return getQualityResultsFromPostgres(currentUser);
  }
  return getSelfScopedMockRecords(qualityResults, currentUser);
}

export async function adjustQualityScore(payload = {}, currentUser = null) {
  return fromPostgres(() => adjustQualityScoreInPostgres(payload, currentUser), () => adjustQualityScoreInMock(payload, currentUser));
}

function adjustQualityScoreInMock(payload = {}, currentUser = null) {
  const resultId = String(payload.quality_result_id || payload.qualityResultId || payload.id || "").trim();
  const conversationId = String(payload.conversation_id || payload.conversationId || "").trim();
  const score = normalizeManualAiScore(payload.ai_score ?? payload.aiScore);
  const reason = normalizeManualAdjustReason(payload.reason || payload.adjust_reason || payload.adjustReason || payload.manual_adjust_reason || payload.manualAdjustReason);
  if (score === null) {
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

  const record = qualityResults.find((item) => resultId ? item.id === resultId : item.conversationId === conversationId);
  if (!record) {
    return {
      ok: false,
      status: "quality_result_not_found",
      message: "Quality result was not found."
    };
  }

  const oldAiScore = Number(record.aiScore || 0);
  record.aiScore = score;
  record.finalScore = Math.min(100, Math.round(((Number(record.objectiveScore) || 0) + score) * 10) / 10);
  record.totalScore = record.finalScore;
  record.status = "manual_adjusted";
  record.manualAdjustReason = reason;
  appendOperationLogInMock({
    actor: currentUser,
    action: "quality_score_manual_adjusted",
    targetType: "quality_score",
    targetId: record.id,
    summary: `人工修正 AI 分：${oldAiScore} -> ${score}`,
    metadata: {
      conversationId: record.conversationId,
      oldAiScore,
      newAiScore: score,
      finalScore: record.finalScore,
      reason
    }
  });
  return { ok: true, status: "manual_adjusted", result: record };
}

export async function evaluateQualityWithAi(payload = {}) {
  return runAiQualityEvaluation(payload);
}

export async function getCustomerProfiles(currentUser = null) {
  return fromPostgres(() => getCustomerProfilesFromPostgres(currentUser), () => getSelfScopedMockRecords(customerProfiles, currentUser));
}

export async function getPermissionModel() {
  return fromPostgres(() => getPermissionModelFromPostgres(), () => getPermissionModelFromMock());
}

export async function getAccountRequests() {
  return fromPostgres(() => getAccountRequestsFromPostgres(), () => accountRequests);
}

export async function createAccountRequest(payload = {}, currentUser = null) {
  return fromPostgres(() => createAccountRequestInPostgres(payload, currentUser), () => createAccountRequestInMock(payload, currentUser));
}

export async function approveAccountRequest(payload = {}, currentUser = null) {
  return fromPostgres(
    () => approveAccountRequestInPostgres(payload, currentUser),
    () => approveAccountRequestInMock(payload, currentUser)
  );
}

export async function rejectAccountRequest(payload = {}, currentUser = null) {
  return fromPostgres(
    () => rejectAccountRequestInPostgres(payload, currentUser),
    () => rejectAccountRequestInMock(payload, currentUser)
  );
}

export async function getOperationLogs(limit = 30) {
  return fromPostgres(() => getOperationLogsFromPostgres(limit), () => operationLogs.slice(0, Number(limit) || 30));
}

export async function updateAccountPermission(payload = {}, currentUser = null) {
  return fromPostgres(
    () => updateAccountPermissionInPostgres(payload, currentUser),
    () => updateAccountPermissionInMock(payload, currentUser)
  );
}

function getPermissionModelFromMock() {
  const counts = users.reduce((acc, user) => {
    acc.set(user.role, (acc.get(user.role) || 0) + 1);
    return acc;
  }, new Map());

  return {
    ...permissionModel,
    roles: permissionModel.roles.map((role) => ({
      ...role,
      userCount: counts.get(role.key) || 0
    })),
    accounts: users.map(({ passwordHash, ...user }) => user)
  };
}

function updateAccountPermissionInMock(payload = {}, currentUser = null) {
  const userId = String(payload.user_id || payload.userId || payload.id || "").trim();
  const role = String(payload.role || payload.role_key || payload.roleKey || "").trim();
  const dataScope = String(payload.data_scope || payload.dataScope || "").trim();

  if (!userId || !role || !dataScope) {
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

  if (!permissionModel.roles.some((item) => item.key === role)) {
    return {
      ok: false,
      status: "role_not_found",
      message: "未找到要下放的角色。"
    };
  }

  if (!["all", "department", "self"].includes(dataScope)) {
    return {
      ok: false,
      status: "invalid_data_scope",
      message: "数据范围只能是 all、department 或 self。"
    };
  }

  const user = users.find((item) => item.id === userId);
  if (!user) {
    return {
      ok: false,
      status: "account_not_found",
      message: "未找到可调整权限的账号。"
    };
  }

  user.role = role;
  user.dataScope = dataScope;
  user.permissions = permissionsForRole(role);

  appendOperationLogInMock({
    actor: currentUser,
    action: "permission_updated",
    targetType: "app_user",
    targetId: userId,
    summary: `${user.name} 权限已下放为 ${role} / ${dataScope}`,
    metadata: { role, dataScope }
  });

  const { passwordHash: _, ...account } = user;
  return {
    ok: true,
    status: "permission_updated",
    message: "账号权限已下放并保存。",
    account,
    persistence: "mock_memory_only"
  };
}

function permissionsForRole(role) {
  if (role === "super_admin") return ["*"];

  const permissionsByRole = {
    quality_manager: ["message:view", "identity:review", "quality:review", "quality:edit", "customer:view", "bi:view"],
    quality_user: ["message:view", "identity:review", "quality:review", "quality:edit", "customer:view", "bi:view"],
    service_user: ["message:view", "quality:self", "customer:self"]
  };

  return permissionsByRole[role] || [];
}

function createAccountRequestInMock(payload = {}, currentUser = null) {
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

  if (!permissionModel.roles.some((item) => item.key === role)) {
    return {
      ok: false,
      status: "role_not_found",
      message: "未找到要开通的角色。"
    };
  }

  if (users.some((item) => item.username === username)) {
    return {
      ok: false,
      status: "username_exists",
      message: "登录账号已存在，请换一个账号名。"
    };
  }

  const record = {
    id: `account_request_${Date.now()}`,
    name,
    username,
    department,
    role,
    dataScope,
    note,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  accountRequests.unshift(record);
  appendOperationLogInMock({
    actor: currentUser,
    action: "account_request_created",
    targetType: "account_request",
    targetId: record.id,
    summary: `${name} 的账号开通申请已创建`,
    metadata: { username, role, dataScope }
  });

  return {
    ok: true,
    message: "账号申请已接收",
    record,
    persistence: "mock_memory_only"
  };
}

async function approveAccountRequestInMock(payload = {}, currentUser = null) {
  const requestId = String(payload.request_id || payload.requestId || payload.id || "").trim();
  const request = accountRequests.find((item) => item.id === requestId);
  if (!request || request.status !== "pending") {
    return {
      ok: false,
      status: "request_not_found_or_handled",
      message: "未找到待处理的账号申请。"
    };
  }

  if (users.some((item) => item.username === request.username)) {
    return {
      ok: false,
      status: "username_exists",
      message: "登录账号已存在，无法重复开通。"
    };
  }

  const initialPassword = normalizeInitialPassword(payload.initial_password || payload.initialPassword) || generateTemporaryPassword();
  const user = {
    id: `u_${Date.now()}`,
    username: request.username,
    passwordHash: await hashPassword(initialPassword),
    name: request.name,
    role: request.role,
    department: request.department,
    dataScope: request.dataScope,
    permissions: permissionsForRole(request.role)
  };
  users.push(user);

  request.status = "approved";
  request.handledBy = currentUser?.id || "";
  request.handledByName = currentUser?.name || "";
  request.handledAt = new Date().toISOString();

  appendOperationLogInMock({
    actor: currentUser,
    action: "account_request_approved",
    targetType: "account_request",
    targetId: requestId,
    summary: `${request.name} 的账号已审批开通`,
    metadata: { userId: user.id, username: user.username, role: user.role, dataScope: user.dataScope }
  });

  const { passwordHash: _, ...account } = user;
  return {
    ok: true,
    status: "approved",
    message: "账号已审批开通。",
    account,
    request,
    initialPassword,
    persistence: "mock_memory_only"
  };
}

function rejectAccountRequestInMock(payload = {}, currentUser = null) {
  const requestId = String(payload.request_id || payload.requestId || payload.id || "").trim();
  const request = accountRequests.find((item) => item.id === requestId);
  if (!request || request.status !== "pending") {
    return {
      ok: false,
      status: "request_not_found_or_handled",
      message: "未找到待处理的账号申请。"
    };
  }

  request.status = "rejected";
  request.handledBy = currentUser?.id || "";
  request.handledByName = currentUser?.name || "";
  request.handledAt = new Date().toISOString();

  appendOperationLogInMock({
    actor: currentUser,
    action: "account_request_rejected",
    targetType: "account_request",
    targetId: requestId,
    summary: `${request.name} 的账号申请已拒绝`,
    metadata: { reason: payload.reason || "" }
  });

  return {
    ok: true,
    status: "rejected",
    message: "账号申请已拒绝。",
    request,
    persistence: "mock_memory_only"
  };
}

function appendOperationLogInMock({ actor = null, action, targetType, targetId = "", summary, metadata = {} } = {}) {
  if (!action || !targetType || !summary) return;
  operationLogs.unshift({
    id: `op_${Date.now()}_${operationLogs.length}`,
    actorUserId: actor?.id || "",
    actorName: actor?.name || actor?.username || "",
    action,
    targetType,
    targetId,
    summary,
    metadata,
    createdAt: new Date().toISOString()
  });
}

function normalizeInitialPassword(value) {
  const password = String(value || "").trim();
  return password.length >= 8 ? password : "";
}

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let password = "Qi";
  for (let i = 0; i < 10; i += 1) {
    password += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${password}!`;
}

export async function getRuleConfig() {
  return ruleConfig;
}

export async function getBiDashboard() {
  const baseDashboard = normalizeBiDashboard(biDashboard);
  return fromPostgres(() => getBiDashboardFromPostgres(baseDashboard), () => baseDashboard);
}

function normalizeBiDashboard() {
  return {
    meta: {
      period: "2026-06-08 至 2026-06-14",
      scope: "全部客服 / 已完成质检会话",
      scoreDefinition: "客服综合质检分，满分 100。由响应速度、回答专业度、服务态度、流程合规、风险扣分综合计算。",
      responseDefinition: "客户提出有效问题后，到客服首次有效人工回复之间的时长。自动回复、系统消息不计入。"
    },
    summary: [
      { label: "质检会话数", value: 186, unit: "场", note: "较上周期 +18" },
      { label: "平均质检分", value: 86.4, unit: "分", note: "较上周期 +1.8" },
      { label: "首次响应中位数", value: 72, unit: "秒", note: "目标 180 秒内" },
      { label: "高意向客户", value: 39, unit: "人", note: "较上周期 +7" }
    ],
    scoreTrend: [
      { date: "06-08", weekday: "周一", avgScore: 82.4, inspectedConversations: 31, timeoutRate: 12 },
      { date: "06-09", weekday: "周二", avgScore: 84.1, inspectedConversations: 34, timeoutRate: 10 },
      { date: "06-10", weekday: "周三", avgScore: 86.0, inspectedConversations: 36, timeoutRate: 8 },
      { date: "06-11", weekday: "周四", avgScore: 85.2, inspectedConversations: 38, timeoutRate: 9 },
      { date: "06-12", weekday: "周五", avgScore: 88.3, inspectedConversations: 47, timeoutRate: 6 }
    ],
    responseTrend: [
      { range: "0-1分钟", count: 119, percentage: 64 },
      { range: "1-3分钟", count: 43, percentage: 23 },
      { range: "3-10分钟", count: 17, percentage: 9 },
      { range: "10分钟以上", count: 7, percentage: 4 }
    ],
    questionTypes: [
      { type: "产品成活率", count: 31, percentage: 31 },
      { type: "缓苗黄叶", count: 20, percentage: 20 },
      { type: "光照环境", count: 16, percentage: 16 },
      { type: "品种搭配", count: 12, percentage: 12 },
      { type: "养护方法", count: 9, percentage: 9 },
      { type: "售后处理", count: 7, percentage: 7 },
      { type: "价格套餐", count: 5, percentage: 5 }
    ],
    staffRanking: [
      { name: "客服小林", avgScore: 91, inspectedConversations: 42, avgFirstResponseSeconds: 48, highIntentCustomers: 15 },
      { name: "客服小陈", avgScore: 88, inspectedConversations: 36, avgFirstResponseSeconds: 65, highIntentCustomers: 11 },
      { name: "客服小周", avgScore: 84, inspectedConversations: 33, avgFirstResponseSeconds: 92, highIntentCustomers: 8 }
    ]
  };
}

export async function fetchMessagesFromDatabase() {
  const status = await getDatabaseStatus();
  if (status.connected) {
    return {
      status: "connected",
      message: "PostgreSQL 数据库已连接，聊天记录可通过 raw_message 读取。",
      expectedFields: ["message_id", "source_system", "source_chat_id", "source_sender_id", "send_time", "role", "content/text", "message_type", "media_url/media_path", "transcript_text/ocr_text/media_description"]
    };
  }

  return {
    status: "pending",
    message: status.message || "真实数据库接口暂未接入。后续在这里替换为 DB/API 读取逻辑。",
    expectedFields: ["message_id", "source_system", "source_chat_id", "source_sender_id", "send_time", "role", "content/text", "message_type", "media_url/media_path", "transcript_text/ocr_text/media_description"]
  };
}

export async function getDatabaseConnectionStatus() {
  return getDatabaseStatus();
}

export function getImportFieldGuide() {
  return {
    ok: true,
    version: "2026-06-17",
    description: "淘宝/微信聊天记录导入字段字典。字段支持 snake_case 与常见 camelCase/别名，后端会统一标准化。",
    required: [
      { field: "source_system", aliases: ["sourceSystem"], type: "enum", values: ["taobao", "wechat"], description: "消息来源系统。" },
      { field: "messages", type: "array", description: "待导入消息数组，至少 1 条。" },
      { field: "source_message_id", aliases: ["sourceMessageId", "message_id", "messageId", "id"], type: "string", description: "来源系统消息 ID，用于幂等去重。" },
      { field: "source_chat_id", aliases: ["sourceChatId", "chat_id", "chatId", "group_id", "session_id"], type: "string", description: "来源会话、群或咨询窗口 ID。" },
      { field: "source_sender_id", aliases: ["sourceSenderId", "sender_id", "senderId", "member_id", "user_id"], type: "string", description: "来源发送人 ID。" },
      { field: "time", aliases: ["sent_at", "sentAt", "send_time", "sendTime", "created_at"], type: "datetime", description: "消息发送时间，建议 ISO 8601 或 yyyy-MM-dd HH:mm:ss。" },
      { field: "role", aliases: ["role_raw", "roleRaw", "sender_role"], type: "enum/text", values: ["customer", "service", "sales", "after_sales", "bot", "system", "unknown"], description: "原始发送人角色；中文客户/客服/售后等会自动映射。" }
    ],
    optional: [
      { field: "sender_name", aliases: ["senderName", "speaker", "nickname", "display_name", "name"], type: "string", description: "原始昵称或展示名。" },
      { field: "content", aliases: ["text", "message", "body"], type: "string", description: "文本消息内容；非文本消息可为空，但必须提供媒体证据字段。" },
      { field: "message_type", aliases: ["messageType", "type"], type: "enum", values: ["text", "image", "voice", "video", "file", "link", "mini_program", "product_card", "emoji", "location", "mixed"], description: "消息类型；缺省时会基于内容和媒体字段推断。" },
      { field: "media_url", aliases: ["mediaUrl", "image_url", "file_url", "url"], type: "string", description: "媒体文件或外部资源 URL。" },
      { field: "media_path", aliases: ["mediaPath", "local_path", "path"], type: "string", description: "本地或对象存储路径。" },
      { field: "ocr_text", aliases: ["ocrText", "ocr", "recognized_text"], type: "string", description: "图片 OCR 文本证据。" },
      { field: "transcript_text", aliases: ["transcriptText", "voice_text", "audio_text", "video_text"], type: "string", description: "语音或视频转写文本证据。" },
      { field: "media_description", aliases: ["mediaDescription", "image_description", "video_description", "file_summary", "caption", "summary"], type: "string", description: "图片、视频、文件或链接摘要。" },
      { field: "attachments", aliases: ["media"], type: "array", description: "多附件消息，元素字段与媒体字段一致。" },
      { field: "structured_content", aliases: ["structuredContent", "card", "mini_program", "product_card", "location"], type: "object", description: "小程序、商品卡片、位置等结构化消息。" }
    ],
    template: {
      source_system: "taobao",
      mode: "incremental",
      file_name: "taobao-chat-2026-06-17.json",
      company_domain: "flower_gardening",
      imported_by: "admin",
      messages: [
        {
          source_message_id: "tb_msg_001",
          source_chat_id: "tb_chat_1001",
          source_sender_id: "tb_customer_7788",
          sender_name: "清风",
          time: "2026-06-15 09:12:20",
          role: "customer",
          content: "这个产品一般多久能看到效果？",
          message_type: "text"
        }
      ]
    }
  };
}

export async function getImportBatches(searchParams = new URLSearchParams()) {
  return fromPostgres(
    () => getImportBatchesFromPostgres(searchParams),
    () => ({
      ok: true,
      mode: "mock",
      batches: [],
      message: "PostgreSQL 未启用，mock 模式没有持久化导入批次。"
    })
  );
}

export async function importMessages(payload = {}) {
  return fromPostgres(
    () => importMessagesInPostgres(payload),
    () => ({
      ok: false,
      status: "database_not_enabled",
      message: "PostgreSQL 未启用，当前未写入数据库。请配置 DATA_SOURCE=postgres 和 DATABASE_URL。",
      expectedPayload: {
        source_system: "taobao | wechat",
        messages: [
          {
            source_message_id: "来源消息ID",
            source_chat_id: "来源会话ID",
            source_sender_id: "来源发送者ID",
            time: "2026-06-15 10:00:00",
            role: "customer",
            content: "文本内容；图片/语音/视频可为空",
            message_type: "text | image | voice | video | file | link | mini_program | product_card | emoji | location | mixed",
            media_url: "媒体文件URL，可选",
            transcript_text: "语音/视频转写，可选",
            ocr_text: "图片OCR，可选",
            media_description: "图片/视频/文件摘要，可选"
          }
        ]
      }
    })
  );
}

export async function updateMessageMediaEvidence(payload = {}, currentUser = null) {
  return fromPostgres(
    () => updateMessageMediaEvidenceInPostgres(payload, currentUser),
    () => updateMessageMediaEvidenceInMock(payload, currentUser)
  );
}

function updateMessageMediaEvidenceInMock(payload = {}, currentUser = null) {
  const messageId = String(payload.message_id || payload.messageId || payload.id || "").trim();
  const message = messages.find((item) => item.id === messageId);
  if (!message) {
    return {
      ok: false,
      status: "message_not_found",
      message: "未找到可更新的消息"
    };
  }

  const fields = {
    ocrText: payload.ocr_text ?? payload.ocrText,
    transcriptText: payload.transcript_text ?? payload.transcriptText,
    mediaDescription: payload.media_description ?? payload.mediaDescription,
    imageDescription: payload.image_description ?? payload.imageDescription
  };

  let updated = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    message[key] = String(value);
    updated += 1;
  }

  message.mediaMetadata = {
    ...(message.mediaMetadata || {}),
    parse_status: payload.parse_status || payload.parseStatus || "processed",
    analysis_text_source: payload.analysis_text_source || payload.analysisTextSource || "manual_or_external_processor",
    updated_by: currentUser?.id || "",
    updated_at: new Date().toISOString()
  };

  return {
    ok: updated > 0,
    status: updated > 0 ? "updated" : "no_fields",
    messageId,
    updatedFields: updated
  };
}

function normalizeManualAiScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 60) return null;
  return Math.round(number * 10) / 10;
}

function normalizeManualAdjustReason(value) {
  const reason = String(value || "").trim();
  if (reason.length < 4) return "";
  return reason.slice(0, 1000);
}

async function fromPostgres(dbCall, fallbackCall) {
  if (!isPostgresConfigured()) {
    return fallbackCall();
  }

  try {
    return await dbCall();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMockFallbackAllowed()) {
      console.warn("[database] PostgreSQL fallback to mock:", message);
      return fallbackCall();
    }

    throw new Error(`PostgreSQL request failed and mock fallback is disabled: ${message}`);
  }
}

function isMockFallbackAllowed() {
  const env = globalThis.process?.env || {};
  return env.ALLOW_MOCK_FALLBACK === "true";
}
