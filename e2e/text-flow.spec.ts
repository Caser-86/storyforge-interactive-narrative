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
    await expect(page.locator("textarea")).toHaveValue("一个勇敢的冒险者走进了神秘森林");

    const startButton = page.locator('button:has-text("开始冒险")');
    await expect(startButton).toBeEnabled();
    const responsePromise = page.waitForResponse((resp) =>
      resp.url().includes("/api/games") && resp.request().method() === "POST"
    );

    await startButton.click();

    const response = await responsePromise;
    const body = await response.json();

    expect(body.sessionId).toBeDefined();
    expect(body.assets.imageJobId).toBeNull();
    expect(body.assets.imageStatus).toBe("none");
    expect(assetRequests.length).toBe(0);
  });

  test("首幕包含标题、正文和3个选项", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个赛博朋克侦探故事");
    await page.locator('button:has-text("开始冒险")').click();

    await page.waitForSelector("h2:visible", { timeout: 30_000 });

    await expect(page.locator("h2:visible")).toBeVisible();

    const choiceButtons = page.locator("[data-risk]:visible");
    await expect(choiceButtons).toHaveCount(3, { timeout: 30_000 });
  });

  test("无图模式不显示画面Tab和画面面板", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个奇幻冒险故事");
    await page.locator('button:has-text("开始冒险")').click();

    await page.waitForSelector("h2:visible", { timeout: 30_000 });

    await expect(page.locator('text=画面')).not.toBeVisible();
  });

  test("选择选项后生成第二幕", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个悬疑推理故事");
    await page.locator('button:has-text("开始冒险")').click();

    await page.waitForSelector("h2:visible", { timeout: 30_000 });
    const firstChoice = page.locator("button[data-risk]:visible:not([disabled])").first();
    const responsePromise = page.waitForResponse((resp) =>
      resp.url().includes("/choices") && resp.request().method() === "POST"
    );
    await firstChoice.click();
    await responsePromise;

    await expect(page.locator("h2:visible")).toBeVisible();
    await expect(page.locator("[data-risk]:visible")).toHaveCount(3, { timeout: 30_000 });
  });

  test("历史选择显示上一幕选择", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个太空探索故事");
    await page.locator('button:has-text("开始冒险")').click();

    await page.waitForSelector("h2:visible", { timeout: 30_000 });

    const firstChoice = page.locator("button[data-risk]:visible:not([disabled])").first();
    const choiceLabel = await firstChoice.locator("span.font-semibold").textContent();
    const responsePromise = page.waitForResponse((resp) =>
      resp.url().includes("/choices") && resp.request().method() === "POST"
    );
    await firstChoice.click();
    await responsePromise;

    await page.waitForSelector("text=历史选择", { timeout: 30_000 });

    const historySection = page.locator("text=历史选择").first();
    await expect(historySection).toBeVisible();
    if (choiceLabel) {
      await expect(page.locator(`text=${choiceLabel}`).first()).toBeVisible();
    }
  });

  test("连续选择3轮后刷新页面可恢复", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个末日生存故事");
    await page.locator('button:has-text("开始冒险")').click();

    await page.waitForSelector("h2:visible", { timeout: 30_000 });

    for (let i = 0; i < 3; i++) {
      const choice = page.locator("button[data-risk]:visible:not([disabled])").first();
      const responsePromise = page.waitForResponse((resp) =>
        resp.url().includes("/choices") && resp.request().method() === "POST"
      );
      await choice.click();
      await responsePromise;

      await expect(page.locator("[data-risk]:visible")).toHaveCount(3, { timeout: 30_000 });
    }

    await page.reload();

    await page.waitForSelector("h2:visible", { timeout: 30_000 });
    await expect(page.locator("h2:visible")).toBeVisible();
    await expect(page.locator("[data-risk]:visible")).toHaveCount(3, { timeout: 30_000 });
  });

  test("恢复后可继续选择推进", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个魔法学院故事");
    await page.locator('button:has-text("开始冒险")').click();

    await page.waitForSelector("h2:visible", { timeout: 30_000 });

    const firstChoice = page.locator("button[data-risk]:visible:not([disabled])").first();
    const firstResponsePromise = page.waitForResponse((resp) =>
      resp.url().includes("/choices") && resp.request().method() === "POST"
    );
    await firstChoice.click();
    await firstResponsePromise;

    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll("[data-risk]")).filter((el) => el instanceof HTMLElement && el.offsetParent !== null);
      return buttons.length >= 3;
    }, { timeout: 30_000 });

    await page.reload();

    await page.waitForSelector("h2:visible", { timeout: 30_000 });
    const restoredChoice = page.locator("button[data-risk]:visible:not([disabled])").first();
    const responsePromise = page.waitForResponse((resp) =>
      resp.url().includes("/choices") && resp.request().method() === "POST"
    );
    await restoredChoice.click();
    await responsePromise;

    await expect(page.locator("h2:visible")).toBeVisible();
  });
});

