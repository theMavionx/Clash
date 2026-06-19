@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-git-hooks.ps1" %*
