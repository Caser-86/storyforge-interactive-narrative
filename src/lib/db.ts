import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query(text: string, params?: unknown[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  return { rows: res.rows, duration };
}

export async function initDb() {
  await query(`
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
  `);
}

export default pool;
