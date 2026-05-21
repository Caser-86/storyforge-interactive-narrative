import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { QueryResult, QueryFn } from "./types";

let db: Database.Database | null = null;

const SLOW_QUERY_THRESHOLD_MS = 500;

const SQLITE_MIGRATIONS: { version: number; up: string }[] = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS game_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        seed_prompt TEXT NOT NULL,
        genre TEXT,
        language TEXT DEFAULT 'zh-CN',
        rating TEXT DEFAULT 'PG-13',
        status TEXT DEFAULT 'active',
        current_scene_id TEXT,
        state_json TEXT DEFAULT '{}',
        owner_token TEXT,
        share_token TEXT,
        share_expires_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        title TEXT NOT NULL,
        location TEXT,
        body TEXT NOT NULL,
        npcs_json TEXT DEFAULT '[]',
        choices_json TEXT DEFAULT '[]',
        art_prompt_json TEXT DEFAULT '{}',
        bgm_cue_json TEXT DEFAULT '{}',
        memory_summary TEXT,
        mood TEXT DEFAULT '[]',
        time_of_day TEXT,
        chapter_goal TEXT,
        raw_model_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS choices (
        id TEXT PRIMARY KEY,
        scene_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        label TEXT NOT NULL,
        intent TEXT,
        risk TEXT,
        preview TEXT,
        state_effects_json TEXT DEFAULT '{}',
        selected_at TEXT,
        model_choice_id TEXT,
        FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS asset_jobs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        scene_id TEXT NOT NULL,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        status TEXT DEFAULT 'queued',
        prompt_hash TEXT,
        prompt_json TEXT DEFAULT '{}',
        url TEXT,
        error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_scenes_session ON scenes(session_id);
      CREATE INDEX IF NOT EXISTS idx_choices_scene ON choices(scene_id);
      CREATE INDEX IF NOT EXISTS idx_asset_jobs_session ON asset_jobs(session_id);
      CREATE INDEX IF NOT EXISTS idx_asset_jobs_status ON asset_jobs(status);
    `,
  },
  {
    version: 2,
    up: `
      CREATE INDEX IF NOT EXISTS idx_asset_jobs_prompt_hash ON asset_jobs(prompt_hash);
      CREATE INDEX IF NOT EXISTS idx_choices_session ON choices(session_id);
      CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);
    `,
  },
  {
    version: 3,
    up: `
      CREATE TABLE IF NOT EXISTS asset_versions (
        id TEXT PRIMARY KEY,
        asset_job_id TEXT NOT NULL,
        url TEXT,
        prompt_hash TEXT,
        prompt_json TEXT DEFAULT '{}',
        provider TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (asset_job_id) REFERENCES asset_jobs(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_asset_versions_job ON asset_versions(asset_job_id);
    `,
  },
  {
    version: 4,
    up: `
      CREATE TABLE IF NOT EXISTS llm_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        scene_id TEXT,
        model TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        retry_count INTEGER DEFAULT 0,
        success INTEGER NOT NULL,
        error TEXT,
        timestamp TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS asset_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_job_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        scene_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        type TEXT NOT NULL,
        latency_ms INTEGER,
        success INTEGER NOT NULL,
        error TEXT,
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_llm_logs_session ON llm_logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_asset_logs_session ON asset_logs(session_id);
    `,
  },
  {
    version: 5,
    up: `
      CREATE INDEX IF NOT EXISTS idx_sessions_share_token ON game_sessions(share_token);
    `,
  },
  {
    version: 6,
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        fingerprint TEXT UNIQUE NOT NULL,
        nickname TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_users_fingerprint ON users(fingerprint);
    `,
  },
  {
    version: 7,
    up: `
    `,
  },
  {
    version: 8,
    up: `
    `,
  },
  {
    version: 9,
    up: `
    `,
  },
  {
    version: 10,
    up: `
    `,
  },
];

