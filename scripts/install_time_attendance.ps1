# Install Node dependencies for Time Attendance (run from repo root)
$ErrorActionPreference = "Stop"
$serviceDir = Join-Path $PSScriptRoot ".." "services" "time-attendance" | Resolve-Path
Push-Location $serviceDir
try {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm not found. Install Node.js first."
  }
  npm install
  Write-Host "Time Attendance dependencies installed in $serviceDir"
} finally {
  Pop-Location
}
