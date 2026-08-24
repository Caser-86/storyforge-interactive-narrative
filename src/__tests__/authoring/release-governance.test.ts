import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

function readRepositoryFile(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

describe("release governance", () => {
  it("runs CI for the canonical branch, release tags, and manual dispatch", () => {
    const workflow = readRepositoryFile(".github/workflows/ci.yml");

    expect(workflow).toMatch(/push:\s*\n\s*branches:\s*\[master\]\s*\n\s*tags:\s*\[\"v\*\"\]/);
    expect(workflow).toMatch(/pull_request:\s*\n\s*branches:\s*\[master\]/);
    expect(workflow).toMatch(/workflow_dispatch:\s*\n/);
  });

  it("generates release evidence only from version tags", () => {
    const workflow = readRepositoryFile(".github/workflows/ci.yml");

    expect(workflow).toContain("release-evidence:");
    expect(workflow).toContain("startsWith(github.ref, 'refs/tags/v')");
    expect(workflow).toContain("npm run package:standalone");
    expect(workflow).toContain("npm run release:evidence");
    expect(workflow).toContain("output/release/");
  });

  it("keeps generated verification artifacts out of commits", () => {
    expect(readRepositoryFile(".gitignore")).toMatch(/^\/output\/$/m);
  });

  it("does not claim that unobserved remote CI has passed", () => {
    const verification = readRepositoryFile("docs/release/authoring-verification.md");

    expect(verification).toContain("will run when a pull request from this branch targets `master`");
    expect(verification).not.toContain("will run after the branch and tag are pushed");
  });

  it("documents the human release procedure", () => {
    const procedure = readRepositoryFile("docs/release/github-release-procedure.md");

    expect(procedure).toContain("protected `master` branch");
    expect(procedure).toContain("GitHub Release");
    expect(procedure).toContain("green Actions run");
  });

  it("defines reproducible SBOM, license, and distribution evidence", () => {
    const packageJson = JSON.parse(readRepositoryFile("package.json")) as { scripts: Record<string, string> };
    const policy = readRepositoryFile("docs/release/dependency-license-sbom-policy.md");
    const script = readRepositoryFile("scripts/release-evidence.ps1");

    expect(packageJson.scripts["release:evidence"]).toContain("release-evidence");
    expect(policy).toContain("CycloneDX");
    expect(policy).toMatch(/私人|private/);
    expect(script).toMatch(/npm sbom/);
    expect(script).toMatch(/Get-FileHash/);
    expect(script).toMatch(/secretsIncluded/);
  });
});
