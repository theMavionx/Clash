@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-repo.ps1" %*
