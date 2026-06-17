import {
  adjustQualityScore,
  getBiDashboard,
  getConversations,
  getCustomerProfiles,
  getDemoUsers,
  getIdentityReviewTasks,
  getMessages,
  getOverview,
  getPermissionModel,
  getAccountRequests,
  getOperationLogs,
  getQualityResults,
  evaluateQualityWithAi,
  getRuleConfig,
  getSyncStatus,
  login,
  approveAccountRequest,
  createAccountRequest,
  rejectAccountRequest,
  updateAccountPermission
} from "./api.js";

const app = document.getElementById("app");
const sessionKey = "qi_session";
const sidebarCollapsedKey = "qi_sidebar_collapsed";

const state = {
  user: readSession(),
  view: "dashboard",
  loading: false,
  toast: "",
  sidebarCollapsed: readSidebarCollapsed(),
  selectedConversationId: null,
  selectedQualityResultId: null,
  selectedIdentityReviewId: null,
  filters: {
    platform: "all",
    role: "all",
    qualityOwner: "all",
    qualityDate: "all",
    qualityStatus: "all",
    qualityQuery: "",
    biPeriod: "30d",
    biOwner: "all"
  },
  accountModalOpen: false,
  pendingAccountRequests: [],
  accountProvisionResult: null,
  aiEvaluation: null,
  data: {
    overview: null,
    syncStatus: null,
    messages: [],
    identityReviewTasks: [],
    conversations: [],
    qualityResults: [],
    customerProfiles: [],
    permissionModel: null,
    accountRequests: [],
    operationLogs: [],
    ruleConfig: null,
    biDashboard: null,
    demoUsers: []
  }
};

const menuByRole = {
  super_admin: [
    { id: "dashboard", label: "总览看板" },
    { id: "sync", label: "数据接入" },
    { id: "messages", label: "聊天记录" },
    { id: "identity", label: "身份复核" },
    { id: "conversations", label: "会话链路" },
    { id: "quality", label: "质检评分" },
    { id: "customers", label: "客户画像" },
    { id: "permissions", label: "账号权限" },
    { id: "rules", label: "规则配置" },
    { id: "bi", label: "BI 看板" }
  ],
  quality_user: [
    { id: "dashboard", label: "总览看板" },
    { id: "messages", label: "聊天记录" },
    { id: "identity", label: "身份复核" },
    { id: "conversations", label: "会话链路" },
    { id: "quality", label: "质检评分" },
    { id: "customers", label: "客户画像" },
    { id: "bi", label: "BI 看板" }
  ],
  quality_manager: [
    { id: "dashboard", label: "总览看板" },
    { id: "messages", label: "聊天记录" },
    { id: "identity", label: "身份复核" },
    { id: "conversations", label: "会话链路" },
    { id: "quality", label: "质检评分" },
    { id: "customers", label: "客户画像" },
    { id: "bi", label: "BI 看板" }
  ],
  service_user: [
    { id: "dashboard", label: "总览看板" },
    { id: "messages", label: "聊天记录" },
    { id: "conversations", label: "会话链路" },
    { id: "quality", label: "客服复盘" },
    { id: "customers", label: "客户画像" }
  ]
};

const roleLabel = {
  super_admin: "超级管理员",
  quality_manager: "质检主管",
  quality_user: "质检员",
  service_user: "客服"
};

init();

function readSession() {
  try {
    const raw = localStorage.getItem(sessionKey);
    const session = normalizeSession(raw ? JSON.parse(raw) : null);
    return session.user && session.token ? session.user : null;
  } catch {
    return null;
  }
}

function saveSession(value) {
  const session = normalizeSession(value);
  if (session.user) {
    localStorage.setItem(sessionKey, JSON.stringify(session));
  }
}

function readSidebarCollapsed() {
  try {
    const saved = localStorage.getItem(sidebarCollapsedKey);
    if (saved === "true" || saved === "false") return saved === "true";
    return window.matchMedia?.("(max-width: 760px)")?.matches || false;
  } catch {
    return false;
  }
}

function saveSidebarCollapsed(value) {
  try {
    localStorage.setItem(sidebarCollapsedKey, value ? "true" : "false");
  } catch {
    // Ignore storage errors in private browsing modes.
  }
}

function scrollPageToTop() {
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
}

function normalizeUserSession(value) {
  const user = value?.user || value;
  if (!user || !user.name || !user.role) return null;
  return user;
}

function normalizeSession(value) {
  return {
    user: normalizeUserSession(value),
    token: value?.token || ""
  };
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clearSession() {
  localStorage.removeItem(sessionKey);
}

function setToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(setToast.timer);
  setToast.timer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2500);
}

async function init() {
  if (!state.user) {
    await loadDemoUsers();
    render();
    bindGlobalEvents();
    return;
  }

  try {
    await loadData();
  } catch (error) {
    if (isAuthError(error)) {
      await resetToLogin(error.message || "登录已失效，请重新登录");
      bindGlobalEvents();
      return;
    }
    throw error;
  }
  state.view = getDefaultView(state.user.role);
  state.selectedConversationId = state.data.conversations[0]?.id || null;
  state.selectedQualityResultId = state.data.qualityResults[0]?.id || null;
  state.selectedIdentityReviewId = state.data.identityReviewTasks[0]?.id || null;
  render();
  bindGlobalEvents();
}

function getDefaultView(role) {
  const first = menuByRole[role]?.[0];
  return first ? first.id : "dashboard";
}

function databaseConnectedLabel() {
  return isDatabaseConnected() ? "真实数据库" : "演示数据";
}

function isDatabaseConnected() {
  const sync = state.data.syncStatus || {};
  return sync.mode === "postgres" || sync.databaseApi === "connected";
}

async function loadDemoUsers() {
  try {
    state.data.demoUsers = await getDemoUsers();
  } catch {
    state.data.demoUsers = [];
  }
}

async function loadData() {
  const role = state.user?.role || "quality_user";
  const canAdmin = role === "super_admin";
  const canQuality = role === "super_admin" || role === "quality_manager" || role === "quality_user";
  const canReadQualityResults = canQuality || role === "service_user";
  const payload = await Promise.all([
    getOverview(role),
    canAdmin ? getSyncStatus() : Promise.resolve(null),
    getMessages(),
    canQuality ? getIdentityReviewTasks() : Promise.resolve([]),
    getConversations(),
    canReadQualityResults ? getQualityResults() : Promise.resolve([]),
    getCustomerProfiles(),
    canAdmin ? getPermissionModel() : Promise.resolve({ roles: [], permissions: [], accounts: [] }),
    canAdmin ? getAccountRequests() : Promise.resolve([]),
    canAdmin ? getOperationLogs(20) : Promise.resolve([]),
    canAdmin ? getRuleConfig() : Promise.resolve(null),
    canQuality ? getBiDashboard() : Promise.resolve(null)
  ]);
  const authPayload = payload.find(isUnauthorizedPayload);
  if (authPayload) {
    const error = new Error("登录已失效，请重新登录");
    error.authExpired = true;
    throw error;
  }

  [
    state.data.overview,
    state.data.syncStatus,
    state.data.messages,
    state.data.identityReviewTasks,
    state.data.conversations,
    state.data.qualityResults,
    state.data.customerProfiles,
    state.data.permissionModel,
    state.data.accountRequests,
    state.data.operationLogs,
    state.data.ruleConfig,
    state.data.biDashboard
  ] = payload;
}

function loginView() {
  const demos = state.data.demoUsers
    .map(
      (user) => `
        <div class="demo-item">
          <div>
            <strong>${escapeHtml(user.name)}</strong>
            <div class="muted">${escapeHtml(user.username)} / ${roleLabel[user.role] || user.role}</div>
          </div>
          <span class="badge ${user.role === "super_admin" ? "admin" : "user"}">${escapeHtml(user.department)}</span>
        </div>
      `
    )
    .join("");

  app.innerHTML = `
    <div class="login-screen">
      <section class="login-hero">
        <div class="login-hero-content">
          <div class="brand-mark">
            <div class="brand-badge">质</div>
            <span>花植客服质检中台</span>
          </div>
          <h1 class="hero-title">面向管理层和客服团队的质检评测工作台</h1>
          <p class="hero-copy">统一查看淘宝、微信等客服链路，评估服务质量、客户意向、需求标签和风险问题，帮助管理层复盘客服表现，也帮助一线客服及时跟进。</p>
          <div class="login-operations">
            <div class="login-ops-card">
              <span>管理层</span>
              <strong>看趋势、看异常、看团队质量</strong>
            </div>
            <div class="login-ops-card">
              <span>质检员</span>
              <strong>复核身份、评分依据和 AI 结论</strong>
            </div>
            <div class="login-ops-card">
              <span>客服</span>
              <strong>回看客户需求、意向和待跟进事项</strong>
            </div>
          </div>
        </div>
        <div class="login-visual">
          <div class="hero-points">
            <div class="hero-point">跨平台聊天记录统一归档，保留原始证据链。</div>
            <div class="hero-point">客户意向、需求类型、满意度和风险点集中评测。</div>
            <div class="hero-point">不同角色登录后进入对应工作台和数据范围。</div>
            <div class="hero-point">后续可继续接入真实数据库、工单系统和 BI。</div>
          </div>
        </div>
      </section>

      <section class="login-panel">
        <div class="login-card panel-card">
          <h2>登录系统</h2>
          <p class="muted">先用演示账号进入内部质检台。后续可替换成企业自己的账号和权限服务。</p>
          <form id="login-form" class="grid" style="gap:14px">
            <div class="field">
              <label>账号</label>
              <input name="username" placeholder="admin / qc / service" autocomplete="username" />
            </div>
            <div class="field">
              <label>密码</label>
              <input name="password" type="password" placeholder="admin123 / 123456" autocomplete="current-password" />
            </div>
            <div class="button-row">
              <button class="btn primary" type="submit">登录</button>
              <button class="btn ghost" type="button" id="fill-admin">填充超级管理员</button>
            </div>
          </form>
        </div>

        <div class="login-card panel-card">
          <h2>角色入口</h2>
          <div class="demo-grid">${demos || '<div class="empty-state">暂无演示账号</div>'}</div>
        </div>
      </section>
    </div>
  `;

  const form = document.getElementById("login-form");
  form?.addEventListener("submit", onLoginSubmit);
  document.getElementById("fill-admin")?.addEventListener("click", () => {
    form.username.value = "admin";
    form.password.value = "admin123";
  });
}

async function onLoginSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "").trim();

  if (!username || !password) {
    setToast("请输入账号和密码");
    return;
  }

  const result = await login(username, password);
  if (!result.ok) {
    setToast(result.message || "登录失败");
    return;
  }

  state.user = result.user;
  saveSession(result);
  try {
    await loadData();
  } catch (error) {
    if (isAuthError(error)) {
      await resetToLogin(error.message || "登录已失效，请重新登录");
      return;
    }
    throw error;
  }
  state.view = getDefaultView(state.user.role);
  state.selectedConversationId = state.data.conversations[0]?.id || null;
  state.selectedQualityResultId = state.data.qualityResults[0]?.id || null;
  state.selectedIdentityReviewId = state.data.identityReviewTasks[0]?.id || null;
  state.aiEvaluation = null;
  render();
  scrollPageToTop();
}

function bindGlobalEvents() {
  app.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const trigger = target.closest("[data-action], [data-view]");
    if (!(trigger instanceof HTMLElement) || !app.contains(trigger)) return;
    event.preventDefault();

    const action = trigger.dataset.action;
    const view = trigger.dataset.view;
    const conversationId = trigger.dataset.conversationId;
    const qualityResultId = trigger.dataset.qualityResultId;
    const reviewId = trigger.dataset.reviewId;

    if (view) {
      state.view = view;
      render();
      scrollPageToTop();
      return;
    }

    if (action === "logout") {
      clearSession();
      state.user = null;
      state.view = "dashboard";
      state.selectedConversationId = null;
      state.selectedQualityResultId = null;
      state.selectedIdentityReviewId = null;
      state.aiEvaluation = null;
      render();
      scrollPageToTop();
      await loadDemoUsers();
      return;
    }

    if (action === "toggle-sidebar") {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      saveSidebarCollapsed(state.sidebarCollapsed);
      render();
      return;
    }

    if (action === "refresh") {
      state.loading = true;
      render();
      try {
        await Promise.all([loadData(), delay(450)]);
        setToast("数据已刷新");
      } finally {
        state.loading = false;
        render();
      }
      return;
    }

    if (action === "select-conversation" && conversationId) {
      state.selectedConversationId = conversationId;
      state.selectedQualityResultId = findQualityResultByConversation(conversationId)?.id || state.selectedQualityResultId;
      state.aiEvaluation = null;
      render();
      const conversation = findConversation(conversationId);
      setToast(conversation ? `已切换到 ${conversation.customerName} 的会话详情` : "已切换会话详情");
      return;
    }

    if (action === "select-quality-result" && qualityResultId) {
      const result = findQualityResult(qualityResultId);
      if (result) {
        state.selectedQualityResultId = result.id;
        state.selectedConversationId = result.conversationId;
        state.aiEvaluation = null;
        state.view = "quality";
        render();
        requestAnimationFrame(() => {
          document.getElementById("quality-detail")?.scrollIntoView({ block: "start", behavior: "smooth" });
        });
        setToast(`已打开 ${result.owner || "未分配"} / ${result.customerName || result.conversationId} 的质检详情`);
      }
      return;
    }

    if (action === "select-review" && reviewId) {
      state.selectedIdentityReviewId = reviewId;
      render();
      const task = findIdentityReviewTask(reviewId);
      setToast(task ? `已切换到 ${task.recommendedName} 的复核依据` : "已切换复核任务");
      return;
    }

    if (action === "approve-review" && reviewId) {
      state.selectedIdentityReviewId = reviewId;
      updateReviewStatus(reviewId, "confirmed");
      setToast("已确认身份匹配");
      return;
    }

    if (action === "reject-review" && reviewId) {
      state.selectedIdentityReviewId = reviewId;
      updateReviewStatus(reviewId, "rejected");
      setToast("已驳回身份匹配");
      return;
    }

    if (action === "mark-resolved" && reviewId) {
      state.selectedIdentityReviewId = reviewId;
      updateReviewStatus(reviewId, "resolved");
      setToast("已标记为复核完成");
      return;
    }

    if (action === "set-conversation-default" && conversationId) {
      state.selectedConversationId = conversationId;
      state.selectedQualityResultId = findQualityResultByConversation(conversationId)?.id || state.selectedQualityResultId;
      state.aiEvaluation = null;
      state.view = canAccessView("quality") ? "quality" : "customers";
      const conversation = findConversation(conversationId);
      render();
      scrollPageToTop();
      setToast(conversation ? `已进入 ${conversation.customerName} 的质检页面` : "已进入质检页面");
      return;
    }

    if (action === "open-account-modal") {
      state.accountModalOpen = true;
      render();
      return;
    }

    if (action === "close-account-modal") {
      state.accountModalOpen = false;
      render();
      return;
    }

    if (action === "submit-account-request") {
      submitAccountRequest().catch(() => setToast("账号申请提交失败，请检查后端服务"));
      return;
    }

    if (action === "update-account-permission") {
      const userId = trigger.dataset.userId || "";
      submitPermissionUpdate(userId).catch(() => setToast("权限下放失败，请检查后端服务"));
      return;
    }

    if (action === "approve-account-request") {
      const requestId = trigger.dataset.requestId || "";
      submitAccountRequestApproval(requestId).catch(() => setToast("账号审批失败，请检查后端服务"));
      return;
    }

    if (action === "reject-account-request") {
      const requestId = trigger.dataset.requestId || "";
      submitAccountRequestRejection(requestId).catch(() => setToast("账号拒绝失败，请检查后端服务"));
      return;
    }

    if (action === "run-ai-quality") {
      runAiQualityEvaluation().catch(() => setToast("AI 质检调用失败，请检查后端服务"));
      return;
    }

    if (action === "submit-quality-adjust") {
      submitQualityAdjustment().catch(() => setToast("人工改分失败，请检查后端服务"));
      return;
    }
  });
}

function canAccessView(viewId) {
  const role = state.user?.role || "quality_user";
  return Boolean(menuByRole[role]?.some((item) => item.id === viewId));
}

function findConversation(conversationId) {
  return state.data.conversations.find((item) => item.id === conversationId);
}

function findQualityResult(qualityResultId) {
  return asArray(state.data.qualityResults).find((item) => item.id === qualityResultId);
}

function findQualityResultByConversation(conversationId) {
  return asArray(state.data.qualityResults).find((item) => item.conversationId === conversationId);
}

function findIdentityReviewTask(reviewId) {
  return state.data.identityReviewTasks.find((item) => item.id === reviewId);
}

async function runAiQualityEvaluation() {
  state.loading = true;
  render();
  try {
    const conversationId = state.selectedConversationId || state.data.conversations[0]?.id || "conv_001";
    state.aiEvaluation = await evaluateQualityWithAi({
      conversation_id: conversationId,
      viewer_role: state.user?.role || "quality_user"
    });
    if (state.aiEvaluation.ok) {
      await loadData();
      state.selectedQualityResultId = findQualityResultByConversation(conversationId)?.id || state.selectedQualityResultId;
    }
    const successMessage = state.user?.role === "service_user" ? "AI 复盘完成" : "AI 质检完成";
    setToast(state.aiEvaluation.ok ? successMessage : getAiFailureMessage(state.aiEvaluation));
  } finally {
    state.loading = false;
    render();
  }
}

async function submitQualityAdjustment() {
  if (!canAdjustQualityScore()) {
    setToast("当前账号没有人工改分权限");
    return;
  }

  const result = getSelectedQualityResult();
  if (!result) {
    setToast("暂无可修改的质检结果");
    return;
  }

  const input = document.getElementById("quality-ai-score");
  const aiScore = numericOrNull(input?.value);
  const reason = document.getElementById("quality-adjust-reason")?.value.trim() || "";
  if (aiScore === null || aiScore < 0 || aiScore > 60) {
    setToast("AI 质检分必须是 0 到 60 的数字");
    return;
  }

  if (reason.length < 4) {
    setToast("请填写人工改分理由，至少 4 个字");
    return;
  }

  state.loading = true;
  render();
  try {
    const response = await adjustQualityScore({
      quality_result_id: result.id,
      conversation_id: result.conversationId,
      ai_score: aiScore,
      reason
    });
    if (!response.ok) {
      setToast(response.message || "人工改分失败");
      return;
    }
    await loadData();
    setToast("人工改分已保存");
  } finally {
    state.loading = false;
    render();
  }
}

async function resetToLogin(message) {
  clearSession();
  state.user = null;
  state.view = "dashboard";
  state.selectedConversationId = null;
  state.selectedQualityResultId = null;
  state.selectedIdentityReviewId = null;
  state.aiEvaluation = null;
  await loadDemoUsers();
  render();
  scrollPageToTop();
  setToast(message);
}

function isUnauthorizedPayload(payload) {
  return Boolean(
    payload &&
      payload.ok === false &&
      ["missing_token", "invalid_token", "expired_token"].includes(payload.code)
  );
}

function isAuthError(error) {
  return Boolean(error?.authExpired);
}

function getAiFailureMessage(result = {}) {
  if (result.status === "request_timeout") return "AI 请求超时，请检查测试模型网络或调大超时时间";
  if (result.status === "missing_api_key") return "AI 密钥未配置，请检查 backend/.env.local";
  if (result.status === "missing_ai_provider_config") return "AI Provider 配置不完整，请检查模型和接口地址";
  if (result.status === "invalid_ai_result") return "AI 返回结构不合格，结果已记录为失败审计";
  if (result.status === "ai_provider_error" || result.status === "deepseek_error") return `AI 服务返回错误：${result.statusCode || "未知状态"}`;
  return result.message || "AI 质检未完成，请查看配置提示";
}

async function submitAccountRequest() {
  const name = document.getElementById("account-name")?.value.trim();
  const username = document.getElementById("account-username")?.value.trim();
  const department = document.getElementById("account-department")?.value.trim();
  const role = document.getElementById("account-role")?.value || "service_user";
  const dataScope = document.getElementById("account-scope")?.value || "self";
  const note = document.getElementById("account-note")?.value.trim() || "";

  if (!name || !username || !department) {
    setToast("请填写姓名、登录账号和所属部门");
    return;
  }

  const result = await createAccountRequest({
    name,
    username,
    department,
    role,
    dataScope,
    note
  });

  if (!result.ok) {
    setToast(result.message || "账号申请提交失败");
    return;
  }

  state.accountModalOpen = false;
  state.accountProvisionResult = null;
  await loadData();
  setToast("账号申请已生成，等待管理员审批开通");
}

async function submitPermissionUpdate(userId) {
  if (state.user?.role !== "super_admin") {
    setToast("当前账号没有权限下放账号权限");
    return;
  }

  if (!userId || userId === state.user?.id) {
    setToast("不能修改当前登录账号的权限");
    return;
  }

  const role = document.getElementById(`permission-role-${userId}`)?.value;
  const dataScope = document.getElementById(`permission-scope-${userId}`)?.value;
  if (!role || !dataScope) {
    setToast("请选择要下放的角色和数据范围");
    return;
  }

  state.loading = true;
  render();
  try {
    const response = await updateAccountPermission({
      user_id: userId,
      role,
      data_scope: dataScope
    });

    if (!response.ok) {
      setToast(response.message || "权限下放保存失败");
      return;
    }

    await loadData();
    const accountName = response.account?.name || "该账号";
    setToast(`${accountName} 已下放为 ${roleNameByKey(role)} / ${scopeLabel(dataScope)}`);
  } finally {
    state.loading = false;
    render();
  }
}

async function submitAccountRequestApproval(requestId) {
  if (state.user?.role !== "super_admin") {
    setToast("当前账号没有账号审批权限");
    return;
  }

  if (!requestId) {
    setToast("缺少账号申请 ID");
    return;
  }

  state.loading = true;
  render();
  try {
    const response = await approveAccountRequest({ request_id: requestId });
    if (!response.ok) {
      setToast(response.message || "账号审批失败");
      return;
    }

    state.accountProvisionResult = {
      account: response.account,
      initialPassword: response.initialPassword
    };
    await loadData();
    setToast(`${response.account?.name || "账号"} 已开通`);
  } finally {
    state.loading = false;
    render();
  }
}

async function submitAccountRequestRejection(requestId) {
  if (state.user?.role !== "super_admin") {
    setToast("当前账号没有账号审批权限");
    return;
  }

  if (!requestId) {
    setToast("缺少账号申请 ID");
    return;
  }

  state.loading = true;
  render();
  try {
    const response = await rejectAccountRequest({ request_id: requestId });
    if (!response.ok) {
      setToast(response.message || "账号拒绝失败");
      return;
    }

    state.accountProvisionResult = null;
    await loadData();
    setToast("账号申请已拒绝");
  } finally {
    state.loading = false;
    render();
  }
}

function updateReviewStatus(reviewId, status) {
  state.data.identityReviewTasks = state.data.identityReviewTasks.map((item) => {
    if (item.id !== reviewId) return item;
    return { ...item, status };
  });
  render();
}

