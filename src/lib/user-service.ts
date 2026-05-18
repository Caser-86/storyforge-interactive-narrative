import { query, initDb } from "./db";

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export interface UserProfile {
  id: string;
  nickname: string;
  createdAt: string;
  gameCount: number;
}

export async function getOrCreateUser(fingerprint: string): Promise<UserProfile> {
  await ensureDb();

  const existing = await query(
    `SELECT id, nickname, created_at FROM users WHERE fingerprint = $1`,
    [fingerprint]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    const countRes = await query(
      `SELECT COUNT(*)::int AS cnt FROM game_sessions WHERE user_id = $1`,
      [row.id]
    );
    return {
      id: row.id,
      nickname: row.nickname,
      createdAt: row.created_at,
      gameCount: countRes.rows[0]?.cnt || 0,
    };
  }

  const id = crypto.randomUUID();
  const nickname = `冒险者${id.slice(0, 6)}`;

  await query(
    `INSERT INTO users (id, fingerprint, nickname, created_at) VALUES ($1, $2, $3, NOW())`,
    [id, fingerprint, nickname]
  );

  return { id, nickname, createdAt: new Date().toISOString(), gameCount: 0 };
}

export async function getUserGames(userId: string): Promise<Array<{
  id: string;
  seedPrompt: string;
  genre: string;
  status: string;
  createdAt: string;
}>> {
  await ensureDb();

  const res = await query(
    `SELECT id, seed_prompt, genre, status, created_at FROM game_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [userId]
  );

  return res.rows.map((r) => ({
    id: r.id,
    seedPrompt: r.seed_prompt,
    genre: r.genre,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export async function updateUserNickname(userId: string, nickname: string): Promise<void> {
  await ensureDb();
  const sanitized = nickname
    .replace(/<[^>]*>/g, "")
    .replace(/[<>"'&]/g, "")
    .trim()
    .slice(0, 24);
  if (!sanitized || sanitized.length < 1) return;
  await query(
    `UPDATE users SET nickname = $1 WHERE id = $2`,
    [sanitized, userId]
  );
}

export async function deleteUser(userId: string): Promise<void> {
  await ensureDb();

  const sessionRes = await query(
    `SELECT id FROM game_sessions WHERE user_id = $1`,
    [userId]
  );

  for (const session of sessionRes.rows) {
    const sceneRes = await query(
      `SELECT id FROM scenes WHERE session_id = $1`,
      [session.id]
    );
    for (const scene of sceneRes.rows) {
      await query(`DELETE FROM asset_jobs WHERE scene_id = $1`, [scene.id]);
      await query(`DELETE FROM asset_logs WHERE scene_id = $1`, [scene.id]);
      await query(`DELETE FROM llm_logs WHERE scene_id = $1`, [scene.id]);
    }
    await query(`DELETE FROM scenes WHERE session_id = $1`, [session.id]);
    await query(`DELETE FROM llm_logs WHERE session_id = $1`, [session.id]);
    await query(`DELETE FROM asset_logs WHERE session_id = $1`, [session.id]);
  }

  await query(`DELETE FROM game_sessions WHERE user_id = $1`, [userId]);
  await query(`DELETE FROM users WHERE id = $1`, [userId]);
}
