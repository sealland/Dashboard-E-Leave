# Install HR Approval Dashboard — autostart at login + LAN firewall rule
# Run as Administrator for firewall; task can be per-user without admin.

param(
    [switch]$SkipFirewall
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$TaskName = "HR_Approve_Dashboard"
$Port = 8010

if (-not (Test-Path "$ProjectRoot\run.py")) {
    Write-Error "run.py not found at $ProjectRoot"
}

$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) {
    Write-Error "Python not found in PATH. Install Python first."
}

$pythonDir = Split-Path $python -Parent
$pythonw = Join-Path $pythonDir "pythonw.exe"
if (-not (Test-Path $pythonw)) {
    $pythonw = $python
}

# Scheduled task — run at user logon, no console window
$action = New-ScheduledTaskAction `
    -Execute $pythonw `
    -Argument "run.py" `
    -WorkingDirectory $ProjectRoot

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "HR Approval Dashboard web server" `
    -Force | Out-Null

Write-Host "OK: Scheduled task '$TaskName' — starts at login" -ForegroundColor Green

# Windows Firewall — allow LAN access
if (-not $SkipFirewall) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($isAdmin) {
        $ruleName = "HR Approve Dashboard (TCP $Port)"
        $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
        if ($existing) {
            Remove-NetFirewallRule -DisplayName $ruleName
        }
        New-NetFirewallRule `
            -DisplayName $ruleName `
            -Direction Inbound `
            -Protocol TCP `
            -LocalPort $Port `
            -Action Allow `
            -Profile Domain, Private | Out-Null
        Write-Host "OK: Firewall rule added (port $Port, Domain + Private network)" -ForegroundColor Green
    } else {
        Write-Host "WARN: Run as Administrator to open firewall port $Port for LAN access." -ForegroundColor Yellow
        Write-Host "      Or run: scripts\open_firewall.ps1 as Admin" -ForegroundColor Yellow
    }
}

# Start now
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2

$ips = @()
try {
    $udp = New-Object System.Net.Sockets.Socket([System.Net.Sockets.AddressFamily]::InterNetwork, [System.Net.Sockets.SocketType]::Dgram, [System.Net.Sockets.ProtocolType]::Udp)
    $udp.Connect("8.8.8.8", 80)
    $ips += ($udp.LocalEndPoint).Address.ToString()
    $udp.Close()
} catch {}

Write-Host ""
Write-Host "Dashboard URLs:" -ForegroundColor Cyan
Write-Host "  http://127.0.0.1:$Port"
foreach ($ip in $ips) {
    Write-Host "  http://${ip}:$Port  (share this on LAN)"
}
Write-Host ""
Write-Host "To remove autostart: scripts\uninstall_autostart.ps1"
