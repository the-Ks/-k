import http from "node:http";
import { URL } from "node:url";
import {
  getBiDashboard,
  getConversations,
  getCustomerProfiles,
  getDemoUsers,
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
  createAccountRequest
} from "./services/dataSource.js";

const env = globalThis.process?.env || {};
const PORT = Number(env.PORT || 8787);

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
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

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  const reqUrl = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = reqUrl.pathname;

  try {
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
      return sendJson(res, result.ok ? 200 : 401, result);
    }

    if (req.method === "GET" && path === "/api/overview") {
      return sendJson(res, 200, await getOverview(parseRole(reqUrl)));
    }

    if (req.method === "POST" && path === "/api/overview") {
      const body = await readJson(req);
      return sendJson(res, 200, await getOverview(body.role || "quality_user"));
    }

    if (req.method === "GET" && path === "/api/sync/status") {
      return sendJson(res, 200, await getSyncStatus());
    }

    if (req.method === "GET" && path === "/api/messages") {
      return sendJson(res, 200, await getMessages(reqUrl.searchParams));
    }

    if (req.method === "POST" && path === "/api/messages/import") {
      const body = await readJson(req);
      return sendJson(res, 200, await importMessages(body));
    }

    if (req.method === "GET" && path === "/api/identity/review") {
      return sendJson(res, 200, await getIdentityReviewTasks());
    }

    if (req.method === "GET" && path === "/api/conversations") {
      return sendJson(res, 200, await getConversations());
    }

    if (req.method === "GET" && path === "/api/quality/results") {
      return sendJson(res, 200, await getQualityResults());
    }

    if (req.method === "POST" && path === "/api/quality/ai-evaluate") {
      const body = await readJson(req);
      return sendJson(res, 200, await evaluateQualityWithAi(body));
    }

    if (req.method === "GET" && path === "/api/customers") {
      return sendJson(res, 200, await getCustomerProfiles());
    }

    if (req.method === "GET" && path === "/api/permissions") {
      return sendJson(res, 200, await getPermissionModel());
    }

    if (req.method === "POST" && path === "/api/accounts/request") {
      const body = await readJson(req);
      return sendJson(res, 200, await createAccountRequest(body));
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
