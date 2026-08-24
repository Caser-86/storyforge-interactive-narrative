import { expect, test } from "@playwright/test";

test.describe("generation cancellation", () => {
  test("cancels a queued run without presenting a generation error", async ({ page, request }) => {
    const projectResponse = await request.post("/api/projects", {
      data: {
        title: "取消流程测试",
        premise: "一名作者在开始生成前决定调整故事方向。",
        genre: "悬疑",
        tone: "克制",
        pointOfView: "第三人称",
        rating: "PG-13",
        size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
      },
    });
    expect(projectResponse.ok()).toBe(true);
    const project = (await projectResponse.json()).project as { id: string };

    await page.goto(`/projects/${project.id}/generate`);
    await expect(page.getByText("准备生成")).toBeVisible();
    await page.getByRole("button", { name: "取消流程" }).click();

    await expect(page.locator(".generation-status")).toHaveText("已取消");
    await expect(page.getByText("本次结果不会写入流程")).toBeVisible();
    await expect(page.getByRole("alert")).not.toContainText("生成推进失败");
  });
});
