# Windows Standalone 安装与回滚

当前交付物是 Node 24 standalone 目录，不是签名安装器。

## 构建

```powershell
npm run package:standalone
```

产物位于 `output/package/StoryForge-<version>`，包含 standalone server、静态资源、`start-storyforge.ps1` 和不含秘密的 `package-manifest.json`。产物不包含 `.env.local`、SQLite、备份、prompt、模型原文或作者数据。

## 启动

在产物目录执行 `./start-storyforge.ps1`。启动脚本默认绑定 `127.0.0.1:3000`，把 SQLite 与备份放到 `%LOCALAPPDATA%\StoryForge\data` 和 `%LOCALAPPDATA%\StoryForge\backups`。首次真实生成前，在当前用户环境中配置 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 和 `OPENAI_MODEL`。

## 升级与回滚

1. 停止旧进程。
2. 执行 `npm run db:authoring:checkpoint`，并用 `npm run db:authoring:restore-check -- --latest` 验证。
3. 保留旧产物目录，替换为新版本目录；不要删除 `%LOCALAPPDATA%\StoryForge`。
4. 启动新版本并检查 Recovery Centre、项目数量和图谱可读性。
5. 如果新版本失败，停止进程并重新启动旧产物；数据目录保持不变。

签名和干净 Windows 账户安装仍是发布前人工门禁；本地临时根已验证升级失败回滚与卸载保留数据，在这些人工证据完成前，不称为一键安装器。
