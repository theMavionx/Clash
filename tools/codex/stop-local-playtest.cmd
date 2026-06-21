@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-local-playtest.ps1" %*
exit /b %ERRORLEVEL%