function appView() {
  const currentUser = normalizeUserSession(state.user) || { name: "未识别账号", role: "quality_user" };
  state.user = currentUser;
  const menu = menuByRole[currentUser.role] || menuByRole.quality_user;
  const activeMenu = menu.find((item) => item.id === state.view) || menu[0];
  if (activeMenu && activeMenu.id !== state.view) {
    state.view = activeMenu.id;
  }
  const sync = state.data.syncStatus || {};
  const databaseConnected = sync.mode === "postgres" || sync.databaseApi === "connected";
  const dataSourceTitle = databaseConnected ? "PostgreSQL 数据库" : "演示数据";
  const dataSourceHint = databaseConnected
    ? "历史聊天记录、身份匹配和质检结果正在读取本地数据库。"
    : "数据库接口未连接时，页面自动读取 mock 数据。";
  const collapsedClass = state.sidebarCollapsed ? " sidebar-collapsed" : "";

  return `
    <div class="app-layout${collapsedClass}">
      <button
        class="sidebar-toggle floating"
        data-action="toggle-sidebar"
        title="${state.sidebarCollapsed ? "展开目录" : "隐藏目录"}"
        aria-label="${state.sidebarCollapsed ? "展开目录" : "隐藏目录"}"
      >
        <span class="sidebar-toggle-arrow" aria-hidden="true"></span>
      </button>
      <aside class="sidebar">
        <button
          class="sidebar-toggle inside"
          data-action="toggle-sidebar"
          title="隐藏目录"
          aria-label="隐藏目录"
        >
          <span class="sidebar-toggle-arrow" aria-hidden="true"></span>
        </button>
        <div class="brand-mark">
          <div class="brand-badge">质</div>
          <span>花植客服质检中台</span>
        </div>
        <div class="user-level">
          <span>当前用户等级</span>
          <strong>${escapeHtml(roleLabel[currentUser.role] || currentUser.role)}</strong>
        </div>
        <nav class="nav">
          ${menu
            .map(
              (item) => `
                <button class="${item.id === state.view ? "active" : ""}" data-view="${item.id}">${escapeHtml(item.label)}</button>
              `
            )
            .join("")}
        </nav>
        <div class="sidebar-card">
          <div class="muted" style="color:#cbd5e1">当前数据源</div>
          <strong>${escapeHtml(dataSourceTitle)}</strong>
          <div class="muted" style="color:#cbd5e1; margin-top:6px">${escapeHtml(dataSourceHint)}</div>
        </div>
      </aside>

      <section class="content">
        <header class="topbar">
          <div>
            <div class="muted">内部评测视图</div>
            <div style="font-weight:700">${escapeHtml(menu.find((item) => item.id === state.view)?.label || "总览看板")}</div>
          </div>
          <div class="button-row">
            <span class="badge ${currentUser.role === "super_admin" ? "admin" : "user"}">${escapeHtml(roleLabel[currentUser.role] || currentUser.role)}</span>
            <button class="btn ghost small" data-action="refresh">刷新数据</button>
            <button class="btn danger small" data-action="logout">退出</button>
          </div>
        </header>
        <main class="main page-enter">${renderView()}</main>
        ${state.loading ? renderLoadingOverlay() : ""}
      </section>
    </div>
  `;
}

function renderView() {
  switch (state.view) {
    case "sync":
      return renderSync();
    case "messages":
      return renderMessages();
    case "identity":
      return renderIdentity();
    case "conversations":
      return renderConversations();
    case "quality":
      return renderQuality();
    case "customers":
      return renderCustomers();
    case "permissions":
      return renderPermissionsV2();
    case "rules":
      return renderRulesV2();
    case "bi":
      return renderBiV3();
    case "dashboard":
    default:
      return renderDashboard();
  }
}

