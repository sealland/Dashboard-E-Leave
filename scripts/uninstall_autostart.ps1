# Remove HR Approval Dashboard autostart task

$TaskName = "HR_Approve_Dashboard"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task: $TaskName" -ForegroundColor Green
} else {
    Write-Host "Task not found: $TaskName"
}

$ruleName = "HR Approve Dashboard (TCP 8010)"
$rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($rule) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($isAdmin) {
        Remove-NetFirewallRule -DisplayName $ruleName
        Write-Host "Removed firewall rule: $ruleName" -ForegroundColor Green
    } else {
        Write-Host "Run as Admin to remove firewall rule: $ruleName" -ForegroundColor Yellow
    }
}
