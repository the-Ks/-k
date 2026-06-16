import crypto from "node:crypto";

const env = globalThis.process?.env || {};
const DEFAULT_TTL_SECONDS = 8 * 60 * 60;

export function createAuthToken(user = {}) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = normalizeTtl(env.AUTH_TOKEN_TTL_SECONDS, DEFAULT_TTL_SECONDS);
  const payload = {
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    dataScope: user.dataScope,
    iat: now,
    exp: now + ttl
  };

  return signToken(payload);
}

export function verifyAuthToken(token) {
  if (!token || typeof token !== "string") {
    return { ok: false, status: "missing_token", message: "Missing bearer token." };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, status: "invalid_token", message: "Invalid bearer token." };
  }

  const [headerPart, payloadPart, signature] = parts;
  const expected = sign(`${headerPart}.${payloadPart}`);
  if (!timingSafeEqual(signature, expected)) {
    return { ok: false, status: "invalid_token", message: "Invalid bearer token signature." };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart));
  } catch {
    return { ok: false, status: "invalid_token", message: "Invalid bearer token payload." };
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || Number(payload.exp) < now) {
    return { ok: false, status: "expired_token", message: "Bearer token expired." };
  }

  if (!payload.sub || !payload.role) {
    return { ok: false, status: "invalid_token", message: "Bearer token is missing user claims." };
  }

  return {
    ok: true,
    user: {
      id: payload.sub,
      username: payload.username,
      name: payload.name,
      role: payload.role,
      dataScope: payload.dataScope
    }
  };
}

export function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : "";
}

function signToken(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(`${headerPart}.${payloadPart}`);
  return `${headerPart}.${payloadPart}.${signature}`;
}

function sign(value) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function getSecret() {
  return env.AUTH_TOKEN_SECRET || env.JWT_SECRET || "dev-only-auth-token-secret-change-me";
}

function normalizeTtl(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.max(Math.round(number), 300), 7 * 24 * 60 * 60);
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
