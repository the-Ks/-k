import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "../backend/src/services/passwordService.js";

test("password hashes verify the original password only", async () => {
  const hash = await hashPassword("admin123");

  assert.match(hash, /^pbkdf2_sha256\$/);
  assert.equal(hash.includes("admin123"), false);
  assert.equal(await verifyPassword("admin123", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});
