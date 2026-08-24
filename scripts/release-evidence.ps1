$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$packageJson = Get-Content (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$version = $packageJson.version
$packageRoot = Join-Path $repoRoot ("output\package\StoryForge-" + $version)
$releaseRoot = Join-Path $repoRoot "output\release"
$manifestPath = Join-Path $packageRoot "package-manifest.json"

if (-not (Test-Path -LiteralPath (Join-Path $packageRoot "server.js"))) {
  throw "Standalone package is missing. Run npm run package:standalone first."
}
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Standalone package manifest is missing."
}

$packageManifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
if ($packageManifest.version -ne $version) {
  throw "Standalone package version does not match package.json."
}
if ($packageManifest.secretsIncluded -ne $false) {
  throw "Refusing to generate release evidence for a package that includes secrets."
}

New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
$sbomPath = Join-Path $releaseRoot ("StoryForge-" + $version + ".sbom.json")
$checksumPath = Join-Path $releaseRoot ("StoryForge-" + $version + "-SHA256SUMS.txt")
$evidencePath = Join-Path $releaseRoot ("StoryForge-" + $version + "-release-evidence.json")

$sbomOutput = & npm sbom --package-lock-only --sbom-format cyclonedx --sbom-type application
if ($LASTEXITCODE -ne 0) {
  throw "npm sbom failed with exit code $LASTEXITCODE."
}
$sbomOutput | Set-Content -LiteralPath $sbomPath -Encoding utf8
$sbom = Get-Content $sbomPath -Raw | ConvertFrom-Json
if ($sbom.bomFormat -ne "CycloneDX") {
  throw "Generated SBOM is not CycloneDX."
}

$packageFiles = @(Get-ChildItem -LiteralPath $packageRoot -File -Recurse | Sort-Object FullName)
$checksumLines = foreach ($file in $packageFiles) {
  $relativePath = [System.IO.Path]::GetRelativePath($packageRoot, $file.FullName).Replace([System.IO.Path]::DirectorySeparatorChar, "/")
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $relativePath"
}
$checksumLines | Set-Content -LiteralPath $checksumPath -Encoding ascii

$evidence = [pscustomobject]@{
  schema = "storyforge-release-evidence@1"
  generatedAt = [DateTime]::UtcNow.ToString("o")
  version = $version
  packageManifest = [System.IO.Path]::GetRelativePath($repoRoot, $manifestPath).Replace([System.IO.Path]::DirectorySeparatorChar, "/")
  sbom = [System.IO.Path]::GetRelativePath($repoRoot, $sbomPath).Replace([System.IO.Path]::DirectorySeparatorChar, "/")
  checksums = [System.IO.Path]::GetRelativePath($repoRoot, $checksumPath).Replace([System.IO.Path]::DirectorySeparatorChar, "/")
  packageFileCount = $packageFiles.Count
  secretsIncluded = [bool]$packageManifest.secretsIncluded
  signed = [bool]$packageManifest.signed
} | ConvertTo-Json
$evidence | Set-Content -LiteralPath $evidencePath -Encoding utf8

[pscustomobject]@{
  status = "passed"
  version = $version
  sbom = $sbomPath
  checksums = $checksumPath
  evidence = $evidencePath
  packageFileCount = $packageFiles.Count
  secretsIncluded = [bool]$packageManifest.secretsIncluded
  signed = [bool]$packageManifest.signed
} | ConvertTo-Json -Compress
