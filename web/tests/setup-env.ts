// Vitest global setup: DOM-matcher types, a throwaway temp DB path (never the
// real db/erp.db), a stub Foundry endpoint, and the handful of browser globals
// jsdom's DOM tree needs for the drawer animations.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import "@testing-library/jest-dom/vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof requestAnimationFrame !== "function") {
  (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = (
    cb: FrameRequestCallback
  ) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
}
if (typeof cancelAnimationFrame !== "function") {
  (globalThis as { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame = (
    id: number
  ) => clearTimeout(id);
}

process.env.FOUNDRY_PROJECT_ENDPOINT ??=
  "https://test-project.services.ai.azure.com/api/projects/test";

// Everything under web/ resolves ../db/schema.sql relative to process.cwd().
const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "complyflow-web-test-")), "erp.db");
process.env.COMPLYFLOW_DB_PATH = dbPath;

const schema = fs.readFileSync(path.resolve(process.cwd(), "..", "db", "schema.sql"), "utf8");
const db = new Database(dbPath);
db.exec(schema);
db.close();