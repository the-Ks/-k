import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const env = globalThis.process?.env || {};
const PORT = Number(env.PORT || 5173);
const API_PROXY_ORIGIN = env.QI_API_ORIGIN || env.API_ORIGIN || `http://${env.BACKEND_HOST || "127.0.0.1"}:${env.BACKEND_PORT || "8787"}`;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function resolveSafePath(requestPath) {
  const normalized = decodeURIComponent(requestPath.split("?")[0]);
  const filePath = normalized === "/" ? "/index.html" : normalized;
  const fullPath = path.join(__dirname, filePath);
  if (!fullPath.startsWith(__dirname)) {
    return path.join(__dirname, "index.html");
  }
  return fullPath;
}

function proxyApiRequest(req, res) {
  const targetUrl = new URL(req.url || "/", API_PROXY_ORIGIN);
  const client = targetUrl.protocol === "https:" ? https : http;
  const headers = { ...req.headers, host: targetUrl.host };

  const proxyReq = client.request(
    targetUrl,
    {
      method: req.method,
      headers
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", () => {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, message: "API proxy failed" }));
  });

  req.pipe(proxyReq);
}

const server = http.createServer(async (req, res) => {
  if ((req.url || "").startsWith("/api/") || req.url === "/api") {
    proxyApiRequest(req, res);
    return;
  }

  const fullPath = resolveSafePath(req.url || "/");

  try {
    const fileStat = await stat(fullPath);
    if (!fileStat.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    createReadStream(fullPath).pipe(res);
  } catch {
    const fallbackPath = path.join(__dirname, "index.html");
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    createReadStream(fallbackPath).pipe(res);
  }
});

server.listen(PORT, () => {
  console.log(`Quality inspection frontend is running at http://localhost:${PORT}`);
});
