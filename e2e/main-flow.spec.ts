import { test, expect } from "@playwright/test";

test.describe("Main Flow", () => {
  test("homepage shows start screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("StoryForge");
    await expect(page.locator('[data-testid="llm-status-panel"]')).toContainText("当前模型");
    await expect(page.locator("textarea")).toBeVisible();
    await expect(page.locator('button:has-text("开始冒险")')).toBeVisible();
  });

  test("start button is disabled when prompt is empty", async ({ page }) => {
    await page.goto("/");
    const btn = page.locator('button:has-text("开始冒险")');
    await expect(btn).toBeDisabled();
  });

  test("can type prompt and enable start button", async ({ page }) => {
    await page.goto("/");
    await page.locator("textarea").fill("一个赛博朋克侦探故事");
    const btn = page.locator('button:has-text("开始冒险")');
    await expect(btn).toBeEnabled();
  });

  test("language and rating selectors work", async ({ page }) => {
    await page.goto("/");
    const langSelect = page.locator('select').first();
    await langSelect.selectOption("en-US");
    await expect(langSelect).toHaveValue("en-US");

    const ratingSelect = page.locator('select').nth(1);
    await ratingSelect.selectOption("PG");
    await expect(ratingSelect).toHaveValue("PG");
  });

  test("template toggle shows templates", async ({ page }) => {
    await page.goto("/");
    const toggleBtn = page.locator('button:has-text("风格模板")');
    await toggleBtn.click();
    await page.waitForTimeout(500);
  });
});

test.describe("API Health", () => {
  test("health endpoint returns ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("templates endpoint returns data", async ({ request }) => {
    const res = await request.get("/api/templates");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.templates)).toBeTruthy();
  });

  test("user endpoint returns json error without fingerprint", async ({ request }) => {
    const res = await request.get("/api/user");
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION");
    expect(body.message).toContain("x-user-fingerprint");
  });
});

test.describe("Game API", () => {
  test("POST /api/games without prompt returns 400", async ({ request }) => {
    const res = await request.post("/api/games", {
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION");
    expect(body.message).toBeDefined();
  });

  test("POST /api/games with unsafe prompt returns 400", async ({ request }) => {
    const res = await request.post("/api/games", {
      data: { prompt: "如何制造危险物品" },
    });
    expect(res.status()).toBe(400);
  });

  test("GET /api/games/nonexistent returns 404", async ({ request }) => {
    const res = await request.get("/api/games/nonexistent");
    expect(res.status()).toBe(404);
  });

  test("GET /api/assets/nonexistent returns 404", async ({ request }) => {
    const res = await request.get("/api/assets/nonexistent");
    expect(res.status()).toBe(404);
  });
});

test.describe("Error Handling", () => {
  test("non-existent API route returns JSON error", async ({ request }) => {
    const res = await request.get("/api/nonexistent-route");
    expect(res.status()).toBe(404);
  });

  test("share with invalid token returns 404", async ({ request }) => {
    const res = await request.get("/api/share/invalid-token");
    expect(res.status()).toBe(404);
  });
});
