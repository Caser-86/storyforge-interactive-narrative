# Dependency、许可证与 SBOM 策略

StoryForge 的运行时仍是私人、本地、单作者项目；本次由项目所有者明确决定保持 GitHub 源码仓库公开，但这不等于授予开源再分发许可。仓库不声明开源许可证，GitHub Release 不应暗示可以再分发项目代码。

## 依赖证据

- `package-lock.json` 是依赖版本和完整性来源。
- 发布前运行 `npm audit --audit-level=high`，高危漏洞未解决时不发布。
- 发布候选运行 `npm run release:evidence`，生成 CycloneDX application SBOM、standalone 产物 SHA-256 清单和不含秘密的证据 manifest。
- SBOM 和校验和只描述构建依赖与公开产物，不包含 `.env*`、SQLite、备份、prompt、模型原文或作者数据。

## 产物位置

证据生成在被 `.gitignore` 忽略的 `output/release/` 下：

- `StoryForge-<version>.sbom.json`
- `StoryForge-<version>-SHA256SUMS.txt`
- `StoryForge-<version>-release-evidence.json`

GitHub Release 只附加经过人工检查的 SBOM、校验和和公开 standalone 产物；不附加 `output/` 中的临时日志、数据库或测试文件。
