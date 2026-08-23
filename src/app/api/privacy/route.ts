import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    version: "2.0",
    updatedAt: "2026-08-24",
    policy: {
      dataCollected: [
        "项目、图谱、互动会话和选择记录（保存在本机 SQLite）",
        "生成状态、错误、模型名称和 token 统计（保存在本机 SQLite）",
        "生成请求和模型响应原文（仅保存在本机 SQLite，用于恢复和诊断）",
      ],
      localStorageUsage: [
        "storyforge:interactive-session:<projectId>：当前互动会话 ID",
        "浏览器只保存当前会话指针，故事正文和选择记录保存在本机 SQLite",
        "清除浏览器数据只会清除指针，不会删除 SQLite 中的项目或互动记录",
      ],
      dataRetention: "数据保留在本机，直到用户删除互动会话、删除项目，或手动清理 SQLite 和数据库备份",
      thirdPartySharing: [
        "仅在生成时向已配置的 LLM 服务发送必要的故事提示词",
      ],
      userRights: [
        "删除互动会话：DELETE /api/projects/:projectId/play/sessions/:sessionId",
        "删除项目及其互动记录：DELETE /api/projects/:projectId",
        "导出项目和互动记录：项目库备份或互动页面导出",
      ],
      scope: "StoryForge 是私人本地、单作者工具，不提供登录、多用户隔离、公开分享或云同步",
      contact: "请通过项目 GitHub 仓库提交隐私相关问题",
    },
  });
}