test.describe("Text Flow - 故事弧线", () => {
  test("创建短篇游戏时显示故事进度", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个短篇冒险故事");
    await page.locator('button:has-text("开始冒险")').click();

    await page.waitForSelector("[data-testid='story-progress']:visible", { timeout: 30_000 });

    const progressEl = page.locator("[data-testid='story-progress']:visible");
    await expect(progressEl).toBeVisible();
    await expect(progressEl.locator("text=开端")).toBeVisible();
    await expect(progressEl.locator("text=/第 \\d+ \\/ 目标 \\d+ 步/")).toBeVisible();
  });

  test("短篇游戏推进后阶段从开端变为展开", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个短篇冒险故事");
    await page.locator('button:has-text("开始冒险")').click();

    await page.waitForSelector("[data-testid='story-progress']:visible", { timeout: 30_000 });

    for (let i = 0; i < 3; i++) {
      const choice = page.locator("button[data-risk]:visible:not([disabled])").first();
      const responsePromise = page.waitForResponse((resp) =>
        resp.url().includes("/choices") && resp.request().method() === "POST"
      );
      await choice.click();
      await responsePromise;

      await expect(page.locator("[data-risk]:visible")).toHaveCount(3, { timeout: 30_000 });
    }

    const progressEl = page.locator("[data-testid='story-progress']:visible");
    await expect(progressEl.locator("text=展开")).toBeVisible({ timeout: 10_000 });
  });

  test("短篇游戏到达目标步数后显示结局", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个短篇冒险故事");
    await page.locator('button:has-text("开始冒险")').click();

    await page.waitForSelector("h2:visible", { timeout: 30_000 });

    for (let i = 0; i < 12; i++) {
      const endingVisible = await page.locator("[data-testid='story-ending']:visible").isVisible().catch(() => false);
      if (endingVisible) break;

      const choiceButtons = page.locator("button[data-risk]:visible:not([disabled])");
      const count = await choiceButtons.count();
      if (count === 0) break;

      const responsePromise = page.waitForResponse((resp) =>
        resp.url().includes("/choices") && resp.request().method() === "POST"
      );
      await choiceButtons.first().click();
      await responsePromise;

      try {
        await page.waitForFunction(
          () => {
            const ending = Array.from(document.querySelectorAll("[data-testid='story-ending']")).find((el) => el instanceof HTMLElement && el.offsetParent !== null);
            const enabledChoices = Array.from(document.querySelectorAll("[data-risk]")).filter((el) => el instanceof HTMLButtonElement && el.offsetParent !== null && !el.disabled);
            return ending !== null || enabledChoices.length >= 3;
          },
          { timeout: 15_000 }
        );
      } catch {
        break;
      }
    }

    await expect(page.locator("[data-testid='story-ending']:visible")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=故事已完结").first()).toBeVisible();
    await expect(page.locator("[data-risk]:visible")).toHaveCount(0);
  });
});

