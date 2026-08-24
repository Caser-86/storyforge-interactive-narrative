import type Database from "better-sqlite3";
import { createHash, randomUUID } from "crypto";
import { initializeAuthoringDatabase } from "../database";
import { AuthoringError } from "../errors";
import { JsonValueSchema } from "../schemas";
import {
  ValidationIssueInputSchema,
  ValidationIssueRecordSchema,
  ValidationRunSchema,
} from "./schemas";
import type { ValidationIssueInput, ValidationIssueRecord, ValidationRun, ValidationSource, ValidationSeverity } from "./schemas";

export interface ValidationRepositoryOptions {
  dbPath?: string;
  backupDir?: string;
}

export interface ValidationRepository {
  createRun(projectId: string, versionId: string, draftRevision: number, sources: ValidationSource[]): Promise<ValidationRun>;
  completeRun(runId: string, status?: "completed" | "failed", errorMessage?: string): Promise<ValidationRun>;
  listRuns(projectId: string, versionId?: string, draftRevision?: number): Promise<ValidationRun[]>;
  replaceIssues(versionId: string, draftRevision: number, source: ValidationSource, issues: ValidationIssueInput[], runId?: string): Promise<ValidationIssueRecord[]>;
  listIssues(projectId: string, versionId?: string, draftRevision?: number): Promise<ValidationIssueRecord[]>;
  resolveIssue(issueId: string): Promise<ValidationIssueRecord>;
  dismissWarning(issueId: string): Promise<ValidationIssueRecord>;
  close(): void;
}

