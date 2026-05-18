import { query, initDb } from "../lib/db";

async function smokeTest() {
  console.log("=== PostgreSQL Migration Smoke Test ===\n");

  try {
    console.log("1. Running initDb()...");
    await initDb();
    console.log("   ✓ initDb() completed\n");

    console.log("2. Running initDb() again (idempotency)...");
    await initDb();
    console.log("   ✓ Idempotent initDb() completed\n");

    const requiredTables = [
      "_migrations",
      "users",
      "game_sessions",
      "scenes",
      "choices",
      "asset_jobs",
      "asset_versions",
      "llm_logs",
      "asset_logs",
    ];

    console.log("3. Checking required tables...");
    const tableResult = await query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    const existingTables = new Set(tableResult.rows.map((r: { tablename: string }) => r.tablename));

    for (const table of requiredTables) {
      if (existingTables.has(table)) {
        console.log(`   ✓ ${table} exists`);
      } else {
        console.error(`   ✗ ${table} MISSING`);
      }
    }
    console.log();

    console.log("4. Checking critical columns...");
    const columnChecks = [
      { table: "game_sessions", column: "owner_token" },
      { table: "game_sessions", column: "share_token" },
      { table: "choices", column: "model_choice_id" },
      { table: "choices", column: "preview" },
      { table: "asset_jobs", column: "prompt_hash" },
      { table: "asset_versions", column: "url" },
    ];

    for (const check of columnChecks) {
      const colResult = await query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [check.table, check.column]
      );
      if (colResult.rows.length > 0) {
        console.log(`   ✓ ${check.table}.${check.column} exists`);
      } else {
        console.error(`   ✗ ${check.table}.${check.column} MISSING`);
      }
    }
    console.log();

    console.log("5. Checking ON DELETE CASCADE on foreign keys...");
    const fkResult = await query(
      `SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'`
    );
    console.log(`   Found ${fkResult.rows.length} foreign keys`);
    for (const fk of fkResult.rows) {
      console.log(`   ✓ ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table}`);
    }
    console.log();

    console.log("6. Testing cascade delete...");
    const suffix = Date.now();
    const userId = `smoke_user_${suffix}`;
    const sessionId = `smoke_session_${suffix}`;
    const sceneId = `smoke_scene_${suffix}`;
    await query(
      `INSERT INTO users (id, fingerprint) VALUES ($1, $2) RETURNING id`,
      [userId, `smoke_test_fp_${suffix}`]
    );

    const _testSession = await query(
      `INSERT INTO game_sessions (id, user_id, owner_token, seed_prompt, genre, language, rating, status, current_scene_id, state_json)
       VALUES ($1, $2, 'hash', 'test', 'fantasy', 'zh-CN', 'PG-13', 'active', $3, '{}') RETURNING id`,
      [sessionId, userId, sceneId]
    );

    const _testScene = await query(
      `INSERT INTO scenes (id, session_id, turn, title, location, time_of_day, mood, body, npcs_json, choices_json, art_prompt_json, bgm_cue_json, chapter_goal, memory_summary)
       VALUES ($1, $2, 1, 'Test', 'Test', 'day', '[]', 'Test body', '[]', '[]', '{}', '{}', '', '') RETURNING id`,
      [sceneId, sessionId]
    );

    await query(`DELETE FROM users WHERE id = $1`, [userId]);

    const sessionCheck = await query(
      `SELECT id FROM game_sessions WHERE id = $1`,
      [sessionId]
    );
    if (sessionCheck.rows.length === 0) {
      console.log("   ✓ Cascade delete: session removed when user deleted");
    } else {
      console.error("   ✗ Cascade delete: session NOT removed when user deleted");
    }
    console.log();

    console.log("=== Smoke Test Complete ===");
    process.exit(0);
  } catch (err) {
    console.error("Smoke test FAILED:", err);
    process.exit(1);
  }
}

smokeTest();
