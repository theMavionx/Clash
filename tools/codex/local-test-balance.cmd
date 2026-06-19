@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-test-balance.ps1" %*
exit /b %ERRORLEVEL%
