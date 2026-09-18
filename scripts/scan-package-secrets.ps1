param(
  [Parameter(Mandatory = $true)]
  [string]$Root
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
  throw "Package root does not exist: $Root"
}

$binaryExtensions = @(
  ".node", ".ico", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".woff", ".woff2",
  ".ttf", ".otf", ".wasm", ".zip", ".gz", ".br"
)
$secretPatterns = @(
  [pscustomobject]@{ Name = "OpenAI-compatible key"; Pattern = "(?<![A-Za-z0-9])(?:sk-|ark-)[A-Za-z0-9_-]{20,}(?![A-Za-z0-9])" },
  [pscustomobject]@{ Name = "Bearer credential"; Pattern = "Bearer\s+[A-Za-z0-9._-]{20,}" },
  [pscustomobject]@{ Name = "URL credential"; Pattern = "https?://[^\s/:]+:[^\s/@]+@[^\s]+" }
)

$secretFindings = @()
$scannedFileCount = 0
foreach ($file in @(Get-ChildItem -LiteralPath $Root -File -Recurse)) {
  if ($binaryExtensions -contains $file.Extension.ToLowerInvariant()) {
    continue
  }

  $scannedFileCount += 1
  $content = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction Stop
  if ($null -eq $content) {
    $content = ""
  }

  foreach ($pattern in $secretPatterns) {
    if ([regex]::IsMatch($content, $pattern.Pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
      $relativePath = [System.IO.Path]::GetRelativePath($Root, $file.FullName).Replace([System.IO.Path]::DirectorySeparatorChar, "/")
      $secretFindings += [pscustomobject]@{ file = $relativePath; pattern = $pattern.Name }
    }
  }
}

if ($secretFindings.Count -gt 0) {
  $findingSummary = ($secretFindings | ForEach-Object { "$($_.file) [$($_.pattern)]" }) -join ", "
  throw "Package secret scan failed: $findingSummary"
}

[pscustomobject]@{
  status = "passed"
  scannedFileCount = $scannedFileCount
  secretFindings = 0
} | ConvertTo-Json -Compress
