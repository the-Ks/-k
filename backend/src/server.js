import http from "node:http";
import { URL } from "node:url";
import {
  adjustQualityScore,
  getBiDashboard,
  getConversations,
  getCustomerProfiles,
  getDemoUsers,
  getAccountRequests,
  getOperationLogs,
  evaluateQualityWithAi,
  getIdentityReviewTasks,
  getMessages,
  getOverview,
  getPermissionModel,
  getQualityResults,
  getRuleConfig,
  getSyncStatus,
  getDatabaseConnectionStatus,
  importMessages,
  login,
  approveAccountRequest,
  rejectAccountRequest,
  updateMessageMediaEvidence,
  updateAccountPermission,
  createAccountRequest
} from "./services/dataSource.js";
import { createAuthToken, getBearerToken, verifyAuthToken } from "./services/authService.js";

const env = globalThis.process?.env || {};
const PORT = Number(env.PORT || 8787);
const CORS_ORIGIN = env.CORS_ORIGIN || "*";
const QUALITY_ROLES = ["super_admin", "quality_manager", "quality_user"];
const ALL_ROLES = [...QUALITY_ROLES, "service_user"];
const accessRules = [
  { method: "GET", path: "/api/overview", roles: ALL_ROLES },
  { method: "POST", path: "/api/overview", roles: ALL_ROLES },
  { method: "GET", path: "/api/sync/status", roles: ["super_admin"] },
  { method: "GET", path: "/api/messages", roles: ALL_ROLES },
  { method: "POST", path: "/api/messages/import", roles: ["super_admin"] },
  { method: "POST", path: "/api/messages/media-evidence", roles: QUALITY_ROLES },
  { method: "GET", path: "/api/identity/review", roles: QUALITY_ROLES },
  { method: "GET", path: "/api/conversations", roles: ALL_ROLES },
  { method: "GET", path: "/api/quality/results", roles: ALL_ROLES },
  { method: "POST", path: "/api/quality/ai-evaluate", roles: ALL_ROLES },
  { method: "POST", path: "/api/quality/score-adjust", roles: QUALITY_ROLES },
  { method: "GET", path: "/api/customers", roles: ALL_ROLES },
  { method: "GET", path: "/api/permissions", roles: ["super_admin"] },
  { method: "POST", path: "/api/permissions/account-update", roles: ["super_admin"] },
  { method: "POST", path: "/api/accounts/request", roles: ["super_admin"] },
  { method: "GET", path: "/api/accounts/requests", roles: ["super_admin"] },
  { method: "POST", path: "/api/accounts/request-approve", roles: ["super_admin"] },
  { method: "POST", path: "/api/accounts/request-reject", roles: ["super_admin"] },
  { method: "GET", path: "/api/operations/logs", roles: ["super_admin"] },
  { method: "GET", path: "/api/rules", roles: ["super_admin"] },
  { method: "GET", path: "/api/bi", roles: QUALITY_ROLES }
];
const publicRoutes = new Set([
  "GET /api/health",
  "GET /api/database/status",
  "GET /api/auth/demo-users",
  "POST /api/auth/login"
]);

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function parseRole(reqUrl) {
  return reqUrl.searchParams.get("role") || "quality_user";
}