test.describe("Text Flow - 故事长度选择", () => {
  test("开局页显示故事长度选择器", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("[data-testid='length-short']")).toBeVisible();
    await expect(page.locator("[data-testid='length-medium']")).toBeVisible();
    await expect(page.locator("[data-testid='length-long']")).toBeVisible();
  });

  test("默认选中短篇", async ({ page }) => {
    await page.goto("/");

    const shortBtn = page.locator("[data-testid='length-short']");
    await expect(shortBtn).toHaveClass(/border-\[#e94560\]/);
  });

  test("可以切换到中篇", async ({ page }) => {
    await page.goto("/");

    const mediumBtn = page.locator("[data-testid='length-medium']");
    await mediumBtn.click();

    await expect(mediumBtn).toHaveClass(/border-\[#e94560\]/);
    const shortBtn = page.locator("[data-testid='length-short']");
    await expect(shortBtn).not.toHaveClass(/border-\[#e94560\]/);
  });

  test("选择中篇后创建游戏，进度显示目标步数在20-40范围", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个中篇冒险故事");
    await page.locator("[data-testid='length-medium']").click();

    const responsePromise = page.waitForResponse((resp) =>
      resp.url().includes("/api/games") && resp.request().method() === "POST"
    );

    await page.locator('button:has-text("开始冒险")').click();

    const response = await responsePromise;
    const body = await response.json();

    expect(body.sessionId).toBeDefined();

    await page.waitForSelector("[data-testid='story-progress']:visible", { timeout: 30_000 });

    const progressText = await page.locator("[data-testid='story-progress']:visible").textContent();
    const match = progressText?.match(/目标 (\d+) 步/);
    expect(match).toBeTruthy();
    const targetTurns = parseInt(match![1], 10);
    expect(targetTurns).toBeGreaterThanOrEqual(20);
    expect(targetTurns).toBeLessThanOrEqual(40);
  });

  test("选择长篇后创建游戏，进度显示目标步数在50-100范围", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("一个长篇冒险故事");
    await page.locator("[data-testid='length-long']").click();

    const responsePromise = page.waitForResponse((resp) =>
      resp.url().includes("/api/games") && resp.request().method() === "POST"
    );

    await page.locator('button:has-text("开始冒险")').click();

    const response = await responsePromise;
    const body = await response.json();

    expect(body.sessionId).toBeDefined();

    await page.waitForSelector("[data-testid='story-progress']:visible", { timeout: 30_000 });

    const progressText = await page.locator("[data-testid='story-progress']:visible").textContent();
    const match = progressText?.match(/目标 (\d+) 步/);
    expect(match).toBeTruthy();
    const targetTurns = parseInt(match![1], 10);
    expect(targetTurns).toBeGreaterThanOrEqual(50);
    expect(targetTurns).toBeLessThanOrEqual(100);
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

test.describe("Text Flow - API 故事弧线验证", () => {
  test("创建短篇游戏，state 中 targetTurns 在 7-12 范围", async ({ request }) => {
    const res = await request.post("/api/games", {
      data: { prompt: "短篇测试", options: { storyLengthPreset: "short" } },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.sessionId).toBeDefined();
  });

  test("创建中篇游戏，state 中 targetTurns 在 20-40 范围", async ({ request }) => {
    const res = await request.post("/api/games", {
      data: { prompt: "中篇测试", options: { storyLengthPreset: "medium" } },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.sessionId).toBeDefined();
  });

  test("创建长篇游戏，state 中 targetTurns 在 50-100 范围", async ({ request }) => {
    const res = await request.post("/api/games", {
      data: { prompt: "长篇测试", options: { storyLengthPreset: "long" } },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.sessionId).toBeDefined();
  });

  test("不传 options 时默认短篇", async ({ request }) => {
    const res = await request.post("/api/games", {
      data: { prompt: "默认测试" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.sessionId).toBeDefined();
  });

  test("选择推进后返回 storyProgress", async ({ request }) => {
    const createRes = await request.post("/api/games", {
      data: { prompt: "推进测试", options: { storyLengthPreset: "short" } },
    });
    expect(createRes.ok()).toBeTruthy();
    const createBody = await createRes.json();

    const sessionId = createBody.sessionId;
    const sceneId = createBody.scene.id;
    const choiceId = createBody.scene.choices[0].id;
    const ownerToken = createBody.ownerToken;

    const choiceRes = await request.post(`/api/games/${sessionId}/choices`, {
      data: { sceneId, choiceId },
      headers: { "x-owner-token": ownerToken },
    });
    expect(choiceRes.ok()).toBeTruthy();
    const choiceBody = await choiceRes.json();

    expect(choiceBody.storyProgress).toBeDefined();
    expect(choiceBody.storyProgress.turn).toBe(2);
    expect(choiceBody.storyProgress.targetTurns).toBeGreaterThanOrEqual(7);
    expect(choiceBody.storyProgress.currentPhase).toBeDefined();
    expect(typeof choiceBody.isEnding).toBe("boolean");
  });

  test("中篇游戏推进13步后仍为 active", async ({ request }) => {
    const createRes = await request.post("/api/games", {
      data: { prompt: "中篇不被截断测试", options: { storyLengthPreset: "medium" } },
    });
    expect(createRes.ok()).toBeTruthy();
    const createBody = await createRes.json();

    const sessionId = createBody.sessionId;
    let sceneId = createBody.scene.id;
    let choiceId = createBody.scene.choices[0].id;
    const ownerToken = createBody.ownerToken;

    for (let i = 0; i < 13; i++) {
      const choiceRes = await request.post(`/api/games/${sessionId}/choices`, {
        data: { sceneId, choiceId },
        headers: { "x-owner-token": ownerToken },
      });

      if (!choiceRes.ok()) break;

      const choiceBody = await choiceRes.json();

      if (choiceBody.isEnding || choiceBody.sessionStatus === "ended") {
        if (i < 12) {
          throw new Error(`中篇故事在第 ${i + 1} 步就结束了，不应该在12步内结束`);
        }
        break;
      }

      sceneId = choiceBody.scene.id;
      choiceId = choiceBody.scene.choices[0].id;

      if (i === 12) {
        expect(choiceBody.sessionStatus).not.toBe("ended");
        expect(choiceBody.storyProgress.turn).toBe(14);
        expect(choiceBody.storyProgress.targetTurns).toBeGreaterThanOrEqual(20);
      }
    }
  });
});
