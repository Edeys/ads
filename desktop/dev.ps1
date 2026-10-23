# Chạy AdsSync như app desktop KHÔNG cần Rust (dùng Edge/Chrome app mode).
# Dùng để thử bản standalone trước khi build Tauri.
#
#   powershell -ExecutionPolicy Bypass -File desktop/dev.ps1
#   powershell -ExecutionPolicy Bypass -File desktop/dev.ps1 -Port 3210 -Rebuild
param(
  [int]$Port = 3210,
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $PSScriptRoot "src-tauri\resources\app"
$dataDir = Join-Path $env:APPDATA "AdsSync"
$logFile = Join-Path $dataDir "server.log"

if ($Rebuild -or -not (Test-Path (Join-Path $appDir "server.js"))) {
  Write-Host "[desktop] build Next standalone..."
  Push-Location $root
  npm run build
  node desktop/prepare.mjs
  Pop-Location
}

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

if (-not $env:NEXTAUTH_SECRET) {
  $secretFile = Join-Path $dataDir "secret.txt"
  if (Test-Path $secretFile) {
    $env:NEXTAUTH_SECRET = (Get-Content $secretFile -TotalCount 1).Trim()
  } else {
    $env:NEXTAUTH_SECRET = -join ((1..48) | ForEach-Object { "{0:x}" -f (Get-Random -Max 16) })
    Set-Content -Path $secretFile -Value $env:NEXTAUTH_SECRET -Encoding ASCII
  }
}

$env:NODE_ENV = "production"
$env:PORT = "$Port"
$env:HOSTNAME = "127.0.0.1"
$env:ADSYNC_DATA_DIR = $dataDir
$env:ADSYNC_MIGRATIONS_DIR = Join-Path $appDir "drizzle"
$env:ADSYNC_ALLOW_BOOTSTRAP = "1"
$env:ADSYNC_INPROC_WORKER = "1"
$env:ADSYNC_MOCK = "1"
$env:NEXTAUTH_URL = "http://127.0.0.1:$Port"
# APP_URL quyết định redirect_uri của OAuth Meta/Google. Thiếu biến này, app sẽ
# quay về localhost:3000 (không có server) thay vì cổng đang chạy.
$env:APP_URL = "http://127.0.0.1:$Port"
$env:AUTH_URL = "http://127.0.0.1:$Port"
$env:AUTH_TRUST_HOST = "true"

if ((Test-Path $logFile) -and ((Get-Item $logFile).Length -gt 10MB)) {
  Move-Item -Path $logFile -Destination "$logFile.1" -Force
}

Write-Host "[desktop] server.js -> $appDir"
Write-Host "[desktop] dữ liệu   -> $dataDir"
Write-Host "[desktop] log       -> $logFile"

Push-Location $appDir
node "bootstrap.mjs"
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "[desktop] migration lỗi, dừng."; exit 1 }
Pop-Location

$server = Start-Process -FilePath "node" -ArgumentList "server.js" `
  -WorkingDirectory $appDir -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"

$url = "http://127.0.0.1:$Port"
$ready = $false
for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$url/api/health" -TimeoutSec 2
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch { }
}

if (-not $ready) {
  Write-Host "[desktop] server không lên trong 60s. Xem log: $logFile"
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  exit 1
}

try {
  $seed = Invoke-WebRequest -UseBasicParsing -Method POST -Uri "$url/api/dev/bootstrap" -TimeoutSec 30
  Write-Host "[desktop] seed: $($seed.Content)"
} catch {
  Write-Host "[desktop] seed lỗi (bỏ qua): $($_.Exception.Message)"
}

Write-Host "[desktop] sẵn sàng: $url"

$browser = $null
foreach ($candidate in @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)) {
  if (Test-Path $candidate) { $browser = $candidate; break }
}

try {
  if ($browser) {
    $profileDir = Join-Path $dataDir "browser-profile"
    New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
    Start-Process -FilePath $browser -ArgumentList "--app=$url", "--window-size=1280,820", "--user-data-dir=$profileDir" -Wait
  } else {
    Start-Process $url
    Write-Host "[desktop] mở bằng trình duyệt mặc định. Nhấn Enter để tắt server."
    Read-Host | Out-Null
  }
} finally {
  Write-Host "[desktop] tắt server..."
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}
