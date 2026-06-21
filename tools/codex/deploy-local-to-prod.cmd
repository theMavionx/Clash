@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-local-to-prod.ps1" %*
