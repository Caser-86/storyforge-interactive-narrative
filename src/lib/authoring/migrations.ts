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
];
