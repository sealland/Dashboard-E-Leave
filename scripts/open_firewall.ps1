# Open Windows Firewall for HR Dashboard (run as Administrator)

$Port = 8000
$ruleName = "HR Approve Dashboard (TCP $Port)"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Run PowerShell as Administrator"
}

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) { Remove-NetFirewallRule -DisplayName $ruleName }

New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $Port `
    -Action Allow `
    -Profile Domain, Private | Out-Null

Write-Host "Firewall opened: TCP $Port (Domain + Private)" -ForegroundColor Green
