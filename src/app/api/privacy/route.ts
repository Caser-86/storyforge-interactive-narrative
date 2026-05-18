import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    version: "1.0",
    updatedAt: "2026-05-18",
    policy: {
      dataCollected: [
        "匿名指纹（用于区分用户，不包含个人信息）",
        "游戏会话数据（故事内容、选择记录）",
        "LLM 调用日志（模型、延迟、token 用量）",
        "资产生成日志（图片生成状态）",
        "Owner Token（存储在浏览器 localStorage 中，用于验证游戏会话所有权，关闭浏览器后仍保留直到手动清除或删除游戏）",
      ],
      localStorageUsage: [
        "game_sessionId：当前游戏会话 ID",
        "game_ownerToken：会话所有者令牌，用于保护私有游戏不被他人访问",
        "以上数据仅存储在您的浏览器本地，不会发送至第三方",
        "清除浏览器数据或使用 DELETE /api/user 即可删除",
      ],
      dataRetention: "用户可随时删除所有数据（DELETE /api/user）",
      thirdPartySharing: [
        "OpenAI/DeepSeek：仅发送故事生成提示词",
        "BFL：仅发送图片生成提示词",
      ],
      userRights: [
        "查看个人数据：GET /api/user",
        "删除所有数据：DELETE /api/user",
        "修改昵称：PATCH /api/user",
      ],
      contact: "请通过项目 GitHub 仓库提交隐私相关问题",
    },
  });
}
