import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Windows distribution contract", () => {
  it("documents the smallest supported packaging path and data lifecycle", () => {
    const decision = fs.readFileSync(path.join(root, "docs/architecture/windows-packaging-decision.md"), "utf8");
    const lifecycle = fs.readFileSync(path.join(root, "docs/operations/windows-data-lifecycle.md"), "utf8");
    expect(decision).toMatch(/Node.*24.*standalone/i);
    expect(decision).toMatch(/Electron/);
    expect(decision).toMatch(/Tauri/);
    expect(lifecycle).toMatch(/LOCALAPPDATA/);
    expect(lifecycle).toMatch(/卸载[\s\S]*不删除|不删除[\s\S]*data/);
  });

  it("keeps the package smoke script scoped to a verified temporary root", () => {
    const script = fs.readFileSync(path.join(root, "scripts/package-smoke.ps1"), "utf8");
    const packageScript = fs.readFileSync(path.join(root, "scripts/package-standalone.ps1"), "utf8");
    expect(script).toMatch(/Mode.*DryRun/);
    expect(script).toMatch(/Local mode requires/);
    expect(script).toMatch(/system temporary directory/);
    expect(script).toMatch(/Remove-Item -LiteralPath \$resolvedRoot/);
    expect(packageScript).toMatch(/Copy-Item -Path/);
    expect(packageScript).toMatch(/packageRoot = "\."/);
    expect(packageScript).not.toMatch(/Copy-Item -LiteralPath.*\*/);
    expect(script).not.toMatch(/Remove-Item.*\$env:USERPROFILE/);
  });

  it("executes the local package lifecycle instead of only scaffolding folders", () => {
    const script = fs.readFileSync(path.join(root, "scripts/package-smoke.ps1"), "utf8");

    expect(script).toMatch(/Copy-Item -Path/);
    expect(script).toMatch(/Start-Process/);
    expect(script).toMatch(/api\/health/);
    expect(script).toMatch(/installV2/);
    expect(script).toMatch(/failed-upgrade/);
    expect(script).toMatch(/HasExited/);
    expect(script).toMatch(/rollback/);
    expect(script).toMatch(/uninstall-preserves-data/);
  });

  it("retains the current native and standalone constraints", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { engines: { node: string }; scripts: { build: string }; dependencies: Record<string, string> };
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
    const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
    expect(packageJson.engines.node).toContain("24");
    expect(packageJson.scripts.build).toContain("next build");
    expect(packageJson.dependencies["better-sqlite3"]).toBeTruthy();
    expect(readme).toMatch(/PowerShell.*7.*pwsh/i);
    expect(workflow).toContain("Check PowerShell runtime");
  });

  it("keeps local author data out of Docker context and preserves the public asset contract", () => {
    const dockerignore = fs.readFileSync(path.join(root, ".dockerignore"), "utf8");
    const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");

    for (const pattern of ["/data/", "/output/", "/.superpowers/", "/.agents/", "*.log", "*.tsbuildinfo", ".next-playwright", "/playwright-report/", "/test-results/"]) {
      expect(dockerignore).toContain(pattern);
    }

    expect(fs.existsSync(path.join(root, "public", ".gitkeep"))).toBe(true);
    expect(dockerfile).toContain("COPY --from=builder /app/public ./public");
  });

  it("prepares writable data directories before dropping Docker privileges", () => {
    const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");

    expect(dockerfile).toContain("mkdir -p /app/data /app/data/backups");
    expect(dockerfile).toContain("chown -R nextjs:nodejs /app/data");
  });

  it("scans standalone contents before asserting that secrets are excluded", () => {
    const packageScript = fs.readFileSync(path.join(root, "scripts/package-standalone.ps1"), "utf8");
    const releaseScript = fs.readFileSync(path.join(root, "scripts/release-evidence.ps1"), "utf8");

    const scannerPath = path.join(root, "scripts/scan-package-secrets.ps1");
    expect(fs.existsSync(scannerPath)).toBe(true);
    const scanner = fs.readFileSync(scannerPath, "utf8");

    expect(scanner).toContain("ark-");
    expect(scanner).toContain("Bearer\\s+");
    expect(scanner).toContain("https?://");
    expect(scanner).toMatch(/Get-ChildItem[\s\S]*Root/);
    expect(scanner).toContain("$null -eq $content");
    expect(scanner).toMatch(/secretFindings/);
    expect(packageScript).toContain("scan-package-secrets.ps1");
    expect(releaseScript).toContain("scan-package-secrets.ps1");
    expect(packageScript).not.toContain("secretsIncluded = $false");
  });

  it("fails on a runtime credential without echoing its value", () => {
    const scannerPath = path.join(root, "scripts/scan-package-secrets.ps1");
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "storyforge-package-secret-scan-"));
    const fakeCredential = ["ark", "fixture-credential-1234567890"].join("-");

    try {
      fs.writeFileSync(path.join(tempRoot, "runtime-config.js"), `const token = ${JSON.stringify(fakeCredential)};\n`, "utf8");
      const result = spawnSync("pwsh", ["-NoProfile", "-File", scannerPath, "-Root", tempRoot], {
        encoding: "utf8",
      });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(output).toContain("Package secret scan failed");
      expect(output).not.toContain(fakeCredential);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
