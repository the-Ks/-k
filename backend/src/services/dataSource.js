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
import { getDatabaseStatus, isPostgresConfigured } from "./postgresClient.js";
import {
  createAccountRequestInPostgres,
  getConversationsFromPostgres,
  getCustomerProfilesFromPostgres,
  getDemoUsersFromPostgres,
  getIdentityReviewTasksFromPostgres,
  getBiDashboardFromPostgres,
  getMessagesFromPostgres,
  getPermissionModelFromPostgres,
  getQualityResultsFromPostgres,
  getSyncStatusFromPostgres,
  importMessagesInPostgres,
  loginFromPostgres
} from "./postgresDataSource.js";

const accountRequests = [];

export async function getDemoUsers() {
  return fromPostgres(() => getDemoUsersFromPostgres(), () => users.map(({ password, ...user }) => user));
}

export async function login(username, password) {
  return fromPostgres(() => loginFromPostgres(username, password), () => loginFromMock(username, password));
}

function loginFromMock(username, password) {
  const user = users.find((item) => item.username === username && item.password === password);

  if (!user) {
    return {
      ok: false,
      message: "账号或密码错误"
    };
  }

  const { password: _, ...safeUser } = user;
  return {
    ok: true,
    token: `mock-token-${safeUser.id}`,
    user: safeUser
  };
}

export async function getOverview(role) {
  if (role === "super_admin") return overview.superAdmin;
  return overview.qualityUser;
}

export async function getSyncStatus() {
  return fromPostgres(() => getSyncStatusFromPostgres(), () => syncStatus);
}

export async function getMessages(searchParams = new URLSearchParams()) {
  return fromPostgres(() => getMessagesFromPostgres(searchParams), () => getMessagesFromMock(searchParams));
}

function getMessagesFromMock(searchParams = new URLSearchParams()) {
  const platform = searchParams.get("platform");
  const role = searchParams.get("role");

  return messages.filter((item) => {
    if (platform && platform !== "all" && item.platform !== platform) return false;
    if (role && role !== "all" && item.normalizedRole !== role) return false;
    return true;
  });
}

export async function getIdentityReviewTasks() {
  return fromPostgres(() => getIdentityReviewTasksFromPostgres(), () => identityReviewTasks);
}

export async function getConversations() {
  return fromPostgres(() => getConversationsFromPostgres(), () => conversations);
}

export async function getQualityResults() {
  return fromPostgres(() => getQualityResultsFromPostgres(), () => qualityResults);
}

export async function evaluateQualityWithAi(payload = {}) {
  return runAiQualityEvaluation(payload);
}

export async function getCustomerProfiles() {
  return fromPostgres(() => getCustomerProfilesFromPostgres(), () => customerProfiles);
}

export async function getPermissionModel() {
  return fromPostgres(() => getPermissionModelFromPostgres(), () => permissionModel);
}

export async function createAccountRequest(payload = {}) {
  return fromPostgres(() => createAccountRequestInPostgres(payload), () => createAccountRequestInMock(payload));
}

function createAccountRequestInMock(payload = {}) {
  const record = {
    id: `account_request_${Date.now()}`,
    name: String(payload.name || "").trim(),
    username: String(payload.username || "").trim(),
    department: String(payload.department || "").trim(),
    role: payload.role || "service_user",
    dataScope: payload.dataScope || "self",
    note: payload.note || "",
    status: "pending_cloud_database_write",
    createdAt: new Date().toISOString()
  };

  accountRequests.unshift(record);

  return {
    ok: true,
    message: "账号申请已接收，等待写入云数据库",
    record,
    persistence: "mock_memory_only"
  };
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

async function fromPostgres(dbCall, fallbackCall) {
  if (!isPostgresConfigured()) {
    return fallbackCall();
  }

  try {
    return await dbCall();
  } catch (error) {
    console.warn("[database] PostgreSQL fallback to mock:", error instanceof Error ? error.message : String(error));
    return fallbackCall();
  }
}
