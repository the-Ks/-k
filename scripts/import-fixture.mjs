import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importMessages } from "../backend/src/services/dataSource.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const fixturePath = process.argv[2]
  ? path.resolve(projectRoot, process.argv[2])
  : path.join(projectRoot, "fixtures", "huaxiang-gardening-chat-import.txt");

const raw = await readFile(fixturePath, "utf8");
const fixture = JSON.parse(raw);
const batches = Array.isArray(fixture.batches) ? fixture.batches : [fixture];

const results = [];
for (const batch of batches) {
  const result = await importMessages(batch);
  results.push(result);
}

console.log(JSON.stringify({
  fixture: path.relative(projectRoot, fixturePath),
  batchCount: results.length,
  results
}, null, 2));

process.exit(results.every((result) => result.ok) ? 0 : 1);
