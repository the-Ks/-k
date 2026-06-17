import assert from "node:assert/strict";
import test from "node:test";

process.env.AUTH_TOKEN_SECRET = "test-auth-secret-for-local-tests";
process.env.AUTH_TOKEN_TTL_SECONDS = "3600";

const { createAuthToken, verifyAuthToken } = await import("../backend/src/services/authService.js");

test("auth token round-trips signed user claims", () => {
  const token = createAuthToken({
    id: "user_1",
    username: "admin",
    name: "管理员",
    role: "super_admin",
    dataScope: "all"
  });

  const verified = verifyAuthToken(token);

  assert.equal(verified.ok, true);
  assert.equal(verified.user.id, "user_1");
  assert.equal(verified.user.role, "super_admin");
  assert.equal(verified.user.dataScope, "all");
});

test("auth token verifier rejects malformed tokens", () => {
  const verified = verifyAuthToken("not-a-jwt");

  assert.equal(verified.ok, false);
  assert.equal(verified.status, "invalid_token");
});
