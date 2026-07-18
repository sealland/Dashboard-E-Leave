@echo off
cd /d "%~dp0"
REM Match IIS reverse proxy (dashboard-eleave → 8010)
set DASHBOARD_HOST=0.0.0.0
set DASHBOARD_PORT=8010

echo Starting HR Approval Dashboard on port %DASHBOARD_PORT%...
start "" pythonw run.py
timeout /t 2 /nobreak >nul
echo.
echo Open in browser:
echo   http://127.0.0.1:%DASHBOARD_PORT%
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do echo   http://%%b:%DASHBOARD_PORT%  ^(LAN^)
)
echo.
echo Log: logs\server.log
pause