function getDbPath(): string {
  return process.env.SQLITE_DB_PATH || "./data/storyforge.sqlite";
}

function openDb(): Database.Database {
  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const database = new Database(dbPath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");

  return database;
}

function ensureDb(): Database.Database {
  if (!db) {
    db = openDb();
  }
  return db;
}

function convertPostgresToSqlite(sql: string, params: unknown[]): { sql: string; params: unknown[] } {
  let converted = sql;

  converted = converted.replace(/\$(\d+)/g, "?");

  converted = converted.replace(/\bNOW\(\)/gi, "CURRENT_TIMESTAMP");

  converted = converted.replace(/::int\b/gi, "");

  converted = converted.replace(/::numeric\([^)]*\)/gi, "");
  converted = converted.replace(/::text\b/gi, "");
  converted = converted.replace(/::boolean\b/gi, "");

  converted = converted.replace(/INTERVAL\s+'[^']*'/gi, "'-1'");

  converted = converted.replace(/\bJSONB\b/gi, "TEXT");
  converted = converted.replace(/\bTIMESTAMPTZ\b/gi, "TEXT");
  converted = converted.replace(/\bSERIAL\b/gi, "INTEGER");

  converted = converted.replace(/FILTER\s*\([^)]*\)/gi, "");

  converted = converted.replace(
    /PERCENTILE_CONT\([^)]*\)\s+WITHIN\s+GROUP\s*\([^)]*\)/gi,
    "0"
  );

  converted = converted.replace(/COUNT\(\*\)/gi, "COUNT(*)");

  return { sql: converted, params };
}

function runQuery(sql: string, params: unknown[]): { rows: Record<string, unknown>[]; changes: number } {
  const database = ensureDb();

  const trimmed = sql.trim();

  if (
    trimmed.toUpperCase().startsWith("SELECT") ||
    trimmed.toUpperCase().startsWith("PRAGMA") ||
    (trimmed.toUpperCase().startsWith("WITH") && trimmed.toUpperCase().includes("SELECT"))
  ) {
    const stmt = database.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];

    for (const row of rows) {
      for (const key of Object.keys(row)) {
        const val = row[key];
        if (typeof val === "number" && Number.isInteger(val)) {
          const colLower = key.toLowerCase();
          if (
            colLower.includes("success") ||
            colLower.includes("chosen") ||
            colLower === "is_not_null"
          ) {
            row[key] = val !== 0;
          }
        }
      }
    }

    return { rows, changes: 0 };
  }

  if (
    trimmed.toUpperCase().startsWith("INSERT") ||
    trimmed.toUpperCase().startsWith("UPDATE") ||
    trimmed.toUpperCase().startsWith("DELETE")
  ) {
    const hasReturning = /\bRETURNING\b/i.test(trimmed);

    if (hasReturning) {
      const returningMatch = trimmed.match(/\bRETURNING\s+(.+?)$/i);
      const returningCols = returningMatch
        ? returningMatch[1].split(",").map((c) => c.trim())
        : ["*"];

      const sqlWithoutReturning = trimmed.replace(/\bRETURNING\s+.+$/i, "").trim();

      const stmt = database.prepare(sqlWithoutReturning);
      const info = stmt.run(...params);

      if (info.changes > 0 && returningCols.length > 0) {
        if (trimmed.toUpperCase().startsWith("INSERT")) {
          const tableMatch = sqlWithoutReturning.match(/INSERT\s+INTO\s+(\w+)/i);
          if (tableMatch) {
            const tableName = tableMatch[1];
            const lastId = info.lastInsertRowid;

            if (returningCols.includes("*") || returningCols.includes("id")) {
              const colMatch = sqlWithoutReturning.match(/\(([^)]+)\)/);
              if (colMatch) {
                const columns = colMatch[1].split(",").map((c) => c.trim());
                const row: Record<string, unknown> = {};
                columns.forEach((col, idx) => {
                  if (idx < params.length) {
                    row[col] = params[idx];
                  }
                });
                if (!row.id && lastId !== undefined && lastId !== 0) {
                  row.id = lastId;
                }
                return { rows: [row], changes: info.changes };
              }
            }

            try {
              const selectSql = `SELECT * FROM ${tableName} WHERE rowid = ?`;
              const selectStmt = database.prepare(selectSql);
              const row = selectStmt.get(lastId) as Record<string, unknown> | undefined;
              if (row) {
                return { rows: [row], changes: info.changes };
              }
            } catch {
              // fallback
            }
          }
        }

        if (trimmed.toUpperCase().startsWith("UPDATE") || trimmed.toUpperCase().startsWith("DELETE")) {
          // For UPDATE/DELETE with RETURNING, we can't easily get the row back
          // Return empty rows with changes count
          return { rows: [], changes: info.changes };
        }
      }

      return { rows: [], changes: info.changes };
    }

    const stmt = database.prepare(trimmed);
    const info = stmt.run(...params);
    return { rows: [], changes: info.changes };
  }

  if (
    trimmed.toUpperCase().startsWith("CREATE") ||
    trimmed.toUpperCase().startsWith("ALTER") ||
    trimmed.toUpperCase().startsWith("DROP")
  ) {
    database.exec(trimmed);
    return { rows: [], changes: 0 };
  }

  if (
    trimmed.toUpperCase().startsWith("BEGIN") ||
    trimmed.toUpperCase().startsWith("COMMIT") ||
    trimmed.toUpperCase().startsWith("ROLLBACK")
  ) {
    return { rows: [], changes: 0 };
  }

  try {
    const stmt = database.prepare(trimmed);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return { rows, changes: 0 };
  } catch {
    return { rows: [], changes: 0 };
  }
}

