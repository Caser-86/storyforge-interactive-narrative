import { Pool } from "pg";
import {
  memoryQuery,
  memoryWithTransaction,
  memoryInitDb,
  isMemoryMode,
} from "./memory-db";

let pool: Pool | null = null;

if (!isMemoryMode && process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on("error", (err) => {
    console.error("Unexpected DB pool error:", err.message);
  });
}

const SLOW_QUERY_THRESHOLD_MS = 500;

export async function query(text: string, params?: unknown[]) {
  if (isMemoryMode) {
    return memoryQuery(text, params);
  }

  if (!pool) {
    throw new Error("Database not configured");
  }

  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > SLOW_QUERY_THRESHOLD_MS) {
    const preview = text.replace(/\s+/g, " ").slice(0, 120);
    console.warn(`[SlowQuery] ${duration}ms: ${preview}`);
  }
  return { rows: res.rows, duration };
}

type QueryFn = (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; duration: number }>;

export async function withTransaction<T>(callback: (client: { query: QueryFn }) => Promise<T>): Promise<T> {
  if (isMemoryMode) {
    return memoryWithTransaction(callback as unknown as (client: { query: typeof memoryQuery }) => Promise<T>);
  }

  if (!pool) {
    throw new Error("Database not configured");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback({ query: client.query.bind(client) });
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

const MIGRATIONS: { version: number; up: string }[] = [
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
        state_json JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES game_sessions(id),
        turn INT NOT NULL,
        title TEXT NOT NULL,
        location TEXT,
        body TEXT NOT NULL,
        npcs_json JSONB DEFAULT '[]',
        choices_json JSONB DEFAULT '[]',
        art_prompt_json JSONB DEFAULT '{}',
        bgm_cue_json JSONB DEFAULT '{}',
        memory_summary TEXT,
        mood JSONB DEFAULT '[]',
        time_of_day TEXT,
        chapter_goal TEXT,
        raw_model_json JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS choices (
        id TEXT PRIMARY KEY,
        scene_id TEXT NOT NULL REFERENCES scenes(id),
        session_id TEXT NOT NULL REFERENCES game_sessions(id),
        label TEXT NOT NULL,
        intent TEXT,
        risk TEXT,
        state_effects_json JSONB DEFAULT '{}',
        selected_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS asset_jobs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES game_sessions(id),
        scene_id TEXT NOT NULL REFERENCES scenes(id),
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        status TEXT DEFAULT 'queued',
        prompt_hash TEXT,
        prompt_json JSONB DEFAULT '{}',
        url TEXT,
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
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
        asset_job_id TEXT NOT NULL REFERENCES asset_jobs(id),
        url TEXT,
        prompt_hash TEXT,
        prompt_json JSONB DEFAULT '{}',
        provider TEXT,
        version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_asset_versions_job ON asset_versions(asset_job_id);
    `,
  },
  {
    version: 4,
    up: `
      CREATE TABLE IF NOT EXISTS llm_logs (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        scene_id TEXT,
        model TEXT NOT NULL,
        latency_ms INT NOT NULL,
        input_tokens INT,
        output_tokens INT,
        retry_count INT DEFAULT 0,
        success BOOLEAN NOT NULL,
        error TEXT,
        timestamp TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS asset_logs (
        id SERIAL PRIMARY KEY,
        asset_job_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        scene_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        type TEXT NOT NULL,
        latency_ms INT,
        success BOOLEAN NOT NULL,
        error TEXT,
        timestamp TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_llm_logs_session ON llm_logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_asset_logs_session ON asset_logs(session_id);
    `,
  },
  {
    version: 5,
    up: `
      ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS share_token TEXT;
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_users_fingerprint ON users(fingerprint);
    `,
  },
  {
    version: 7,
    up: `
      ALTER TABLE choices ADD COLUMN IF NOT EXISTS preview TEXT;
      ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS owner_token TEXT;
    `,
  },
  {
    version: 8,
    up: `
      ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_session_id_fkey;
      ALTER TABLE scenes ADD CONSTRAINT scenes_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE;

      ALTER TABLE choices DROP CONSTRAINT IF EXISTS choices_scene_id_fkey;
      ALTER TABLE choices ADD CONSTRAINT choices_scene_id_fkey
        FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE;

      ALTER TABLE choices DROP CONSTRAINT IF EXISTS choices_session_id_fkey;
      ALTER TABLE choices ADD CONSTRAINT choices_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE;

      ALTER TABLE asset_jobs DROP CONSTRAINT IF EXISTS asset_jobs_session_id_fkey;
      ALTER TABLE asset_jobs ADD CONSTRAINT asset_jobs_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE;

      ALTER TABLE asset_jobs DROP CONSTRAINT IF EXISTS asset_jobs_scene_id_fkey;
      ALTER TABLE asset_jobs ADD CONSTRAINT asset_jobs_scene_id_fkey
        FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE;

      ALTER TABLE asset_versions DROP CONSTRAINT IF EXISTS asset_versions_asset_job_id_fkey;
      ALTER TABLE asset_versions ADD CONSTRAINT asset_versions_asset_job_id_fkey
        FOREIGN KEY (asset_job_id) REFERENCES asset_jobs(id) ON DELETE CASCADE;

      ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

      ALTER TABLE choices ADD COLUMN IF NOT EXISTS model_choice_id TEXT;
    `,
  },
];

export async function initDb() {
  if (isMemoryMode) {
    await memoryInitDb();
    return;
  }

  if (!pool) {
    throw new Error("Database not configured");
  }

  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const applied = await query(`SELECT version FROM _migrations ORDER BY version`);
  const appliedVersions = new Set(applied.rows.map((r: { version: number }) => r.version));

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    console.log(`[Migration] Applying version ${migration.version}...`);
    await query(migration.up);
    await query(`INSERT INTO _migrations (version) VALUES ($1)`, [migration.version]);
    console.log(`[Migration] Version ${migration.version} applied.`);
  }
}

export default pool;
