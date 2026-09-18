import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";

const databasePath = path.join(process.cwd(), "output", "playwright", "authoring-e2e.sqlite");

async function cleanDatabase(): Promise<void> {
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = databasePath + suffix;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        fs.rmSync(target, { force: true });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EPERM" || attempt === 9) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
}

test.describe("interactive mobile resilience", () => {
  test.beforeEach(cleanDatabase);
  test.afterEach(cleanDatabase);

  test("wraps a long unbroken scene body without horizontal overflow", async ({ page, request }) => {
    const projectResponse = await request.post("/api/projects", {
      data: {
        title: "移动端长文本测试",
        premise: "一名档案员在门后发现一份需要继续核对的记录。",
        genre: "悬疑",
        tone: "克制",
        pointOfView: "第三人称",
        rating: "PG-13",
        size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
      },
    });
    expect(projectResponse.ok()).toBe(true);
    const project = (await projectResponse.json()).project as { id: string };

    await page.route(/\/api\/projects\/[^/]+\/play(?:\/[^/]+)?$/, async (route) => {
      const response = await route.fetch();
      const payload = await response.json() as { session?: { scene?: { body?: string } } };
      if (payload.session?.scene) {
        payload.session.scene.body = "A".repeat(1_700);
      }
      await route.fulfill({ response, json: payload });
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/projects/${project.id}/generate`);
    await page.getByRole("button", { name: "开始分支写作" }).click();
    await expect(page.locator(".interactive-body")).toContainText("AAAA");

    const dimensions = await page.evaluate(() => ({
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  });
});
