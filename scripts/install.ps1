# cloudy installer for Windows (PowerShell)
# Usage: irm https://raw.githubusercontent.com/czaku/cloudy/main/scripts/install.ps1 | iex
# Or locally: .\scripts\install.ps1 [-Port 1510] [-Boot]

param(
  [int]$Port = 1510,
  [switch]$Boot,
  [switch]$NoLocal
)

$ErrorActionPreference = "Stop"
$RepoDir = Split-Path $PSScriptRoot -Parent

function Step  { param($msg) Write-Host "▸  $msg" -ForegroundColor Cyan }
function Ok    { param($msg) Write-Host "✓  $msg" -ForegroundColor Green }
function Warn  { param($msg) Write-Host "⚠  $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "  ☁️  cloudy installer" -ForegroundColor White
Write-Host ""

# ── 1. build ──────────────────────────────────────────────────────────────────
Step "Building cloudy…"
Push-Location $RepoDir
npm install --silent
npm run build:client
npx tsc --skipLibCheck 2>$null

# ── 2. link globally ─────────────────────────────────────────────────────────
Step "Linking cloudy globally…"
npm link --silent
Ok "cloudy linked"

Pop-Location

# ── 3. hosts entry ───────────────────────────────────────────────────────────
if (-not $NoLocal) {
  $HostsFile = "$env:SystemRoot\System32\drivers\etc\hosts"
  $HostsEntry = "127.0.0.1 cloudy.local"
  $HostsContent = Get-Content $HostsFile -ErrorAction SilentlyContinue
  if ($HostsContent -match "cloudy\.local") {
    Ok "cloudy.local already in hosts file"
  } else {
    Step "Adding cloudy.local to hosts file…"
    try {
      Add-Content $HostsFile "`n$HostsEntry"
      Ok "Added: $HostsEntry"
    } catch {
      Warn "Need admin rights to write hosts file. Run as Administrator or add manually:"
      Write-Host "   $HostsEntry -> $HostsFile"
    }
  }

  # ── Port forwarding: netsh portproxy (Windows equivalent of pfctl) ────────
  $ExistingProxy = netsh interface portproxy show v4tov4 2>$null | Select-String "0.0.0.0.*80"
  if ($ExistingProxy) {
    Ok "Port forwarding already configured"
  } else {
    Step "Setting up port forwarding 80 -> $Port…"
    try {
      netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=80 connectaddress=127.0.0.1 connectport=$Port 2>$null
      # Also forward 0.0.0.0 so cloudy.local resolves from all interfaces
      netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=80 connectaddress=127.0.0.1 connectport=$Port 2>$null
      Ok "Port forwarding active — http://cloudy.local will work"
    } catch {
      Warn "Could not set up port forwarding (may need admin). Run as Administrator:"
      Write-Host "   netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=80 connectaddress=127.0.0.1 connectport=$Port"
    }
  }
}

# ── 4. start daemon ───────────────────────────────────────────────────────────
Step "Starting cloudy daemon on port $Port…"
try { cloudy daemon stop 2>$null } catch {}
Start-Sleep -Milliseconds 500

$BootArg = if ($Boot) { "--boot" } else { "" }
Invoke-Expression "cloudy daemon start --port $Port $BootArg"

# ── done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Ok "Installation complete"
$PfActive = Test-Path "C:\Windows\System32\drivers\etc\hosts" -PathType Leaf  # always true; check portproxy instead
$ProxyActive = (netsh interface portproxy show v4tov4 2>$null) -match "80"
if ($ProxyActive) {
  Write-Host "  http://cloudy.local  ·  http://localhost:$Port" -ForegroundColor White
} else {
  Write-Host "  http://localhost:$Port" -ForegroundColor White
}
Write-Host "  Docs: cloudy --help" -ForegroundColor DarkGray
Write-Host ""
