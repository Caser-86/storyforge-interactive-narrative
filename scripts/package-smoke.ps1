param(
  [ValidateSet("DryRun", "Local")]
  [string]$Mode = "DryRun",
  [string]$Root,
  [string]$PackageRoot,
  [int]$Port = 3110
)

$ErrorActionPreference = "Stop"

if ($Mode -eq "DryRun") {
  [pscustomobject]@{
    status = "dry-run"
    actions = @(
      "verify Node 24 and standalone launch",
      "verify better-sqlite3 native loading",
      "verify data and backups remain outside install root",
      "verify upgrade, rollback, and uninstall-preserves-data"
    )
    destructive = $false
  } | ConvertTo-Json -Compress
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Root)) {
  throw "Local mode requires an explicit temporary -Root."
}

function Get-NormalizedPath([string]$PathValue) {
  return [System.IO.Path]::GetFullPath($PathValue).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
}

function Test-PathWithin([string]$ChildPath, [string]$ParentPath) {
  $child = Get-NormalizedPath $ChildPath
  $parent = Get-NormalizedPath $ParentPath
  return $child.Equals($parent, [System.StringComparison]::OrdinalIgnoreCase) -or
    $child.StartsWith($parent + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

$resolvedRoot = [System.IO.Path]::GetFullPath($Root)
$temporaryRoots = @([System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()))
if ($env:GITHUB_ACTIONS -eq "true" -and -not [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
  $temporaryRoots += [System.IO.Path]::GetFullPath($env:RUNNER_TEMP)
}
$isScopedTemporaryRoot = @($temporaryRoots | Where-Object {
  -not $resolvedRoot.Equals($_, [System.StringComparison]::OrdinalIgnoreCase) -and
    (Test-PathWithin $resolvedRoot $_)
})
if ($isScopedTemporaryRoot.Count -eq 0) {
  throw "Local smoke root must be inside the system temporary directory."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($PackageRoot)) {
  $packageJson = Get-Content (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
  $PackageRoot = Join-Path $repoRoot ("output\package\StoryForge-" + $packageJson.version)
}
$sourcePackage = (Resolve-Path -LiteralPath $PackageRoot).Path
if (Test-PathWithin $sourcePackage $resolvedRoot) {
  throw "Package source must not be inside the disposable smoke root."
}
foreach ($requiredFile in @("server.js", "start-storyforge.ps1", "package-manifest.json")) {
  if (-not (Test-Path -LiteralPath (Join-Path $sourcePackage $requiredFile))) {
    throw "Standalone package is missing $requiredFile."
  }
}

New-Item -ItemType Directory -Path $resolvedRoot -Force | Out-Null
$installV1 = Join-Path $resolvedRoot "install-v1"
$installV2 = Join-Path $resolvedRoot "install-v2"
$profileRoot = Join-Path $resolvedRoot "profile"
$dataRoot = Join-Path $profileRoot "StoryForge\data"
$backupRoot = Join-Path $profileRoot "StoryForge\backups"
$databasePath = Join-Path $dataRoot "storyforge.sqlite"
$authorMarker = Join-Path $dataRoot "author-data-marker.txt"
$serverProcess = $null
$environmentNames = @("LOCALAPPDATA", "SQLITE_DB_PATH", "SQLITE_BACKUP_DIR", "HOSTNAME", "PORT", "GENERATION_PROVIDER")
$originalEnvironment = @{}
foreach ($environmentName in $environmentNames) {
  $originalEnvironment[$environmentName] = [Environment]::GetEnvironmentVariable($environmentName, "Process")
}
New-Item -ItemType Directory -Path $resolvedRoot, $profileRoot, $dataRoot, $backupRoot -Force | Out-Null

New-Item -ItemType Directory -Path $installV1, $installV2 -Force | Out-Null

function Stop-PackageProcess {
  if ($null -eq $script:serverProcess) {
    return
  }
  try {
    $script:serverProcess.Refresh()
    if (-not $script:serverProcess.HasExited) {
      $script:serverProcess.Kill($true)
      $null = $script:serverProcess.WaitForExit(5000)
    }
  }
  catch {
    # The process may have exited between the health check and cleanup.
  }
  finally {
    $script:serverProcess = $null
  }
}

try {
  if (Test-PathWithin $dataRoot $installV1 -or Test-PathWithin $dataRoot $installV2) {
    throw "Data root must not be inside install root."
  }
  if (Test-PathWithin $backupRoot $installV1 -or Test-PathWithin $backupRoot $installV2) {
    throw "Backup root must not be inside install root."
  }

  Copy-Item -Path (Join-Path $sourcePackage "*") -Destination $installV1 -Recurse -Force
  if (-not (Test-Path -LiteralPath (Join-Path $installV1 "server.js"))) {
    throw "Clean install did not contain server.js."
  }

  function Wait-ForHealth([int]$HealthPort) {
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      try {
        $health = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/health" -f $HealthPort) -TimeoutSec 2
        if ($health.status -eq "ok") {
          return $health
        }
      }
      catch {
        # The standalone server may still be starting.
      }
      Start-Sleep -Milliseconds 500
    }
    throw "Standalone health check did not become ready on port $HealthPort."
  }

  function Start-Package([string]$InstallPath) {
    $env:LOCALAPPDATA = $profileRoot
    $env:SQLITE_DB_PATH = $databasePath
    $env:SQLITE_BACKUP_DIR = $backupRoot
    $env:HOSTNAME = "127.0.0.1"
    $env:PORT = "$Port"
    $env:GENERATION_PROVIDER = "fake"
    return Start-Process -FilePath "node" -ArgumentList @("server.js") -WorkingDirectory $InstallPath -WindowStyle Hidden -PassThru
  }

  function Wait-ForProcessExit([System.Diagnostics.Process]$Process) {
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      $Process.Refresh()
      if ($Process.HasExited) {
        return
      }
      Start-Sleep -Milliseconds 250
    }
    throw "The intentionally broken upgrade process did not exit."
  }

  $serverProcess = Start-Package $installV1
  $null = Wait-ForHealth $Port
  if (-not (Test-Path -LiteralPath $databasePath)) {
    throw "Clean install did not create the SQLite database outside the install root."
  }
  "StoryForge smoke marker" | Set-Content -LiteralPath $authorMarker -Encoding utf8
  Stop-PackageProcess

  Copy-Item -Path (Join-Path $sourcePackage "*") -Destination $installV2 -Recurse -Force
  $serverProcess = Start-Package $installV2
  $null = Wait-ForHealth $Port
  if (-not (Test-Path -LiteralPath $authorMarker)) {
    throw "Upgrade did not preserve author data."
  }
  Stop-PackageProcess

  Remove-Item -LiteralPath (Join-Path $installV2 "server.js") -Force
  $serverProcess = Start-Package $installV2
  Wait-ForProcessExit $serverProcess
  if ($serverProcess.ExitCode -eq 0) {
    throw "The intentionally broken upgrade unexpectedly exited successfully."
  }
  Stop-PackageProcess

  $serverProcess = Start-Package $installV1
  $null = Wait-ForHealth $Port
  if (-not (Test-Path -LiteralPath $authorMarker)) {
    throw "Rollback did not preserve author data."
  }
  Stop-PackageProcess

  if (-not (Test-PathWithin $installV2 $resolvedRoot)) {
    throw "Install root escaped the disposable smoke root."
  }
  Remove-Item -LiteralPath $installV1, $installV2 -Recurse -Force
  if (-not (Test-Path -LiteralPath $databasePath) -or -not (Test-Path -LiteralPath $authorMarker)) {
    throw "Uninstall removed data that must remain outside the install root."
  }

  $manifest = Get-Content (Join-Path $sourcePackage "package-manifest.json") -Raw | ConvertFrom-Json
  [pscustomobject]@{
    status = "passed"
    packageVersion = $manifest.version
    phases = @("clean-install", "health", "upgrade", "failed-upgrade", "rollback", "uninstall-preserves-data")
    installRoot = $resolvedRoot
    dataRoot = $dataRoot
    backupRoot = $backupRoot
    destructive = $true
  } | ConvertTo-Json -Compress
}
finally {
  Stop-PackageProcess
  foreach ($environmentName in $environmentNames) {
    [Environment]::SetEnvironmentVariable($environmentName, $originalEnvironment[$environmentName], "Process")
  }
  foreach ($temporaryRoot in $temporaryRoots) {
    if (-not $resolvedRoot.Equals($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-PathWithin $resolvedRoot $temporaryRoot)) {
      Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
      break
    }
  }
}
