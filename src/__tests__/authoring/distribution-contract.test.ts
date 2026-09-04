import fs from "node:fs";
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
    expect(packageJson.engines.node).toContain("24");
    expect(packageJson.scripts.build).toContain("next build");
    expect(packageJson.dependencies["better-sqlite3"]).toBeTruthy();
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
});
