import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";

const databasePath = path.join(process.cwd(), "output", "playwright", "authoring-e2e.sqlite");

function cleanDatabase(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(databasePath + suffix, { force: true });
  }
}

test.describe("authoring request security", () => {
  test.beforeEach(cleanDatabase);
  test.afterEach(cleanDatabase);

  test("rejects a cross-origin browser write before it reaches the project handler", async ({ page, request }) => {
    const apiUrl = "http://localhost:3105/api/projects";
    await page.goto("data:text/html,<title>cross-origin probe</title>");

    const [browserRequest, result] = await Promise.all([
      page.waitForRequest(apiUrl),
      page.evaluate(async (url) => {
        try {
          const response = await fetch(url, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({
              title: "Cross-origin attempt",
              premise: "This write must not reach the local authoring store.",
              genre: "mystery",
              tone: "measured",
              pointOfView: "third person",
              rating: "PG-13",
              size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
            }),
          });
          return { status: response.status, type: response.type, message: "" };
        } catch (error) {
          return { status: 0, type: "network-error", message: String(error) };
        }
      }, apiUrl),
    ]);

    expect(browserRequest.method()).toBe("POST");
    expect(browserRequest.postData()).toContain("Cross-origin attempt");
    expect(result.type).toBe("network-error");
    expect(result.message).toContain("Failed to fetch");

    const directResponse = await request.post(apiUrl, {
      headers: { Origin: "null", "Content-Type": "application/json" },
      data: {
        title: "Cross-origin attempt",
        premise: "This write must not reach the local authoring store.",
        genre: "mystery",
        tone: "measured",
        pointOfView: "third person",
        rating: "PG-13",
        size: { preset: "micro", targetNodes: 8, targetEndings: 2 },
      },
    });
    expect(directResponse.status()).toBe(403);

    const projectsResponse = await request.get("/api/projects");
    expect(projectsResponse.ok()).toBe(true);
    expect((await projectsResponse.json()).projects).toHaveLength(0);
  });
});
