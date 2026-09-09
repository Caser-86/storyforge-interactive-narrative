export interface AuthoringMigration {
  version: number;
  name: string;
  up: string;
}

export const AUTHORING_MIGRATIONS: AuthoringMigration[] = [
  {
    version: 1,
    name: "phase_1_authoring_core",
    up: `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        premise TEXT NOT NULL,
        genre TEXT NOT NULL,
        tone TEXT NOT NULL,
        point_of_view TEXT NOT NULL,
        rating TEXT NOT NULL,
        size_preset TEXT NOT NULL CHECK (size_preset IN ('micro', 'short', 'medium', 'custom')),
        target_node_count INTEGER NOT NULL,
        target_ending_count INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'generating', 'ready', 'archived')),
        active_draft_version_id TEXT,
        settings_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS story_versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('draft', 'snapshot')),
        source_version_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('planning', 'generating', 'review_required', 'valid', 'invalid')),
        brief_json TEXT NOT NULL DEFAULT '{}',
        story_bible_json TEXT NOT NULL DEFAULT '{}',
        outline_json TEXT NOT NULL DEFAULT '{}',
        canon_json TEXT NOT NULL DEFAULT '{}',
        draft_revision INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        sealed_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (source_version_id) REFERENCES story_versions(id) ON DELETE SET NULL,
        UNIQUE (project_id, version_number)
      );

      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        title TEXT NOT NULL,
        goal TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (version_id) REFERENCES story_versions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS story_nodes (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        node_key TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('start', 'scene', 'ending')),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        summary TEXT NOT NULL,
        objective TEXT NOT NULL,
        topological_rank INTEGER NOT NULL,
        content_status TEXT NOT NULL CHECK (content_status IN ('planned', 'generated', 'author_edited', 'review_required')),
        author_modified INTEGER NOT NULL CHECK (author_modified IN (0, 1)),
        content_revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (version_id) REFERENCES story_versions(id) ON DELETE CASCADE,
        FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
        UNIQUE (version_id, node_key)
      );

      CREATE TABLE IF NOT EXISTS story_edges (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL,
        source_node_id TEXT NOT NULL,
        target_node_id TEXT NOT NULL,
        label TEXT NOT NULL,
        intent TEXT NOT NULL,
        consequence_summary TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (version_id) REFERENCES story_versions(id) ON DELETE CASCADE,
        FOREIGN KEY (source_node_id) REFERENCES story_nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (target_node_id) REFERENCES story_nodes(id) ON DELETE CASCADE,
        UNIQUE (version_id, source_node_id, target_node_id, label)
      );

      CREATE INDEX IF NOT EXISTS idx_story_versions_project ON story_versions(project_id);
      CREATE INDEX IF NOT EXISTS idx_chapters_version ON chapters(version_id);
      CREATE INDEX IF NOT EXISTS idx_story_nodes_version ON story_nodes(version_id);
      CREATE INDEX IF NOT EXISTS idx_story_nodes_chapter ON story_nodes(chapter_id);
      CREATE INDEX IF NOT EXISTS idx_story_edges_version ON story_edges(version_id);
      CREATE INDEX IF NOT EXISTS idx_story_edges_source ON story_edges(source_node_id);
      CREATE INDEX IF NOT EXISTS idx_story_edges_target ON story_edges(target_node_id);
    `,
  },
  {
    version: 2,
    name: "scope_authoring_foreign_keys",
    up: `
      PRAGMA defer_foreign_keys = ON;

      CREATE TABLE projects_v2 (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        premise TEXT NOT NULL,
        genre TEXT NOT NULL,
        tone TEXT NOT NULL,
        point_of_view TEXT NOT NULL,
        rating TEXT NOT NULL,
        size_preset TEXT NOT NULL CHECK (size_preset IN ('micro', 'short', 'medium', 'custom')),
        target_node_count INTEGER NOT NULL,
        target_ending_count INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'generating', 'ready', 'archived')),
        active_draft_version_id TEXT,
        settings_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (id, active_draft_version_id) REFERENCES story_versions_v2(project_id, id)
      );

      CREATE TABLE story_versions_v2 (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('draft', 'snapshot')),
        source_version_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('planning', 'generating', 'review_required', 'valid', 'invalid')),
        brief_json TEXT NOT NULL DEFAULT '{}',
        story_bible_json TEXT NOT NULL DEFAULT '{}',
        outline_json TEXT NOT NULL DEFAULT '{}',
        canon_json TEXT NOT NULL DEFAULT '{}',
        draft_revision INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        sealed_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects_v2(id) ON DELETE CASCADE,
        FOREIGN KEY (source_version_id) REFERENCES story_versions_v2(id) ON DELETE SET NULL,
        UNIQUE (project_id, version_number),
        UNIQUE (project_id, id)
      );

      CREATE TABLE chapters_v2 (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        title TEXT NOT NULL,
        goal TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (version_id) REFERENCES story_versions_v2(id) ON DELETE CASCADE,
        UNIQUE (version_id, id)
      );

      CREATE TABLE story_nodes_v2 (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        node_key TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('start', 'scene', 'ending')),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        summary TEXT NOT NULL,
        objective TEXT NOT NULL,
        topological_rank INTEGER NOT NULL,
        content_status TEXT NOT NULL CHECK (content_status IN ('planned', 'generated', 'author_edited', 'review_required')),
        author_modified INTEGER NOT NULL CHECK (author_modified IN (0, 1)),
        content_revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (version_id) REFERENCES story_versions_v2(id) ON DELETE CASCADE,
        FOREIGN KEY (version_id, chapter_id) REFERENCES chapters_v2(version_id, id) ON DELETE CASCADE,
        UNIQUE (version_id, id),
        UNIQUE (version_id, node_key)
      );

      CREATE TABLE story_edges_v2 (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL,
        source_node_id TEXT NOT NULL,
        target_node_id TEXT NOT NULL,
        label TEXT NOT NULL,
        intent TEXT NOT NULL,
        consequence_summary TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (version_id) REFERENCES story_versions_v2(id) ON DELETE CASCADE,
        FOREIGN KEY (version_id, source_node_id) REFERENCES story_nodes_v2(version_id, id) ON DELETE CASCADE,
        FOREIGN KEY (version_id, target_node_id) REFERENCES story_nodes_v2(version_id, id) ON DELETE CASCADE,
        UNIQUE (version_id, id),
        UNIQUE (version_id, source_node_id, target_node_id, label)
      );

      INSERT INTO projects_v2 SELECT * FROM projects;
      INSERT INTO story_versions_v2 SELECT * FROM story_versions;
      INSERT INTO chapters_v2 SELECT * FROM chapters;
      INSERT INTO story_nodes_v2 SELECT * FROM story_nodes;
      INSERT INTO story_edges_v2 SELECT * FROM story_edges;

      DROP TABLE story_edges;
      DROP TABLE story_nodes;
      DROP TABLE chapters;
      DROP TABLE story_versions;
      DROP TABLE projects;

      ALTER TABLE projects_v2 RENAME TO projects;
      ALTER TABLE story_versions_v2 RENAME TO story_versions;
      ALTER TABLE chapters_v2 RENAME TO chapters;
      ALTER TABLE story_nodes_v2 RENAME TO story_nodes;
      ALTER TABLE story_edges_v2 RENAME TO story_edges;

      CREATE INDEX idx_story_versions_project ON story_versions(project_id);
      CREATE INDEX idx_chapters_version ON chapters(version_id);
      CREATE INDEX idx_story_nodes_version ON story_nodes(version_id);
      CREATE INDEX idx_story_nodes_chapter ON story_nodes(version_id, chapter_id);
      CREATE INDEX idx_story_edges_version ON story_edges(version_id);
      CREATE INDEX idx_story_edges_source ON story_edges(version_id, source_node_id);
      CREATE INDEX idx_story_edges_target ON story_edges(version_id, target_node_id);
    `,
  },
  {
    version: 3,
    name: "freeze_snapshot_validation_limits",
    up: `
      ALTER TABLE story_versions
      ADD COLUMN validation_limits_json TEXT NOT NULL
      DEFAULT '{"minNodes":8,"minEndings":2,"maxNodes":80,"maxEndings":10}';
    `,
  },
  {
    version: 4,
    name: "generation_runs_persistence",
    up: `
      CREATE TABLE IF NOT EXISTS generation_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        stage TEXT NOT NULL CHECK (stage IN ('brief', 'bible', 'outline', 'graph', 'structural_check', 'nodes', 'continuity_review', 'ready')),
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'paused', 'failed', 'completed', 'canceled')),
        progress_current INTEGER NOT NULL DEFAULT 0,
        progress_total INTEGER NOT NULL DEFAULT 0,
        model TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT CHECK (
          last_error_code IS NULL OR last_error_code IN (
            'AUTH', 'RATE_LIMIT', 'TIMEOUT', 'NETWORK', 'EMPTY', 'SCHEMA',
            'VALIDATION', 'STORAGE', 'LEASE_EXPIRED', 'CANCELED', 'UNKNOWN'
          )
        ),
        last_error_message TEXT,
        lease_expires_at TEXT,
        started_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id, version_id) REFERENCES story_versions(project_id, id) ON DELETE CASCADE,
        UNIQUE (project_id, version_id, id)
      );

      CREATE TABLE IF NOT EXISTS generation_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_key TEXT NOT NULL,
        stage TEXT NOT NULL CHECK (stage IN ('brief', 'bible', 'outline', 'graph', 'structural_check', 'nodes', 'continuity_review')),
        subject_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'canceled')),
        attempt INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL,
        lease_expires_at TEXT,
        next_attempt_at TEXT,
        model TEXT,
        request_json TEXT NOT NULL DEFAULT '{}',
        raw_response TEXT,
        parsed_response_json TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        error_code TEXT CHECK (
          error_code IS NULL OR error_code IN (
            'AUTH', 'RATE_LIMIT', 'TIMEOUT', 'NETWORK', 'EMPTY', 'SCHEMA',
            'VALIDATION', 'STORAGE', 'LEASE_EXPIRED', 'CANCELED', 'UNKNOWN'
          )
        ),
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (run_id) REFERENCES generation_runs(id) ON DELETE CASCADE,
        UNIQUE (run_id, step_key),
        UNIQUE (run_id, id)
      );

      CREATE TABLE IF NOT EXISTS generation_candidates (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        run_id TEXT,
        step_id TEXT,
        node_id TEXT NOT NULL,
        base_content_revision INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'applied', 'rejected')),
        candidate_body TEXT NOT NULL,
        model TEXT,
        raw_response TEXT,
        created_at TEXT NOT NULL,
        applied_at TEXT,
        rejected_at TEXT,
        CHECK (step_id IS NULL OR run_id IS NOT NULL),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id, version_id) REFERENCES story_versions(project_id, id) ON DELETE CASCADE,
        FOREIGN KEY (run_id) REFERENCES generation_runs(id) ON DELETE SET NULL,
        FOREIGN KEY (step_id) REFERENCES generation_steps(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id, version_id, run_id) REFERENCES generation_runs(project_id, version_id, id) ON DELETE CASCADE,
        FOREIGN KEY (run_id, step_id) REFERENCES generation_steps(run_id, id) ON DELETE SET NULL,
        FOREIGN KEY (version_id, node_id) REFERENCES story_nodes(version_id, id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_runs_one_active_project
        ON generation_runs(project_id)
        WHERE status IN ('queued', 'running', 'paused');

      CREATE INDEX IF NOT EXISTS idx_generation_runs_project ON generation_runs(project_id);
      CREATE INDEX IF NOT EXISTS idx_generation_runs_version ON generation_runs(version_id);
      CREATE INDEX IF NOT EXISTS idx_generation_steps_run_status
        ON generation_steps(run_id, status, next_attempt_at, lease_expires_at, sort_order);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_steps_run_step_key
        ON generation_steps(run_id, step_key);
      CREATE INDEX IF NOT EXISTS idx_generation_candidates_node ON generation_candidates(version_id, node_id);
    `,
  },
  {
    version: 5,
    name: "validation_runs_and_issues",
    up: `
      CREATE TABLE IF NOT EXISTS validation_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        draft_revision INTEGER NOT NULL,
        sources_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        error_message TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id, version_id) REFERENCES story_versions(project_id, id) ON DELETE CASCADE,
        UNIQUE (project_id, version_id, id)
      );

      CREATE TABLE IF NOT EXISTS validation_issues (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        run_id TEXT,
        draft_revision INTEGER NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('structural', 'rule', 'ai_review')),
        severity TEXT NOT NULL CHECK (severity IN ('blocking', 'warning')),
        code TEXT NOT NULL,
        message TEXT NOT NULL,
        node_id TEXT,
        edge_id TEXT,
        details_json TEXT NOT NULL DEFAULT '{}',
        fingerprint TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'dismissed')),
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id, version_id) REFERENCES story_versions(project_id, id) ON DELETE CASCADE,
        FOREIGN KEY (run_id) REFERENCES validation_runs(id) ON DELETE SET NULL,
        UNIQUE (version_id, draft_revision, source, fingerprint)
      );

      CREATE INDEX IF NOT EXISTS idx_validation_runs_project ON validation_runs(project_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_validation_runs_version_revision ON validation_runs(version_id, draft_revision);
      CREATE INDEX IF NOT EXISTS idx_validation_issues_project_status ON validation_issues(project_id, status, severity);
      CREATE INDEX IF NOT EXISTS idx_validation_issues_version_revision ON validation_issues(version_id, draft_revision, source);
    `,
  },
  {
    version: 6,
    name: "explicit_main_and_side_branches",
    up: `
      ALTER TABLE story_edges
      ADD COLUMN branch_type TEXT NOT NULL DEFAULT 'side'
      CHECK (branch_type IN ('main', 'side'));

      UPDATE story_edges
      SET branch_type = 'main'
      WHERE sort_order = (
        SELECT MIN(candidate.sort_order)
        FROM story_edges AS candidate
        WHERE candidate.version_id = story_edges.version_id
          AND candidate.source_node_id = story_edges.source_node_id
      );
    `,
  },
  {
    version: 7,
    name: "interactive_generation_sessions",
    up: `
      CREATE TABLE IF NOT EXISTS interactive_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('generating', 'active', 'ended', 'failed')),
        turn INTEGER NOT NULL DEFAULT 0,
        target_turns INTEGER NOT NULL,
        state_json TEXT NOT NULL DEFAULT '{}',
        current_turn_id TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS interactive_turns (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        scene_json TEXT NOT NULL,
        selected_choice_id TEXT,
        selected_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES interactive_sessions(id) ON DELETE CASCADE,
        UNIQUE (session_id, turn)
      );

      CREATE INDEX IF NOT EXISTS idx_interactive_sessions_project
        ON interactive_sessions(project_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_interactive_turns_session
        ON interactive_turns(session_id, turn);
    `,
  },
  {
    version: 8,
    name: "generation_run_budgets",
    up: `
      ALTER TABLE generation_runs
      ADD COLUMN budget_json TEXT NOT NULL DEFAULT '{}';
    `,
  },
  {
    version: 9,
    name: "interactive_materialized_draft_links",
    up: `
      ALTER TABLE interactive_sessions
      ADD COLUMN materialized_version_id TEXT
      REFERENCES story_versions(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_interactive_sessions_materialized_version
        ON interactive_sessions(materialized_version_id);
    `,
  },
  {
    version: 10,
    name: "interactive_generation_attempt_tokens",
    up: `
      ALTER TABLE interactive_sessions
      ADD COLUMN generation_token TEXT;
    `,
  },
  {
    version: 11,
    name: "interactive_persistent_generation_jobs",
    up: `
      CREATE TABLE IF NOT EXISTS interactive_generation_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('opening', 'next')),
        expected_turn INTEGER NOT NULL,
        turn_id TEXT,
        choice_id TEXT,
        generation_token TEXT,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
        attempt INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
        deadline_at TEXT NOT NULL,
        lease_token TEXT,
        lease_expires_at TEXT,
        next_attempt_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES interactive_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (turn_id) REFERENCES interactive_turns(id) ON DELETE SET NULL
      );

      INSERT INTO interactive_generation_jobs (
        id, project_id, session_id, kind, expected_turn, status, attempt, max_attempts,
        deadline_at, created_at, updated_at
      )
      SELECT
        'legacy-opening-' || s.id, s.project_id, s.id, 'opening', 0, 'queued', 0, 3,
        datetime(s.updated_at, '+30 minutes'), s.created_at, s.updated_at
      FROM interactive_sessions AS s
      WHERE s.status = 'generating'
        AND s.turn = 0
        AND s.current_turn_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM interactive_generation_jobs AS existing WHERE existing.session_id = s.id);

      INSERT INTO interactive_generation_jobs (
        id, project_id, session_id, kind, expected_turn, turn_id, choice_id, generation_token,
        status, attempt, max_attempts, deadline_at, created_at, updated_at
      )
      SELECT
        'legacy-next-' || s.id, s.project_id, s.id, 'next', s.turn, t.id, t.selected_choice_id, s.generation_token,
        'queued', 0, 3, datetime(s.updated_at, '+30 minutes'), s.created_at, s.updated_at
      FROM interactive_sessions AS s
      JOIN interactive_turns AS t ON t.id = s.current_turn_id
      WHERE s.status = 'generating'
        AND s.turn > 0
        AND t.selected_choice_id IS NOT NULL
        AND s.generation_token IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM interactive_generation_jobs AS existing WHERE existing.session_id = s.id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_interactive_jobs_one_active_session
        ON interactive_generation_jobs(session_id)
        WHERE status IN ('queued', 'running');
      CREATE INDEX IF NOT EXISTS idx_interactive_jobs_claim
        ON interactive_generation_jobs(status, next_attempt_at, lease_expires_at, created_at);
      CREATE INDEX IF NOT EXISTS idx_interactive_jobs_session
        ON interactive_generation_jobs(project_id, session_id, created_at);
    `,
  },
  {
    version: 12,
    name: "interactive_usage_ledger_and_budgets",
    up: `
      ALTER TABLE interactive_sessions
      ADD COLUMN output_budget_limit INTEGER;

      ALTER TABLE interactive_sessions
      ADD COLUMN output_budget_reserved INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE interactive_sessions
      ADD COLUMN output_budget_consumed INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE interactive_sessions
      ADD COLUMN output_budget_unknown INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS interactive_generation_usage (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        task_attempt INTEGER NOT NULL,
        call_index INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('scene', 'ending-repair')),
        model TEXT NOT NULL,
        request_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('reserved', 'succeeded', 'unknown', 'canceled')),
        reserved_output_tokens INTEGER NOT NULL CHECK (reserved_output_tokens >= 0),
        input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
        output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
        latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES interactive_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES interactive_generation_jobs(id) ON DELETE CASCADE,
        UNIQUE (task_id, task_attempt, call_index)
      );

      CREATE INDEX IF NOT EXISTS idx_interactive_usage_project
        ON interactive_generation_usage(project_id, created_at, status);
      CREATE INDEX IF NOT EXISTS idx_interactive_usage_session
        ON interactive_generation_usage(session_id, created_at, status);
    `,
  },
  {
    version: 13,
    name: "interactive_session_summary_pagination_index",
    up: `
      CREATE INDEX IF NOT EXISTS idx_interactive_sessions_project_updated_id
        ON interactive_sessions(project_id, updated_at DESC, id DESC);
    `,
  },
];
