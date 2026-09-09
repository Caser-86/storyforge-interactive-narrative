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

  it("runs the offline interactive evaluation in the verification job", () => {
    expect(readRepositoryFile(".github/workflows/ci.yml")).toContain("npm run interactive:evaluate -- --provider fake");
  });

  it("generates release evidence only from version tags", () => {
    const workflow = readRepositoryFile(".github/workflows/ci.yml");

    expect(workflow).toContain("release-evidence:");
    expect(workflow).toContain("startsWith(github.ref, 'refs/tags/v')");
    expect(workflow).toContain("npm run package:standalone");
    expect(workflow).toContain("npm run release:evidence");
    expect(workflow).toContain("output/release/");
  });

  it("keeps Windows standalone and Docker target checks explicit", () => {
    const workflow = readRepositoryFile(".github/workflows/ci.yml");

    expect(workflow).toContain("standalone-windows:");
    expect(workflow).toContain("runs-on: windows-latest");
    expect(workflow).toContain("npm run package:standalone");
    expect(workflow).toContain("scripts/package-smoke.ps1 -Mode Local");
    expect(workflow).toContain("docker-build:");
    expect(workflow).toContain("docker build --pull");
    expect(workflow).toContain("/api/health");
    expect(workflow).toContain("docker rm --force");
  });

  it("keeps generated verification artifacts out of commits", () => {
    expect(readRepositoryFile(".gitignore")).toMatch(/^\/output\/$/m);
  });

  it("records observed remote release evidence without stale CI claims", () => {
    const verification = readRepositoryFile("docs/release/authoring-verification.md");

    expect(verification).toContain("PR #1 targeted `master`; `CI/verify` and `CI/e2e-authoring` passed before merge.");
    expect(verification).toContain("Tag run `32687684469` passed on `v0.1.4`");
    expect(verification).toContain("Published v0.1.4 Evidence");
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
