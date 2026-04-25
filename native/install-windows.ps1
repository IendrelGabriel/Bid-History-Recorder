$ErrorActionPreference = "Stop"

function Write-Info($s) { Write-Host $s -ForegroundColor Cyan }
function Write-Ok($s) { Write-Host $s -ForegroundColor Green }
function Write-Warn($s) { Write-Host $s -ForegroundColor Yellow }

$root = Split-Path -Parent $PSScriptRoot
$nativeDir = Join-Path $root "native"

if (!(Get-Command py -ErrorAction SilentlyContinue) -and !(Get-Command python -ErrorAction SilentlyContinue)) {
  throw "Python 3 is required. Install Python 3 (and check 'Add to PATH'), then re-run this script."
}

$extId = Read-Host "Paste your extension ID (from chrome://extensions)"
if ([string]::IsNullOrWhiteSpace($extId)) { throw "Extension ID is required." }

$hostBat = Join-Path $nativeDir "host.bat"
$manifestTemplate = Join-Path $nativeDir "com.automatic_bid_record.sqlite.json"
$manifestOutDir = Join-Path $env:LOCALAPPDATA "AutomaticBidRecord"
New-Item -ItemType Directory -Force -Path $manifestOutDir | Out-Null
$manifestOut = Join-Path $manifestOutDir "com.automatic_bid_record.sqlite.json"

$json = Get-Content $manifestTemplate -Raw
$json = $json.Replace("__REPLACE_WITH_ABSOLUTE_PATH_TO_HOST_BAT__", ($hostBat -replace "\\", "\\\\"))
$json = $json.Replace("__REPLACE_WITH_EXTENSION_ID__", $extId)
Set-Content -Path $manifestOut -Value $json -Encoding UTF8

Write-Info "Registering native messaging host in registry..."
$regPath = "HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.automatic_bid_record.sqlite"
New-Item -Force -Path $regPath | Out-Null
New-ItemProperty -Path $regPath -Name "(Default)" -Value $manifestOut -PropertyType String -Force | Out-Null

Write-Ok "Done."
Write-Ok "Native host manifest written to: $manifestOut"
Write-Ok "SQLite DB will be created at: %LOCALAPPDATA%\\AutomaticBidRecord\\bids.sqlite"
Write-Warn "If Chrome is open, reload the extension to start mirroring to SQLite."

