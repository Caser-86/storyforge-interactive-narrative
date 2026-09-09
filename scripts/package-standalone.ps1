param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$distributionRoot = Join-Path $repoRoot "output\package"
$packageJson = Get-Content (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$packageRoot = Join-Path $distributionRoot ("StoryForge-" + $packageJson.version)

if (-not $SkipBuild) {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Production build failed." }
}

$standaloneRoot = Join-Path $repoRoot ".next\standalone"
$staticRoot = Join-Path $repoRoot ".next\static"
if (-not (Test-Path -LiteralPath (Join-Path $standaloneRoot "server.js"))) {
  throw "The Next standalone output was not found."
}

New-Item -ItemType Directory -Path $distributionRoot -Force | Out-Null
if (Test-Path -LiteralPath $packageRoot) {
  Remove-Item -LiteralPath $packageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
Copy-Item -Path (Join-Path $standaloneRoot "*") -Destination $packageRoot -Recurse -Force
New-Item -ItemType Directory -Path (Join-Path $packageRoot ".next\static") -Force | Out-Null
Copy-Item -Path (Join-Path $staticRoot "*") -Destination (Join-Path $packageRoot ".next\static") -Recurse -Force
if (Test-Path -LiteralPath (Join-Path $repoRoot "public")) {
  Copy-Item -LiteralPath (Join-Path $repoRoot "public") -Destination $packageRoot -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $repoRoot "scripts\start-storyforge.ps1") -Destination $packageRoot -Force
$scannerPath = Join-Path $PSScriptRoot "scan-package-secrets.ps1"
$scanOutput = & pwsh -NoProfile -File $scannerPath -Root $packageRoot
if ($LASTEXITCODE -ne 0) {
  throw "Standalone package secret scan failed."
}
$scanSummary = ($scanOutput -join [Environment]::NewLine) | ConvertFrom-Json
if ($scanSummary.status -ne "passed" -or $scanSummary.secretFindings -ne 0) {
  throw "Standalone package secret scan returned an invalid result."
}
$secretsIncluded = [bool]$scanSummary.secretFindings
@{
  version = $packageJson.version
  packageRoot = "."
  dataRoot = "%LOCALAPPDATA%\StoryForge\data"
  backupRoot = "%LOCALAPPDATA%\StoryForge\backups"
  secretsIncluded = $secretsIncluded
  signed = $false
} | ConvertTo-Json | Set-Content (Join-Path $packageRoot "package-manifest.json") -Encoding utf8
Write-Output ("Standalone package created at " + $packageRoot)
