import { mockRequest } from "./mock.js";

const API_BASE = resolveApiBase();
const sessionKey = "qi_session";

function resolveApiBase() {
  const configured = globalThis.QI_API_BASE || globalThis.__QI_CONFIG__?.apiBase;
  if (configured) return normalizeApiBase(configured);

  return "/api";
}

function normalizeApiBase(value) {
  return String(value || "/api").replace(/\/+$/, "");
}

async function request(path, options = {}) {
  const token = getAuthToken();
  const config = {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    ...options
  };

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, config);
  } catch (error) {
    return mockRequest(path, config);
  }

  const payload = await safeJson(response);
  if (!response.ok) {
    return payload || {
      ok: false,
      statusCode: response.status,
      message: `HTTP ${response.status}`
    };
  }

  return payload;
}

export function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export function getDemoUsers() {
  return request("/auth/demo-users");
}

export function getOverview(role) {
  return request("/overview", {
    method: "POST",
    body: JSON.stringify({ role })
  });
}

export function getSyncStatus() {
  return request("/sync/status");
}

export function getMessages() {
  return request("/messages");
}

export function getIdentityReviewTasks() {
  return request("/identity/review");
}

export function getConversations() {
  return request("/conversations");
}

export function getQualityResults() {
  return request("/quality/results");
}

export function evaluateQualityWithAi(payload) {
  return request("/quality/ai-evaluate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function adjustQualityScore(payload) {
  return request("/quality/score-adjust", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getCustomerProfiles() {
  return request("/customers");
}

export function getPermissionModel() {
  return request("/permissions");
}

export function updateAccountPermission(payload) {
  return request("/permissions/account-update", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function createAccountRequest(payload) {
  return request("/accounts/request", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getAccountRequests() {
  return request("/accounts/requests");
}

export function approveAccountRequest(payload) {
  return request("/accounts/request-approve", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function rejectAccountRequest(payload) {
  return request("/accounts/request-reject", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getOperationLogs(limit = 30) {
  return request(`/operations/logs?limit=${encodeURIComponent(limit)}`);
}

export function getRuleConfig() {
  return request("/rules");
}

export async function getBiDashboard() {
  return normalizeBiDashboard(await request("/bi"));
}

function getAuthToken() {
  const raw = safeLocalStorageGet(sessionKey);
  if (!raw) return "";
  try {
    const session = JSON.parse(raw);
    return session?.token || "";
  } catch {
    return "";
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeBiDashboard(payload) {
  const fallback = fallbackBiDashboard();
  if (!payload || !Array.isArray(payload.questionTypes)) return fallback;

  return {
    ...fallback,
    ...payload,
    meta: {
      ...fallback.meta,
      ...(payload.meta || {})
    },
    questionTypes: normalizeQuestionTypes(payload.questionTypes)
  };
}

function normalizeQuestionTypes(items) {
  return items.map((item) => ({
    type: item.type || item.label || "未分类",
    count: Number(item.count ?? item.value ?? 0),
    percentage: Number(item.percentage ?? item.value ?? 0)
  }));
}

function safeLocalStorageGet(key) {
  try {
    return typeof localStorage === "undefined" ? "" : localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function fallbackBiDashboard() {
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
