@echo off
cd /d "%~dp0"
echo Starting HR Approval Dashboard...
start "" pythonw run.py
timeout /t 2 /nobreak >nul
echo.
echo Open in browser:
echo   http://127.0.0.1:8000
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do echo   http://%%b:8000  ^(LAN^)
)
echo.
echo Log: logs\server.log
pause
