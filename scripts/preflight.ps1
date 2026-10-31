# ============================================================
# AI AUTO FARM — environment preflight  (Windows / PowerShell)
#   Run:  powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1
# Reports what is present, what is missing, and how to install it.
# ============================================================
$ErrorActionPreference = "SilentlyContinue"

function Check($name, $cmd, $args, $min, $install) {
  $found = Get-Command $cmd -ErrorAction SilentlyContinue
  if ($found) {
    $v = (& $cmd $args 2>&1 | Select-Object -First 1)
    Write-Host ("  [ OK ]  {0,-16} {1}" -f $name, $v) -ForegroundColor Green
    return $true
  } else {
    Write-Host ("  [MISS]  {0,-16} required {1}" -f $name, $min) -ForegroundColor Red
    Write-Host ("          install: {0}" -f $install) -ForegroundColor DarkGray
    return $false
  }
}

Write-Host ""
Write-Host "AI AUTO FARM - environment preflight" -ForegroundColor Cyan
Write-Host "------------------------------------"
$ok = $true
$ok = (Check "Docker"  "docker"  "--version"  "24+"    "https://www.docker.com/products/docker-desktop/") -and $ok
$ok = (Check "Node.js" "node"    "--version"  "20+"    "https://nodejs.org/en/download  (LTS)") -and $ok
$ok = (Check "npm"     "npm"     "--version"  "10+"    "ships with Node.js") -and $ok
$ok = (Check "Python"  "python"  "--version"  "3.11+"  "https://www.python.org/downloads/  (tick 'Add to PATH')") -and $ok
$ok = (Check "Git"     "git"     "--version"  "2.40+"  "https://git-scm.com/download/win") -and $ok

Write-Host ""
if (Test-Path ".env") {
  Write-Host "  [ OK ]  .env present" -ForegroundColor Green
} else {
  Write-Host "  [MISS]  .env missing - run:  Copy-Item .env.example .env" -ForegroundColor Yellow
}

Write-Host ""
if ($ok) {
  Write-Host "All prerequisites present. Next:" -ForegroundColor Cyan
  Write-Host "    docker compose up -d"
  Write-Host "    open http://localhost:5173   (app)"
  Write-Host "    open http://localhost:8000/docs (API)"
} else {
  Write-Host "Install the items marked [MISS] above, then run this script again." -ForegroundColor Yellow
  Write-Host "Docker Desktop alone is enough to run everything - Node and Python"
  Write-Host "are only needed if you want to run a service outside a container."
}
Write-Host ""