function renderDashboard() {
  const overview = state.data.overview;
  if (!overview) return `<div class="empty-state">加载中...</div>`;
  const visuals = buildDashboardVisuals();
  const statusRows = buildDashboardStatusRows();

  return `
    <section class="panel-card section">
      <div class="dashboard-brief">
        <div class="brief-copy">
          <span class="brief-kicker">运营质检台</span>
          <h2>${escapeHtml(overview.roleName)}</h2>
          <p>围绕客服表现、客户意向、需求标签和风险问题做内部评测。页面展示的是管理与复盘指标，不面向商品买家展示。</p>
        </div>
        <div class="brief-status">
          <div>
            <span>当前视角</span>
            <strong>${escapeHtml(roleLabel[state.user?.role] || state.user?.role || "质检")}</strong>
          </div>
          <div>
            <span>数据范围</span>
            <strong>${escapeHtml(databaseConnectedLabel())}</strong>
          </div>
        </div>
      </div>
      <div class="section-header">
        <div>
          <h3>${escapeHtml(overview.roleName)}</h3>
          <div class="muted">客服质检、客户意向和待处理风险在这里汇总。</div>
        </div>
      </div>
      <div class="grid metrics">
        ${overview.metrics
          .map(
            (item) => `
              <div class="metric-card">
                <div class="metric-title">${escapeHtml(item.label)}</div>
                <div class="metric-value">${escapeHtml(String(item.value))}</div>
                <div class="metric-trend muted">${escapeHtml(item.trend)}</div>
              </div>
            `
          )
          .join("")}
      </div>
      ${renderDashboardVisualSection(visuals)}
    </section>

    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>项目流程</h3>
          <div class="muted">从聊天记录进入系统后的内部评测链路。</div>
        </div>
      </div>
      <div class="steps">
        ${overview.workflow
          .map(
            (step, index) => `
              <div class="step">
                <strong>${index + 1}. ${escapeHtml(step)}</strong>
                <div class="muted">${stepHint(step)}</div>
              </div>
            `
          )
          .join("")}
      </div>
    </section>

    <div class="grid two">
      <section class="panel-card section">
        <div class="section-header">
          <h3>当前重点</h3>
        </div>
        <div class="timeline">
          <div class="timeline-item"><strong>第一步</strong><div class="muted">先把淘宝、微信和统一身份映射稳定下来，再做后续评分。</div></div>
          <div class="timeline-item"><strong>第二步</strong><div class="muted">把会话切分、响应时长、问题类型和专业度规则跑通。</div></div>
          <div class="timeline-item"><strong>第三步</strong><div class="muted">接真实数据库 API 后，管理层可按团队、账号和周期做复盘。</div></div>
        </div>
      </section>

      <section class="panel-card section">
        <div class="section-header">
          <h3>当前状态</h3>
        </div>
        <div class="stats-list">
          ${statusRows
            .map(
              (item) => `
                <div class="stat-row"><span>${escapeHtml(item.label)}</span><span class="badge ${escapeHtml(item.tone)}">${escapeHtml(item.value)}</span></div>
              `
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function buildDashboardStatusRows() {
  return [
    { label: "数据接入", value: isDatabaseConnected() ? "已接入" : "演示数据", tone: isDatabaseConnected() ? "user" : "warn" },
    { label: "身份统一", value: "可复核", tone: "user" },
    { label: "质检规则", value: "可配置", tone: "user" },
    { label: "权限体系", value: "已启用", tone: "admin" }
  ];
}

function renderSync() {
  const sync = state.data.syncStatus;
  if (!sync) return `<div class="empty-state">加载中...</div>`;
  const databaseConnected = isDatabaseConnected();
  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>数据接入状态</h3>
          <div class="muted">${databaseConnected ? "后端已连接数据库，页面正在读取真实业务表中的聊天、身份和质检数据。" : "数据库未连接时，页面会使用演示数据，方便先验证质检流程。"}</div>
        </div>
      </div>
      ${renderQualityRecordContext(result)}
      <div class="grid three">
        <div class="metric-card"><div class="metric-title">同步模式</div><div class="metric-value" style="font-size:22px">${escapeHtml(sync.mode)}</div></div>
        <div class="metric-card"><div class="metric-title">数据库接口</div><div class="metric-value" style="font-size:22px">${escapeHtml(sync.databaseApi)}</div></div>
        <div class="metric-card"><div class="metric-title">最后全量同步</div><div class="metric-value" style="font-size:22px">${escapeHtml(sync.lastFullSyncAt)}</div></div>
      </div>
    </section>

    <section class="panel-card section">
      <div class="section-header"><h3>来源系统</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>来源</th><th>状态</th><th>预计字段</th></tr></thead>
          <tbody>
            ${sync.sourceSystems
              .map(
                (item) => `
                  <tr>
                    <td>${escapeHtml(item.name)}</td>
                    <td><span class="badge ${escapeHtml(sourceStatusTone(item.status))}">${escapeHtml(sourceStatusText(item.status))}</span></td>
                    <td>${item.expectedFields.map((field) => `<span class="tag">${escapeHtml(field)}</span>`).join(" ")}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel-card section">
      <div class="section-header"><h3>同步检查项</h3></div>
      <div class="tag-list">
        ${sync.syncChecks.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}
      </div>
    </section>
  `;
}

function sourceStatusText(status) {
  const map = {
    placeholder: "待配置",
    pending: "待配置",
    connected: "已接入",
    ready: "已就绪",
    syncing: "同步中",
    failed: "异常"
  };
  return map[status] || status || "待配置";
}

function sourceStatusTone(status) {
  if (["connected", "ready", "syncing"].includes(status)) return "user";
  if (status === "failed") return "danger";
  return "warn";
}

function renderMessages() {
  const filtered = state.data.messages.filter((item) => {
    if (state.filters.platform !== "all" && item.platform !== state.filters.platform) return false;
    if (state.filters.role !== "all" && item.normalizedRole !== state.filters.role) return false;
    return true;
  });
  const visuals = buildMessageVisuals(filtered);

  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>聊天记录</h3>
          <div class="muted">按平台、角色筛选已经标准化的消息。</div>
        </div>
        <div class="button-row">
          <select id="filter-platform">
            <option value="all">全部平台</option>
            <option value="taobao">淘宝</option>
            <option value="wechat">微信</option>
          </select>
          <select id="filter-role">
            <option value="all">全部角色</option>
            <option value="customer">客户</option>
            <option value="service">客服</option>
            <option value="after_sales">售后</option>
          </select>
        </div>
      </div>
      ${renderMessageVisualSection(visuals)}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>平台</th>
              <th>角色</th>
              <th>发送人</th>
              <th>类型</th>
              <th>内容</th>
            </tr>
          </thead>
          <tbody>
            ${filtered
              .map(
                (item) => `
                  <tr>
                    <td>${escapeHtml(item.sentAt)}</td>
                    <td>${escapeHtml(item.platform)}</td>
                    <td><span class="badge ${item.normalizedRole === "customer" ? "user" : "admin"}">${escapeHtml(item.normalizedRole)}</span></td>
                    <td>${escapeHtml(item.senderName)}</td>
                    <td><span class="badge ${messageTypeBadgeClass(item.messageType)}">${escapeHtml(messageTypeLabel(item.messageType))}</span></td>
                    <td>${renderMessageContent(item)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderIdentity() {
  const tasks = state.data.identityReviewTasks;
  const visual = buildIdentityVisuals(tasks);
  const selectedTask = tasks.find((item) => item.id === state.selectedIdentityReviewId) || tasks[0];
  if (selectedTask && state.selectedIdentityReviewId !== selectedTask.id) {
    state.selectedIdentityReviewId = selectedTask.id;
  }
  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>身份复核</h3>
          <div class="muted">从聊天内容抽取线索，低置信度记录进入人工复核。</div>
        </div>
      </div>
      ${renderIdentityVisualSection(visual)}
      <div class="grid two">
        <div class="conversation-list">
          ${tasks
            .map(
              (task) => `
                <div class="conversation-item clickable ${task.id === selectedTask?.id ? "active" : ""}" data-action="select-review" data-review-id="${escapeHtml(task.id)}">
                  <div class="button-row" style="justify-content:space-between">
                    <strong>${escapeHtml(task.recommendedName)}</strong>
                    <span class="badge ${task.status === "confirmed" ? "user" : task.status === "rejected" ? "danger" : "warn"}">${escapeHtml(task.status)}</span>
                  </div>
                  <div class="muted">置信度 ${Math.round(task.confidence * 100)}%</div>
                  <div class="confidence-track"><span style="width:${clampPercent((task.confidence || 0) * 100)}%"></span></div>
                  <div class="muted">淘宝账号：${escapeHtml(task.taobaoAccount)} · 微信账号：${escapeHtml(task.wechatAccount)}</div>
                  <div class="button-row">
                    <button class="btn success small" data-action="approve-review" data-review-id="${escapeHtml(task.id)}">确认</button>
                    <button class="btn danger small" data-action="reject-review" data-review-id="${escapeHtml(task.id)}">驳回</button>
                    <button class="btn ghost small" data-action="mark-resolved" data-review-id="${escapeHtml(task.id)}">标记完成</button>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
        ${renderIdentityDetail(selectedTask)}
      </div>
    </section>
  `;
}

function renderConversations() {
  const conversations = state.data.conversations;
  const selected = conversations.find((item) => item.id === state.selectedConversationId) || conversations[0];
  if (!selected) return `<div class="empty-state">暂无会话数据</div>`;
  const visual = buildConversationVisuals(conversations, selected);
  const profile = findCustomerProfileForConversation(selected);
  const quality = findQualityResultByConversation(selected.id);
  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>会话链路</h3>
          <div class="muted">把淘宝咨询、微信群答疑、身份匹配和跟进动作串起来，帮助商家判断客户该怎么服务。</div>
        </div>
      </div>
      ${renderConversationVisualSection(visual)}
      <div class="conversation-workspace">
        <div class="conversation-list">
          ${conversations
            .map(
              (item) => `
                <div class="conversation-item clickable ${item.id === selected.id ? "active" : ""}" data-action="select-conversation" data-conversation-id="${escapeHtml(item.id)}">
                  <div class="button-row" style="justify-content:space-between">
                    <strong>${escapeHtml(item.customerName)}</strong>
                    <span class="badge ${item.status === "quality_ready" ? "user" : "warn"}">${escapeHtml(item.stage)}</span>
                  </div>
                  <div class="muted">负责人：${escapeHtml(item.owner)} · 最后消息：${escapeHtml(item.lastMessageAt)}</div>
                  <div class="conversation-mini-meta">
                    <span>${escapeHtml(String(asArray(item.timeline).length))} 个节点</span>
                    <span>${escapeHtml(String(asArray(item.participants).length))} 人参与</span>
                  </div>
                  <div class="button-row">
                    <button class="btn ghost small" data-action="select-conversation" data-conversation-id="${escapeHtml(item.id)}">查看详情</button>
                    <button class="btn primary small" data-action="set-conversation-default" data-conversation-id="${escapeHtml(item.id)}">进入质检</button>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="conversation-detail-stack">
          <div class="conversation-hero-card">
            <div>
              <div class="muted">当前会话</div>
              <h3>${escapeHtml(selected.customerName)}</h3>
              <div class="muted">会话ID：${escapeHtml(selected.id)} · 状态：${escapeHtml(selected.status)} · 负责人：${escapeHtml(selected.owner)}</div>
            </div>
            <div class="conversation-score-chip">
              <span>质检分</span>
              <strong>${quality ? formatScore(quality.finalScore ?? quality.totalScore) : "-"}</strong>
            </div>
          </div>
          ${renderConversationBusinessSignals(selected, profile, quality)}
          ${renderConversationRoute(selected)}
          <div class="detail-card section conversation-participants">
            <div class="button-row" style="justify-content:space-between">
              <h4 class="section-title">参与人员</h4>
              <span class="badge admin">${asArray(selected.participants).length} 人</span>
            </div>
            <div class="tag-list">${asArray(selected.participants).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("") || '<span class="tag">暂无</span>'}</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function buildDashboardVisuals() {
  const messages = asArray(state.data.messages);
  const identityTasks = asArray(state.data.identityReviewTasks);
  const conversations = asArray(state.data.conversations);
  const qualityResults = asArray(state.data.qualityResults);
  const customers = asArray(state.data.customerProfiles);
  const pendingIdentity = identityTasks.filter((item) => ["pending", "needs_review"].includes(item.status)).length;
  const readyQuality = conversations.filter((item) => item.status === "quality_ready").length;
  const riskCount = qualityResults.reduce((total, item) => total + asArray(item.risks).length, 0);
  const highIntent = customers.filter((item) => String(item.intentLevel || "").includes("高")).length;

  return {
    sourceSegments: buildSegments(messages, (item) => platformLabel(item.platform)),
    roleSegments: buildSegments(messages, (item) => roleText(item.normalizedRole)),
    queueItems: [
      { label: "待身份复核", value: pendingIdentity, tone: pendingIdentity ? "warn" : "user" },
      { label: "可进入质检", value: readyQuality, tone: "user" },
      { label: "需关注风险", value: riskCount, tone: riskCount ? "danger" : "user" },
      { label: "高意向客户", value: highIntent, tone: "admin" }
    ],
    flowSteps: [
      { label: "淘宝咨询", value: countByValue(messages, (item) => item.platform === "taobao") },
      { label: "微信进群", value: countByValue(messages, (item) => item.platform === "wechat") },
      { label: "身份匹配", value: identityTasks.length },
      { label: "会话串联", value: conversations.length },
      { label: "AI 质检", value: qualityResults.length }
    ]
  };
}

function renderDashboardVisualSection(visuals) {
  return `
    <div class="visual-grid dashboard-visuals">
      <div class="visual-card">
        <div class="visual-card-head">
          <span>消息来源占比</span>
          <strong>${sumSegmentCount(visuals.sourceSegments)}</strong>
        </div>
        ${renderStackedBar(visuals.sourceSegments)}
        ${renderLegend(visuals.sourceSegments)}
      </div>

      <div class="visual-card">
        <div class="visual-card-head">
          <span>角色消息占比</span>
          <strong>${sumSegmentCount(visuals.roleSegments)}</strong>
        </div>
        ${renderStackedBar(visuals.roleSegments)}
        ${renderLegend(visuals.roleSegments)}
      </div>

      <div class="visual-card">
        <div class="visual-card-head">
          <span>当前处理队列</span>
          <strong>${visuals.queueItems.reduce((total, item) => total + Number(item.value || 0), 0)}</strong>
        </div>
        <div class="mini-kpi-grid">
          ${visuals.queueItems
            .map(
              (item) => `
                <div class="mini-kpi ${escapeHtml(item.tone)}">
                  <span>${escapeHtml(item.label)}</span>
                  <strong>${escapeHtml(String(item.value))}</strong>
                </div>
              `
            )
            .join("")}
        </div>
      </div>

      <div class="visual-card wide">
        <div class="visual-card-head">
          <span>业务处理链路</span>
          <strong>${visuals.flowSteps.length} 步</strong>
        </div>
        ${renderFlowRail(visuals.flowSteps)}
      </div>
    </div>
  `;
}

function buildMessageVisuals(messages) {
  const safeMessages = asArray(messages);
  const latestMessages = [...safeMessages]
    .sort((a, b) => String(a.sentAt || "").localeCompare(String(b.sentAt || "")))
    .slice(-5);

  return {
    total: safeMessages.length,
    sourceSegments: buildSegments(safeMessages, (item) => platformLabel(item.platform)),
    roleSegments: buildSegments(safeMessages, (item) => roleText(item.normalizedRole)),
    latestMessages
  };
}

function renderMessageVisualSection(visuals) {
  return `
    <div class="message-visual-grid">
      <div class="visual-card">
        <div class="visual-card-head">
          <span>当前筛选消息</span>
          <strong>${escapeHtml(String(visuals.total))}</strong>
        </div>
        <div class="source-meter">
          ${renderStackedBar(visuals.sourceSegments)}
          ${renderLegend(visuals.sourceSegments)}
        </div>
      </div>

      <div class="visual-card">
        <div class="visual-card-head">
          <span>角色分布</span>
          <strong>${sumSegmentCount(visuals.roleSegments)}</strong>
        </div>
        <div class="role-rings">
          ${visuals.roleSegments
            .map(
              (item) => `
                <div class="role-pill">
                  <span class="role-dot"></span>
                  <div>
                    <strong>${escapeHtml(String(item.count))}</strong>
                    <span>${escapeHtml(item.label)} · ${item.percentage}%</span>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>

      <div class="visual-card chat-preview-card">
        <div class="visual-card-head">
          <span>最近消息预览</span>
          <strong>${visuals.latestMessages.length}</strong>
        </div>
        <div class="chat-preview">
          ${visuals.latestMessages.length
            ? visuals.latestMessages.map((item) => renderMessageBubble(item)).join("")
            : '<div class="empty-state">当前筛选下暂无消息</div>'}
        </div>
      </div>
    </div>
  `;
}

function renderMessageBubble(item) {
  const role = item.normalizedRole || "unknown";
  return `
    <div class="message-bubble ${escapeHtml(role)}">
      <div class="bubble-meta">
        <span>${escapeHtml(platformLabel(item.platform))}</span>
        <span>${escapeHtml(roleText(role))}</span>
        <span>${escapeHtml(messageTypeLabel(item.messageType))}</span>
        <span>${escapeHtml(item.sentAt || "-")}</span>
      </div>
      ${renderMessageContent(item)}
    </div>
  `;
}

function renderMessageContent(item = {}) {
  const text = messageDisplayText(item);
  const mediaMeta = renderMediaMeta(item);
  return `
    <div class="message-content">
      <div>${escapeHtml(text || "该消息暂无可分析文本")}</div>
      ${mediaMeta}
    </div>
  `;
}

function messageDisplayText(item = {}) {
  return [
    item.content,
    item.transcriptText,
    item.ocrText,
    item.mediaDescription,
    item.imageDescription,
    item.linkTitle,
    item.linkUrl,
    item.analysisText
  ]
    .filter(Boolean)
    .find(Boolean) || "";
}

function renderMediaMeta(item = {}) {
  const type = item.messageType || "text";
  if (type === "text") return "";
  const parts = [
    item.mediaPath || item.mediaUrl ? `媒体：${item.mediaPath || item.mediaUrl}` : "",
    item.mediaMimeType ? `格式：${item.mediaMimeType}` : "",
    item.durationSeconds ? `时长：${item.durationSeconds}秒` : "",
    item.fileName ? `文件：${item.fileName}` : "",
    item.linkUrl ? `链接：${item.linkUrl}` : ""
  ].filter(Boolean);

  return `
    <div class="media-meta">
      <span class="media-chip">${escapeHtml(messageTypeLabel(type))}</span>
      ${parts.map((part) => `<span>${escapeHtml(part)}</span>`).join("")}
    </div>
  `;
}

function messageTypeLabel(type) {
  const map = {
    text: "文本",
    image: "图片",
    voice: "语音",
    video: "视频",
    file: "文件",
    link: "链接",
    mini_program: "小程序",
    product_card: "商品卡片",
    emoji: "表情",
    location: "位置",
    mixed: "混合",
    system: "系统",
    auto_reply: "自动回复"
  };
  return map[type] || type || "未知";
}

function messageTypeBadgeClass(type) {
  if (["image", "video", "voice", "file"].includes(type)) return "warn";
  if (["link", "mini_program", "product_card"].includes(type)) return "admin";
  return "user";
}

function buildIdentityVisuals(tasks) {
  const safeTasks = asArray(tasks);
  const highConfidence = safeTasks.filter((item) => Number(item.confidence || 0) >= 0.85).length;
  const needReview = safeTasks.filter((item) => Number(item.confidence || 0) < 0.85 || item.status === "needs_review").length;
  const statusSegments = buildSegments(safeTasks, (item) => identityStatusText(item.status));
  const avgConfidence = safeTasks.length
    ? Math.round((safeTasks.reduce((total, item) => total + Number(item.confidence || 0), 0) / safeTasks.length) * 100)
    : 0;

  return {
    total: safeTasks.length,
    highConfidence,
    needReview,
    avgConfidence,
    statusSegments
  };
}

function renderIdentityVisualSection(visual) {
  return `
    <div class="identity-summary">
      <div class="visual-card confidence-card">
        <div class="visual-card-head">
          <span>平均匹配置信度</span>
          <strong>${visual.avgConfidence}%</strong>
        </div>
        <div class="confidence-gauge" style="--value:${clampPercent(visual.avgConfidence)}">
          <span>${visual.avgConfidence}%</span>
        </div>
      </div>
      <div class="visual-card">
        <div class="visual-card-head">
          <span>复核状态</span>
          <strong>${visual.total}</strong>
        </div>
        ${renderStackedBar(visual.statusSegments)}
        ${renderLegend(visual.statusSegments)}
      </div>
      <div class="visual-card">
        <div class="visual-card-head">
          <span>人工处理重点</span>
          <strong>${visual.needReview}</strong>
        </div>
        <div class="mini-kpi-grid">
          <div class="mini-kpi user"><span>高置信匹配</span><strong>${visual.highConfidence}</strong></div>
          <div class="mini-kpi warn"><span>需要复核</span><strong>${visual.needReview}</strong></div>
        </div>
      </div>
    </div>
  `;
}

function renderIdentityDetail(task) {
  if (!task) {
    return `<div class="detail-card section" style="padding:16px"><div class="empty-state">暂无复核任务</div></div>`;
  }

  return `
    <div class="detail-card section" style="padding:16px">
      <h3 class="section-title">复核依据</h3>
      <div class="identity-flow">
        <div class="identity-node">
          <span>淘宝</span>
          <strong>${escapeHtml(task.taobaoAccount || "待确认")}</strong>
        </div>
        <div class="identity-link">聊天证据</div>
        <div class="identity-node">
          <span>微信</span>
          <strong>${escapeHtml(task.wechatAccount || "待确认")}</strong>
        </div>
        <div class="identity-link">归一</div>
        <div class="identity-node primary">
          <span>客户</span>
          <strong>${escapeHtml(task.recommendedName || "待复核")}</strong>
        </div>
      </div>
      <div class="badge warn" style="margin-top:12px">来源消息：${escapeHtml(task.sourceMessageId || "待确认")}</div>
      <ul class="evidence">
        ${asArray(task.evidence).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function buildConversationVisuals(conversations, selected) {
  const safeConversations = asArray(conversations);
  return {
    total: safeConversations.length,
    readyCount: safeConversations.filter((item) => item.status === "quality_ready").length,
    reviewCount: safeConversations.filter((item) => item.status === "identity_review").length,
    stageSegments: buildSegments(safeConversations, (item) => item.stage || "未标记阶段"),
    selected
  };
}

function renderConversationVisualSection(visual) {
  return `
    <div class="conversation-summary">
      <div class="visual-card">
        <div class="visual-card-head">
          <span>会话状态分布</span>
          <strong>${visual.total}</strong>
        </div>
        ${renderStackedBar(visual.stageSegments)}
        ${renderLegend(visual.stageSegments)}
      </div>
      <div class="visual-card">
        <div class="visual-card-head">
          <span>当前会话</span>
          <strong>${escapeHtml(visual.selected?.customerName || "-")}</strong>
        </div>
        <div class="mini-kpi-grid">
          <div class="mini-kpi user"><span>可质检</span><strong>${visual.readyCount}</strong></div>
          <div class="mini-kpi warn"><span>待身份复核</span><strong>${visual.reviewCount}</strong></div>
        </div>
      </div>
      <div class="visual-card">
        <div class="visual-card-head">
          <span>参与人员</span>
          <strong>${asArray(visual.selected?.participants).length}</strong>
        </div>
        <div class="participant-row">
          ${asArray(visual.selected?.participants).map((item) => `<span>${escapeHtml(item)}</span>`).join("") || '<span>暂无</span>'}
        </div>
      </div>
    </div>
  `;
}

function renderConversationBusinessSignals(selected, profile, quality) {
  const intentScore = estimateIntentScore(profile);
  const satisfactionScore = estimateSatisfactionScore(profile);
  const riskScore = estimateCustomerRiskScore(profile, quality);
  const concerns = inferPurchaseConcerns(profile);
  const actions = inferMerchantServiceActions(profile, selected, quality);
  const volume = inferPurchaseVolume(profile);

  return `
    <div class="conversation-signal-grid">
      <div class="detail-card section signal-card">
        <div class="signal-head">
          <span>购买意向</span>
          <strong>${intentScore}</strong>
        </div>
        <div class="progress"><span style="width:${clampPercent(intentScore)}%"></span></div>
        <div class="muted">${escapeHtml(profile?.intentLevel || "根据会话暂未判断")}</div>
      </div>
      <div class="detail-card section signal-card">
        <div class="signal-head">
          <span>满意/信任</span>
          <strong>${satisfactionScore}</strong>
        </div>
        <div class="progress"><span style="width:${clampPercent(satisfactionScore)}%"></span></div>
        <div class="muted">${escapeHtml(profile?.satisfaction || "需要继续观察")}</div>
      </div>
      <div class="detail-card section signal-card">
        <div class="signal-head">
          <span>购买体量</span>
          <strong>${escapeHtml(volume.level)}</strong>
        </div>
        <div class="muted">${escapeHtml(volume.reason)}</div>
      </div>
      <div class="detail-card section signal-card">
        <div class="signal-head">
          <span>流失风险</span>
          <strong>${riskScore}</strong>
        </div>
        <div class="progress"><span style="width:${clampPercent(riskScore)}%"></span></div>
        <div class="muted">${concerns.length ? concerns.map((item) => item.label).join("、") : "暂无明显顾虑"}</div>
      </div>
    </div>

    <div class="conversation-merchant-grid">
      <div class="detail-card section">
        <h4 class="section-title">客户需求推测</h4>
        <div class="demand-cloud">
          ${asArray(profile?.needs).length ? profile.needs.map((item) => `<span>${escapeHtml(item)}</span>`).join("") : '<span>等待更多会话证据</span>'}
        </div>
      </div>
      <div class="detail-card section">
        <h4 class="section-title">购买顾虑</h4>
        <div class="timeline compact">
          ${concerns.length ? concerns.map((item) => `<div class="timeline-item"><strong>${escapeHtml(item.label)}</strong><div class="muted">${escapeHtml(item.reason)}</div></div>`).join("") : '<div class="timeline-item">暂无明显顾虑，可推进转化。</div>'}
        </div>
      </div>
      <div class="detail-card section">
        <h4 class="section-title">建议服务动作</h4>
        <div class="timeline compact">
          ${actions.map((item) => `<div class="timeline-item"><strong>${escapeHtml(item.title)}</strong><div class="muted">${escapeHtml(item.desc)}</div></div>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderConversationRoute(selected) {
  const steps = asArray(selected.timeline);
  return `
    <div class="detail-card section conversation-route">
      <div class="button-row" style="justify-content:space-between">
        <h4 class="section-title">会话链路节点</h4>
        <span class="badge user">${steps.length} 个节点</span>
      </div>
      <div class="route-list">
        ${
          steps.length
            ? steps.map((item, index) => `
                <div class="route-item">
                  <span>${index + 1}</span>
                  <strong>${escapeHtml(item)}</strong>
                </div>
              `).join("")
            : '<div class="empty-state">暂无链路节点</div>'
        }
      </div>
    </div>
  `;
}

function findCustomerProfileForConversation(conversation = {}) {
  const profiles = asArray(state.data.customerProfiles);
  return (
    profiles.find((item) => item.id && item.id === conversation.customerId) ||
    profiles.find((item) => item.name && item.name === conversation.customerName) ||
    null
  );
}

function estimateIntentScore(profile = {}) {
  const level = String(profile?.intentLevel || "");
  if (level.includes("高")) return 86;
  if (level.includes("中")) return 62;
  if (level.includes("低")) return 34;
  return 46;
}

function estimateSatisfactionScore(profile = {}) {
  const value = String(profile?.satisfaction || "");
  if (value.includes("满意") && !value.includes("不")) return value.includes("偏") ? 72 : 86;
  if (value.includes("一般")) return 58;
  if (value.includes("未知")) return 42;
  if (value.includes("不满")) return 24;
  return 50;
}

function estimateCustomerRiskScore(profile = {}, quality = null) {
  const tags = asArray(profile?.tags).join(" ");
  let score = 18;
  if (tags.includes("售后")) score += 18;
  if (tags.includes("价格")) score += 16;
  if (tags.includes("身份待复核")) score += 22;
  if (tags.includes("待跟进")) score += 12;
  if (String(profile?.satisfaction || "").includes("未知")) score += 8;
  if (asArray(quality?.risks).length) score += 18;
  return Math.min(92, score);
}

function inferPurchaseConcerns(profile = {}) {
  const tags = asArray(profile?.tags);
  const needs = asArray(profile?.needs);
  const concerns = [];
  if (tags.some((item) => item.includes("售后")) || needs.some((item) => item.includes("售后"))) {
    concerns.push({ label: "担心售后保障", reason: "客户提到售后或保障，需要给出明确承诺、处理边界和回访节奏。" });
  }
  if (tags.some((item) => item.includes("价格")) || needs.some((item) => item.includes("价格"))) {
    concerns.push({ label: "价格敏感", reason: "客户可能在比较套餐或竞品，适合展示差异、优惠门槛和适用场景。" });
  }
  if (tags.some((item) => item.includes("身份"))) {
    concerns.push({ label: "身份未闭环", reason: "淘宝与微信身份尚未完全确认，后续跟进和售后归因会受影响。" });
  }
  if (needs.some((item) => item.includes("效果") || item.includes("周期"))) {
    concerns.push({ label: "关注见效周期", reason: "客户关心多久见效，需要用真实案例、使用周期和预期管理降低犹豫。" });
  }
  return concerns;
}

function inferMerchantServiceActions(profile = {}, conversation = {}, quality = null) {
  const concerns = inferPurchaseConcerns(profile);
  const actions = [];
  if (concerns.some((item) => item.label.includes("见效"))) {
    actions.push({ title: "补充效果证据", desc: "发送使用周期、适用条件和真实反馈，避免只说效果好。" });
  }
  if (concerns.some((item) => item.label.includes("售后"))) {
    actions.push({ title: "明确售后边界", desc: "用一句话讲清售后保障、回访时间和问题处理入口。" });
  }
  if (concerns.some((item) => item.label.includes("价格"))) {
    actions.push({ title: "做套餐对比", desc: "按客户需求推荐一档主推方案，再给一个低门槛试购方案。" });
  }
  if (concerns.some((item) => item.label.includes("身份"))) {
    actions.push({ title: "先补身份信息", desc: "请客户确认淘宝ID、订单号或手机号，保证后续服务能追溯。" });
  }
  if (estimateIntentScore(profile) >= 80) {
    actions.push({ title: "24 小时内促成下一步", desc: "高意向客户不要只归档，客服需要主动给下单路径和跟进时间。" });
  }
  if (quality && Number(quality.finalScore || 0) < 80) {
    actions.push({ title: "复盘客服话术", desc: "本次质检分偏低，先修正回答完整度和风险承诺，再继续转化。" });
  }
  if (!actions.length) {
    actions.push({ title: "继续收集需求", desc: `当前会话停在“${conversation.stage || "未标记阶段"}”，先问清场景、预算和使用目标。` });
  }
  return actions.slice(0, 4);
}

function inferPurchaseVolume(profile = {}) {
  const intent = estimateIntentScore(profile);
  const needs = asArray(profile?.needs).join(" ");
  if (intent >= 80 && (needs.includes("周期") || needs.includes("售后"))) {
    return { level: "中高", reason: "有明确效果和售后关注，适合从试购推进到周期服务。" };
  }
  if (intent >= 70) {
    return { level: "中", reason: "意向较强，可先推荐主推套餐，再观察复购机会。" };
  }
  if (intent >= 55) {
    return { level: "试购", reason: "仍在比较或确认信息，适合低门槛方案降低决策压力。" };
  }
  return { level: "培育", reason: "信息不足，先通过内容和回访提高信任。" };
}

function renderConversationFlow(selected) {
  const steps = asArray(selected.timeline).map((item, index) => ({
    label: item,
    value: index + 1
  }));
  if (!steps.length) return "";

  return `
    <div class="conversation-flow">
      ${renderFlowRail(steps)}
    </div>
  `;
}

function renderFlowRail(steps) {
  return `
    <div class="flow-rail">
      ${asArray(steps)
        .map(
          (step, index) => `
            <div class="flow-step">
              <div class="flow-dot">${index + 1}</div>
              <div>
                <strong>${escapeHtml(step.label)}</strong>
                <span>${escapeHtml(String(step.value ?? ""))}</span>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderStackedBar(segments) {
  const safeSegments = asArray(segments).filter((item) => Number(item.count) > 0);
  if (!safeSegments.length) return `<div class="stacked-empty">暂无数据</div>`;

  return `
    <div class="stacked-bar" aria-label="占比分布">
      ${safeSegments
        .map(
          (item, index) => `
            <span
              class="stack-segment color-${index % 6}"
              style="width:${clampPercent(item.percentage)}%"
              title="${escapeHtml(item.label)} ${item.percentage}%"
            ></span>
          `
        )
        .join("")}
    </div>
  `;
}

function renderLegend(segments) {
  const safeSegments = asArray(segments).filter((item) => Number(item.count) > 0);
  if (!safeSegments.length) return "";

  return `
    <div class="visual-legend">
      ${safeSegments
        .map(
          (item, index) => `
            <span>
              <i class="color-${index % 6}"></i>
              ${escapeHtml(item.label)} ${escapeHtml(String(item.count))} (${item.percentage}%)
            </span>
          `
        )
        .join("")}
    </div>
  `;
}

function buildSegments(items, labelFactory) {
  const counts = new Map();
  asArray(items).forEach((item) => {
    const label = labelFactory(item) || "未分类";
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);

  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      count,
      percentage: total ? Math.round((count / total) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);
}

function sumSegmentCount(segments) {
  return asArray(segments).reduce((total, item) => total + Number(item.count || 0), 0);
}

function countByValue(items, predicate) {
  return asArray(items).filter(predicate).length;
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function platformLabel(platform) {
  const map = {
    taobao: "淘宝",
    wechat: "微信"
  };
  return map[platform] || platform || "未知来源";
}

function roleText(role) {
  const map = {
    customer: "客户",
    service: "客服",
    after_sales: "售后",
    system: "系统"
  };
  return map[role] || role || "未识别角色";
}

function identityStatusText(status) {
  const map = {
    pending: "待确认",
    needs_review: "需复核",
    confirmed: "已确认",
    rejected: "已驳回",
    resolved: "已完成"
  };
  return map[status] || status || "未标记";
}

function getSelectedQualityResult(results = asArray(state.data.qualityResults)) {
  return (
    results.find((item) => item.id === state.selectedQualityResultId) ||
    results.find((item) => item.conversationId === state.selectedConversationId) ||
    results[0] ||
    null
  );
}

function canAdjustQualityScore() {
  return ["super_admin", "quality_manager", "quality_user"].includes(state.user?.role);
}

function qualityStatusText(status) {
  const map = {
    ai_scored: "AI 已评分",
    manual_adjusted: "人工已修正",
    pending: "待评分",
    failed: "评分失败"
  };
  return map[status] || status || "未标记";
}

function qualityStatusTone(status) {
  if (status === "manual_adjusted") return "user";
  if (status === "failed") return "danger";
  if (status === "pending" || status === "pending_review") return "warn";
  return "admin";
}

function getFilteredQualityResults(results = []) {
  const owner = state.filters.qualityOwner;
  const date = state.filters.qualityDate;
  const status = state.filters.qualityStatus;
  const query = String(state.filters.qualityQuery || "").trim().toLowerCase();

  return asArray(results).filter((item) => {
    if (owner !== "all" && String(item.owner || "未分配") !== owner) return false;
    if (date !== "all" && getQualityDateKey(item) !== date) return false;
    if (status !== "all" && String(item.status || "") !== status) return false;
    if (query && !qualityResultSearchText(item).includes(query)) return false;
    return true;
  });
}

function qualityResultSearchText(item = {}) {
  return [
    item.id,
    item.conversationId,
    item.customerName,
    item.owner,
    item.scorerName,
    item.reviewedByName,
    item.status,
    item.qualityDate,
    item.conversationDate,
    item.conversationStage,
    item.conversationStatus,
    item.manualAdjustReason
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getQualityDateKey(item = {}) {
  return item.qualityDateKey || item.conversationDateKey || normalizeDateKey(item.createdAt || item.reviewedAt || item.conversationLastMessageAt || item.conversationStartedAt);
}

function getQualityDateLabel(item = {}) {
  return item.qualityDate || item.conversationDate || item.createdAt || item.reviewedAt || "未标记日期";
}

function normalizeDateKey(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const direct = raw.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/);
  if (direct) {
    const [year, month, day] = direct[0].replaceAll("/", "-").split("-");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getQualityOwnerOptions(results = []) {
  return [...new Set(asArray(results).map((item) => String(item.owner || "未分配")))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function getQualityDateOptions(results = []) {
  const dates = new Map();
  asArray(results).forEach((item) => {
    const key = getQualityDateKey(item);
    if (key && !dates.has(key)) dates.set(key, getQualityDateLabel(item));
  });
  return [...dates.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

function getQualityStatusOptions(results = []) {
  return [...new Set(asArray(results).map((item) => String(item.status || "")).filter(Boolean))].sort();
}

function renderQualityIndexPanel(allResults, filteredResults, selected) {
  const owners = getQualityOwnerOptions(allResults);
  const dates = getQualityDateOptions(allResults);
  const statuses = getQualityStatusOptions(allResults);
  const selectedSummary = selected
    ? `${selected.owner || "未分配"} / ${selected.customerName || selected.conversationId} / ${formatScore(selected.finalScore ?? selected.totalScore)} 分`
    : "未选择";

  return `
    <section class="panel-card section quality-index-panel">
      <div class="section-header">
        <div>
          <h3>质检评分台账</h3>
          <div class="muted">每一行是一条质检评分记录，点击后进入该记录的评分基准、证据链和原始聊天记录。</div>
        </div>
        <div class="button-row">
          <span class="badge admin">共 ${allResults.length} 条</span>
          <span class="badge user">当前 ${filteredResults.length} 条</span>
        </div>
      </div>

      <div class="quality-filter-grid">
        <div class="field">
          <label>负责人</label>
          <select id="filter-quality-owner">
            <option value="all">全部负责人</option>
            ${owners.map((owner) => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>质检日期</label>
          <select id="filter-quality-date">
            <option value="all">全部日期</option>
            ${dates.map((date) => `<option value="${escapeHtml(date.key)}">${escapeHtml(date.label)} (${escapeHtml(date.key)})</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>状态</label>
          <select id="filter-quality-status">
            <option value="all">全部状态</option>
            ${statuses.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(qualityStatusText(item))}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>搜索</label>
          <input id="filter-quality-query" placeholder="客户、会话、质检ID、负责人" value="${escapeHtml(state.filters.qualityQuery)}" />
        </div>
      </div>

      <div class="quality-selected-strip">
        <span>当前详情</span>
        <strong>${escapeHtml(selectedSummary)}</strong>
      </div>

      <div class="table-wrap quality-table-wrap">
        <table class="quality-table">
          <thead>
            <tr>
              <th>质检时间</th>
              <th>负责人</th>
              <th>客户 / 会话</th>
              <th>分数结构</th>
              <th>状态</th>
              <th>复核</th>
            </tr>
          </thead>
          <tbody>
            ${
              filteredResults.length
                ? filteredResults.map((item) => renderQualityRecordRow(item, selected?.id === item.id)).join("")
                : `<tr><td colspan="6"><div class="empty-state">暂无匹配记录</div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderQualityRecordRow(item, active) {
  const finalScore = item.finalScore ?? item.totalScore;
  return `
    <tr class="quality-record-row ${active ? "active" : ""}" data-action="select-quality-result" data-quality-result-id="${escapeHtml(item.id)}">
      <td>
        <strong>${escapeHtml(item.createdAt || item.reviewedAt || item.conversationLastMessageAt || "-")}</strong>
        <div class="muted">记录ID：${escapeHtml(item.id || "-")}</div>
      </td>
      <td>
        <strong>${escapeHtml(item.owner || "未分配")}</strong>
        <div class="muted">评分人：${escapeHtml(item.scorerName || "系统")}</div>
      </td>
      <td>
        <strong>${escapeHtml(item.customerName || "未知客户")}</strong>
        <div class="muted">会话：${escapeHtml(item.conversationId || "-")}</div>
      </td>
      <td>
        <div class="quality-mini-score">
          <span>客观 ${formatScore(item.objectiveScore)}/40</span>
          <span>AI ${formatScore(item.aiScore)}/60</span>
          <strong>${formatScore(finalScore)}/100</strong>
        </div>
      </td>
      <td><span class="badge ${qualityStatusTone(item.status)}">${escapeHtml(qualityStatusText(item.status))}</span></td>
      <td>
        <div>${escapeHtml(item.reviewedByName || item.reviewedBy || "未人工复核")}</div>
        <div class="muted">${escapeHtml(item.reviewedAt || "")}</div>
      </td>
    </tr>
  `;
}

function renderQualityRecordContext(result) {
  const reviewedBy = result.reviewedByName || result.reviewedBy || "未人工复核";
  const scorer = result.scorerName || "系统";
  return `
    <div class="quality-context-panel">
      <div class="quality-context-title">
        <span>当前展示的是哪一条分数</span>
        <strong>${escapeHtml(result.owner || "未分配")} / ${escapeHtml(result.customerName || "未知客户")}</strong>
      </div>
      <div class="quality-context-grid">
        <div>
          <span>质检记录</span>
          <strong>${escapeHtml(result.id || "-")}</strong>
          <small>质检时间：${escapeHtml(result.createdAt || "-")}</small>
        </div>
        <div>
          <span>会话对象</span>
          <strong>${escapeHtml(result.customerName || "未知客户")}</strong>
          <small>会话ID：${escapeHtml(result.conversationId || "-")}</small>
        </div>
        <div>
          <span>归属客服</span>
          <strong>${escapeHtml(result.owner || "未分配")}</strong>
          <small>会话日期：${escapeHtml(result.conversationDate || result.conversationLastMessageAt || "-")}</small>
        </div>
        <div>
          <span>评分来源</span>
          <strong>${escapeHtml(scorer)}</strong>
          <small>客观分来自规则指标，AI 分来自模型质检结果</small>
        </div>
        <div>
          <span>人工复核</span>
          <strong>${escapeHtml(reviewedBy)}</strong>
          <small>${escapeHtml(result.reviewedAt || "暂无人工修正记录")}</small>
        </div>
        <div>
          <span>数据依据</span>
          <strong>conversation_message / quality_score</strong>
          <small>评分、证据链和聊天记录均按会话ID追溯</small>
        </div>
      </div>
    </div>
  `;
}

function renderQualityMessagesArchive(result) {
  const messages = asArray(result?.messages || result?.conversationMessages);
  return `
    <details class="quality-chat-archive">
      <summary>
        <span>原始聊天记录</span>
        <strong>${messages.length} 条消息</strong>
      </summary>
      ${
        messages.length
          ? `<div class="quality-message-list">${messages.map((item) => renderQualityChatMessage(item)).join("")}</div>`
          : `<div class="empty-state">这条质检记录暂未返回原始聊天消息，仍可通过会话ID追溯。</div>`
      }
    </details>
  `;
}

function renderQualityChatMessage(item = {}) {
  const role = item.role || item.normalizedRole || "unknown";
  const roleClass = ["customer", "service", "after_sales", "system"].includes(role) ? role : "unknown";
  const speaker = item.speaker || item.senderName || roleText(role);
  const text = item.content || item.analysisText || messageDisplayText(item) || "";
  return `
    <div class="quality-message ${roleClass}">
      <div class="quality-message-meta">
        <span>${escapeHtml(item.sentAt || "-")}</span>
        <span>${escapeHtml(roleText(role))}</span>
        <span>${escapeHtml(speaker)}</span>
        <span>message_id：${escapeHtml(item.id || "-")}</span>
      </div>
      <div class="quality-message-text">${escapeHtml(text || "该消息暂无可分析文本")}</div>
      ${
        item.mediaUrl || item.mediaPath || item.linkUrl
          ? `<div class="tag-list"><span class="tag">${escapeHtml(item.messageType || "media")}</span>${item.linkUrl ? `<span class="tag">${escapeHtml(item.linkUrl)}</span>` : ""}</div>`
          : ""
      }
    </div>
  `;
}

function getScopedAiEvaluation(result) {
  const ai = state.aiEvaluation;
  if (!ai || !ai.ok) return null;
  if (ai.conversationId && result?.conversationId && ai.conversationId !== result.conversationId) return null;

  const expectedProfile = getExpectedAiAnalysisProfile();
  if (ai.analysisProfile && ai.analysisProfile !== expectedProfile) return null;

  return ai;
}

function getExpectedAiAnalysisProfile() {
  const role = state.user?.role || "quality_user";
  if (role === "super_admin") return "executive_full";
  if (role === "service_user") return "service_coaching";
  return "review_limited";
}

function renderQuality() {
  const allResults = asArray(state.data.qualityResults);
  if (!allResults.length) return `<div class="empty-state">暂无质检结果</div>`;

  const filteredResults = getFilteredQualityResults(allResults);
  const result = getSelectedQualityResult(filteredResults);
  if (result && (state.selectedQualityResultId !== result.id || state.selectedConversationId !== result.conversationId)) {
    state.selectedQualityResultId = result.id;
    state.selectedConversationId = result.conversationId;
  }

  if (!filteredResults.length) {
    return `
      ${renderQualityIndexPanel(allResults, filteredResults, null)}
      <div class="empty-state">当前筛选条件下暂无质检记录</div>
    `;
  }

  const viewMeta = getQualityViewMeta();
  const currentAi = getScopedAiEvaluation(result);
  const scoreComposition = getScoreComposition(result, currentAi);
  const objectiveDimensions = getObjectiveDimensions(result);

  if (state.user?.role === "service_user") {
    return renderServiceQuality(result, scoreComposition, currentAi, viewMeta);
  }

  return `
    ${renderQualityIndexPanel(allResults, filteredResults, result)}
    ${renderManagementQuality(result, scoreComposition, currentAi, viewMeta, objectiveDimensions)}
  `;
}

function renderManagementQuality(result, scoreComposition, ai, viewMeta, objectiveDimensions) {
  return `
    <section class="panel-card section" id="quality-detail">
      <div class="section-header">
        <div>
          <h3>${escapeHtml(viewMeta.title)}</h3>
          <div class="muted">${escapeHtml(viewMeta.description)}</div>
        </div>
        <div class="button-row">
          <span class="badge warn">${escapeHtml(qualityStatusText(result.status))}</span>
          <button class="btn primary small" data-action="run-ai-quality">${escapeHtml(viewMeta.buttonLabel)}</button>
        </div>
      </div>
      ${renderQualityRecordContext(result)}
      ${renderScoreComposition(scoreComposition)}
      ${renderManualQualityAdjustment(result, scoreComposition)}
      ${renderAiTracePanel(result, scoreComposition, ai)}
      <div class="grid two">
        ${renderObjectiveScoreBreakdown(result, scoreComposition, objectiveDimensions)}
        <div class="detail-card section" style="padding:16px">
          <h3 class="section-title">响应细节与风险</h3>
          <div class="timeline">
            <div class="timeline-item">首次响应：${formatMetricValue(result.responseTime.firstResponseSeconds, "秒")}</div>
            <div class="timeline-item">平均响应：${formatMetricValue(result.responseTime.averageResponseSeconds, "秒")}</div>
            <div class="timeline-item">最长等待：${formatMetricValue(result.responseTime.longestWaitSeconds, "秒")}</div>
            <div class="timeline-item">超时次数：${formatMetricValue(result.responseTime.timeoutCount, "次")}</div>
            <div class="timeline-item">回复覆盖率：${formatPercentMetric(result.responseTime.replyCoverageRate)}</div>
            <div class="timeline-item">客户有效提问：${formatMetricValue(result.responseTime.customerQuestionCount, "次")}</div>
            ${result.risks.map((item) => `<div class="timeline-item"><span class="badge danger">风险</span> ${escapeHtml(item)}</div>`).join("")}
          </div>
        </div>
      </div>
      ${renderQualityMessagesArchive(result)}
      ${ai ? renderAiEvaluationPanel(ai) : ""}
    </section>
  `;
}

function renderObjectiveScoreBreakdown(result, composition, objectiveDimensions) {
  const parts = getObjectiveScoreParts(result, objectiveDimensions);
  const score = numericOrNull(composition?.objective?.score) ?? sumObjectiveParts(parts);
  const max = 40;
  const percent = scorePercent(score, max);

  return `
    <div class="detail-card section" style="padding:16px">
      <div class="section-header">
        <div>
          <h3 class="section-title">客观规则分结构</h3>
          <div class="muted">会话：${escapeHtml(result.conversationId)} · 客户：${escapeHtml(result.customerName)} · 负责人：${escapeHtml(result.owner)}</div>
        </div>
        <span class="badge admin">系统计算</span>
      </div>

      <div class="objective-score-layout">
        <div class="objective-score-ring" style="--score:${percent}">
          <div>
            <strong>${formatScore(score)}</strong>
            <span>/40</span>
          </div>
        </div>
        <div class="objective-score-summary">
          <div class="metric-title">客观分 = 响应速度 + 回复覆盖率 + 流程执行</div>
          <div class="objective-stack" aria-label="客观分结构">
            ${parts
              .map((part, index) => {
                const width = part.max ? Math.max(0, Math.min(100, (part.score / max) * 100)) : 0;
                return `<span class="objective-stack-segment color-${index % 6}" style="width:${width}%"></span>`;
              })
              .join("")}
          </div>
          <div class="objective-stack-legend">
            ${parts
              .map(
                (part, index) => `
                  <span>
                    <i class="color-${index % 6}"></i>
                    ${escapeHtml(part.name)} ${formatScore(part.score)}/${formatScore(part.max)}
                  </span>
                `
              )
              .join("")}
          </div>
        </div>
      </div>

      <div class="objective-breakdown-list">
        ${parts.map((part) => renderObjectiveScorePart(part)).join("")}
      </div>
    </div>
  `;
}

function renderObjectiveScorePart(part) {
  const percent = scorePercent(part.score, part.max);

  return `
    <div class="objective-breakdown-item">
      <div class="button-row" style="justify-content:space-between">
        <strong>${escapeHtml(part.name)}</strong>
        <span class="badge user">${formatScore(part.score)}/${formatScore(part.max)}</span>
      </div>
      <div class="progress objective-progress"><span style="width:${percent}%"></span></div>
      <div class="muted" style="margin-top:6px">${escapeHtml(part.reason)}</div>
      <div class="objective-source-list">
        ${part.sources.map((source) => `<span class="tag">${escapeHtml(source)}</span>`).join("")}
      </div>
    </div>
  `;
}

function getObjectiveScoreParts(result, objectiveDimensions = []) {
  const metrics = result?.objectiveMetrics || {};
  const dimensions = asArray(objectiveDimensions);

  const responseDimension = findObjectiveDimension(dimensions, ["响应速度", "响应"]);
  const coverageDimension = findObjectiveDimension(dimensions, ["回复覆盖率", "覆盖率"]);
  const processDimension = findObjectiveDimension(dimensions, ["流程执行", "流程合规", "流程"]);

  const responseScore = numericOrNull(metrics.response_score) ?? numericOrNull(responseDimension?.score) ?? numericOrNull(result?.responseTime?.score) ?? 0;
  const coverageScore = numericOrNull(metrics.coverage_score) ?? numericOrNull(coverageDimension?.score);
  const processScore = numericOrNull(metrics.process_score) ?? numericOrNull(processDimension?.score);
  const objectiveScore = numericOrNull(result?.objectiveScore) ?? 0;

  const normalizedCoverageScore = coverageScore ?? inferMissingObjectiveScore(objectiveScore, responseScore, processScore, 10);
  const normalizedProcessScore = processScore ?? Math.max(0, Math.min(10, objectiveScore - responseScore - normalizedCoverageScore));

  return [
    {
      name: "响应速度",
      score: clampScore(responseScore, 20),
      max: 20,
      reason: responseDimension?.reason || buildResponseScoreReason(metrics, result),
      sources: [
        `平均响应 ${formatMetricValue(metrics.average_response_seconds ?? result?.responseTime?.averageResponseSeconds, "秒")}`,
        `首次响应 ${formatMetricValue(metrics.first_response_seconds ?? result?.responseTime?.firstResponseSeconds, "秒")}`,
        `超时 ${formatMetricValue(metrics.timeout_count ?? result?.responseTime?.timeoutCount, "次")}`,
        `阈值 ${formatMetricValue(metrics.timeout_threshold_seconds, "秒")}`
      ]
    },
    {
      name: "回复覆盖率",
      score: clampScore(normalizedCoverageScore, 10),
      max: 10,
      reason: coverageDimension?.reason || buildCoverageScoreReason(metrics, result),
      sources: [
        `客户有效提问 ${formatMetricValue(metrics.customer_question_count ?? result?.responseTime?.customerQuestionCount, "次")}`,
        `覆盖率 ${formatPercentMetric(metrics.reply_coverage_rate ?? result?.responseTime?.replyCoverageRate)}`,
        `规则：覆盖率 × 10`
      ]
    },
    {
      name: "流程执行",
      score: clampScore(normalizedProcessScore, 10),
      max: 10,
      reason: processDimension?.reason || buildProcessScoreReason(metrics),
      sources: [
        `身份线索 ${formatMetricValue(metrics.identity_clue_count, "条")}`,
        `主动跟进 ${formatMetricValue(metrics.proactive_followup_count ?? result?.responseTime?.proactiveFollowupCount, "次")}`,
        `客服回复 ${formatMetricValue(metrics.service_reply_count, "条")}`,
        `规则：4 + 3 + 3`
      ]
    }
  ];
}

function findObjectiveDimension(dimensions, keywords) {
  return dimensions.find((item) => {
    const name = String(item?.name || "");
    return keywords.some((keyword) => name.includes(keyword));
  });
}

function inferMissingObjectiveScore(total, knownA, knownB, max) {
  const known = Number(knownA || 0) + Number(knownB || 0);
  return Math.max(0, Math.min(max, Number(total || 0) - known));
}

function sumObjectiveParts(parts = []) {
  return parts.reduce((sum, part) => sum + Number(part.score || 0), 0);
}

function clampScore(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(max, Math.round(number * 10) / 10));
}

function buildResponseScoreReason(metrics = {}, result = {}) {
  if (metrics.average_response_seconds === undefined && result?.responseTime?.averageResponseSeconds === undefined) {
    return "历史记录未单独保存响应速度拆分，当前按总客观分中的响应部分回填。";
  }
  return `响应速度从 20 分开始，按平均响应时长、是否超过阈值和超时次数扣分。平均响应 ${formatMetricValue(metrics.average_response_seconds ?? result?.responseTime?.averageResponseSeconds, "秒")}，超时 ${formatMetricValue(metrics.timeout_count ?? result?.responseTime?.timeoutCount, "次")}。`;
}

function buildCoverageScoreReason(metrics = {}, result = {}) {
  if (metrics.reply_coverage_rate === undefined && result?.responseTime?.replyCoverageRate === undefined) {
    return "历史记录未单独保存回复覆盖率拆分，当前按总客观分中的剩余部分回填。";
  }
  return `回复覆盖率按客户有效提问覆盖情况计分，公式为覆盖率 × 10。当前覆盖率 ${formatPercentMetric(metrics.reply_coverage_rate ?? result?.responseTime?.replyCoverageRate)}。`;
}

function buildProcessScoreReason(metrics = {}) {
  if (metrics.identity_clue_count === undefined && metrics.proactive_followup_count === undefined && metrics.service_reply_count === undefined) {
    return "历史记录未单独保存流程执行拆分，当前按总客观分中的流程部分回填。";
  }
  return "流程执行由身份线索、主动承接/跟进、是否存在客服回复组成，分别最多 4 分、3 分、3 分。";
}

function renderServiceQuality(result, scoreComposition, ai, viewMeta) {
  const improvementItems = asArray(ai?.result?.improvement_items);
  const nextAction = ai?.result?.customer_followup?.next_action || "";

  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>${escapeHtml(viewMeta.title)}</h3>
          <div class="muted">${escapeHtml(viewMeta.description)}</div>
        </div>
        <div class="button-row">
          <span class="badge warn">${escapeHtml(qualityStatusText(result.status))}</span>
          <button class="btn primary small" data-action="run-ai-quality">${escapeHtml(viewMeta.buttonLabel)}</button>
        </div>
      </div>
      <div class="grid three">
        <div class="metric-card">
          <div class="metric-title">本次复盘分</div>
          <div class="metric-value">${formatScore(scoreComposition.final.score)}<span>/100</span></div>
          <div class="metric-trend muted">这是给客服看的自我提升分，不是管理层考核口径。</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">AI 复盘分</div>
          <div class="metric-value">${formatScore(scoreComposition.ai.score)}<span>/60</span></div>
          <div class="metric-trend muted">${escapeHtml(scoreComposition.ai.sourceText)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">建议跟进数</div>
          <div class="metric-value">${improvementItems.length}</div>
          <div class="metric-trend muted">${escapeHtml(nextAction || "优先看优化建议和下一步动作")}</div>
        </div>
      </div>
      <div class="grid two" style="margin-top:14px">
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">本次复盘重点</h4>
          <div class="timeline">
            <div class="timeline-item">首次响应：${formatMetricValue(result.responseTime.firstResponseSeconds, "秒")}</div>
            <div class="timeline-item">平均响应：${formatMetricValue(result.responseTime.averageResponseSeconds, "秒")}</div>
            <div class="timeline-item">最长等待：${formatMetricValue(result.responseTime.longestWaitSeconds, "秒")}</div>
            <div class="timeline-item">回复覆盖率：${formatPercentMetric(result.responseTime.replyCoverageRate)}</div>
            <div class="timeline-item">客户有效提问：${formatMetricValue(result.responseTime.customerQuestionCount, "次")}</div>
            ${result.risks.map((item) => `<div class="timeline-item"><span class="badge danger">提醒</span> ${escapeHtml(item)}</div>`).join("")}
          </div>
        </div>
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">你可以这样改</h4>
          <div class="timeline">
            ${ai
              ? improvementItems.length
                ? improvementItems.map((item) => renderImprovementItem(item)).join("")
                : '<div class="timeline-item">这次没有明确优化项</div>'
              : '<div class="timeline-item">先运行复盘 AI，再看具体优化建议</div>'}
          </div>
        </div>
      </div>
      ${renderQualityMessagesArchive(result)}
      ${ai ? renderServiceAiEvaluationPanel(ai) : ""}
    </section>
  `;
}

function renderManualQualityAdjustment(result, composition) {
  if (!canAdjustQualityScore()) return "";

  const aiScore = numericOrNull(composition?.ai?.score) ?? numericOrNull(result?.aiScore) ?? 0;
  const objectiveScore = numericOrNull(composition?.objective?.score) ?? numericOrNull(result?.objectiveScore) ?? 0;
  const previewFinalScore = Math.min(100, Math.round((objectiveScore + aiScore) * 10) / 10);
  const manualReason = String(result?.manualAdjustReason || "").trim();

  return `
    <div class="detail-card section" style="padding:16px;margin-bottom:14px">
      <div class="section-header">
        <div>
          <h3>人工修正 AI 分</h3>
          <div class="muted">AI 质检通过后会直接进入正式分数；质检员可基于证据链修正 AI 分。</div>
        </div>
        <span class="badge user">可修改</span>
      </div>
      <div class="grid two" style="align-items:start">
        <div style="min-width:0">
          <h4 class="section-title">人工修正输入</h4>
          <div class="field">
            <label>AI 质检分（0-60）</label>
            <input id="quality-ai-score" type="number" min="0" max="60" step="0.5" value="${escapeHtml(formatScoreInput(aiScore))}" />
          </div>
          <div class="field" style="margin-top:12px">
            <label>改分理由</label>
            <textarea id="quality-adjust-reason" rows="5" placeholder="说明为什么要从 AI 分数修正为当前分数，建议写明证据点和修改依据。">${escapeHtml(manualReason)}</textarea>
          </div>
          <div class="muted" style="margin-top:8px">提交后会保留到质检记录和审计日志里。</div>
        </div>
        <div style="min-width:0">
          <h4 class="section-title">AI 打分基准</h4>
          <div class="muted">质检员改分时，对照这套 60 分口径核对证据链。</div>
          <div class="timeline" style="margin-top:10px">
            ${renderAiScoringCriteria()}
          </div>
          <div class="cloud-box" style="margin-top:12px">
            <div class="metric-title">当前预览总分</div>
            <div class="metric-value">${formatScore(previewFinalScore)}<span>/100</span></div>
            <div class="muted">保存后状态会标记为 manual_adjusted，理由会一并留存。</div>
          </div>
        </div>
      </div>
      <div class="button-row" style="justify-content:flex-end;margin-top:14px">
        <button class="btn primary small" data-action="submit-quality-adjust">保存人工修正</button>
      </div>
    </div>
  `;
}

function renderAiScoringCriteria() {
  const criteria = [
    {
      title: "1. 问题识别能力",
      score: "8分",
      desc: "识别客户核心问题、场景限制、主次问题和上下文延续。"
    },
    {
      title: "2. 回答相关性",
      score: "8分",
      desc: "正面回应客户问题，内容与具体植物、订单或场景相关。"
    },
    {
      title: "3. 回答完整度",
      score: "8分",
      desc: "覆盖客户全部关键点，给出必要条件、边界和下一步动作。"
    },
    {
      title: "4. 专业准确性",
      score: "10分",
      desc: "建议符合园艺常识，不夸大、不绝对化、不越权承诺。"
    },
    {
      title: "5. 问题解决能力",
      score: "8分",
      desc: "推进咨询、补充信息、推荐方案、登记问题和跟进节点。"
    },
    {
      title: "6. 服务态度",
      score: "8分",
      desc: "礼貌、耐心、积极，不冷漠、不推责、不攻击。"
    },
    {
      title: "7. 异议处理能力",
      score: "5分",
      desc: "处理价格、效果、信任、售后等异议，并给出替代方案。"
    },
    {
      title: "8. 销售转化能力",
      score: "3分",
      desc: "在合适时机做需求确认、推荐方案和自然下一步引导。"
    },
    {
      title: "9. 话术规范度",
      score: "2分",
      desc: "保持接待顺序、身份关联、结束语和后续跟进动作。"
    }
  ];

  return criteria
    .map(
      (item) => `
        <div class="timeline-item">
          <div class="button-row" style="justify-content:space-between">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="badge admin">${escapeHtml(item.score)}</span>
          </div>
          <div class="muted" style="margin-top:6px">${escapeHtml(item.desc)}</div>
        </div>
      `
    )
    .join("");
}

function getObjectiveDimensions(result) {
  const names = new Set(["响应速度", "回复覆盖率", "流程执行"]);
  const dimensions = asArray(result?.dimensions).filter((item) => names.has(item.name));
  if (dimensions.length) return dimensions;
  return asArray(result?.dimensions).filter((item) => String(item.name || "").includes("响应") || String(item.name || "").includes("流程"));
}

function formatMetricValue(value, unit) {
  if (value === null || value === undefined || value === "") return "-";
  return `${escapeHtml(String(value))} ${unit}`;
}

function formatPercentMetric(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${Math.round(number * 100)}%`;
}

function renderAiTracePanel(result, composition, ai) {
  const trace = buildAiTrace(result, composition, ai);

  return `
    <div class="detail-card section ai-trace-panel" style="padding:16px;margin-bottom:14px">
      <div class="section-header">
        <div>
          <h3>AI 质检过程与证据链</h3>
          <div class="muted">展示 AI 如何从聊天记录进入评分、扣分、风险判断和人工复核，所有结论都要能追到原始消息。</div>
        </div>
        <div class="button-row">
          <span class="badge user">过程可追溯</span>
          <span class="badge warn">证据按 message_id 定位</span>
        </div>
      </div>

      <div class="ai-process-grid">
        ${trace.steps
          .map(
            (step, index) => `
              <div class="ai-step-card">
                <div class="ai-step-index">${index + 1}</div>
                <div>
                  <strong>${escapeHtml(step.title)}</strong>
                  <div class="muted">${escapeHtml(step.description)}</div>
                </div>
              </div>
            `
          )
          .join("")}
      </div>

      <div class="grid two" style="margin-top:14px">
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">证据链</h4>
          <div class="evidence-chain">
            ${trace.evidence
              .map(
                (item) => `
                  <div class="evidence-card">
                    <div class="evidence-meta">
                      <span class="badge ${item.badgeClass}">${escapeHtml(item.type)}</span>
                      <strong>${escapeHtml(item.messageId || "无 message_id")}</strong>
                    </div>
                    <div class="evidence-text">${escapeHtml(item.evidence || "暂无原文证据")}</div>
                    <div class="muted">${escapeHtml(item.reason || "等待 AI 返回进一步说明")}</div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>

        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">本次评分依据</h4>
          <div class="timeline">
            <div class="timeline-item">
              <strong>客观指标只引用</strong>
              <div class="muted">首次响应 ${escapeHtml(String(trace.metrics.firstResponseSeconds ?? "-"))} 秒，最长等待 ${escapeHtml(String(trace.metrics.longestWaitSeconds ?? "-"))} 秒，由系统计算，AI 不重新计算。</div>
            </div>
            <div class="timeline-item">
              <strong>AI 质检分</strong>
              <div class="muted">${formatScore(composition.ai.score)}/60，${escapeHtml(composition.ai.sourceText)}</div>
            </div>
            <div class="timeline-item">
              <strong>人工复核点</strong>
              <div class="muted">${escapeHtml(trace.reviewFocus)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildAiTrace(result, composition, ai) {
  const aiResult = ai?.ok ? ai.result || {} : {};
  const evidenceFromAi = collectAiEvidence(aiResult);
  const evidence = evidenceFromAi.length ? evidenceFromAi : buildFallbackEvidence(result);
  const riskCount = Array.isArray(result?.risks) ? result.risks.length : 0;

  return {
    metrics: {
      firstResponseSeconds: result?.responseTime?.firstResponseSeconds,
      longestWaitSeconds: result?.responseTime?.longestWaitSeconds
    },
    reviewFocus: riskCount
      ? `当前存在 ${riskCount} 条风险提示，需人工确认话术边界和售后承诺是否完整。`
      : "当前未发现明显风险，仍建议抽查 AI 引用证据是否与原文一致。",
    steps: [
      {
        title: "读取标准化消息",
        description: "使用 message_id、time、role、speaker、content，不使用未入库的猜测信息。"
      },
      {
        title: "引用客观指标",
        description: `读取系统计算的响应时长和流程指标，客观规则分为 ${formatScore(composition.objective.score)}/40。`
      },
      {
        title: "语义维度评分",
        description: "判断问题识别、回答相关性、完整度、专业性、服务态度、异议处理和转化引导。"
      },
      {
        title: "定位原文证据",
        description: "每个扣分、风险或亮点都要绑定 message_id，并展示原文片段。"
      },
      {
        title: "输出复核结论",
        description: "形成最终质检分和人工复核点，证据不足的维度不做臆测。"
      }
    ],
    evidence
  };
}

function collectAiEvidence(result) {
  const structuredEvidence = collectStructuredEvidenceChain(result.evidence_chain);
  if (structuredEvidence.length) return structuredEvidence;

  const groups = [
    { items: result.compliance_risks, type: "风险", badgeClass: "danger", titleKey: "risk_type" },
    { items: result.deductions, type: "扣分", badgeClass: "warn", titleKey: "dimension" },
    { items: result.positive_points, type: "亮点", badgeClass: "user", titleKey: "dimension" },
    { items: result.risk_reminders, type: "风险", badgeClass: "danger", titleKey: "risk_type" },
    { items: result.review_items, type: "复核", badgeClass: "warn", titleKey: "dimension" },
    { items: result.improvement_items, type: "改进", badgeClass: "warn", titleKey: "dimension" }
  ];

  return groups.flatMap((group) =>
    asArray(group.items).map((item) => ({
      type: item[group.titleKey] || group.type,
      badgeClass: group.badgeClass,
      messageId: item.message_id || "",
      evidence: item.evidence || lookupMessageContent(item.message_id),
      reason: item.reason || item.suggestion || ""
    }))
  );
}

function collectStructuredEvidenceChain(chain) {
  if (!chain || typeof chain !== "object") return [];

  const scoreSections = [
    { items: chain.scoring_dimensions, type: "客服评分", badgeClass: "admin" },
    { items: chain.customer_dimensions, type: "客户分析", badgeClass: "user" }
  ];

  const scoreEvidence = scoreSections.flatMap((section) =>
    asArray(section.items).flatMap((dimension) =>
      asArray(dimension.sub_items).map((item) => {
        const messageIds = asArray(item.message_ids);
        return {
          type: `${dimension.label || dimension.dimension || section.type} / ${item.sub_item || "评分子项"}`,
          badgeClass: item.status === "miss" ? "warn" : section.badgeClass,
          messageId: messageIds.join("、"),
          evidence: item.evidence || messageIds.map((id) => lookupMessageContent(id)).filter(Boolean).join(" / "),
          reason: [
            `得分 ${formatScore(item.score)}/${formatScore(item.max_score)}`,
            item.status ? `状态 ${item.status}` : "",
            item.reason || ""
          ].filter(Boolean).join(" · ")
        };
      })
    )
  );

  const complianceEvidence = asArray(chain.compliance_trace).map((item) => {
    const messageIds = asArray(item.message_ids);
    return {
      type: item.risk_type || "合规检查",
      badgeClass: item.risk_level === "high" || item.risk_level === "serious" ? "danger" : "warn",
      messageId: messageIds.join("、"),
      evidence: item.evidence || messageIds.map((id) => lookupMessageContent(id)).filter(Boolean).join(" / "),
      reason: [
        `扣分 ${formatScore(item.deduct_score || 0)}`,
        item.status ? `状态 ${item.status}` : "",
        item.reason || ""
      ].filter(Boolean).join(" · ")
    };
  });

  return [...scoreEvidence, ...complianceEvidence];
}

function buildFallbackEvidence() {
  return [
    {
      type: "客户提问",
      badgeClass: "user",
      messageId: "msg_001",
      evidence: lookupMessageContent("msg_001") || "这个产品一般多久能看到效果？",
      reason: "客户提出效果周期问题，进入响应速度和回答相关性判断。"
    },
    {
      type: "客服回复",
      badgeClass: "admin",
      messageId: "msg_002",
      evidence: lookupMessageContent("msg_002") || "一般需要结合使用周期看，我先了解一下您的具体情况。",
      reason: "客服在 42 秒内回复，回答方向相关，但效果说明仍需更完整。"
    },
    {
      type: "身份匹配",
      badgeClass: "user",
      messageId: "msg_004",
      evidence: lookupMessageContent("msg_004") || "淘宝ID是 清风7788。",
      reason: "客户在微信群内提供淘宝 ID，可用于淘宝与微信身份归一。"
    },
    {
      type: "售后异议",
      badgeClass: "warn",
      messageId: "msg_005",
      evidence: lookupMessageContent("msg_005") || "如果没效果怎么办？",
      reason: "客户提出售后和效果担忧，进入异议处理与合规风险判断。"
    },
    {
      type: "售后回应",
      badgeClass: "danger",
      messageId: "msg_006",
      evidence: lookupMessageContent("msg_006") || "售后老师会定期回访并记录反馈。",
      reason: "已回应售后问题，但处理标准和边界说明偏泛，需要人工复核。"
    }
  ];
}

function lookupMessageContent(messageId) {
  if (!messageId) return "";
  const message = state.data.messages.find((item) => item.id === messageId);
  return message ? messageDisplayText(message) : "";
}

function renderScoreComposition(composition) {
  return `
    <div class="score-composition">
      <div class="score-card">
        <div class="metric-title">客观规则分</div>
        <div class="metric-value">${formatScore(composition.objective.score)}<span>/40</span></div>
        <div class="muted">响应时长、流程执行等系统可计算指标。</div>
        <div class="progress"><span style="width:${scorePercent(composition.objective.score, 40)}%"></span></div>
      </div>
      <div class="score-card">
        <div class="metric-title">AI 质检分</div>
        <div class="metric-value">${formatScore(composition.ai.score)}<span>/60</span></div>
        <div class="muted">${escapeHtml(composition.ai.sourceText)}</div>
        <div class="progress"><span style="width:${scorePercent(composition.ai.score, 60)}%"></span></div>
      </div>
      <div class="score-card final">
        <div class="metric-title">最终质检分</div>
        <div class="metric-value">${formatScore(composition.final.score)}<span>/100</span></div>
        <div class="muted">最终分 = 客观规则分 + AI 质检分。</div>
        <div class="progress"><span style="width:${scorePercent(composition.final.score, 100)}%"></span></div>
      </div>
    </div>
  `;
}

function getScoreComposition(result, ai) {
  const objectiveRaw = sumDimensions(result, ["响应", "回复覆盖率", "覆盖率", "流程"]);
  const storedObjectiveScore = numericOrNull(result?.objectiveScore);
  const objectiveScore = storedObjectiveScore ?? normalizeScore(objectiveRaw.score, objectiveRaw.max, 40);
  const aiScoreData = getAiQualityScore(result, ai);
  const aiScore = normalizeScore(aiScoreData.score, aiScoreData.max, 60);
  const storedFinalScore = numericOrNull(result?.finalScore ?? result?.totalScore);
  const finalScore = Number.isFinite(objectiveScore) && Number.isFinite(aiScore) ? Math.round((objectiveScore + aiScore) * 10) / 10 : storedFinalScore;

  return {
    objective: {
      score: objectiveScore
    },
    ai: {
      score: aiScore,
      sourceText: aiScoreData.sourceText
    },
    final: {
      score: finalScore
    }
  };
}

function getAiQualityScore(result, ai) {
  const storedAiScore = numericOrNull(result?.aiScore);
  if (storedAiScore !== null) {
    return { score: storedAiScore, max: 60, sourceText: "来自数据库已保存的 AI 质检分，可由质检员人工修正。" };
  }

  const aiResult = ai?.ok ? ai.result || {} : {};
  const semanticScore = numericOrNull(aiResult.ai_semantic_score?.total_score);
  if (semanticScore !== null) {
    return { score: semanticScore, max: 60, sourceText: "来自 AI 语义质检结果。" };
  }

  const reviewScore = numericOrNull(aiResult.review_score?.total_score);
  if (reviewScore !== null) {
    return { score: reviewScore, max: 60, sourceText: "来自 AI 复核质检结果。" };
  }

  const serviceScore = numericOrNull(aiResult.self_improvement?.service_quality_score);
  if (serviceScore !== null) {
    return { score: serviceScore, max: 60, sourceText: "来自 AI 会话复盘结果。" };
  }

  const legacyScore = sumDimensions(result, ["专业", "态度", "风险"]);
  return {
    score: legacyScore.score,
    max: legacyScore.max,
    sourceText: ai?.ok ? "AI 未返回标准总分，当前使用语义维度汇总。" : "运行 AI 前使用当前语义维度预估。"
  };
}

function sumDimensions(result, keywords) {
  const dimensions = Array.isArray(result?.dimensions) ? result.dimensions : [];
  return dimensions.reduce(
    (total, item) => {
      const name = String(item.name || "");
      if (!keywords.some((keyword) => name.includes(keyword))) return total;
      return {
        score: total.score + Number(item.score || 0),
        max: total.max + Number(item.max || 0)
      };
    },
    { score: 0, max: 0 }
  );
}

function normalizeScore(score, max, targetMax) {
  const numericScore = numericOrNull(score);
  const numericMax = numericOrNull(max);
  if (numericScore === null || numericMax === null || numericMax <= 0) return null;
  return Math.round(Math.min(targetMax, Math.max(0, (numericScore / numericMax) * targetMax)) * 10) / 10;
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number.isInteger(Number(value)) ? String(value) : Number(value).toFixed(1);
}

function formatScoreInput(value) {
  const number = numericOrNull(value);
  return number === null ? "" : String(Math.round(number * 10) / 10);
}

function scorePercent(value, max) {
  const number = numericOrNull(value);
  if (number === null || !max) return 0;
  return Math.min(100, Math.max(0, (number / max) * 100));
}

function renderAiEvaluationPanel(ai) {
  const result = ai.result || {};
  const profile = ai.analysisProfile || getAiAnalysisProfileFromResult(result);

  if (!ai.ok) {
    return `
      <div class="detail-card section" style="padding:16px;margin-top:14px">
        <div class="button-row" style="justify-content:space-between">
          <h3 class="section-title">AI 质检结果</h3>
          <span class="badge warn">${escapeHtml(ai.status || "未完成")}</span>
        </div>
        <div class="muted">模型：${escapeHtml(ai.model || "deepseek-v4-pro")}</div>
        <div class="muted" style="margin-top:6px">分析视角：${escapeHtml(ai.analysisProfileLabel || analysisProfileLabel(profile))}</div>
        <div class="muted" style="margin-top:6px">${escapeHtml(ai.message || "AI 暂未返回结果")}</div>
        <div class="tag-list" style="margin-top:10px">
          <span class="tag">后端环境变量：DEEPSEEK_API_KEY</span>
          <span class="tag">Prompt：${escapeHtml(ai.promptDocument || "docs/ai-quality-prompt.md")}</span>
        </div>
      </div>
    `;
  }

  if (profile === "executive_full" || result.ai_semantic_score || result.customer_analysis || result.compliance_risks) {
    return renderExecutiveAiEvaluationPanel(ai);
  }

  if (profile === "service_coaching" || result.self_improvement || result.customer_followup) {
    return renderServiceAiEvaluationPanel(ai);
  }

  if (result.review_score || result.customer_signal || result.review_items) {
    return renderQualityAiEvaluationPanel(ai);
  }

  return renderLegacyAiEvaluationPanel(ai);
}

function renderExecutiveAiEvaluationPanel(ai) {
  const result = ai.result || {};
  const semantic = result.ai_semantic_score || {};
  const customer = result.customer_analysis || {};
  const complianceRisks = asArray(result.compliance_risks);
  const deductions = asArray(result.deductions);
  const positivePoints = asArray(result.positive_points);
  const insufficientEvidence = asArray(result.insufficient_evidence);
  const evidenceChainItems = collectStructuredEvidenceChain(result.evidence_chain);
  const semanticRows = [
    { label: "问题识别", value: semantic.question_understanding, max: 8 },
    { label: "回答相关性", value: semantic.answer_relevance, max: 8 },
    { label: "回答完整度", value: semantic.answer_completeness, max: 8 },
    { label: "专业准确性", value: semantic.professional_accuracy, max: 10 },
    { label: "问题解决", value: semantic.problem_solving, max: 8 },
    { label: "服务态度", value: semantic.service_attitude, max: 8 },
    { label: "异议处理", value: semantic.objection_handling, max: 5 },
    { label: "销售转化", value: semantic.sales_conversion, max: 3 },
    { label: "话术规范", value: semantic.script_standardization, max: 2 }
  ];
  const customerRows = [
    { label: "购买意愿", value: customer.purchase_intent_score, max: 15 },
    { label: "信任程度", value: customer.trust_score, max: 10 },
    { label: "价格接受度", value: customer.price_acceptance_score, max: 8 },
    { label: "满意度", value: customer.satisfaction_score, max: 7 },
    { label: "犹豫程度", value: customer.hesitation_score, max: 5 },
    { label: "流失风险", value: customer.churn_risk_score, max: 5 }
  ];

  return `
    <div class="detail-card section" style="padding:16px;margin-top:14px">
      <div class="button-row" style="justify-content:space-between">
        <h3 class="section-title">AI 质检结果</h3>
        <div class="button-row">
          <span class="badge admin">${escapeHtml(ai.analysisProfileLabel || analysisProfileLabel("executive_full"))}</span>
          <span class="badge user">${escapeHtml(ai.model || "deepseek-v4-pro")}</span>
        </div>
      </div>
      <div class="grid three" style="margin-top:14px">
        <div class="metric-card">
          <div class="metric-title">语义总分</div>
          <div class="metric-value">${escapeHtml(String(semantic.total_score ?? "-"))}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">客户语义分</div>
          <div class="metric-value">${escapeHtml(String(customer.semantic_score ?? "-"))}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">意向等级</div>
          <div class="metric-value">${escapeHtml(customer.intention_level || "-")}</div>
        </div>
      </div>
      <div class="grid two" style="margin-top:14px">
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">客服语义评分</h4>
          <div class="score-list">${semanticRows.map((item) => renderScoreRow(item)).join("")}</div>
        </div>
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">客户语义分析</h4>
          <div class="score-list">${customerRows.map((item) => renderScoreRow(item)).join("")}</div>
        </div>
      </div>
      ${
        evidenceChainItems.length
          ? `<div class="detail-card section" style="padding:16px;margin-top:14px">
              <div class="button-row" style="justify-content:space-between">
                <h4 class="section-title">评分证据链</h4>
                <span class="badge user">按子项追溯</span>
              </div>
              <div class="timeline">
                ${evidenceChainItems.slice(0, 14).map((item) => renderAiEvidenceChainItem(item)).join("")}
              </div>
            </div>`
          : ""
      }
      <div class="grid two" style="margin-top:14px">
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">合规风险</h4>
          <div class="timeline">
            ${complianceRisks.length ? complianceRisks.map((item) => renderEvidenceItem(item.risk_type || "risk", item.message_id, item.evidence, item.reason, item.risk_level || "unknown", item.deduct_score)).join("") : '<div class="timeline-item">暂无风险</div>'}
          </div>
        </div>
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">扣分与亮点</h4>
          <div class="timeline">
            ${deductions.length ? deductions.map((item) => renderEvidenceItem(item.dimension || "deduction", item.message_id, item.evidence, item.reason, "deduct", item.deduct_score)).join("") : '<div class="timeline-item">暂无扣分项</div>'}
            ${positivePoints.length ? positivePoints.map((item) => renderEvidencePoint(item.dimension || "positive", item.message_id, item.evidence, item.reason)).join("") : ""}
          </div>
        </div>
      </div>
      <div class="grid two" style="margin-top:14px">
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">证据不足</h4>
          <div class="tag-list">
            ${insufficientEvidence.length ? insufficientEvidence.map((item) => `<span class="tag">${escapeHtml(stringifyEvidence(item))}</span>`).join("") : '<span class="tag">无</span>'}
          </div>
        </div>
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">总结</h4>
          <div class="muted">${escapeHtml(result.summary || "未生成总结")}</div>
          <div class="tag-list" style="margin-top:12px">
            <span class="tag">人工确认：${result.review_required ? "需要" : "不需要"}</span>
            <span class="tag">意向等级：${escapeHtml(customer.intention_level || "unknown")}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderQualityAiEvaluationPanel(ai) {
  const result = ai.result || {};
  const review = result.review_score || {};
  const customer = result.customer_signal || {};
  const riskReminders = asArray(result.risk_reminders);
  const reviewItems = asArray(result.review_items);
  const positivePoints = asArray(result.positive_points);
  const insufficientEvidence = asArray(result.insufficient_evidence);
  const reviewRows = [
    { label: "问题识别", value: review.question_understanding, max: 8 },
    { label: "回答相关", value: review.answer_relevance, max: 8 },
    { label: "回答完整", value: review.answer_completeness, max: 8 },
    { label: "专业准确", value: review.professional_accuracy, max: 10 },
    { label: "服务态度", value: review.service_attitude, max: 8 },
    { label: "流程执行", value: review.process_execution, max: 10 }
  ];

  return `
    <div class="detail-card section" style="padding:16px;margin-top:14px">
      <div class="button-row" style="justify-content:space-between">
        <h3 class="section-title">AI 质检结果</h3>
        <div class="button-row">
          <span class="badge warn">${escapeHtml(ai.analysisProfileLabel || analysisProfileLabel("review_limited"))}</span>
          <span class="badge user">${escapeHtml(ai.model || "deepseek-v4-pro")}</span>
        </div>
      </div>
      <div class="muted">面向质检复核，重点展示需要人工确认的评分项、风险提醒和证据。</div>
      <div class="grid three" style="margin-top:14px">
        <div class="metric-card">
          <div class="metric-title">复核总分</div>
          <div class="metric-value">${escapeHtml(String(review.total_score ?? "-"))}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">满意度信号</div>
          <div class="metric-value">${escapeHtml(customer.satisfaction_signal || "-")}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">意向等级</div>
          <div class="metric-value">${escapeHtml(customer.intent_level || "-")}</div>
        </div>
      </div>
      <div class="detail-card section" style="padding:16px;margin-top:14px">
        <h4 class="section-title">复核评分</h4>
        <div class="score-list">${reviewRows.map((item) => renderScoreRow(item)).join("")}</div>
      </div>
      <div class="grid two" style="margin-top:14px">
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">客户信号</h4>
          <div class="tag-list">
            <span class="tag">意向：${escapeHtml(customer.intent_level || "unknown")}</span>
            <span class="tag">满意度：${escapeHtml(customer.satisfaction_signal || "unknown")}</span>
          </div>
          <div class="muted" style="margin-top:10px">需求点：${escapeHtml(listText(customer.demand_points) || "无")}</div>
        </div>
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">风险提醒</h4>
          <div class="timeline">
            ${riskReminders.length ? riskReminders.map((item) => renderEvidenceItem(item.risk_type || "risk", item.message_id, item.evidence, item.reason, item.risk_level || "unknown", item.deduct_score)).join("") : '<div class="timeline-item">暂无风险提醒</div>'}
          </div>
        </div>
      </div>
      <div class="grid two" style="margin-top:14px">
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">复核项</h4>
          <div class="timeline">
            ${reviewItems.length ? reviewItems.map((item) => renderEvidenceItem(item.dimension || "review", item.message_id, item.evidence, item.reason, "deduct", item.deduct_score)).join("") : '<div class="timeline-item">暂无复核项</div>'}
            ${positivePoints.length ? positivePoints.map((item) => renderEvidencePoint(item.dimension || "positive", item.message_id, item.evidence, item.reason)).join("") : ""}
          </div>
        </div>
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">证据不足</h4>
          <div class="tag-list">
            ${insufficientEvidence.length ? insufficientEvidence.map((item) => `<span class="tag">${escapeHtml(stringifyEvidence(item))}</span>`).join("") : '<span class="tag">无</span>'}
          </div>
          <div class="muted" style="margin-top:12px">${escapeHtml(result.summary || "未生成总结")}</div>
        </div>
      </div>
    </div>
  `;
}

function renderServiceAiEvaluationPanel(ai) {
  const result = ai.result || {};
  const self = result.self_improvement || {};
  const customer = result.customer_followup || {};
  const riskReminders = asArray(result.risk_reminders);
  const improvementItems = asArray(result.improvement_items);
  const positivePoints = asArray(result.positive_points);
  const insufficientEvidence = asArray(result.insufficient_evidence);
  const selfRows = [
    { label: "本次回复", value: self.service_quality_score, max: 20 },
    { label: "回答相关", value: self.answer_relevance, max: 10 },
    { label: "回答完整", value: self.answer_completeness, max: 10 },
    { label: "服务态度", value: self.service_attitude, max: 10 },
    { label: "跟进动作", value: self.followup_action, max: 10 }
  ];

  return `
    <div class="detail-card section" style="padding:16px;margin-top:14px">
      <div class="button-row" style="justify-content:space-between">
        <h3 class="section-title">AI 复盘结果</h3>
        <div class="button-row">
          <span class="badge user">${escapeHtml(ai.analysisProfileLabel || analysisProfileLabel("service_coaching"))}</span>
          <span class="badge warn">${escapeHtml(ai.model || "测试模型")}</span>
        </div>
      </div>
      <div class="muted">面向客服复盘，重点展示可执行的改进建议、跟进动作和风险提醒。</div>
      <div class="grid three" style="margin-top:14px">
        <div class="metric-card">
          <div class="metric-title">复盘总分</div>
          <div class="metric-value">${escapeHtml(String(self.service_quality_score ?? "-"))}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">客户信号</div>
          <div class="metric-value">${escapeHtml(customer.intent_signal || "-")}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">跟进优先级</div>
          <div class="metric-value">${escapeHtml(customer.followup_priority || "-")}</div>
        </div>
      </div>
      <div class="detail-card section" style="padding:16px;margin-top:14px">
        <h4 class="section-title">复盘评分</h4>
        <div class="score-list">${selfRows.map((item) => renderScoreRow(item)).join("")}</div>
      </div>
      <div class="grid two" style="margin-top:14px">
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">下一步跟进</h4>
          <div class="tag-list">
            <span class="tag">优先级：${escapeHtml(customer.followup_priority || "unknown")}</span>
            <span class="tag">意向：${escapeHtml(customer.intent_signal || "unknown")}</span>
          </div>
          <div class="muted" style="margin-top:10px">${escapeHtml(customer.next_action || "暂无下一步动作")}</div>
          <div class="muted" style="margin-top:10px">需求点：${escapeHtml(listText(customer.demand_points) || "无")}</div>
        </div>
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">风险提醒</h4>
          <div class="timeline">
            ${riskReminders.length ? riskReminders.map((item) => renderEvidenceItem(item.risk_type || "risk", item.message_id, item.evidence, item.reason, item.risk_level || "unknown", item.deduct_score)).join("") : '<div class="timeline-item">暂无风险提醒</div>'}
          </div>
        </div>
      </div>
      <div class="grid two" style="margin-top:14px">
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">改进项</h4>
          <div class="timeline">
            ${improvementItems.length ? improvementItems.map((item) => renderImprovementItem(item)).join("") : '<div class="timeline-item">暂无改进项</div>'}
            ${positivePoints.length ? positivePoints.map((item) => renderEvidencePoint(item.dimension || "positive", item.message_id, item.evidence, item.reason)).join("") : ""}
          </div>
        </div>
        <div class="detail-card section" style="padding:16px">
          <h4 class="section-title">证据不足</h4>
          <div class="tag-list">
            ${insufficientEvidence.length ? insufficientEvidence.map((item) => `<span class="tag">${escapeHtml(stringifyEvidence(item))}</span>`).join("") : '<span class="tag">无</span>'}
          </div>
          <div class="muted" style="margin-top:12px">${escapeHtml(result.summary || "未生成总结")}</div>
        </div>
      </div>
    </div>
  `;
}

function renderLegacyAiEvaluationPanel(ai) {
  const result = ai.result || {};
  const risks = Array.isArray(result.risk_points) ? result.risk_points : [];
  const reasons = Array.isArray(result.score_reasons) ? result.score_reasons : [];

  return `
    <div class="detail-card section" style="padding:16px;margin-top:14px">
      <div class="button-row" style="justify-content:space-between">
        <h3 class="section-title">AI 质检结果</h3>
        <span class="badge user">${escapeHtml(ai.model || "测试模型")}</span>
      </div>
      <div class="muted">分析视角：${escapeHtml(ai.analysisProfileLabel || "旧版结果")}</div>
      <div class="grid three" style="margin-top:14px">
        <div class="metric-card">
          <div class="metric-title">专业度</div>
          <div class="metric-value">${escapeHtml(String(result.professional_score ?? "-"))}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">服务态度</div>
          <div class="metric-value">${escapeHtml(String(result.attitude_score ?? "-"))}</div>
        </div>
        <div class="metric-card">
          <div class="metric-title">流程合规</div>
          <div class="metric-value">${escapeHtml(String(result.process_score ?? "-"))}</div>
        </div>
      </div>
      <div class="tag-list" style="margin-top:14px">
        <span class="tag">满意度：${escapeHtml(result.customer_satisfaction || "unknown")}</span>
        <span class="tag">潜客等级：${escapeHtml(result.potential_customer || "unknown")}</span>
        <span class="tag">需求强度：${escapeHtml(result.demand_level || "unknown")}</span>
        <span class="tag">需人工复核：${result.review_required ? "是" : "否"}</span>
      </div>
      <div class="timeline" style="margin-top:14px">
        ${result.summary ? `<div class="timeline-item"><strong>总结</strong><div class="muted">${escapeHtml(result.summary)}</div></div>` : ""}
        ${risks.map((item) => `<div class="timeline-item"><span class="badge danger">风险</span> ${escapeHtml(item.description || item.risk_type || "未命名风险")}</div>`).join("")}
        ${reasons.map((item) => `<div class="timeline-item"><strong>${escapeHtml(item.dimension || "评分理由")}</strong><div class="muted">${escapeHtml(item.reason || "")}</div></div>`).join("")}
      </div>
    </div>
  `;
}

function renderScoreRow(item) {
  const value = item.value ?? item.score ?? item.deduct_score ?? "-";
  const max = Number(item.max || item.limit || 0);
  const numericValue = Number(value);
  const percentage = max > 0 && Number.isFinite(numericValue) ? (numericValue / max) * 100 : 0;
  return `
    <div class="score-item">
      <div class="stat-row">
        <span>${escapeHtml(item.label || item.dimension || "未命名维度")}</span>
        <span>${escapeHtml(String(value))}${max ? `/${escapeHtml(String(max))}` : ""}</span>
      </div>
      <div class="progress"><span style="width:${Math.min(100, Math.max(0, percentage))}%"></span></div>
      ${item.evidence || item.reason ? `<div class="muted" style="margin-top:4px">${escapeHtml([item.evidence, item.reason].filter(Boolean).join(" · "))}</div>` : ""}
    </div>
  `;
}

function renderEvidenceItem(label, messageId, evidence, reason, level, score) {
  return `
    <div class="timeline-item">
      <div class="button-row" style="justify-content:space-between">
        <strong>${escapeHtml(label)}</strong>
        <span class="badge ${riskBadgeClass(level)}">${escapeHtml(String(score ?? level ?? "0"))}</span>
      </div>
      <div class="muted" style="margin-top:4px">message_id：${escapeHtml(messageId || "证据不足")}</div>
      ${evidence ? `<div class="muted">${escapeHtml(evidence)}</div>` : ""}
      ${reason ? `<div class="muted">${escapeHtml(reason)}</div>` : ""}
    </div>
  `;
}

function renderAiEvidenceChainItem(item) {
  const allowedBadgeClasses = ["admin", "user", "warn", "danger"];
  const badgeClass = allowedBadgeClasses.includes(item.badgeClass) ? item.badgeClass : "user";
  return `
    <div class="timeline-item">
      <div class="button-row" style="justify-content:space-between">
        <strong>${escapeHtml(item.type || "评分证据")}</strong>
        <span class="badge ${badgeClass}">证据</span>
      </div>
      <div class="muted" style="margin-top:4px">message_id：${escapeHtml(item.messageId || "证据不足")}</div>
      ${item.evidence ? `<div class="muted">${escapeHtml(item.evidence)}</div>` : ""}
      ${item.reason ? `<div class="muted">${escapeHtml(item.reason)}</div>` : ""}
    </div>
  `;
}

function renderEvidencePoint(label, messageId, evidence, reason) {
  return `
    <div class="timeline-item">
      <div class="button-row" style="justify-content:space-between">
        <strong>${escapeHtml(label)}</strong>
        <span class="badge user">正向</span>
      </div>
      <div class="muted" style="margin-top:4px">message_id：${escapeHtml(messageId || "证据不足")}</div>
      ${evidence ? `<div class="muted">${escapeHtml(evidence)}</div>` : ""}
      ${reason ? `<div class="muted">${escapeHtml(reason)}</div>` : ""}
    </div>
  `;
}

function renderImprovementItem(item) {
  return `
    <div class="timeline-item">
      <div class="button-row" style="justify-content:space-between">
        <strong>${escapeHtml(item.dimension || "改进项")}</strong>
        <span class="badge warn">${escapeHtml(String(item.deduct_score ?? "0"))}</span>
      </div>
      <div class="muted" style="margin-top:4px">message_id：${escapeHtml(item.message_id || "证据不足")}</div>
      ${item.evidence ? `<div class="muted">${escapeHtml(item.evidence)}</div>` : ""}
      ${item.reason ? `<div class="muted">${escapeHtml(item.reason)}</div>` : ""}
      ${item.suggestion ? `<div class="muted">${escapeHtml(item.suggestion)}</div>` : ""}
    </div>
  `;
}

function getQualityViewMeta() {
  const role = state.user?.role || "quality_user";
  if (role === "super_admin") {
    return {
      title: "AI 质检",
      description: "综合客观规则分与 AI 语义质检分，形成可追溯的最终质检结果。",
      buttonLabel: "运行 AI 质检"
    };
  }

  if (role === "service_user") {
    return {
      title: "客服复盘",
      description: "展示本次会话的自我复盘和下一步跟进建议，面向客服本人。",
      buttonLabel: "运行复盘 AI"
    };
  }

  return {
    title: "质检复核",
    description: "展示质检员需要复核的语义评分、风险提醒和证据。",
    buttonLabel: "运行质检 AI"
  };
}

function getAiAnalysisProfileFromResult(result = {}) {
  if (result.ai_semantic_score || result.customer_analysis || result.compliance_risks) return "executive_full";
  if (result.self_improvement || result.customer_followup) return "service_coaching";
  if (result.review_score || result.customer_signal || result.review_items) return "review_limited";
  return "legacy";
}

function analysisProfileLabel(profile) {
  const map = {
    executive_full: "超级管理员版本 Prompt",
    review_limited: "质检员复核分析",
    service_coaching: "客服本人复盘",
    legacy: "旧版结果"
  };
  return map[profile] || profile || "未命名视角";
}

function riskBadgeClass(level) {
  const value = String(level || "").toLowerCase();
  if (value === "serious" || value === "high") return "danger";
  if (value === "medium") return "warn";
  return "user";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function listText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join("、");
  if (value === null || value === undefined) return "";
  return String(value);
}

function stringifyEvidence(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "证据不足";
  return item.message_id || item.dimension || item.risk_type || item.reason || "证据不足";
}

function renderCustomers() {
  const profiles = asArray(state.data.customerProfiles);
  const stats = buildCustomerPortfolioStats(profiles);
  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>客户画像</h3>
          <div class="muted">从聊天内容、交互频率和意向关键词推测需求、购买意向、顾虑和下一步服务动作。</div>
        </div>
      </div>
      <div class="customer-portfolio">
        <div class="portfolio-kpi">
          <span>客户数</span>
          <strong>${profiles.length}</strong>
        </div>
        <div class="portfolio-kpi">
          <span>高意向</span>
          <strong>${stats.highIntent}</strong>
        </div>
        <div class="portfolio-kpi warn">
          <span>需重点服务</span>
          <strong>${stats.needService}</strong>
        </div>
        <div class="portfolio-kpi">
          <span>主要需求</span>
          <strong>${escapeHtml(stats.topNeed || "-")}</strong>
        </div>
      </div>
      <div class="customer-need-board">
        <div>
          <h4 class="section-title">需求分布</h4>
          ${renderCustomerNeedBars(stats.needSegments)}
        </div>
        <div>
          <h4 class="section-title">商家服务重点</h4>
          <div class="timeline compact">
            ${stats.serviceFocus.map((item) => `<div class="timeline-item">${escapeHtml(item)}</div>`).join("")}
          </div>
        </div>
      </div>
      <div class="customer-profile-grid">
        ${profiles.map((item) => renderCustomerProfileCard(item)).join("")}
      </div>
    </section>
  `;
}

function buildCustomerPortfolioStats(profiles = []) {
  const highIntent = profiles.filter((item) => estimateIntentScore(item) >= 80).length;
  const needService = profiles.filter((item) => estimateCustomerRiskScore(item) >= 45).length;
  const needSegments = buildSegments(
    profiles.flatMap((item) => asArray(item.needs).map((need) => ({ need }))),
    (item) => item.need
  );
  const topNeed = needSegments[0]?.label || "";
  const serviceFocus = [];
  if (highIntent) serviceFocus.push("高意向客户优先给下单路径、套餐建议和明确跟进时间。");
  if (needService) serviceFocus.push("有售后、价格、身份顾虑的客户要先消除风险，再推动成交。");
  if (topNeed) serviceFocus.push(`当前最常见需求是“${topNeed}”，客服话术和素材应优先围绕它准备。`);
  if (!serviceFocus.length) serviceFocus.push("当前样本较少，先积累聊天记录和客户反馈。");
  return { highIntent, needService, needSegments, topNeed, serviceFocus };
}

function renderCustomerNeedBars(segments = []) {
  const safeSegments = asArray(segments).slice(0, 6);
  if (!safeSegments.length) return `<div class="empty-state">暂无需求数据</div>`;
  return `
    <div class="need-bars">
      ${safeSegments
        .map(
          (item, index) => `
            <div class="need-bar-row">
              <div class="chart-label"><span>${escapeHtml(item.label)}</span><strong>${item.count}</strong></div>
              <div class="bar"><span class="color-${index % 6}" style="width:${clampPercent(item.percentage)}%"></span></div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderCustomerProfileCard(item) {
  const intentScore = estimateIntentScore(item);
  const satisfactionScore = estimateSatisfactionScore(item);
  const riskScore = estimateCustomerRiskScore(item);
  const concerns = inferPurchaseConcerns(item);
  const actions = inferMerchantServiceActions(item);
  const volume = inferPurchaseVolume(item);
  return `
    <article class="customer-profile-card">
      <div class="customer-card-head">
        <div>
          <h4>${escapeHtml(item.name)}</h4>
          <div class="muted">归属客服：${escapeHtml(item.owner || "未分配")} · 最近活跃：${escapeHtml(item.lastActiveAt || "-")}</div>
        </div>
        <span class="badge ${intentScore >= 80 ? "user" : intentScore >= 55 ? "warn" : "admin"}">${escapeHtml(item.intentLevel || "未知意向")}</span>
      </div>
      <div class="customer-id-line">
        <span>淘宝ID：${escapeHtml(item.taobaoId || "-")}</span>
        <span>微信ID：${escapeHtml(item.wechatId || "-")}</span>
      </div>
      <div class="customer-score-grid">
        ${renderCustomerScoreMeter("购买意向", intentScore)}
        ${renderCustomerScoreMeter("满意信任", satisfactionScore)}
        ${renderCustomerScoreMeter("流失风险", riskScore)}
      </div>
      <div class="customer-insight-grid">
        <div>
          <span>购买体量推测</span>
          <strong>${escapeHtml(volume.level)}</strong>
          <small>${escapeHtml(volume.reason)}</small>
        </div>
        <div>
          <span>主要需求</span>
          <strong>${escapeHtml(asArray(item.needs)[0] || "待判断")}</strong>
          <small>${asArray(item.needs).slice(1).map((need) => escapeHtml(need)).join(" / ") || "继续从对话中提取"}</small>
        </div>
      </div>
      <div class="tag-list">${asArray(item.tags).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="customer-next-actions">
        <div>
          <h5>购买顾虑</h5>
          <div class="mini-list">
            ${concerns.length ? concerns.map((item) => `<span>${escapeHtml(item.label)}</span>`).join("") : "<span>暂无明显顾虑</span>"}
          </div>
        </div>
        <div>
          <h5>下一步服务</h5>
          <div class="mini-list">
            ${actions.slice(0, 3).map((item) => `<span>${escapeHtml(item.title)}</span>`).join("")}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderCustomerScoreMeter(label, score) {
  return `
    <div class="customer-meter">
      <div class="chart-label"><span>${escapeHtml(label)}</span><strong>${score}</strong></div>
      <div class="progress"><span style="width:${clampPercent(score)}%"></span></div>
    </div>
  `;
}

function renderPermissionsV2() {
  if (state.user.role !== "super_admin") {
    return `
      <div class="access-denied">
        <strong>当前账号没有权限进入账号与权限管理。</strong>
        <div class="muted" style="margin-top:8px">这块只给管理层和超级管理员看，用来管账号、看范围、批权限和开新账号。</div>
      </div>
    `;
  }

  const model = state.data.permissionModel;
  if (!model) return `<div class="empty-state">加载中...</div>`;

  const roles = [
    { key: "super_admin", title: "超级管理员", desc: "看全部数据、管账号、配规则、下放权限。", scope: "全部数据" },
    { key: "quality_manager", title: "质检主管", desc: "看本部门质检结果，处理疑难会话和复核任务。", scope: "部门数据" },
    { key: "quality_user", title: "质检员", desc: "看被分配的数据，完成会话质检和人工复核。", scope: "授权数据" },
    { key: "service_user", title: "客服", desc: "看自己负责的客户和会话，跟进服务过程。", scope: "本人客户" }
  ];

  const businessPermissions = [
    { title: "聊天和客户", items: ["查看聊天记录", "查看会话详情", "查看客户画像", "导出会话数据"] },
    { title: "质检复核", items: ["查看质检结果", "人工修正评分", "处理身份复核", "标记异常会话"] },
    { title: "账号管理", items: ["新建账号申请", "审批账号开通", "冻结账号", "调整角色"] },
    { title: "权限管理", items: ["下放数据范围", "分配指定权限", "查看操作日志"] },
    { title: "规则和报表", items: ["配置质检规则", "修改评分权重", "查看 BI 看板"] }
  ];
  const accountRequests = state.data.accountRequests || [];
  const operationLogs = state.data.operationLogs || [];

  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>账号与权限管理</h3>
          <div class="muted">管理层最关心的不是权限码，而是“谁能看什么、能做什么、现在有没有开通”。</div>
        </div>
        <div class="button-row">
          <button class="btn primary small" data-action="open-account-modal">新建账号申请</button>
        </div>
      </div>

      <div class="permission-layout">
        <div class="permission-main">
          <div class="permission-main-head">
            <div>
              <h3 class="section-title">权限下放 / 账号列表</h3>
              <div class="muted">这里是本页主任务：直接调整账号角色和数据范围，保存后马上写回后端并留下操作记录。</div>
            </div>
            <div class="permission-kpi-row">
              <div><span>账号</span><strong>${model.accounts.length}</strong></div>
              <div><span>待开通</span><strong>${accountRequests.filter((item) => item.status === "pending").length}</strong></div>
              <div><span>角色</span><strong>${model.roles.length}</strong></div>
            </div>
          </div>
          <div class="timeline">
            ${model.accounts.map((item) => renderAccountPermissionRow(item, model.roles)).join("")}
          </div>
        </div>

        <aside class="permission-side-rail">
          <div class="detail-card section side-card">
          <h3 class="section-title">待开通账号</h3>
          ${renderAccountProvisionResult()}
          ${accountRequests.length
            ? `<div class="timeline">
                ${accountRequests.map((item) => renderAccountRequestRow(item)).join("")}
              </div>`
            : `<div class="empty-state">暂无待开通账号，点击右上角新建账号申请。</div>`}
          </div>

          ${renderRoleIntroDisclosure(roles, model)}
          ${renderBusinessPermissionDisclosure(businessPermissions)}
          ${renderDatabasePermissionDisclosure()}
          ${renderOperationLogPanel(operationLogs)}
        </aside>
      </div>

      ${state.accountModalOpen ? renderAccountModal() : ""}
    </section>
  `;
}

function renderRoleIntroDisclosure(roles, model) {
  return `
    <details class="permission-disclosure">
      <summary>
        <span>各岗位说明</span>
        <strong>点击展开</strong>
      </summary>
      <div class="timeline compact">
        ${roles
          .map(
            (role) => `
              <div class="timeline-item">
                <div class="button-row" style="justify-content:space-between">
                  <strong>${escapeHtml(role.title)}</strong>
                  <span class="badge user">${escapeHtml(role.scope)}</span>
                </div>
                <div class="muted" style="margin-top:6px">${escapeHtml(role.desc)}</div>
                <div class="muted">当前账号数：${model.roles.find((item) => item.key === role.key)?.userCount ?? 0}</div>
              </div>
            `
          )
          .join("")}
      </div>
    </details>
  `;
}

function renderBusinessPermissionDisclosure(groups) {
  return `
    <details class="permission-disclosure">
      <summary>
        <span>可见范围与可做事项</span>
        <strong>点击展开</strong>
      </summary>
      <div class="permission-groups">
        ${groups
          .map(
            (group) => `
              <div class="permission-group">
                <div class="permission-group-title">${escapeHtml(group.title)}</div>
                <div class="tag-list">
                  ${group.items.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    </details>
  `;
}

function renderDatabasePermissionDisclosure() {
  return `
    <details class="permission-disclosure">
      <summary>
        <span>云数据库接入状态</span>
        <strong>待配置</strong>
      </summary>
      <div class="muted">后端会把账号、角色、权限写入云数据库。前端这里只发申请，不直接保存密码或连接信息。</div>
      <div class="tag-list" style="margin-top:10px">
        <span class="tag">数据库地址</span>
        <span class="tag">库名</span>
        <span class="tag">只读账号</span>
        <span class="tag">业务写入账号</span>
        <span class="tag">账号状态表</span>
      </div>
    </details>
  `;
}

function renderAccountPermissionRow(item, roles = []) {
  const isCurrentUser = item.id === state.user?.id;
  const disabled = isCurrentUser ? "disabled" : "";

  return `
    <div class="timeline-item">
      <div class="button-row" style="justify-content:space-between">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <div class="muted" style="margin-top:6px">${escapeHtml(item.username)} · ${escapeHtml(item.department)}</div>
        </div>
        <span class="badge ${item.role === "super_admin" ? "admin" : "user"}">${escapeHtml(roleNameByKey(item.role))}</span>
      </div>
      <div class="grid two" style="margin-top:12px">
        <div class="field">
          <label>下放角色</label>
          <select id="permission-role-${escapeHtml(item.id)}" ${disabled}>
            ${renderPermissionRoleOptions(roles, item.role)}
          </select>
        </div>
        <div class="field">
          <label>数据范围</label>
          <select id="permission-scope-${escapeHtml(item.id)}" ${disabled}>
            ${renderPermissionScopeOptions(item.dataScope)}
          </select>
        </div>
      </div>
      <div class="button-row" style="justify-content:space-between; margin-top:12px">
        <div class="muted">当前：${escapeHtml(roleNameByKey(item.role))} · ${escapeHtml(scopeLabel(item.dataScope))}</div>
        ${
          isCurrentUser
            ? `<span class="badge warn">当前登录账号不可自改</span>`
            : `<button class="btn primary small" data-action="update-account-permission" data-user-id="${escapeHtml(item.id)}">保存下放</button>`
        }
      </div>
    </div>
  `;
}

function renderPermissionRoleOptions(roles = [], selectedRole = "") {
  const fallbackRoles = [
    { key: "super_admin", name: "超级管理员" },
    { key: "quality_manager", name: "质检主管" },
    { key: "quality_user", name: "质检员" },
    { key: "service_user", name: "客服" }
  ];
  const source = roles.length ? roles : fallbackRoles;

  return source
    .map((role) => {
      const key = role.key || role;
      const name = role.name || roleNameByKey(key);
      return `<option value="${escapeHtml(key)}" ${key === selectedRole ? "selected" : ""}>${escapeHtml(name)}</option>`;
    })
    .join("");
}

function renderPermissionScopeOptions(selectedScope = "") {
  return [
    { key: "self", name: "本人客户" },
    { key: "department", name: "本部门数据" },
    { key: "all", name: "全部数据" }
  ]
    .map((scope) => `<option value="${escapeHtml(scope.key)}" ${scope.key === selectedScope ? "selected" : ""}>${escapeHtml(scope.name)}</option>`)
    .join("");
}

function renderAccountProvisionResult() {
  const result = state.accountProvisionResult;
  if (!result?.account || !result.initialPassword) return "";

  return `
    <div class="cloud-box" style="margin:10px 0 12px">
      <div class="button-row" style="justify-content:space-between">
        <strong>账号已开通</strong>
        <span class="badge warn">初始密码仅本次显示</span>
      </div>
      <div class="grid two" style="margin-top:10px">
        <div class="field">
          <label>登录账号</label>
          <input value="${escapeHtml(result.account.username || "")}" readonly />
        </div>
        <div class="field">
          <label>初始密码</label>
          <input value="${escapeHtml(result.initialPassword)}" readonly />
        </div>
      </div>
      <div class="muted" style="margin-top:8px">请让使用人首次登录后尽快修改密码；后续不再从系统界面展示明文密码。</div>
    </div>
  `;
}

function renderAccountRequestRow(item) {
  const isPending = item.status === "pending";

  return `
    <div class="timeline-item">
      <div class="button-row" style="justify-content:space-between">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <div class="muted" style="margin-top:6px">${escapeHtml(item.username)} · ${escapeHtml(item.department)} · ${escapeHtml(roleNameByKey(item.role))}</div>
        </div>
        <span class="badge ${accountRequestStatusTone(item.status)}">${escapeHtml(accountRequestStatusText(item.status))}</span>
      </div>
      <div class="muted" style="margin-top:8px">数据范围：${escapeHtml(scopeLabel(item.dataScope))} · 提交时间：${escapeHtml(item.createdAt || "")}</div>
      ${item.note ? `<div class="muted">备注：${escapeHtml(item.note)}</div>` : ""}
      ${
        isPending
          ? `<div class="button-row" style="justify-content:flex-end;margin-top:12px">
              <button class="btn ghost small" data-action="reject-account-request" data-request-id="${escapeHtml(item.id)}">拒绝</button>
              <button class="btn primary small" data-action="approve-account-request" data-request-id="${escapeHtml(item.id)}">审批开通</button>
            </div>`
          : `<div class="muted" style="margin-top:8px">处理时间：${escapeHtml(item.handledAt || "-")} ${item.handledByName ? `· 处理人：${escapeHtml(item.handledByName)}` : ""}</div>`
      }
    </div>
  `;
}

function accountRequestStatusText(status) {
  const map = {
    pending: "待审批",
    approved: "已开通",
    rejected: "已拒绝"
  };
  return map[status] || status || "未知";
}

function accountRequestStatusTone(status) {
  if (status === "approved") return "user";
  if (status === "rejected") return "danger";
  return "warn";
}

function renderOperationLogPanel(logs = []) {
  return `
    <div class="detail-card section" style="padding:16px;margin-top:14px">
      <div class="section-header">
        <div>
          <h3 class="section-title">最近权限操作记录</h3>
          <div class="muted">权限下放、账号申请、审批开通和拒绝都会在这里留痕，方便后续审计。</div>
        </div>
        <span class="badge admin">${logs.length} 条</span>
      </div>
      ${
        logs.length
          ? `<div class="timeline">${logs.map((item) => renderOperationLogRow(item)).join("")}</div>`
          : `<div class="empty-state">暂无操作记录。</div>`
      }
    </div>
  `;
}

function renderOperationLogRow(item) {
  return `
    <div class="timeline-item">
      <div class="button-row" style="justify-content:space-between">
        <strong>${escapeHtml(operationActionText(item.action))}</strong>
        <span class="badge user">${escapeHtml(item.createdAt || "")}</span>
      </div>
      <div class="muted" style="margin-top:6px">${escapeHtml(item.summary || "")}</div>
      <div class="muted">操作人：${escapeHtml(item.actorName || "系统")} · 对象：${escapeHtml(item.targetType || "")}/${escapeHtml(item.targetId || "")}</div>
    </div>
  `;
}

function operationActionText(action) {
  const map = {
    permission_updated: "权限下放",
    account_request_created: "账号申请",
    account_request_approved: "审批开通",
    account_request_rejected: "拒绝开通",
    quality_score_manual_adjusted: "人工改分"
  };
  return map[action] || action || "操作";
}

function renderAccountModal() {
  return `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="section-header" style="margin-bottom:14px">
          <div>
            <h3>新建账号申请</h3>
            <div class="muted">这里是申请入口，后端接云数据库后会真正生成账号。</div>
          </div>
          <button class="btn ghost small" data-action="close-account-modal">关闭</button>
        </div>
        <div class="grid two">
          <div class="field">
            <label>姓名</label>
            <input id="account-name" placeholder="例如：客服小陈" />
          </div>
          <div class="field">
            <label>登录账号</label>
            <input id="account-username" placeholder="例如：service_chen" />
          </div>
        </div>
        <div class="grid two" style="margin-top:12px">
          <div class="field">
            <label>所属部门</label>
            <input id="account-department" placeholder="例如：客服二组" />
          </div>
          <div class="field">
            <label>账号角色</label>
            <select id="account-role">
              <option value="service_user">客服</option>
              <option value="quality_user">质检员</option>
              <option value="quality_manager">质检主管</option>
            </select>
          </div>
        </div>
        <div class="grid two" style="margin-top:12px">
          <div class="field">
            <label>数据范围</label>
            <select id="account-scope">
              <option value="self">本人客户</option>
              <option value="department">本部门数据</option>
              <option value="all">全部数据</option>
            </select>
          </div>
          <div class="field">
            <label>备注</label>
            <input id="account-note" placeholder="例如：负责售后质检" />
          </div>
        </div>
        <div class="button-row" style="margin-top:16px; justify-content:flex-end">
          <button class="btn ghost" data-action="close-account-modal">取消</button>
          <button class="btn primary" data-action="submit-account-request">提交申请</button>
        </div>
      </div>
    </div>
  `;
}

function roleNameByKey(role) {
  const map = {
    super_admin: "超级管理员",
    quality_manager: "质检主管",
    quality_user: "质检员",
    service_user: "客服"
  };
  return map[role] || role || "未分配";
}

function scopeLabel(scope) {
  const map = {
    all: "全部数据",
    department: "本部门数据",
    self: "本人客户"
  };
  return map[scope] || scope || "未设置";
}

function renderPermissions() {
  if (state.user.role !== "super_admin") {
    return `
      <div class="access-denied">
        <strong>当前账号无权限访问账号与权限管理。</strong>
        <div class="muted" style="margin-top:8px">这部分只对超级管理员开放，用来创建账号、分配角色和下放权限。</div>
      </div>
    `;
  }

  const model = state.data.permissionModel;
  if (!model) return `<div class="empty-state">加载中...</div>`;

  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>账号与权限管理</h3>
          <div class="muted">这里预留账号申请、权限下放和角色管理能力。</div>
        </div>
        <button class="btn primary small">新建账号</button>
      </div>
      <div class="grid two">
        <div class="detail-card section" style="padding:16px">
          <h3 class="section-title">角色</h3>
          <div class="timeline">
            ${model.roles
              .map(
                (role) => `
                  <div class="timeline-item">
                    <div class="button-row" style="justify-content:space-between">
                      <strong>${escapeHtml(role.name)}</strong>
                      <span class="badge user">${escapeHtml(role.dataScope)}</span>
                    </div>
                    <div class="muted">账号数：${role.userCount}</div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
        <div class="detail-card section" style="padding:16px">
          <h3 class="section-title">权限项</h3>
          <div class="tag-list">
            ${model.permissions.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}
          </div>
          <h3 class="section-title" style="margin-top:16px">账号列表</h3>
          <div class="timeline">
            ${model.accounts
              .map(
                (item) => `
                  <div class="timeline-item">
                    <strong>${escapeHtml(item.name)}</strong>
                    <div class="muted">${escapeHtml(item.username)} · ${escapeHtml(item.department)} · ${escapeHtml(item.dataScope)}</div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderRulesV2() {
  if (state.user.role !== "super_admin") {
    return `
      <div class="access-denied">
        <strong>当前账号没有权限访问规则配置。</strong>
        <div class="muted" style="margin-top:8px">质检规则、AI 接入和评分权重统一由超级管理员维护。</div>
      </div>
    `;
  }

  const rules = state.data.ruleConfig;
  if (!rules) return `<div class="empty-state">加载中...</div>`;

  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>规则配置</h3>
          <div class="muted">这里分成两层：确定性规则负责可解释指标，AI 负责语义判断。</div>
        </div>
      </div>

      <div class="grid two">
        <div class="detail-card section" style="padding:16px">
          <h3 class="section-title">规则质检</h3>
          <div class="stat-row"><span>响应超时阈值</span><strong>${rules.responseTimeoutSeconds} 秒</strong></div>
          <div class="stat-row"><span>人工复核阈值</span><strong>${Math.round(rules.manualReviewThreshold * 100)}%</strong></div>
          <h3 class="section-title" style="margin-top:16px">评分权重</h3>
          <div class="timeline">
            ${rules.weights
              .map(
                (item) => `
                  <div class="timeline-item">
                    <div class="button-row" style="justify-content:space-between">
                      <strong>${escapeHtml(item.name)}</strong>
                      <span>${item.weight} 分</span>
                    </div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>

        <div class="detail-card section" style="padding:16px">
          <h3 class="section-title">AI 质检接入</h3>
          <div class="button-row" style="justify-content:space-between">
            <span class="badge user">已接测试 AI Provider</span>
            <span class="badge admin">后端环境变量启用</span>
          </div>
          <div class="muted" style="margin-top:10px">后端通过 AI Provider 配置接入结构化对话模型；当前可用 DeepSeek 做测试，商业版可替换为更强模型。密钥只在后端环境变量中读取，前端不会保存密钥。</div>
          <div class="timeline" style="margin-top:12px">
            <div class="timeline-item"><strong>输入</strong><div class="muted">标准化聊天记录：时间、角色、文本内容、消息类型、媒体解析结果、会话阶段、身份匹配结果。</div></div>
            <div class="timeline-item"><strong>输出</strong><div class="muted">专业度、服务态度、满意度、潜客等级、需求标签、风险点和证据消息。</div></div>
            <div class="timeline-item"><strong>Prompt</strong><div class="muted">已写入 docs/ai-quality-prompt.md，后端接 AI 时直接使用。</div></div>
          </div>
        </div>
      </div>

      <div class="grid two" style="margin-top:14px">
        <div class="detail-card section" style="padding:16px">
          <h3 class="section-title">身份线索优先级</h3>
          <div class="tag-list">${rules.cluePriority.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>
        </div>
        <div class="detail-card section" style="padding:16px">
          <h3 class="section-title">关键词规则</h3>
          <div class="muted">风险关键词</div>
          <div class="tag-list" style="margin-top:8px">${rules.riskKeywords.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>
          <div class="muted" style="margin-top:16px">意向关键词</div>
          <div class="tag-list" style="margin-top:8px">${rules.intentKeywords.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>
        </div>
      </div>
    </section>
  `;
}

function renderRules() {
  if (state.user.role !== "super_admin") {
    return `
      <div class="access-denied">
        <strong>当前账号无权限访问规则配置。</strong>
        <div class="muted" style="margin-top:8px">质检权重、关键词和阈值统一由超级管理员维护。</div>
      </div>
    `;
  }

  const rules = state.data.ruleConfig;
  if (!rules) return `<div class="empty-state">加载中...</div>`;

  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>规则配置</h3>
          <div class="muted">质检权重、线索优先级和风险词先做成可配置项。</div>
        </div>
      </div>
      <div class="grid two">
        <div class="detail-card section" style="padding:16px">
          <div class="stat-row"><span>响应超时阈值</span><strong>${rules.responseTimeoutSeconds} 秒</strong></div>
          <div class="stat-row"><span>人工复核阈值</span><strong>${Math.round(rules.manualReviewThreshold * 100)}%</strong></div>
          <h3 class="section-title" style="margin-top:16px">评分权重</h3>
          <div class="timeline">
            ${rules.weights
              .map(
                (item) => `
                  <div class="timeline-item">
                    <div class="button-row" style="justify-content:space-between">
                      <strong>${escapeHtml(item.name)}</strong>
                      <span>${item.weight} 分</span>
                    </div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
        <div class="detail-card section" style="padding:16px">
          <h3 class="section-title">识别策略</h3>
          <div class="muted">线索优先级</div>
          <div class="tag-list" style="margin-top:8px">${rules.cluePriority.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>
          <div class="muted" style="margin-top:16px">风险关键词</div>
          <div class="tag-list" style="margin-top:8px">${rules.riskKeywords.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>
          <div class="muted" style="margin-top:16px">意向关键词</div>
          <div class="tag-list" style="margin-top:8px">${rules.intentKeywords.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>
        </div>
      </div>
    </section>
  `;
}

function renderBi() {
  const bi = state.data.biDashboard;
  if (!bi) return `<div class="empty-state">加载中...</div>`;

  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>BI 看板</h3>
          <div class="muted">汇总客服响应、质检评分、问题分类和团队排行，供管理层查看运营趋势。</div>
        </div>
      </div>
      <div class="grid two">
        <div class="chart-card section" style="padding:16px">
          <h3 class="section-title">平均评分趋势</h3>
          <div class="chart-grid">
            ${bi.scoreTrend.map((item) => chartRow(item.label, item.value, 100)).join("")}
          </div>
        </div>
        <div class="chart-card section" style="padding:16px">
          <h3 class="section-title">响应时长分布</h3>
          <div class="chart-grid">
            ${bi.responseTrend.map((item) => chartRow(item.label, item.value, 100)).join("")}
          </div>
        </div>
      </div>

      <div class="grid two" style="margin-top:14px">
        <div class="chart-card section" style="padding:16px">
          <h3 class="section-title">问题分类分布</h3>
          <div class="chart-grid">
            ${bi.questionTypes.map((item) => chartRow(item.type || item.label, item.count ?? item.value, 40)).join("")}
          </div>
        </div>
        <div class="chart-card section" style="padding:16px">
          <h3 class="section-title">客服排行</h3>
          <div class="timeline">
            ${bi.staffRanking
              .map(
                (item, index) => `
                  <div class="timeline-item">
                    <div class="button-row" style="justify-content:space-between">
                      <strong>${index + 1}. ${escapeHtml(item.name)}</strong>
                      <span class="badge user">${item.score} 分</span>
                    </div>
                    <div class="muted">会话数：${item.conversations}</div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderBiV2() {
  const bi = state.data.biDashboard;
  if (!bi) return `<div class="empty-state">加载中...</div>`;

  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>BI 看板</h3>
          <div class="muted">当前看板展示的是客服质检运营数据，不是单纯按时间堆几条柱。统计范围：${escapeHtml(bi.meta.period)}，${escapeHtml(bi.meta.scope)}。</div>
        </div>
      </div>
      <div class="grid metrics">
        ${bi.summary.map((item) => metricSummaryCard(item)).join("")}
      </div>
    </section>

    <div class="grid two">
      <section class="chart-card section" style="padding:16px">
        <h3 class="section-title">客服综合质检平均分趋势</h3>
        <div class="muted" style="margin-bottom:14px">口径：${escapeHtml(bi.meta.scoreDefinition)}</div>
        <div class="chart-grid">
          ${bi.scoreTrend
            .map(
              (item) => `
                <div class="chart-item">
                  <div class="chart-label">
                    <span>${escapeHtml(getBiTrendLabel(item))}</span>
                    <span>${escapeHtml(String(getBiTrendValue(item)))} 分</span>
                  </div>
                  <div class="bar"><span style="width:${Math.min(100, getBiTrendValue(item))}%"></span></div>
                  <div class="muted">${escapeHtml(getBiTrendMeta(item))}</div>
                </div>
              `
            )
            .join("")}
        </div>
      </section>

      <section class="chart-card section" style="padding:16px">
        <h3 class="section-title">首次有效响应时长分布</h3>
        <div class="muted" style="margin-bottom:14px">口径：${escapeHtml(bi.meta.responseDefinition)}</div>
        <div class="chart-grid">
          ${bi.responseTrend.map((item) => distributionRow(item.range, item.count, item.percentage, "场")).join("")}
        </div>
      </section>
    </div>

    <div class="grid two" style="margin-top:14px">
      <section class="chart-card section" style="padding:16px">
        <h3 class="section-title">客户问题分类分布</h3>
        <div class="muted" style="margin-bottom:14px">口径：从客户消息的文本、语音转写、图片 OCR、视频/文件描述中按园艺业务规则识别分类，一条消息可同时命中产品成活率、缓苗黄叶、光照环境、售后处理等多个类别。</div>
        <div class="chart-grid">
          ${bi.questionTypes.map((item) => distributionRow(item.type, item.count, item.percentage, "次")).join("")}
        </div>
      </section>

      <section class="chart-card section" style="padding:16px">
        <h3 class="section-title">客服质检排行</h3>
        <div class="muted" style="margin-bottom:14px">口径：按统计周期内已完成质检会话的平均综合分排序。</div>
        <div class="timeline">
          ${bi.staffRanking
            .map(
              (item, index) => `
                <div class="timeline-item">
                  <div class="button-row" style="justify-content:space-between">
                    <strong>${index + 1}. ${escapeHtml(item.name)}</strong>
                    <span class="badge user">${escapeHtml(String(getStaffRankScore(item)))} 分</span>
                  </div>
                  <div class="muted">${escapeHtml(getStaffRankMeta(item))}</div>
                </div>
              `
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function renderBiV3() {
  const bi = state.data.biDashboard;
  if (!bi) return `<div class="empty-state">加载中...</div>`;
  const view = buildBiViewModel(bi);

  return `
    <section class="panel-card section bi-control-panel">
      <div class="section-header">
        <div>
          <h3>BI 看板</h3>
          <div class="muted">按时间和人员筛选，既能看全员走势，也能单独查看某个客服在这段时间的变化。</div>
        </div>
      </div>
      ${renderBiFilters(view)}
      <div class="bi-scope-strip">
        <span>当前视角</span>
        <strong>${escapeHtml(view.scopeLabel)}</strong>
        <span>${escapeHtml(view.periodLabel)}</span>
        <span>${escapeHtml(view.latestDateLabel)}</span>
      </div>
      <div class="grid metrics bi-metric-grid">
        ${view.summary.map((item) => metricSummaryCard(item)).join("")}
      </div>
    </section>

    <div class="bi-dashboard-grid">
      <section class="chart-card section bi-trend-card">
        <div class="section-header compact">
          <div>
            <h3 class="section-title">质检分时间趋势</h3>
            <div class="muted">每个时间点同时展示当前筛选范围和全员基准，方便看变化而不是只看一个总数。</div>
          </div>
          ${renderBiTrendChange(view.trendStats)}
        </div>
        ${renderBiTrendRows(view)}
      </section>

      <section class="chart-card section bi-benchmark-card">
        <div class="section-header compact">
          <div>
            <h3 class="section-title">单人 / 全员对比</h3>
            <div class="muted">选择某个客服后，这里会直接显示他和团队同期基准的差距。</div>
          </div>
        </div>
        ${renderBiBenchmark(view)}
      </section>
    </div>

    <div class="grid two bi-secondary-grid">
      <section class="chart-card section">
        <h3 class="section-title">首次有效响应时长分布</h3>
        <div class="muted" style="margin-bottom:14px">口径：按当前筛选范围内质检记录的首次响应时长分段统计。</div>
        <div class="chart-grid">
          ${
            view.responseTrend.length
              ? view.responseTrend.map((item) => distributionRow(item.range || item.label, item.count, item.percentage, "场")).join("")
              : renderBiEmpty("当前筛选下没有响应时长记录")
          }
        </div>
      </section>

      <section class="chart-card section">
        <h3 class="section-title">客户问题分类分布</h3>
        <div class="muted" style="margin-bottom:14px">口径：从客户文本、OCR、语音转写和媒体描述中识别需求类型。</div>
        <div class="chart-grid">
          ${
            view.questionTypes.length
              ? view.questionTypes.map((item) => distributionRow(item.type || item.label, item.count, item.percentage, "次")).join("")
              : renderBiEmpty("当前筛选下没有可分类的客户问题")
          }
        </div>
      </section>
    </div>

    <section class="chart-card section bi-staff-section">
      <div class="section-header compact">
        <div>
          <h3 class="section-title">人员表现排名</h3>
          <div class="muted">排名受上方时间筛选影响；选择单人时会高亮该人员，仍保留全员对照。</div>
        </div>
      </div>
      ${renderBiStaffRanking(view)}
    </section>
  `;
}

function renderBiFilters(view) {
  return `
    <div class="bi-filter-grid">
      <div class="field">
        <label>时间范围</label>
        <select id="filter-bi-period">
          ${getBiPeriodOptions().map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>人员范围</label>
        <select id="filter-bi-owner">
          <option value="all">全部人员</option>
          ${view.ownerOptions.map((owner) => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`).join("")}
        </select>
      </div>
      <div class="bi-filter-note">
        <span>可看全员，也可单独看一个人</span>
        <strong>${escapeHtml(view.scopeLabel)} / ${escapeHtml(view.periodLabel)}</strong>
        <small>${escapeHtml(view.recordNote)}</small>
      </div>
    </div>
  `;
}

function buildBiViewModel(sourceBi = {}) {
  const allQuality = asArray(state.data.qualityResults);
  const allConversations = asArray(state.data.conversations);
  const allMessages = asArray(state.data.messages);
  const allCustomers = asArray(state.data.customerProfiles);
  const ownerOptions = getBiOwnerOptions(allQuality, allConversations, allCustomers, sourceBi);
  const period = state.filters.biPeriod || "30d";
  const anchorKey = getBiAnchorDateKey([allQuality, allConversations, allMessages, allCustomers]);
  let owner = state.filters.biOwner || "all";
  if (owner !== "all" && !ownerOptions.includes(owner)) owner = "all";

  const periodQuality = allQuality.filter((item) => isWithinBiPeriod(getBiRecordDateKey(item), period, anchorKey));
  const selectedQuality = owner === "all" ? periodQuality : periodQuality.filter((item) => normalizeBiOwner(item.owner) === owner);
  const periodConversations = allConversations.filter((item) => isWithinBiPeriod(getBiRecordDateKey(item), period, anchorKey));
  const selectedConversations = owner === "all" ? periodConversations : periodConversations.filter((item) => normalizeBiOwner(item.owner) === owner);
  const selectedMessages = getBiMessagesForScope(owner, period, anchorKey, selectedQuality, allMessages);
  const selectedStats = buildBiAggregateStats(selectedQuality, selectedConversations);
  const teamStats = buildBiAggregateStats(periodQuality, periodConversations);
  const trendRows = buildBiTrendRows(selectedQuality, periodQuality, sourceBi.scoreTrend, period);
  const questionTypes = buildBiQuestionTypes(selectedMessages, sourceBi.questionTypes);
  const responseTrend = buildBiResponseDistribution(selectedQuality, sourceBi.responseTrend);
  const staffRanking = buildBiStaffRanking(periodQuality, sourceBi.staffRanking, owner);

  return {
    period,
    owner,
    ownerOptions,
    periodLabel: getBiPeriodLabel(period),
    scopeLabel: owner === "all" ? "全部人员" : owner,
    latestDateLabel: anchorKey ? `数据截止：${anchorKey}` : "数据截止：未记录",
    recordNote: `质检 ${selectedQuality.length}/${periodQuality.length} 条 · 会话 ${selectedConversations.length}/${periodConversations.length} 场`,
    selectedStats,
    teamStats,
    trendRows,
    trendStats: buildBiTrendStats(trendRows),
    questionTypes,
    responseTrend,
    staffRanking,
    summary: buildBiSummary(selectedStats, teamStats)
  };
}

function buildBiSummary(selectedStats, teamStats) {
  return [
    {
      label: "平均质检分",
      value: formatScore(selectedStats.avgScore),
      unit: "分",
      note: `全员同期 ${formatScore(teamStats.avgScore)} 分`
    },
    {
      label: "质检会话",
      value: selectedStats.qualityCount,
      unit: "场",
      note: `筛选范围会话 ${selectedStats.conversationCount} 场`
    },
    {
      label: "人工改分",
      value: selectedStats.manualAdjusted,
      unit: "次",
      note: "改分理由可留存审计"
    },
    {
      label: "风险与超时",
      value: selectedStats.riskCount + selectedStats.timeoutCount,
      unit: "项",
      note: `风险 ${selectedStats.riskCount} · 超时 ${selectedStats.timeoutCount}`
    }
  ];
}

function renderBiTrendChange(stats) {
  if (!stats || stats.change === null) return `<span class="badge admin">趋势待积累</span>`;
  const tone = stats.change >= 0 ? "user" : "danger";
  const prefix = stats.change > 0 ? "+" : "";
  return `<span class="badge ${tone}">${prefix}${formatScore(stats.change)} 分 / 时间变化</span>`;
}

function renderBiTrendRows(view) {
  if (!view.trendRows.length) return renderBiEmpty("当前时间和人员范围下暂无趋势数据");
  const selectedLabel = view.owner === "all" ? "全员" : view.scopeLabel;
  return `
    <div class="bi-trend-list">
      ${view.trendRows
        .map((row) => {
          const selectedValue = row.selectedAvg === null ? 0 : row.selectedAvg;
          const teamValue = row.teamAvg === null ? 0 : row.teamAvg;
          const delta = row.selectedAvg === null || row.teamAvg === null ? null : Math.round((row.selectedAvg - row.teamAvg) * 10) / 10;
          const deltaTone = delta === null ? "admin" : delta >= 0 ? "user" : "danger";
          return `
            <div class="bi-trend-row">
              <div class="bi-trend-date">
                <strong>${escapeHtml(row.label)}</strong>
                <span>${escapeHtml(selectedLabel)} ${row.selectedCount} 场 / 全员 ${row.teamCount} 场</span>
              </div>
              <div class="bi-trend-bars">
                <div class="bi-bar-line">
                  <span>${escapeHtml(selectedLabel)}</span>
                  <div class="bar"><span style="width:${clampPercent(selectedValue)}%"></span></div>
                  <strong>${row.selectedAvg === null ? "-" : formatScore(row.selectedAvg)}</strong>
                </div>
                <div class="bi-bar-line team">
                  <span>全员基准</span>
                  <div class="bar"><span style="width:${clampPercent(teamValue)}%"></span></div>
                  <strong>${row.teamAvg === null ? "-" : formatScore(row.teamAvg)}</strong>
                </div>
              </div>
              <span class="badge ${deltaTone}">${delta === null ? "无对比" : `${delta > 0 ? "+" : ""}${formatScore(delta)}`}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderBiBenchmark(view) {
  const selected = view.selectedStats;
  const team = view.teamStats;
  const scoreDelta = selected.avgScore === null || team.avgScore === null ? null : Math.round((selected.avgScore - team.avgScore) * 10) / 10;
  const responseDelta =
    selected.avgFirstResponseSeconds === null || team.avgFirstResponseSeconds === null
      ? null
      : Math.round((selected.avgFirstResponseSeconds - team.avgFirstResponseSeconds) * 10) / 10;

  return `
    <div class="bi-benchmark-grid">
      <div class="bi-benchmark-tile primary">
        <span>${escapeHtml(view.scopeLabel)}</span>
        <strong>${formatScore(selected.avgScore)}</strong>
        <small>质检 ${selected.qualityCount} 场</small>
      </div>
      <div class="bi-benchmark-tile">
        <span>全员同期</span>
        <strong>${formatScore(team.avgScore)}</strong>
        <small>质检 ${team.qualityCount} 场</small>
      </div>
      <div class="bi-benchmark-tile ${scoreDelta !== null && scoreDelta < 0 ? "danger" : ""}">
        <span>分差</span>
        <strong>${scoreDelta === null ? "-" : `${scoreDelta > 0 ? "+" : ""}${formatScore(scoreDelta)}`}</strong>
        <small>和全员基准比</small>
      </div>
    </div>
    <div class="bi-benchmark-list">
      ${renderBiBenchmarkLine("客观分", selected.avgObjectiveScore, team.avgObjectiveScore, "分")}
      ${renderBiBenchmarkLine("AI 语义分", selected.avgAiScore, team.avgAiScore, "分")}
      ${renderBiBenchmarkLine("平均首响应", selected.avgFirstResponseSeconds, team.avgFirstResponseSeconds, "秒", true)}
      ${renderBiBenchmarkLine("人工改分", selected.manualAdjusted, team.manualAdjusted, "次")}
      ${renderBiBenchmarkLine("风险项", selected.riskCount, team.riskCount, "项")}
      ${responseDelta === null ? "" : `<div class="muted">响应时长与全员相差 ${responseDelta > 0 ? "+" : ""}${formatScore(responseDelta)} 秒，负数表示更快。</div>`}
    </div>
  `;
}

function renderBiBenchmarkLine(label, selectedValue, teamValue, unit, lowerIsBetter = false) {
  const selectedNumber = numericOrNull(selectedValue);
  const teamNumber = numericOrNull(teamValue);
  const max = Math.max(selectedNumber || 0, teamNumber || 0, 1);
  const delta = selectedNumber === null || teamNumber === null ? null : Math.round((selectedNumber - teamNumber) * 10) / 10;
  const positive = lowerIsBetter ? delta !== null && delta <= 0 : delta !== null && delta >= 0;
  return `
    <div class="bi-benchmark-line">
      <div>
        <strong>${escapeHtml(label)}</strong>
        <span>${delta === null ? "无对比" : `差值 ${delta > 0 ? "+" : ""}${formatScore(delta)}${unit}`}</span>
      </div>
      <div class="bi-dual-bars">
        <div class="bar"><span style="width:${clampPercent(((selectedNumber || 0) / max) * 100)}%"></span></div>
        <div class="bar team"><span style="width:${clampPercent(((teamNumber || 0) / max) * 100)}%"></span></div>
      </div>
      <span class="badge ${delta === null ? "admin" : positive ? "user" : "danger"}">${selectedNumber === null ? "-" : `${formatScore(selectedNumber)}${unit}`}</span>
    </div>
  `;
}

function renderBiStaffRanking(view) {
  if (!view.staffRanking.length) return renderBiEmpty("当前时间范围下暂无人员质检排名");
  return `
    <div class="bi-staff-list">
      ${view.staffRanking
        .map(
          (item, index) => `
            <div class="bi-staff-row ${item.active ? "active" : ""}">
              <div class="bi-rank">${index + 1}</div>
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.meta)}</span>
              </div>
              <div class="bi-staff-score">${escapeHtml(formatScore(item.avgScore))}<span>分</span></div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderBiEmpty(text) {
  return `<div class="empty-state bi-empty">${escapeHtml(text)}</div>`;
}

function getBiPeriodOptions() {
  return [
    { value: "7d", label: "近 7 天" },
    { value: "30d", label: "近 30 天" },
    { value: "90d", label: "近 90 天" },
    { value: "all", label: "全部时间" }
  ];
}

function getBiPeriodLabel(period) {
  return getBiPeriodOptions().find((item) => item.value === period)?.label || "近 30 天";
}

function getBiOwnerOptions(qualityResults, conversations, customers, sourceBi = {}) {
  const values = [
    ...asArray(qualityResults).map((item) => item.owner),
    ...asArray(conversations).map((item) => item.owner),
    ...asArray(customers).map((item) => item.owner),
    ...asArray(sourceBi.staffRanking).map((item) => item.name)
  ]
    .map(normalizeBiOwner)
    .filter(Boolean)
    .filter((item) => item !== "未分配");
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function normalizeBiOwner(value) {
  return String(value || "").trim();
}

function getBiRecordDateKey(item = {}) {
  return (
    item.qualityDateKey ||
    item.conversationDateKey ||
    normalizeDateKey(
      item.createdAt ||
        item.reviewedAt ||
        item.updatedAt ||
        item.conversationLastMessageAt ||
        item.conversationStartedAt ||
        item.lastMessageAt ||
        item.startedAt ||
        item.sentAt ||
        item.lastActiveAt
    )
  );
}

function getBiAnchorDateKey(groups = []) {
  const keys = groups
    .flatMap((group) => asArray(group))
    .map(getBiRecordDateKey)
    .filter(Boolean)
    .sort();
  const todayKey = normalizeDateKey(new Date().toISOString());
  const dataKey = keys[keys.length - 1] || "";
  return [todayKey, dataKey].filter(Boolean).sort().pop() || "";
}

function isWithinBiPeriod(dateKey, period, anchorKey) {
  if (period === "all") return true;
  if (!dateKey || !anchorKey) return false;
  const days = { "7d": 7, "30d": 30, "90d": 90 }[period] || 30;
  const anchor = parseBiDateKey(anchorKey);
  if (!anchor) return false;
  const start = new Date(anchor);
  start.setDate(start.getDate() - days + 1);
  const startKey = formatBiDateKey(start);
  return dateKey >= startKey && dateKey <= anchorKey;
}

function parseBiDateKey(key) {
  const match = String(key || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatBiDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getBiMessagesForScope(owner, period, anchorKey, selectedQuality, allMessages) {
  const nestedMessages = selectedQuality.flatMap((item) => asArray(item.messages));
  const source = nestedMessages.length || owner !== "all" ? nestedMessages : asArray(allMessages);
  return source.filter((item) => isWithinBiPeriod(getBiRecordDateKey(item), period, anchorKey));
}

function buildBiAggregateStats(qualityRecords, conversations) {
  const records = asArray(qualityRecords);
  const scores = records.map((item) => numericOrNull(item.finalScore ?? item.totalScore)).filter((value) => value !== null);
  const objectiveScores = records.map((item) => numericOrNull(item.objectiveScore)).filter((value) => value !== null);
  const aiScores = records.map((item) => numericOrNull(item.aiScore)).filter((value) => value !== null);
  const firstResponses = records
    .map((item) => numericOrNull(item.responseTime?.firstResponseSeconds ?? item.objectiveMetrics?.first_response_seconds))
    .filter((value) => value !== null);
  const manualAdjusted = records.filter((item) => item.status === "manual_adjusted" || item.manualAdjustReason).length;
  const riskCount = records.reduce((total, item) => total + asArray(item.risks).length, 0);
  const timeoutCount = firstResponses.filter((seconds) => seconds > 180).length;

  return {
    qualityCount: records.length,
    conversationCount: new Set([
      ...records.map((item) => item.conversationId).filter(Boolean),
      ...asArray(conversations).map((item) => item.id).filter(Boolean)
    ]).size,
    avgScore: averageBiNumbers(scores),
    avgObjectiveScore: averageBiNumbers(objectiveScores),
    avgAiScore: averageBiNumbers(aiScores),
    avgFirstResponseSeconds: averageBiNumbers(firstResponses),
    manualAdjusted,
    riskCount,
    timeoutCount
  };
}

function averageBiNumbers(values) {
  const safeValues = asArray(values).filter((value) => Number.isFinite(Number(value)));
  if (!safeValues.length) return null;
  return Math.round((safeValues.reduce((sum, value) => sum + Number(value), 0) / safeValues.length) * 10) / 10;
}

function buildBiTrendRows(selectedRecords, teamRecords, sourceTrend = [], period = "30d") {
  if (!asArray(teamRecords).length && asArray(sourceTrend).length) {
    return asArray(sourceTrend)
      .map((item) => ({
        label: getBiTrendLabel(item),
        selectedAvg: getBiTrendValue(item),
        teamAvg: getBiTrendValue(item),
        selectedCount: item.inspectedConversations ?? item.count ?? 0,
        teamCount: item.inspectedConversations ?? item.count ?? 0
      }))
      .slice(-getBiTrendLimit(period));
  }

  const selectedByDate = groupBiQualityByDate(selectedRecords);
  const teamByDate = groupBiQualityByDate(teamRecords);
  const dateKeys = [...new Set([...selectedByDate.keys(), ...teamByDate.keys()])].sort();
  return dateKeys
    .map((key) => {
      const selectedItems = selectedByDate.get(key) || [];
      const teamItems = teamByDate.get(key) || [];
      return {
        key,
        label: formatBiTrendDate(key),
        selectedAvg: averageBiNumbers(selectedItems.map((item) => item.finalScore ?? item.totalScore)),
        teamAvg: averageBiNumbers(teamItems.map((item) => item.finalScore ?? item.totalScore)),
        selectedCount: selectedItems.length,
        teamCount: teamItems.length
      };
    })
    .slice(-getBiTrendLimit(period));
}

function groupBiQualityByDate(records) {
  const groups = new Map();
  asArray(records).forEach((item) => {
    const key = getBiRecordDateKey(item);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
}

function getBiTrendLimit(period) {
  if (period === "7d") return 7;
  if (period === "90d") return 13;
  if (period === "all") return 16;
  return 12;
}

function formatBiTrendDate(key) {
  if (!key) return "未知日期";
  const [, month, day] = key.split("-");
  return `${month}-${day}`;
}

function buildBiTrendStats(rows) {
  const valid = asArray(rows).filter((item) => item.selectedAvg !== null && item.selectedAvg !== undefined);
  if (valid.length < 2) return { change: null };
  const first = valid[0].selectedAvg;
  const last = valid[valid.length - 1].selectedAvg;
  return { change: Math.round((last - first) * 10) / 10 };
}

function buildBiQuestionTypes(messages, fallback = []) {
  const texts = asArray(messages)
    .filter((item) => item.normalizedRole === "customer" || item.role === "customer" || !item.normalizedRole)
    .map(messageDisplayText)
    .filter(Boolean);
  if (!texts.length) return normalizeBiDistribution(fallback, "type");

  const counts = new Map();
  texts.forEach((text) => {
    let hit = false;
    getBiTopicRules().forEach((rule) => {
      if (rule.keywords.some((keyword) => text.includes(keyword))) {
        counts.set(rule.type, (counts.get(rule.type) || 0) + 1);
        hit = true;
      }
    });
    if (!hit) counts.set("其他问题", (counts.get("其他问题") || 0) + 1);
  });

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count, percentage: total ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
}

function getBiTopicRules() {
  return [
    { type: "产品效果", keywords: ["效果", "成活", "多久", "改善", "长势"] },
    { type: "价格套餐", keywords: ["价格", "多少钱", "优惠", "套餐", "付款", "下单"] },
    { type: "售后保障", keywords: ["售后", "退款", "没效果", "保障", "投诉"] },
    { type: "养护方法", keywords: ["怎么用", "使用", "养护", "浇水", "方法"] },
    { type: "品种搭配", keywords: ["品种", "搭配", "适合", "推荐", "选哪"] },
    { type: "身份 / 订单", keywords: ["ID", "订单", "淘宝", "微信", "手机"] }
  ];
}

function buildBiResponseDistribution(records, fallback = []) {
  const ranges = [
    { range: "0-1分钟", min: 0, max: 60 },
    { range: "1-3分钟", min: 61, max: 180 },
    { range: "3-10分钟", min: 181, max: 600 },
    { range: "10分钟以上", min: 601, max: Infinity },
    { range: "未记录", unknown: true }
  ];
  const counts = new Map(ranges.map((item) => [item.range, 0]));
  asArray(records).forEach((item) => {
    const seconds = numericOrNull(item.responseTime?.firstResponseSeconds ?? item.objectiveMetrics?.first_response_seconds);
    const matched =
      seconds === null
        ? ranges.find((range) => range.unknown)
        : ranges.find((range) => !range.unknown && seconds >= range.min && seconds <= range.max);
    counts.set(matched.range, (counts.get(matched.range) || 0) + 1);
  });
  const total = asArray(records).length;
  if (!total) return normalizeBiDistribution(fallback, "range");
  return ranges
    .map((range) => ({
      range: range.range,
      count: counts.get(range.range) || 0,
      percentage: total ? Math.round(((counts.get(range.range) || 0) / total) * 100) : 0
    }))
    .filter((item) => item.count > 0);
}

function normalizeBiDistribution(items, labelKey) {
  const total = asArray(items).reduce((sum, item) => sum + Number(item.count ?? item.value ?? 0), 0);
  return asArray(items)
    .map((item) => {
      const count = Number(item.count ?? item.value ?? 0);
      return {
        ...item,
        [labelKey]: item[labelKey] || item.type || item.range || item.label || "未分类",
        count,
        percentage: item.percentage ?? (total ? Math.round((count / total) * 100) : 0)
      };
    })
    .filter((item) => Number(item.count) > 0);
}

function buildBiStaffRanking(periodQuality, fallback = [], selectedOwner = "all") {
  if (!asArray(periodQuality).length) {
    return asArray(fallback).map((item) => ({
      name: item.name,
      avgScore: getStaffRankScore(item),
      active: selectedOwner !== "all" && item.name === selectedOwner,
      meta: getStaffRankMeta(item)
    }));
  }
  const groups = new Map();
  asArray(periodQuality).forEach((item) => {
    const owner = normalizeBiOwner(item.owner) || "未分配";
    if (!groups.has(owner)) groups.set(owner, []);
    groups.get(owner).push(item);
  });
  const rows = [...groups.entries()]
    .map(([name, records]) => {
      const stats = buildBiAggregateStats(records, []);
      return {
        name,
        avgScore: stats.avgScore,
        active: selectedOwner !== "all" && name === selectedOwner,
        meta: `质检 ${stats.qualityCount} 场 · 客观分 ${formatScore(stats.avgObjectiveScore)} · AI 分 ${formatScore(stats.avgAiScore)} · 风险 ${stats.riskCount}`
      };
    })
    .sort((a, b) => Number(b.avgScore || 0) - Number(a.avgScore || 0));
  if (selectedOwner !== "all" && !rows.some((item) => item.name === selectedOwner)) {
    rows.push({
      name: selectedOwner,
      avgScore: null,
      active: true,
      meta: "当前时间范围暂无质检记录"
    });
  }
  return rows;
}

function metricSummaryCard(item) {
  return `
    <div class="metric-card">
      <div class="metric-title">${escapeHtml(item.label || "指标")}</div>
      <div class="metric-value">${escapeHtml(String(item.value ?? "-"))}<span style="font-size:14px;font-weight:600;margin-left:4px">${escapeHtml(item.unit || "")}</span></div>
      <div class="metric-trend muted">${escapeHtml(item.note || "暂无说明")}</div>
    </div>
  `;
}

function getBiTrendLabel(item) {
  const primary = item?.date || item?.label || item?.range || item?.type || "未命名";
  const secondary = item?.weekday ? ` ${item.weekday}` : "";
  return `${primary}${secondary}`.trim();
}

function getBiTrendValue(item) {
  const value = numericOrNull(item?.avgScore ?? item?.value ?? item?.count);
  return value === null ? 0 : value;
}

function getBiTrendMeta(item) {
  const parts = [];
  if (Number.isFinite(Number(item?.inspectedConversations))) {
    parts.push(`已质检 ${item.inspectedConversations} 场`);
  }
  if (Number.isFinite(Number(item?.timeoutRate))) {
    parts.push(`超时会话占比 ${item.timeoutRate}%`);
  }
  if (Number.isFinite(Number(item?.percentage)) && item?.count !== undefined) {
    const unit = item.range ? "场" : item.type ? "次" : "项";
    parts.push(`${item.count}${unit} · ${item.percentage}%`);
  }
  return parts.length ? parts.join(" · ") : "暂无更多说明";
}

function getStaffRankScore(item) {
  const score = numericOrNull(item?.avgScore ?? item?.score);
  return score === null ? "-" : score;
}

function getStaffRankMeta(item) {
  const conversations = item?.inspectedConversations ?? item?.conversations;
  const firstResponse = item?.avgFirstResponseSeconds;
  const highIntent = item?.highIntentCustomers;
  const parts = [];
  if (conversations !== undefined) parts.push(`质检会话：${conversations} 场`);
  if (firstResponse !== undefined) parts.push(`平均首次响应：${firstResponse} 秒`);
  if (highIntent !== undefined) parts.push(`高意向客户：${highIntent} 人`);
  return parts.length ? parts.join(" · ") : "暂无更多说明";
}

function distributionRow(label, count, percentage, unit) {
  const safeCount = count ?? 0;
  const safePercentage = percentage ?? 0;
  return `
    <div class="chart-item">
      <div class="chart-label">
        <span>${escapeHtml(label || "未分类")}</span>
        <span>${safeCount}${escapeHtml(unit)} · ${safePercentage}%</span>
      </div>
      <div class="bar"><span style="width:${Math.min(100, safePercentage)}%"></span></div>
    </div>
  `;
}

function chartRow(label, value, max) {
  return `
    <div class="chart-item">
      <div class="chart-label"><span>${escapeHtml(label)}</span><span>${value}</span></div>
      <div class="bar"><span style="width:${Math.min(100, (value / max) * 100)}%"></span></div>
    </div>
  `;
}

function stepHint(step) {
  const hints = {
    数据接入: "保留原始来源，后面可重放。",
    消息标准化: "统一 time / role / content / message_type / media / source 字段。",
    身份归一: "从聊天线索里匹配淘宝与微信的人。",
    会话链路: "把零散消息拼成完整客户沟通路径。",
    质检评分: "算响应速度、专业度和风险扣分。",
    客户画像: "沉淀意向、满意度和需求标签。",
    BI看板: "给管理层看趋势和异常。",
    授权消息: "只展示当前账号可查看的数据范围。",
    身份复核: "核对淘宝、微信和客户身份线索是否一致。",
    人工备注: "记录质检员判断依据和复盘建议。",
    提交结果: "保存评分结论，供管理层复盘。",
    客户接入: "汇总客户从淘宝、微信进入咨询的第一触点。",
    问题识别: "识别客户关注的效果、养护、售后和价格问题。",
    回复承接: "检查客服是否承接问题并给出可执行答复。",
    转接协同: "记录客服、售后、园艺顾问之间的协同过程。",
    跟进闭环: "确认客户意向、满意度和后续待办是否落地。"
  };
  return hints[step] || "按当前业务规则继续补充评测说明。";
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function render() {
  if (!state.user) {
    loginView();
    if (state.toast) renderToast();
    else removeToast();
    return;
  }

  app.innerHTML = `
    <div class="app-shell">
      ${appView()}
    </div>
  `;

  bindFilters();
  if (state.toast) renderToast();
  else removeToast();
}

function bindFilters() {
  const platform = document.getElementById("filter-platform");
  const role = document.getElementById("filter-role");
  const qualityOwner = document.getElementById("filter-quality-owner");
  const qualityDate = document.getElementById("filter-quality-date");
  const qualityStatus = document.getElementById("filter-quality-status");
  const qualityQuery = document.getElementById("filter-quality-query");
  const biPeriod = document.getElementById("filter-bi-period");
  const biOwner = document.getElementById("filter-bi-owner");
  if (platform) {
    platform.value = state.filters.platform;
    platform.addEventListener("change", (event) => {
      state.filters.platform = event.target.value;
      render();
    });
  }
  if (role) {
    role.value = state.filters.role;
    role.addEventListener("change", (event) => {
      state.filters.role = event.target.value;
      render();
    });
  }
  if (qualityOwner) {
    qualityOwner.value = state.filters.qualityOwner;
    qualityOwner.addEventListener("change", (event) => {
      state.filters.qualityOwner = event.target.value;
      render();
    });
  }
  if (qualityDate) {
    qualityDate.value = state.filters.qualityDate;
    qualityDate.addEventListener("change", (event) => {
      state.filters.qualityDate = event.target.value;
      render();
    });
  }
  if (qualityStatus) {
    qualityStatus.value = state.filters.qualityStatus;
    qualityStatus.addEventListener("change", (event) => {
      state.filters.qualityStatus = event.target.value;
      render();
    });
  }
  if (qualityQuery) {
    qualityQuery.value = state.filters.qualityQuery;
    qualityQuery.addEventListener("change", (event) => {
      state.filters.qualityQuery = event.target.value;
      render();
    });
  }
  if (biPeriod) {
    biPeriod.value = state.filters.biPeriod;
    biPeriod.addEventListener("change", (event) => {
      state.filters.biPeriod = event.target.value;
      render();
    });
  }
  if (biOwner) {
    biOwner.value = state.filters.biOwner;
    biOwner.addEventListener("change", (event) => {
      state.filters.biOwner = event.target.value;
      render();
    });
  }
}

function renderToast() {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = state.toast;
  if (!state.toast) {
    toast.remove();
  }
}

function renderLoadingOverlay() {
  return `
    <div class="loading-overlay">
      <div class="loading-card">
        <div class="spinner"></div>
        <div>
          <strong>正在刷新数据</strong>
          <div class="muted">同步聊天记录、质检结果和权限配置</div>
        </div>
      </div>
    </div>
  `;
}

function removeToast() {
  const toast = document.querySelector(".toast");
  if (toast) toast.remove();
}
