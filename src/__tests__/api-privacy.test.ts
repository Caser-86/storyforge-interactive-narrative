import { describe, expect, it } from "vitest";

describe("privacy policy", () => {
  it("describes only current local authoring data flows", async () => {
    const { GET } = await import("@/app/api/privacy/route");
    const response = await GET();
    const body = await response.json() as { policy: Record<string, unknown> };
    const policyText = JSON.stringify(body.policy);

    expect(response.status).toBe(200);
    expect(policyText).toContain("项目、图谱、互动会话和选择记录");
    expect(policyText).toContain("本机 SQLite");
    expect(policyText).toContain("仅在生成时向已配置的 LLM 服务发送必要的故事提示词");
    expect(policyText).not.toMatch(/BFL|Owner Token|匿名指纹|\/api\/user|图片生成/);
    expect(policyText).toContain("删除互动会话");
    expect(policyText).toContain("删除项目");
  });
});
