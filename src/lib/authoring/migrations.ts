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
];
