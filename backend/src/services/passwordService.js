import crypto from "node:crypto";
import { promisify } from "node:util";

const pbkdf2 = promisify(crypto.pbkdf2);
const ALGORITHM = "pbkdf2_sha256";
const DEFAULT_ITERATIONS = 210000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derived = await pbkdf2(String(password || ""), salt, DEFAULT_ITERATIONS, KEY_LENGTH, DIGEST);
  return `${ALGORITHM}$${DEFAULT_ITERATIONS}$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password, storedHash) {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) return false;

  const derived = await pbkdf2(String(password || ""), parsed.salt, parsed.iterations, KEY_LENGTH, DIGEST);
  return timingSafeEqual(derived.toString("base64url"), parsed.hash);
}

function parsePasswordHash(value) {
  const [algorithm, iterationsText, salt, hash] = String(value || "").split("$");
  const iterations = Number(iterationsText);

  if (algorithm !== ALGORITHM || !Number.isInteger(iterations) || iterations < 100000 || !salt || !hash) {
    return null;
  }

  return { iterations, salt, hash };
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
