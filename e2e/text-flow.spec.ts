import { test, expect } from "@playwright/test";

test.describe("Text Flow - 无图文字主线", () => {
  test("默认不勾选场景图时，创建游戏不触发图片请求", async ({ page }) => {
    const assetRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/api/assets")) {
        assetRequests.push(url);
      }
    });

    await page.goto("/");

    await page.locator("textarea").fill("一个勇敢的冒险者走进了神秘森林");

    const checkbox = page.locator('input[type="checkbox"]');
    await expect(checkbox).not.toBeChecked();

    const responsePromise = page.waitForResponse((resp) =>
      resp.url().includes("/api/games") && resp.request().method() === "POST"
    );

    await page.locator('button:has-text("开始冒险")').click();

    const response = await responsePromise;
    const body = await response.json();

    expect(body.sessionId).toBeDefined();
    expect(body.assets.imageJobId).toBeNull();
    expect(body.assets.imageStatus).toBe("none");
    expect(assetRequests.length).toBe(0);
  });

  test("首幕包含标题、正文、NPC和3个选项", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个赛博朋克侦探故事");
    await page.locator('button:has-text("开始冒险")').click();

    await page.waitForSelector("h2", { timeout: 30_000 });

    await expect(page.locator("h2")).toBeVisible();
    await expect(page.locator("text=📍")).toBeVisible();
    await expect(page.locator("text=选择你的行动")).toBeVisible();

    const choiceButtons = page.locator("button:has-text('风险')");
    await expect(choiceButtons).toHaveCount(3, { timeout: 30_000 });
  });

  test("无图模式不显示画面Tab和画面面板", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个奇幻冒险故事");
    await page.locator('button:has-text("开始冒险")').click();

    await page.waitForSelector("h2", { timeout: 30_000 });

    await expect(page.locator('text=画面')).not.toBeVisible();
  });

  test("选择选项后生成第二幕", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个悬疑推理故事");
    await page.locator('button:has-text("开始冒险")').click();

    await page.waitForSelector("h2", { timeout: 30_000 });
    const firstTitle = await page.locator("h2").textContent();

    const firstChoice = page.locator("button:has-text('风险')").first();
    await firstChoice.click();

    await page.waitForFunction(
      (prevTitle) => {
        const h2 = document.querySelector("h2");
        return h2 && h2.textContent !== prevTitle;
      },
      firstTitle,
      { timeout: 30_000 }
    );

    await expect(page.locator("h2")).toBeVisible();
    await expect(page.locator("button:has-text('风险')")).toHaveCount(3, { timeout: 30_000 });
  });

  test("历史选择显示上一幕选择", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个太空探索故事");
    await page.locator('button:has-text("开始冒险")').click();

    await page.waitForSelector("h2", { timeout: 30_000 });

    const firstChoice = page.locator("button:has-text('风险')").first();
    const choiceLabel = await firstChoice.locator("span.font-semibold").textContent();
    await firstChoice.click();

    await page.waitForSelector("text=历史选择", { timeout: 30_000 });

    const historySection = page.locator("text=历史选择");
    await expect(historySection).toBeVisible();
    if (choiceLabel) {
      await expect(page.locator(`text=${choiceLabel}`)).toBeVisible();
    }
  });

  test("连续选择3轮后刷新页面可恢复", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个末日生存故事");
    await page.locator('button:has-text("开始冒险")').click();

    await page.waitForSelector("h2", { timeout: 30_000 });

    for (let i = 0; i < 3; i++) {
      const prevTitle = await page.locator("h2").textContent();
      const choice = page.locator("button:has-text('风险')").first();
      await choice.click();

      await page.waitForFunction(
        (prev) => {
          const h2 = document.querySelector("h2");
          return h2 && h2.textContent !== prev;
        },
        prevTitle,
        { timeout: 30_000 }
      );
    }

    await page.reload();

    await page.waitForSelector("h2", { timeout: 30_000 });
    await expect(page.locator("h2")).toBeVisible();
    await expect(page.locator("button:has-text('风险')")).toHaveCount(3, { timeout: 30_000 });
  });

  test("恢复后可继续选择推进", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个魔法学院故事");
    await page.locator('button:has-text("开始冒险")').click();

    await page.waitForSelector("h2", { timeout: 30_000 });

    const firstChoice = page.locator("button:has-text('风险')").first();
    await firstChoice.click();

    await page.waitForFunction(() => {
      const buttons = document.querySelectorAll("button:has(span)");
      return buttons.length >= 3;
    }, { timeout: 30_000 });

    await page.reload();

    await page.waitForSelector("h2", { timeout: 30_000 });
    const titleBefore = await page.locator("h2").textContent();

    const restoredChoice = page.locator("button:has-text('风险')").first();
    await restoredChoice.click();

    await page.waitForFunction(
      (prev) => {
        const h2 = document.querySelector("h2");
        return h2 && h2.textContent !== prev;
      },
      titleBefore,
      { timeout: 30_000 }
    );

    await expect(page.locator("h2")).toBeVisible();
  });
});

test.describe("Text Flow - API 层无图验证", () => {
  test("默认创建游戏返回 imageJobId=null", async ({ request }) => {
    const res = await request.post("/api/games", {
      data: { prompt: "一个简单的冒险故事" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.assets.imageJobId).toBeNull();
    expect(body.assets.imageStatus).toBe("none");
  });

  test("默认创建游戏不触发 asset_jobs", async ({ request }) => {
    const res = await request.post("/api/games", {
      data: { prompt: "一个简单的冒险故事" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.meta?.imageGenerationEnabled).toBeFalsy();
  });

  test("开启图片后创建游戏返回 imageJobId", async ({ request }) => {
    const res = await request.post("/api/games", {
      data: {
        prompt: "一个简单的冒险故事",
        options: { enableImages: true },
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.assets.imageJobId).not.toBeNull();
    expect(body.assets.imageStatus).toBe("queued");
    expect(body.meta?.imageGenerationEnabled).toBe(true);
  });
});