export async function sqliteQuery(text: string, params: unknown[] = []): Promise<QueryResult> {
  const start = Date.now();

  const { sql, params: convertedParams } = convertPostgresToSqlite(text, params);

  const { rows } = runQuery(sql, convertedParams);

  const duration = Date.now() - start;
  if (duration > SLOW_QUERY_THRESHOLD_MS) {
    const preview = text.replace(/\s+/g, " ").slice(0, 120);
    console.warn(`[SlowQuery] ${duration}ms: ${preview}`);
  }

  return { rows, duration };
}

export async function sqliteWithTransaction<T>(
  callback: (client: { query: QueryFn }) => Promise<T>
): Promise<T> {
  const database = ensureDb();

  return new Promise<T>((resolve, reject) => {
    try {
      database.exec("BEGIN");

      const txQuery: QueryFn = async (text: string, params: unknown[] = []) => {
        const { sql, params: convertedParams } = convertPostgresToSqlite(text, params);
        const start = Date.now();
        const { rows } = runQuery(sql, convertedParams);
        const duration = Date.now() - start;
        return { rows, duration };
      };

      callback({ query: txQuery })
        .then((result) => {
          database.exec("COMMIT");
          resolve(result);
        })
        .catch((err) => {
          database.exec("ROLLBACK");
          reject(err);
        });
    } catch (err) {
      database.exec("ROLLBACK");
      reject(err);
    }
  });
}

export async function sqliteInitDb(): Promise<void> {
  const database = ensureDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const appliedRows = database.prepare("SELECT version FROM _migrations ORDER BY version").all() as { version: number }[];
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  for (const migration of SQLITE_MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    console.log(`[SQLite Migration] Applying version ${migration.version}...`);

    if (migration.up.trim()) {
      database.exec(migration.up);
    }

    database.prepare("INSERT INTO _migrations (version) VALUES (?)").run(migration.version);
    console.log(`[SQLite Migration] Version ${migration.version} applied.`);
  }

  console.log(`[SQLite] Database initialized at ${getDbPath()}`);
}

export function closeSqlite(): void {
  if (db) {
    db.close();
    db = null;
  }
}