function authorizeRequest(req, path) {
  const key = `${req.method} ${path}`;
  if (publicRoutes.has(key)) {
    return { ok: true, user: null };
  }

  const rule = accessRules.find((item) => item.method === req.method && item.path === path);
  if (!rule) {
    return { ok: true, user: null };
  }

  const auth = verifyAuthToken(getBearerToken(req));
  if (!auth.ok) {
    return {
      ok: false,
      statusCode: 401,
      payload: {
        ok: false,
        code: auth.status,
        message: auth.message
      }
    };
  }

  if (!rule.roles.includes(auth.user.role)) {
    return {
      ok: false,
      statusCode: 403,
      payload: {
        ok: false,
        code: "forbidden",
        message: "当前账号没有访问该接口的权限。"
      }
    };
  }

  return { ok: true, user: auth.user };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  const reqUrl = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = reqUrl.pathname;

  try {
    const access = authorizeRequest(req, path);
    if (!access.ok) {
      return sendJson(res, access.statusCode, access.payload);
    }
    const currentUser = access.user;

    if (req.method === "GET" && path === "/api/health") {
      const databaseStatus = await getDatabaseConnectionStatus();
      return sendJson(res, 200, {
        ok: true,
        service: "quality-inspection-backend",
        mode: databaseStatus.mode,
        database: databaseStatus.connected ? "connected" : "pending"
      });
    }

    if (req.method === "GET" && path === "/api/database/status") {
      return sendJson(res, 200, await getDatabaseConnectionStatus());
    }

    if (req.method === "GET" && path === "/api/auth/demo-users") {
      return sendJson(res, 200, await getDemoUsers());
    }

    if (req.method === "POST" && path === "/api/auth/login") {
      const body = await readJson(req);
      const result = await login(body.username, body.password);
      if (result.ok && result.user) {
        result.token = createAuthToken(result.user);
      }
      return sendJson(res, result.ok ? 200 : 401, result);
    }

    if (req.method === "GET" && path === "/api/overview") {
      return sendJson(res, 200, await getOverview(currentUser?.role || parseRole(reqUrl)));
    }

    if (req.method === "POST" && path === "/api/overview") {
      await readJson(req);
      return sendJson(res, 200, await getOverview(currentUser?.role || "quality_user"));
    }

    if (req.method === "GET" && path === "/api/sync/status") {
      return sendJson(res, 200, await getSyncStatus());
    }

    if (req.method === "GET" && path === "/api/messages") {
      return sendJson(res, 200, await getMessages(reqUrl.searchParams, currentUser));
    }

    if (req.method === "POST" && path === "/api/messages/import") {
      const body = await readJson(req);
      return sendJson(res, 200, await importMessages(body));
    }

    if (req.method === "POST" && path === "/api/messages/media-evidence") {
      const body = await readJson(req);
      return sendJson(res, 200, await updateMessageMediaEvidence(body, currentUser));
    }

    if (req.method === "GET" && path === "/api/identity/review") {
      return sendJson(res, 200, await getIdentityReviewTasks());
    }

    if (req.method === "GET" && path === "/api/conversations") {
      return sendJson(res, 200, await getConversations(currentUser));
    }

    if (req.method === "GET" && path === "/api/quality/results") {
      return sendJson(res, 200, await getQualityResults(currentUser));
    }

    if (req.method === "POST" && path === "/api/quality/ai-evaluate") {
      const body = await readJson(req);
      return sendJson(res, 200, await evaluateQualityWithAi({
        ...body,
        viewer_role: currentUser?.role || "quality_user",
        viewer_user_id: currentUser?.id || "",
        viewer_data_scope: currentUser?.dataScope || ""
      }));
    }

    if (req.method === "POST" && path === "/api/quality/score-adjust") {
      const body = await readJson(req);
      return sendJson(res, 200, await adjustQualityScore(body, currentUser));
    }

    if (req.method === "GET" && path === "/api/customers") {
      return sendJson(res, 200, await getCustomerProfiles(currentUser));
    }

    if (req.method === "GET" && path === "/api/permissions") {
      return sendJson(res, 200, await getPermissionModel());
    }

    if (req.method === "POST" && path === "/api/permissions/account-update") {
      const body = await readJson(req);
      return sendJson(res, 200, await updateAccountPermission(body, currentUser));
    }

    if (req.method === "POST" && path === "/api/accounts/request") {
      const body = await readJson(req);
      return sendJson(res, 200, await createAccountRequest(body, currentUser));
    }

    if (req.method === "GET" && path === "/api/accounts/requests") {
      return sendJson(res, 200, await getAccountRequests());
    }

    if (req.method === "POST" && path === "/api/accounts/request-approve") {
      const body = await readJson(req);
      return sendJson(res, 200, await approveAccountRequest(body, currentUser));
    }

    if (req.method === "POST" && path === "/api/accounts/request-reject") {
      const body = await readJson(req);
      return sendJson(res, 200, await rejectAccountRequest(body, currentUser));
    }

    if (req.method === "GET" && path === "/api/operations/logs") {
      const limit = Number(reqUrl.searchParams.get("limit") || 30);
      return sendJson(res, 200, await getOperationLogs(limit));
    }

    if (req.method === "GET" && path === "/api/rules") {
      return sendJson(res, 200, await getRuleConfig());
    }

    if (req.method === "GET" && path === "/api/bi") {
      return sendJson(res, 200, await getBiDashboard());
    }

    return sendJson(res, 404, {
      ok: false,
      message: "API route not found",
      path
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      message: "Internal server error",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(PORT, () => {
  console.log(`Quality inspection backend is running at http://localhost:${PORT}`);
});
