# Start HR Approve + Time Attendance via PM2 (run from repo root)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent

if (-not (Test-Path "$ProjectRoot\run.py")) {
    Write-Error "run.py not found at $ProjectRoot"
}

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    Write-Error "pm2 not found. Install: npm install -g pm2"
}

if (-not (Test-Path "$ProjectRoot\.env")) {
    Write-Error ".env not found. Copy .env.example to .env and fill in values."
}

Push-Location $ProjectRoot
try {
    if (-not (Test-Path "$ProjectRoot\logs")) {
        New-Item -ItemType Directory -Path "$ProjectRoot\logs" | Out-Null
    }

    $nodeModules = "$ProjectRoot\services\time-attendance\node_modules"
    if (-not (Test-Path $nodeModules)) {
        Write-Host "Installing Time Attendance dependencies..." -ForegroundColor Cyan
        npm run setup
    }

    $venvPython = "$ProjectRoot\.venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        Write-Host "WARN: .venv not found — PM2 will use system python." -ForegroundColor Yellow
        Write-Host "      Recommended: python -m venv .venv && .\.venv\Scripts\pip install -r requirements.txt" -ForegroundColor Yellow
    }

    $existing = pm2 jlist 2>$null | ConvertFrom-Json
    $names = @("hr-approve", "time-attendance")
    $running = @()
    if ($existing) {
        $running = $existing | Where-Object { $names -contains $_.name -and $_.pm2_env.status -eq "online" } | ForEach-Object { $_.name }
    }

    if ($running.Count -eq $names.Count) {
        Write-Host "PM2 apps already running — restarting..." -ForegroundColor Cyan
        pm2 restart ecosystem.config.cjs
    } else {
        pm2 delete hr-approve,time-attendance 2>$null | Out-Null
        pm2 start ecosystem.config.cjs
    }

    pm2 save 2>$null | Out-Null
    pm2 status

    $port = 8010
    $envFile = "$ProjectRoot\.env"
    if (Test-Path $envFile) {
        $match = Select-String -Path $envFile -Pattern '^\s*DASHBOARD_PORT\s*=\s*(\d+)' | Select-Object -First 1
        if ($match) { $port = $match.Matches[0].Groups[1].Value }
    }

    Write-Host ""
    Write-Host "Dashboard: http://127.0.0.1:$port" -ForegroundColor Green
    Write-Host "Time Attendance (proxied): http://127.0.0.1:$port/hr-approve/" -ForegroundColor Green
    Write-Host "Logs: pm2 logs  |  logs\hr-approve-*.log" -ForegroundColor Cyan
} finally {
    Pop-Location
}
