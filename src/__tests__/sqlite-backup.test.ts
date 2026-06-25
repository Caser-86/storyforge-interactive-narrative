import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const backup = vi.fn();
  const close = vi.fn();
  const database = vi.fn(function Database() {
    return { backup, close };
  });
  const fs = {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
  return { backup, close, database, fs };
});

vi.mock("better-sqlite3", () => ({
  default: mocks.database,
}));

vi.mock("fs", () => ({
  default: mocks.fs,
}));

describe("sqlite backup script", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SQLITE_DB_PATH = "./data/storyforge.sqlite";
    process.env.SQLITE_BACKUP_DIR = "./data/backups";
    process.env.SQLITE_MAX_BACKUPS = "10";
    mocks.fs.existsSync.mockReturnValue(true);
    mocks.fs.statSync.mockReturnValue({ size: 1024 * 1024 });
    mocks.fs.readdirSync.mockReturnValue([]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("awaits the SQLite backup promise before closing the database", async () => {
    const events: string[] = [];
    mocks.backup.mockImplementation(async () => {
      events.push("backup-start");
      await Promise.resolve();
      events.push("backup-finish");
      return { totalPages: 1, remainingPages: 0 };
    });
    mocks.close.mockImplementation(() => {
      events.push("close");
    });

    const { backupSqlite } = await import("@/scripts/sqlite-backup");
    await backupSqlite();

    expect(events).toEqual(["backup-start", "backup-finish", "close"]);
  });

  it("closes the database when backup fails", async () => {
    mocks.backup.mockRejectedValue(new Error("disk full"));

    const { backupSqlite } = await import("@/scripts/sqlite-backup");
    await expect(backupSqlite()).rejects.toThrow("disk full");

    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
});