type RunRow = {
  id: string;
  project_id: string;
  version_id: string;
  draft_revision: number;
  sources_json: string;
  status: ValidationRun["status"];
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

type IssueRow = {
  id: string;
  project_id: string;
  version_id: string;
  run_id: string | null;
  draft_revision: number;
  source: ValidationIssueRecord["source"];
  severity: ValidationSeverity;
  code: string;
  message: string;
  node_id: string | null;
  edge_id: string | null;
  details_json: string;
  fingerprint: string;
  status: ValidationIssueRecord["status"];
  created_at: string;
  resolved_at: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function storageError(error: unknown, message: string): AuthoringError {
  if (error instanceof AuthoringError) return error;
  return new AuthoringError("STORAGE", message, { cause: error instanceof Error ? error.message : String(error) });
}

function toRun(row: RunRow): ValidationRun {
  return ValidationRunSchema.parse({
    id: row.id,
    projectId: row.project_id,
    versionId: row.version_id,
    draftRevision: row.draft_revision,
    sources: parseJson(row.sources_json),
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  });
}

function toIssue(row: IssueRow): ValidationIssueRecord {
  return ValidationIssueRecordSchema.parse({
    id: row.id,
    projectId: row.project_id,
    versionId: row.version_id,
    runId: row.run_id,
    draftRevision: row.draft_revision,
    source: row.source,
    severity: row.severity,
    code: row.code,
    message: row.message,
    nodeId: row.node_id,
    edgeId: row.edge_id,
    detailsJson: JsonValueSchema.parse(parseJson(row.details_json)),
    fingerprint: row.fingerprint,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  });
}

function fingerprintFor(issue: ValidationIssueInput): string {
  const canonical = JSON.stringify({
    source: issue.source,
    code: issue.code,
    nodeId: issue.nodeId ?? null,
    edgeId: issue.edgeId ?? null,
    detailsJson: issue.detailsJson ?? {},
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export class BetterSqliteValidationRepository implements ValidationRepository {
  private readonly db: Database.Database;

  constructor(options: ValidationRepositoryOptions = {}) {
    this.db = initializeAuthoringDatabase(options);
  }

  public async createRun(projectId: string, versionId: string, draftRevision: number, sources: ValidationSource[]): Promise<ValidationRun> {
    try {
      const row = this.db
        .prepare("SELECT 1 FROM story_versions WHERE project_id = ? AND id = ?")
        .get(projectId, versionId);
      if (!row) throw new AuthoringError("NOT_FOUND", "Validation version not found", { projectId, versionId });
      const id = randomUUID();
      const createdAt = nowIso();
      this.db.prepare("INSERT INTO validation_runs (id, project_id, version_id, draft_revision, sources_json, status, created_at) VALUES (?, ?, ?, ?, ?, 'running', ?)").run(id, projectId, versionId, draftRevision, JSON.stringify(sources), createdAt);
      return this.getRun(id);
    } catch (error) {
      throw storageError(error, "Failed to create validation run");
    }
  }

  public async completeRun(runId: string, status: "completed" | "failed" = "completed", errorMessage?: string): Promise<ValidationRun> {
    try {
      const completedAt = nowIso();
      const result = this.db.prepare("UPDATE validation_runs SET status = ?, error_message = ?, completed_at = ? WHERE id = ?").run(status, errorMessage ?? null, completedAt, runId);
      if (result.changes !== 1) throw new AuthoringError("NOT_FOUND", "Validation run not found", { runId });
      return this.getRun(runId);
    } catch (error) {
      throw storageError(error, "Failed to complete validation run");
    }
  }

  public async listRuns(projectId: string, versionId?: string, draftRevision?: number): Promise<ValidationRun[]> {
    try {
      const clauses = ["project_id = ?"];
      const params: Array<string | number> = [projectId];
      if (versionId !== undefined) {
        clauses.push("version_id = ?");
        params.push(versionId);
      }
      if (draftRevision !== undefined) {
        clauses.push("draft_revision = ?");
        params.push(draftRevision);
      }
      const rows = this.db
        .prepare(`SELECT * FROM validation_runs WHERE ${clauses.join(" AND ")} ORDER BY created_at ASC, id ASC`)
        .all(...params) as RunRow[];
      return rows.map(toRun);
    } catch (error) {
      throw storageError(error, "Failed to list validation runs");
    }
  }

  public async replaceIssues(versionId: string, draftRevision: number, source: ValidationSource, issues: ValidationIssueInput[], runId?: string): Promise<ValidationIssueRecord[]> {
    try {
      const replace = this.db.transaction(() => {
        const version = this.db.prepare("SELECT project_id FROM story_versions WHERE id = ?").get(versionId) as { project_id: string } | undefined;
        if (!version) throw new AuthoringError("NOT_FOUND", "Validation version not found", { versionId });
        const validated = issues.map((issue) => ValidationIssueInputSchema.parse({ ...issue, source }));
        const timestamp = nowIso();
        this.db.prepare("DELETE FROM validation_issues WHERE version_id = ? AND draft_revision = ? AND source = ? AND status = 'open'").run(versionId, draftRevision, source);
        const insert = this.db.prepare(
          `INSERT INTO validation_issues (
             id, project_id, version_id, run_id, draft_revision, source, severity,
             code, message, node_id, edge_id, details_json, fingerprint, status,
             created_at, resolved_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, NULL)
           ON CONFLICT(version_id, draft_revision, source, fingerprint) DO UPDATE SET
             run_id = excluded.run_id,
             severity = excluded.severity,
             message = excluded.message,
             node_id = excluded.node_id,
             edge_id = excluded.edge_id,
             details_json = excluded.details_json,
             status = 'open',
             resolved_at = NULL`,
        );
        for (const issue of validated) {
          const fingerprint = fingerprintFor(issue);
          const id = `validation:${versionId}:${draftRevision}:${source}:${fingerprint}`;
          insert.run(id, version.project_id, versionId, runId ?? null, draftRevision, source, issue.severity, issue.code, issue.message, issue.nodeId ?? null, issue.edgeId ?? null, JSON.stringify(issue.detailsJson ?? {}), fingerprint, timestamp);
        }
        return this.listIssueRows(version.project_id, versionId, draftRevision, source);
      });
      return replace().map(toIssue);
    } catch (error) {
      throw storageError(error, "Failed to replace validation issues");
    }
  }

  public async listIssues(projectId: string, versionId?: string, draftRevision?: number): Promise<ValidationIssueRecord[]> {
    try {
      return this.listIssueRows(projectId, versionId, draftRevision).map(toIssue);
    } catch (error) {
      throw storageError(error, "Failed to list validation issues");
    }
  }

  public async resolveIssue(issueId: string): Promise<ValidationIssueRecord> {
    return this.updateIssue(issueId, "resolved");
  }

  public async dismissWarning(issueId: string): Promise<ValidationIssueRecord> {
    try {
      const issue = this.getIssue(issueId);
      if (issue.severity === "blocking") throw new AuthoringError("VALIDATION", "Blocking validation issues cannot be dismissed", { issueId });
      return this.updateIssue(issueId, "dismissed");
    } catch (error) {
      throw storageError(error, "Failed to dismiss validation warning");
    }
  }

  public close(): void {
    this.db.close();
  }

  private getRun(runId: string): ValidationRun {
    const row = this.db.prepare("SELECT * FROM validation_runs WHERE id = ?").get(runId) as RunRow | undefined;
    if (!row) throw new AuthoringError("NOT_FOUND", "Validation run not found", { runId });
    return toRun(row);
  }

  private getIssue(issueId: string): ValidationIssueRecord {
    const row = this.db.prepare("SELECT * FROM validation_issues WHERE id = ?").get(issueId) as IssueRow | undefined;
    if (!row) throw new AuthoringError("NOT_FOUND", "Validation issue not found", { issueId });
    return toIssue(row);
  }

  private updateIssue(issueId: string, status: "resolved" | "dismissed"): ValidationIssueRecord {
    this.getIssue(issueId);
    const resolvedAt = nowIso();
    this.db.prepare("UPDATE validation_issues SET status = ?, resolved_at = ? WHERE id = ?").run(status, resolvedAt, issueId);
    return this.getIssue(issueId);
  }

  private listIssueRows(projectId: string, versionId?: string, draftRevision?: number, source?: ValidationSource): IssueRow[] {
    const clauses = ["project_id = ?"];
    const params: Array<string | number> = [projectId];
    if (versionId !== undefined) { clauses.push("version_id = ?"); params.push(versionId); }
    if (draftRevision !== undefined) { clauses.push("draft_revision = ?"); params.push(draftRevision); }
    if (source !== undefined) { clauses.push("source = ?"); params.push(source); }
    return this.db.prepare(`SELECT * FROM validation_issues WHERE ${clauses.join(" AND ")} ORDER BY severity ASC, created_at ASC, id ASC`).all(...params) as IssueRow[];
  }
}

export function createValidationRepository(options: ValidationRepositoryOptions = {}): ValidationRepository {
  return new BetterSqliteValidationRepository(options);
}
