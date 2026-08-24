# Windows 数据生命周期

## 目录边界

安装目录只放应用代码和构建产物。正式打包时，SQLite 主库、迁移前备份、checkpoint 和项目替换恢复点应放在 `%LOCALAPPDATA%\StoryForge\data` 与 `%LOCALAPPDATA%\StoryForge\backups`，不要放在安装目录或临时解压目录。

模型密钥通过本地环境配置提供，不写入 SQLite、项目 JSON、HTML 导出、评测报告或诊断报告。升级只替换应用目录，不能覆盖数据目录。

## 生命周期动作

- 安装：创建应用目录和数据目录，初始化数据库并运行完整 smoke。
- 启动：默认 loopback；先检查数据库完整性和最近 checkpoint，再显示 Recovery Centre。
- 升级：停止旧进程，创建当前数据库 checkpoint，替换应用目录，启动后运行迁移与 restore-check；失败时保留旧目录和数据，不删除备份。
- 回滚：恢复旧应用目录或旧版本 standalone 产物，再让它读取同一数据目录；如迁移不可逆，使用经 restore-check 验证的数据库副本。
- 卸载：删除应用代码和快捷方式，不删除 `%LOCALAPPDATA%\StoryForge\data` 或 backups；由作者单独执行数据清理。

## 分发门槛

本地临时根 smoke 已验证干净目录复制、standalone 健康启动、升级、故意失败升级、回滚、卸载保留数据和 better-sqlite3 加载。干净 Windows 账户安装与签名仍是 Task 10 门槛；在这些证据完成前，不能称为签名安装器已发布。
