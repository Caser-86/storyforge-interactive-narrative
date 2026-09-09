import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";

const SQLITE_E2E_PATH = path.join(process.cwd(), "output", "playwright", "authoring-e2e.sqlite");

async function cleanAuthoringDatabase(): Promise<void> {
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = `${SQLITE_E2E_PATH}${suffix}`;
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

test.describe("empty draft recovery", () => {
  test.beforeEach(() => cleanAuthoringDatabase());
  test.afterEach(() => cleanAuthoringDatabase());

  test("offers author-driven generation when an editor draft has no nodes", async ({ page, request }) => {
    const projectResponse = await request.post("/api/projects", {
      data: {
        title: "空草稿恢复测试",
        premise: "一名档案员发现一扇不该存在的门。",
        genre: "悬疑",
        tone: "克制紧张",
        pointOfView: "第二人称",
        rating: "PG-13",
        size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
      },
    });
    expect(projectResponse.ok()).toBe(true);
    const project = (await projectResponse.json()).project as { id: string };

    await page.goto(`/projects/${project.id}/edit`);

    await expect(page.getByRole("heading", { name: "这个草稿还没有可编辑的节点" })).toBeVisible();
    await expect(page.getByRole("link", { name: "开始分支写作" })).toHaveAttribute("href", `/projects/${project.id}/generate`);
    await expect(page.getByRole("link", { name: "重试一次性结构化生成" }))
      .toHaveAttribute("href", `/projects/${project.id}/generate/structured`);
  });
});
