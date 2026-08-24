$ErrorActionPreference = "Stop"
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataRoot = Join-Path $env:LOCALAPPDATA "StoryForge\data"
$backupRoot = Join-Path $env:LOCALAPPDATA "StoryForge\backups"
New-Item -ItemType Directory -Path $dataRoot, $backupRoot -Force | Out-Null
$env:SQLITE_DB_PATH = Join-Path $dataRoot "storyforge.sqlite"
$env:SQLITE_BACKUP_DIR = $backupRoot
$env:HOSTNAME = "127.0.0.1"
$env:PORT = "3000"
if ([string]::IsNullOrWhiteSpace($env:OPENAI_MODEL)) { $env:OPENAI_MODEL = "deepseek-v4-flash" }
node (Join-Path $packageRoot "server.js")
