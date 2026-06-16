import {
  getBiDashboard,
  getConversations,
  getCustomerProfiles,
  getDemoUsers,
  getIdentityReviewTasks,
  getMessages,
  getOverview,
  getPermissionModel,
  getQualityResults,
  evaluateQualityWithAi,
  getRuleConfig,
  getSyncStatus,
  login,
  createAccountRequest
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
  selectedIdentityReviewId: null,
  filters: {
    platform: "all",
    role: "all"
  },
  accountModalOpen: false,
  pendingAccountRequests: [],
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
  service_user: [
    { id: "dashboard", label: "总览看板" },
    { id: "messages", label: "聊天记录" },
    { id: "conversations", label: "会话链路" },
    { id: "customers", label: "客户画像" }
  ]
};

const roleLabel = {
  super_admin: "超级管理员",
  quality_user: "质检员",
  service_user: "客服"
};

init();

function readSession() {
  try {
    const raw = localStorage.getItem(sessionKey);
    return normalizeUserSession(raw ? JSON.parse(raw) : null);
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
    return localStorage.getItem(sidebarCollapsedKey) === "true";
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

  await loadData();
  state.view = getDefaultView(state.user.role);
  state.selectedConversationId = state.data.conversations[0]?.id || null;
  state.selectedIdentityReviewId = state.data.identityReviewTasks[0]?.id || null;
  render();
  bindGlobalEvents();
}

function getDefaultView(role) {
  const first = menuByRole[role]?.[0];
  return first ? first.id : "dashboard";
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
  const canQuality = role === "super_admin" || role === "quality_user";
  const payload = await Promise.all([
    getOverview(role),
    canAdmin ? getSyncStatus() : Promise.resolve(null),
    getMessages(),
    canQuality ? getIdentityReviewTasks() : Promise.resolve([]),
    getConversations(),
    canQuality ? getQualityResults() : Promise.resolve([]),
    getCustomerProfiles(),
    canAdmin ? getPermissionModel() : Promise.resolve({ roles: [], permissions: [], accounts: [] }),
    canAdmin ? getRuleConfig() : Promise.resolve(null),
    canQuality ? getBiDashboard() : Promise.resolve(null)
  ]);

  [
    state.data.overview,
    state.data.syncStatus,
    state.data.messages,
    state.data.identityReviewTasks,
    state.data.conversations,
    state.data.qualityResults,
    state.data.customerProfiles,
    state.data.permissionModel,
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
        <div>
          <div class="brand-mark">
            <div class="brand-badge">质</div>
            <span>客服质检项目</span>
          </div>
          <h1 class="hero-title">淘宝与微信客服链路质检、身份归一与客户画像的一体化系统</h1>
          <p class="hero-copy">当前项目先落地核心骨架：数据接入占位、聊天记录标准化、身份匹配、会话串联、质检评分、客户分析和权限控制。等你的数据库接口准备好，只需要替换后端数据源即可继续往前走。</p>
        </div>
        <div class="hero-points">
          <div class="hero-point">身份线索从聊天记录中抽取，而不是只依赖平台账号。</div>
          <div class="hero-point">超级管理员与普通用户登录后进入不同工作台。</div>
          <div class="hero-point">质检规则、评分权重、权限下放都先预留。</div>
          <div class="hero-point">支持后续接入真实数据库 API、工单和 BI。</div>
        </div>
      </section>

      <section class="login-panel">
        <div class="login-card panel-card">
          <h2>登录系统</h2>
          <p class="muted">先用内置演示账号进入。后续可替换成你自己的认证服务。</p>
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
          <h2>演示账号</h2>
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
  await loadData();
  state.view = getDefaultView(state.user.role);
  state.selectedConversationId = state.data.conversations[0]?.id || null;
  state.selectedIdentityReviewId = state.data.identityReviewTasks[0]?.id || null;
  render();
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
    const reviewId = trigger.dataset.reviewId;

    if (view) {
      state.view = view;
      render();
      return;
    }

    if (action === "logout") {
      clearSession();
      state.user = null;
      state.view = "dashboard";
      render();
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
      render();
      const conversation = findConversation(conversationId);
      setToast(conversation ? `已切换到 ${conversation.customerName} 的会话详情` : "已切换会话详情");
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
      state.view = canAccessView("quality") ? "quality" : "customers";
      const conversation = findConversation(conversationId);
      render();
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

    if (action === "run-ai-quality") {
      runAiQualityEvaluation().catch(() => setToast("AI 质检调用失败，请检查后端服务"));
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
    setToast(state.aiEvaluation.ok ? "AI 质检完成" : "AI 质检未完成，请查看配置提示");
  } finally {
    state.loading = false;
    render();
  }
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

  const record = result.record || {};
  state.pendingAccountRequests.unshift({
    id: record.id || `pending_${Date.now()}`,
    name,
    username,
    department,
    role,
    dataScope,
    status: "待写入云数据库",
    createdAt: record.createdAt ? new Date(record.createdAt).toLocaleString("zh-CN") : new Date().toLocaleString("zh-CN")
  });
  state.accountModalOpen = false;
  setToast("账号申请已生成，等待后端写入云数据库");
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
          <span>客服质检系统</span>
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
            <div class="muted">当前工作台</div>
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
      return renderBiV2();
    case "dashboard":
    default:
      return renderDashboard();
  }
}

function renderDashboard() {
  const overview = state.data.overview;
  if (!overview) return `<div class="empty-state">加载中...</div>`;
  const visuals = buildDashboardVisuals();

  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>${escapeHtml(overview.roleName)}</h3>
          <div class="muted">项目主流程、关键指标和下一步工作在这里汇总。</div>
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
          <div class="muted">从聊天记录进入系统后的标准处理链路。</div>
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
          <div class="timeline-item"><strong>第三步</strong><div class="muted">接真实数据库 API 后，替换 mock 数据层即可继续开发。</div></div>
        </div>
      </section>

      <section class="panel-card section">
        <div class="section-header">
          <h3>当前状态</h3>
        </div>
        <div class="stats-list">
          <div class="stat-row"><span>数据接入</span><span class="badge warn">占位</span></div>
          <div class="stat-row"><span>身份统一</span><span class="badge user">可演示</span></div>
          <div class="stat-row"><span>质检规则</span><span class="badge user">可配置</span></div>
          <div class="stat-row"><span>权限体系</span><span class="badge admin">已预留</span></div>
        </div>
      </section>
    </div>
  `;
}

function renderSync() {
  const sync = state.data.syncStatus;
  if (!sync) return `<div class="empty-state">加载中...</div>`;
  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>数据接入状态</h3>
          <div class="muted">数据库接口还没接入时，这里先展示接口占位与同步要求。</div>
        </div>
      </div>
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
                    <td><span class="badge warn">${escapeHtml(item.status)}</span></td>
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
  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>会话链路</h3>
          <div class="muted">把淘宝咨询、微信群进群、答疑和跟进串起来。</div>
        </div>
      </div>
      ${renderConversationVisualSection(visual)}
      <div class="split">
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
                  <div class="button-row">
                    <button class="btn ghost small" data-action="select-conversation" data-conversation-id="${escapeHtml(item.id)}">查看详情</button>
                    <button class="btn primary small" data-action="set-conversation-default" data-conversation-id="${escapeHtml(item.id)}">进入质检</button>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="detail-card section" style="padding:16px">
          <h3 class="section-title">${escapeHtml(selected.customerName)}</h3>
          <div class="muted">会话ID：${escapeHtml(selected.id)} · 状态：${escapeHtml(selected.status)}</div>
          ${renderConversationFlow(selected)}
          <div class="timeline" style="margin-top:14px">
            ${selected.timeline.map((item) => `<div class="timeline-item">${escapeHtml(item)}</div>`).join("")}
          </div>
          <div style="margin-top:16px">
            <div class="muted">参与人员</div>
            <div class="tag-list" style="margin-top:8px">${selected.participants.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>
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

function renderQuality() {
  const result = state.data.qualityResults[0];
  if (!result) return `<div class="empty-state">暂无质检结果</div>`;
  const viewMeta = getQualityViewMeta();
  const scoreComposition = getScoreComposition(result, state.aiEvaluation);
  const objectiveDimensions = getObjectiveDimensions(result);
  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>${escapeHtml(viewMeta.title)}</h3>
          <div class="muted">${escapeHtml(viewMeta.description)}</div>
        </div>
        <div class="button-row">
          <span class="badge warn">${escapeHtml(result.status)}</span>
          <button class="btn primary small" data-action="run-ai-quality">${escapeHtml(viewMeta.buttonLabel)}</button>
        </div>
      </div>
      ${renderScoreComposition(scoreComposition)}
      ${renderAiTracePanel(result, scoreComposition, state.aiEvaluation)}
      <div class="grid two">
        <div class="detail-card section" style="padding:16px">
          <div class="metric-title">客观规则分明细</div>
          <div class="metric-value">${formatScore(scoreComposition.objective.score)}<span>/40</span></div>
          <div class="muted">会话：${escapeHtml(result.conversationId)} · 客户：${escapeHtml(result.customerName)} · 负责人：${escapeHtml(result.owner)}</div>
          <div class="stats-list" style="margin-top:16px">
            ${objectiveDimensions
              .map(
                (item) => `
                  <div>
                    <div class="stat-row">
                      <span>${escapeHtml(item.name)}</span>
                      <span>${item.score}/${item.max}</span>
                    </div>
                    <div class="progress"><span style="width:${(item.score / item.max) * 100}%"></span></div>
                    <div class="muted" style="margin-top:4px">${escapeHtml(item.reason)}</div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
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
      ${state.aiEvaluation ? renderAiEvaluationPanel(state.aiEvaluation) : ""}
    </section>
  `;
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
  const objectiveRaw = sumDimensions(result, ["响应", "流程"]);
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
  const storedAiScore = numericOrNull(result?.aiScore);
  if (storedAiScore !== null) {
    return { score: storedAiScore, max: 60, sourceText: "来自数据库已保存的 AI 质检分。" };
  }

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
          <span class="badge warn">${escapeHtml(ai.model || "deepseek-v4-pro")}</span>
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
        <span class="badge user">${escapeHtml(ai.model || "deepseek-v4-pro")}</span>
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
  const profiles = state.data.customerProfiles;
  return `
    <section class="panel-card section">
      <div class="section-header">
        <div>
          <h3>客户画像</h3>
          <div class="muted">从聊天内容、交互频率和意向关键词形成标签与分层。</div>
        </div>
      </div>
      <div class="grid three">
        ${profiles
          .map(
            (item) => `
              <div class="detail-card section" style="padding:16px">
                <div class="button-row" style="justify-content:space-between">
                  <strong>${escapeHtml(item.name)}</strong>
                  <span class="badge ${item.intentLevel === "高意向" ? "user" : "warn"}">${escapeHtml(item.intentLevel)}</span>
                </div>
                <div class="muted" style="margin-top:8px">淘宝ID：${escapeHtml(item.taobaoId)}</div>
                <div class="muted">微信ID：${escapeHtml(item.wechatId)}</div>
                <div class="muted">满意度：${escapeHtml(item.satisfaction)}</div>
                <div class="tag-list" style="margin-top:10px">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
                <div class="timeline" style="margin-top:14px">
                  ${item.needs.map((need) => `<div class="timeline-item">${escapeHtml(need)}</div>`).join("")}
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
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

      <div class="grid two">
        <div class="detail-card section" style="padding:16px">
          <h3 class="section-title">角色说明</h3>
          <div class="timeline">
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
        </div>

        <div class="detail-card section" style="padding:16px">
          <h3 class="section-title">可见范围与可做事项</h3>
          <div class="permission-groups">
            ${businessPermissions
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
          <div class="cloud-box">
            <div class="button-row" style="justify-content:space-between">
              <strong>云数据库接入状态</strong>
              <span class="badge warn">待配置</span>
            </div>
            <div class="muted" style="margin-top:8px">后端会把账号、角色、权限写入云数据库。前端这里只发申请，不直接保存密码或连接信息。</div>
            <div class="tag-list" style="margin-top:10px">
              <span class="tag">数据库地址</span>
              <span class="tag">库名</span>
              <span class="tag">只读账号</span>
              <span class="tag">业务写入账号</span>
              <span class="tag">账号状态表</span>
            </div>
          </div>
        </div>
      </div>

      <div class="grid two" style="margin-top:14px">
        <div class="detail-card section" style="padding:16px">
          <h3 class="section-title">账号列表</h3>
          <div class="timeline">
            ${model.accounts
              .map(
                (item) => `
                  <div class="timeline-item">
                    <div class="button-row" style="justify-content:space-between">
                      <strong>${escapeHtml(item.name)}</strong>
                      <span class="badge ${item.role === "super_admin" ? "admin" : "user"}">${escapeHtml(roleNameByKey(item.role))}</span>
                    </div>
                    <div class="muted" style="margin-top:6px">${escapeHtml(item.username)} · ${escapeHtml(item.department)} · ${escapeHtml(scopeLabel(item.dataScope))}</div>
                    <div class="muted">状态：正常</div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>

        <div class="detail-card section" style="padding:16px">
          <h3 class="section-title">待开通账号</h3>
          ${state.pendingAccountRequests.length
            ? `<div class="timeline">
                ${state.pendingAccountRequests
                  .map(
                    (item) => `
                      <div class="timeline-item">
                        <div class="button-row" style="justify-content:space-between">
                          <strong>${escapeHtml(item.name)}</strong>
                          <span class="badge warn">${escapeHtml(item.status)}</span>
                        </div>
                        <div class="muted" style="margin-top:6px">${escapeHtml(item.username)} · ${escapeHtml(item.department)} · ${escapeHtml(roleNameByKey(item.role))}</div>
                        <div class="muted">数据范围：${escapeHtml(scopeLabel(item.dataScope))} · 提交时间：${escapeHtml(item.createdAt)}</div>
                      </div>
                    `
                  )
                  .join("")}
              </div>`
            : `<div class="empty-state">暂无待开通账号，点击右上角新建账号申请。</div>`}
        </div>
      </div>

      ${state.accountModalOpen ? renderAccountModal() : ""}
    </section>
  `;
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
            <span class="badge user">已接 DeepSeek V4</span>
            <span class="badge admin">后端环境变量启用</span>
          </div>
          <div class="muted" style="margin-top:10px">后端已接入 DeepSeek Chat Completions。配置 DEEPSEEK_API_KEY 后，质检评分页可直接运行 AI 质检；前端不会保存密钥。</div>
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
          <div class="muted">响应、评分、问题分类和客服排行的可视化占位。</div>
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
    BI看板: "给管理层看趋势和异常。"
  };
  return hints[step] || "预留扩展说明。";
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
