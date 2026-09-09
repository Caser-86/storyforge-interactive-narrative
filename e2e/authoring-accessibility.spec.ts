import fs from "fs";
import path from "path";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const databasePath = path.join(process.cwd(), "output", "playwright", "authoring-e2e.sqlite");

function cleanDatabase(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(databasePath + suffix, { force: true });
  }
}

async function expectAccessible(page: Page, label: string): Promise<void> {
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page }).analyze();
  const seriousViolations = results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(seriousViolations, label + " has serious accessibility violations").toEqual([]);
}

test.describe("authoring accessibility", () => {
  test.beforeEach(cleanDatabase);
  test.afterEach(cleanDatabase);

  test("critical authoring screens pass axe and support reduced motion", async ({ page, request }) => {
    await page.goto("/projects/new");
    await expect(page.getByRole("heading", { name: "先把边界写下来。" })).toBeVisible();
    await expectAccessible(page, "new project");

    const create = await request.post("/api/projects", {
      data: {
        title: "Accessibility Story",
        premise: "A finite local story supports a keyboard-first authoring workflow.",
        genre: "mystery",
        tone: "measured",
        pointOfView: "third person",
        rating: "PG-13",
        size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
      },
    });
    expect(create.ok()).toBe(true);
    const project = (await create.json()).project as { id: string };

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "项目库" })).toBeVisible();
    await expectAccessible(page, "project library");

    await page.getByRole("link", { name: /新建项目/ }).focus();
    await expect(page.getByRole("link", { name: /新建项目/ })).toBeFocused();

    await page.goto("/projects/" + project.id + "/generate");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("button", { name: "开始分支写作" })).toBeVisible();
    await expectAccessible(page, "generation");

    await page.goto("/projects/" + project.id + "/generate/structured");
    await expect(page.locator("main")).toBeVisible();
    await expectAccessible(page, "structured generation");

    await page.goto("/projects/" + project.id + "/edit");
    await expect(page.locator("main")).toBeVisible();
    await expectAccessible(page, "editor");

    await page.goto("/projects/" + project.id + "/play");
    await expect(page.locator("main")).toBeVisible();
    await expectAccessible(page, "interactive play");

    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  });
});
