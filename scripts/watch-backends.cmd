@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0watch-backends.ps1" %*
