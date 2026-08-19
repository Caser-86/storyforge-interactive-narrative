import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type * as SqliteModule from "@/lib/db/sqlite";

const userDbPath = path.resolve("data/storyforge.sqlite");
const originalSqliteDbPath = process.env.SQLITE_DB_PATH;
let sqlite: typeof SqliteModule;
let userDbSnapshot: { exists: boolean; size?: number; mtimeMs?: number };

beforeEach(async () => {
  userDbSnapshot = fs.existsSync(userDbPath)
    ? (() => {
        const stat = fs.statSync(userDbPath);
        return { exists: true, size: stat.size, mtimeMs: stat.mtimeMs };
      })()
    : { exists: false };

  process.env.SQLITE_DB_PATH = ":memory:";
  vi.resetModules();
  sqlite = await import("@/lib/db/sqlite");
});

afterEach(() => {
  sqlite.closeSqlite();
  vi.resetModules();

  if (originalSqliteDbPath === undefined) {
    delete process.env.SQLITE_DB_PATH;
  } else {
    process.env.SQLITE_DB_PATH = originalSqliteDbPath;
  }

  const currentSnapshot = fs.existsSync(userDbPath)
    ? (() => {
        const stat = fs.statSync(userDbPath);
        return { exists: true, size: stat.size, mtimeMs: stat.mtimeMs };
      })()
    : { exists: false };
  expect(currentSnapshot).toEqual(userDbSnapshot);
});

it("propagates malformed SQL instead of returning empty rows", async () => {
  await expect(sqlite.sqliteQuery("SELEC definitely_invalid")).rejects.toThrow(
    /near "SELEC": syntax error/
  );
});

it("allows VACUUM without treating it as a row-returning query", async () => {
  await expect(sqlite.sqliteQuery("VACUUM")).resolves.toMatchObject({ rows: [] });
});

it("allows ANALYZE without treating it as a row-returning query", async () => {
  await expect(sqlite.sqliteQuery("ANALYZE")).resolves.toMatchObject({ rows: [] });
});
